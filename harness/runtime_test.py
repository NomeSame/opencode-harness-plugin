"""Integration and edge-case tests for model/preset/context coordination."""

import pytest

from harness.context import ContextConfig, compute_compaction_threshold, should_compact
from harness.data_model import Preset
from harness.loader import load_harness_from_dict
from harness.runtime import HarnessRuntimeCoordinator


def make_runtime() -> HarnessRuntimeCoordinator:
    harnesses = {
        "qwen": load_harness_from_dict(
            {
                "name": "qwen",
                "parameters": {
                    "temperature": {"value": 1.0, "enforced": True},
                },
            }
        ),
        "vanilla": load_harness_from_dict(
            {
                "name": "vanilla",
                "parameters": {"temperature": {"value": 0.7}},
            }
        ),
        "long-context": load_harness_from_dict(
            {
                "name": "long-context",
                "parameters": {"compaction_threshold": {"value": 0.80}},
            }
        ),
    }
    presets = [
        Preset(
            name="Qwen Deep Coding",
            harnesses=["qwen", "long-context"],
            model="qwen-128k",
        ),
        Preset(name="Vanilla", harnesses=["vanilla"]),
    ]
    return HarnessRuntimeCoordinator(
        presets,
        harnesses,
        {"qwen-128k": 128_000, "qwen-256k": 256_000, "plain": 64_000},
    )


class TestRuntimePresetIntegration:
    def test_model_switch_loads_default_and_recalculates_threshold(self):
        runtime = make_runtime()

        state = runtime.switch_model("qwen-128k")

        assert state.active_preset.name == "Qwen Deep Coding"
        assert state.effective_harness.get_parameter("temperature").value == 1.0
        assert state.effective_harness.get_parameter("temperature").is_enforced()
        assert state.compaction_threshold == 102_400
        assert runtime.should_compact(102_399) is False
        assert runtime.should_compact(102_400) is True

    def test_model_switch_live_updates_threshold_without_resetting_policy(self):
        runtime = make_runtime()
        runtime.switch_model("qwen-128k")

        state = runtime.switch_model("qwen-256k")

        assert state.active_preset is None
        assert state.effective_harness.parameters == {}
        assert state.compaction_threshold is None
        with pytest.raises(RuntimeError, match="No Long-Context policy"):
            runtime.should_compact(204_800)

    def test_model_without_default_has_no_override(self):
        runtime = make_runtime()

        state = runtime.switch_model("plain")

        assert state.active_preset is None
        assert state.manual_preset is False
        assert state.effective_harness.parameters == {}
        assert state.compaction_threshold is None
        with pytest.raises(RuntimeError, match="No Long-Context policy"):
            runtime.should_compact(51_200)

    def test_manual_session_selection_overrides_model_default(self):
        runtime = make_runtime()
        runtime.switch_model("qwen-128k")

        state = runtime.select_preset("Vanilla")

        assert state.active_preset.name == "Vanilla"
        assert state.manual_preset is True
        assert state.effective_harness.get_parameter("temperature").value == 0.7
        assert not state.effective_harness.get_parameter("temperature").is_enforced()
        assert state.compaction_threshold is None

    def test_manual_long_context_selection_calculates_threshold_for_current_model(self):
        runtime = make_runtime()
        runtime.switch_model("plain")

        state = runtime.select_preset("Qwen Deep Coding")

        assert state.manual_preset is True
        assert state.compaction_threshold == 51_200
        assert runtime.should_compact(51_200) is True

    def test_manual_selection_survives_model_switch_and_context_recalculates(self):
        runtime = make_runtime()
        runtime.switch_model("qwen-128k")
        runtime.select_preset("Vanilla")

        state = runtime.switch_model("qwen-256k")

        assert state.active_preset.name == "Vanilla"
        assert state.manual_preset is True
        assert state.compaction_threshold is None
        with pytest.raises(RuntimeError, match="No Long-Context policy"):
            runtime.should_compact(204_800)

    def test_clearing_manual_selection_restores_model_default(self):
        runtime = make_runtime()
        runtime.switch_model("qwen-128k")
        runtime.select_preset("Vanilla")

        state = runtime.clear_manual_preset()

        assert state.active_preset.name == "Qwen Deep Coding"
        assert state.manual_preset is False
        assert state.compaction_threshold == 102_400

    def test_unknown_preset_does_not_mutate_session(self):
        runtime = make_runtime()
        before = runtime.switch_model("qwen-128k")

        with pytest.raises(KeyError, match="Unknown preset"):
            runtime.select_preset("missing")

        after = runtime.snapshot()
        assert after == before

    def test_duplicate_model_defaults_are_rejected(self):
        with pytest.raises(ValueError, match="Multiple default presets"):
            HarnessRuntimeCoordinator(
                [
                    Preset(name="one", model="same"),
                    Preset(name="two", model="same"),
                ],
                {},
                {"same": 1},
            )

    def test_unknown_model_has_no_context_trigger(self):
        runtime = make_runtime()

        state = runtime.switch_model("not-configured")

        assert state.compaction_threshold is None
        with pytest.raises(RuntimeError, match="No context window"):
            runtime.should_compact(1)


class TestContextBoundaries:
    def test_exact_threshold_is_inclusive(self):
        assert should_compact(80, 100, 0.80) is True
        assert should_compact(79, 100, 0.80) is False

    def test_zero_threshold_disables_compaction(self):
        assert compute_compaction_threshold(100, 0.0) == 0
        assert should_compact(0, 100, 0.0) is False
        assert should_compact(100, 100, 0.0) is False

    def test_one_threshold_triggers_at_full_context(self):
        assert should_compact(99, 100, 1.0) is False
        assert should_compact(100, 100, 1.0) is True
        assert should_compact(101, 100, 1.0) is True

    @pytest.mark.parametrize("context_window", [0, -1, 1.5, True])
    def test_invalid_context_window_is_rejected(self, context_window):
        with pytest.raises((TypeError, ValueError)):
            compute_compaction_threshold(context_window, 0.80)

    @pytest.mark.parametrize("used_tokens", [-1, 1.5, True])
    def test_invalid_usage_is_rejected(self, used_tokens):
        with pytest.raises((TypeError, ValueError)):
            should_compact(used_tokens, 100, 0.80)

    def test_context_config_exposes_same_boundary_behavior(self):
        config = ContextConfig(threshold=0.80)
        assert config.absolute_threshold(100) == 80
        assert config.is_compaction_due(79, 100) is False
        assert config.is_compaction_due(80, 100) is True
