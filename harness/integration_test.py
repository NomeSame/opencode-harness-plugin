"""Integration test: full request through OpenCode → Harness → Provider.

DoD TODO-022:
- OpenCode-Wert wird gesetzt.
- Harness setzt einen anderen Enforced-Wert.
- Provider sieht den Harness-Wert.
- Nicht-enforced Werte bleiben überschreibbar.
- Mehrere Harnesses funktionieren.
- Preset funktioniert.
"""

import tempfile
import json
from pathlib import Path

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict, load_harness_from_file, load_preset_from_file
from harness.merge import merge_harnesses
from harness.preset import PresetResolver
from harness.context import ContextConfig, compute_compaction_threshold
from harness.runtime import HarnessRuntimeCoordinator
from harness.testing import TestExecutionConfig, TestStrategy


CANONICAL_CONFIG_DIR = Path(__file__).resolve().parents[1] / "harness_configs"


def load_canonical_store() -> dict[str, Harness]:
    """Load repository harness files rather than test-local fixtures."""
    names = ("qwen", "coding", "long-context", "testing", "final-authority")
    return {
        name: load_harness_from_file(CANONICAL_CONFIG_DIR / f"{name}.yaml")
        for name in names
    }


def load_canonical_preset(filename: str) -> Preset:
    return load_preset_from_file(CANONICAL_CONFIG_DIR / filename)


class MockProvider:
    """Simulates the final provider that receives the request."""

    def __init__(self) -> None:
        self.last_request: dict[str, any] = {}

    def receive_request(self, params: dict[str, any]) -> dict[str, any]:
        self.last_request = dict(params)
        return self.last_request


def create_harness_store() -> dict[str, Harness]:
    """Create a harness store with multiple harnesses."""
    return {
        "qwen": load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
                "top_p": {"value": 0.95, "enforced": True},
            },
        }),
        "coding": load_harness_from_dict({
            "name": "coding",
            "parameters": {
                "max_iterations": {"value": 30},
            },
        }),
        "long-context": load_harness_from_dict({
            "name": "long-context",
            "parameters": {
                "compaction_threshold": {"value": 0.80},
            },
        }),
        "testing": load_harness_from_dict({
            "name": "testing",
            "parameters": {
                "test_strategy": {"value": "generate_tdd"},
            },
        }),
    }


class TestFullIntegration:
    """Full integration test: OpenCode → Harness → Provider."""

    def test_opencode_value_set(self):
        """OpenCode sets its default values first."""
        opencode = load_harness_from_dict({
            "name": "opencode-defaults",
            "parameters": {
                "temperature": {"value": 0.3},
                "top_p": {"value": 0.5},
            },
        })
        assert opencode.get_parameter("temperature").value == 0.3

    def test_harness_overrides_with_enforced(self):
        """Harness sets different enforced values."""
        opencode = load_harness_from_dict({
            "name": "opencode-defaults",
            "parameters": {
                "temperature": {"value": 0.3},
                "top_p": {"value": 0.5},
            },
        })
        harness = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
                "top_p": {"value": 0.95, "enforced": True},
            },
        })
        merged = merge_harnesses([opencode, harness])
        assert merged.get_parameter("temperature").value == 1.0
        assert merged.get_parameter("top_p").value == 0.95

    def test_provider_sees_harness_value(self):
        """Provider receives the harness-enforced values."""
        provider = MockProvider()
        store = create_harness_store()
        resolver = PresetResolver(store)

        # Load preset
        yaml_content = """
name: Qwen Deep Coding
harnesses:
  - qwen
  - coding
  - long-context
  - testing
model: qwen-3.8-27b
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(yaml_content)
            f.flush()
            preset = load_preset_from_file(f.name)

        # Resolve preset
        merged = resolver.resolve(preset)

        # Build request params
        params = {
            name: param.value
            for name, param in merged.parameters.items()
        }
        provider.receive_request(params)

        # Provider sees the enforced values
        assert provider.last_request["temperature"] == 1.0
        assert provider.last_request["top_p"] == 0.95

    def test_non_enforced_values_remain_overrideable(self):
        """Non-enforced values can still be overridden."""
        coding = load_harness_from_dict({
            "name": "coding",
            "parameters": {
                "max_iterations": {"value": 30},
            },
        })
        # User can override max_iterations (not enforced)
        assert coding.get_parameter("max_iterations").value == 30
        assert not coding.get_parameter("max_iterations").is_enforced()

    def test_multiple_harnesses_work(self):
        """Multiple harnesses are correctly merged."""
        store = create_harness_store()
        resolver = PresetResolver(store)
        merged = merge_harnesses(list(store.values()))

        assert merged.has_parameter("temperature")
        assert merged.has_parameter("top_p")
        assert merged.has_parameter("max_iterations")
        assert merged.has_parameter("compaction_threshold")
        assert merged.has_parameter("test_strategy")

    def test_preset_works(self):
        """Preset correctly loads and resolves all harnesses."""
        store = create_harness_store()
        resolver = PresetResolver(store)

        yaml_content = """
name: Qwen Deep Coding
harnesses:
  - qwen
  - coding
  - long-context
  - testing
model: qwen-3.8-27b
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(yaml_content)
            f.flush()
            preset = load_preset_from_file(f.name)

        merged = resolver.resolve(preset)
        assert merged.name == "testing"  # Last harness name
        assert merged.has_parameter("temperature")
        assert merged.get_parameter("temperature").is_enforced()

    def test_compaction_threshold_on_128k(self):
        """Context compaction works with 128k model."""
        config = ContextConfig(threshold=0.80)
        threshold = compute_compaction_threshold(128_000, config.threshold)
        assert threshold == 102_400

    def test_test_strategy_is_tdd(self):
        """Test strategy is set to TDD."""
        testing = load_harness_from_dict({
            "name": "testing",
            "parameters": {
                "test_strategy": {"value": "generate_tdd"},
            },
        })
        strategy = testing.get_parameter("test_strategy")
        assert strategy.value == "generate_tdd"

    def test_test_execution_config(self):
        """Test execution flags are configurable."""
        config = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        assert config.after_code_changes
        assert config.before_finishing
        assert not config.after_every_tool_operation
        assert config.should_run("generate_tdd")


class TestCanonicalCombinations:
    """Integration contracts for the real independent harness compositions."""

    def test_each_generic_harness_resolves_without_qwen(self):
        store = load_canonical_store()
        resolver = PresetResolver(store)

        for filename, expected in (
            ("final_authority_preset.yaml", {"temperature"}),
            ("long_context_preset.yaml", {"compaction_threshold"}),
            ("testing_preset.yaml", {"test_strategy"}),
        ):
            resolved = resolver.resolve(load_canonical_preset(filename))
            assert expected <= set(resolved.parameters)
            assert "thinking" not in resolved.parameters

    def test_every_generic_pair_resolves_without_implicit_dependencies(self):
        store = load_canonical_store()
        resolver = PresetResolver(store)
        pairs = (
            (("final-authority", "long-context"), {"temperature", "compaction_threshold"}),
            (("long-context", "testing"), {"compaction_threshold", "test_strategy"}),
            (("final-authority", "testing"), {"temperature", "test_strategy"}),
        )

        for names, expected in pairs:
            resolved = resolver.resolve(Preset(name=" + ".join(names), harnesses=list(names)))
            assert expected <= set(resolved.parameters)
            assert "thinking" not in resolved.parameters

    def test_all_generic_harnesses_and_qwen_deep_coding_preserve_authority(self):
        store = load_canonical_store()
        resolver = PresetResolver(store)
        all_generic = resolver.resolve(
            Preset(
                name="all generic",
                harnesses=["final-authority", "long-context", "testing"],
            )
        )
        qwen_deep = resolver.resolve(load_canonical_preset("qwen_deep_coding.yaml"))

        for resolved in (all_generic, qwen_deep):
            assert resolved.get_parameter("temperature").value == 1.0
            assert resolved.get_parameter("temperature").is_enforced()
            assert resolved.get_parameter("compaction_threshold").value == 0.80
            assert resolved.get_parameter("test_strategy").value == "generate_tdd"

    def test_model_default_and_unmapped_model_are_safe_with_canonical_configs(self):
        store = load_canonical_store()
        qwen_deep = load_canonical_preset("qwen_deep_coding.yaml")
        runtime = HarnessRuntimeCoordinator(
            [qwen_deep],
            store,
            {"qwen-3.8-27b": 128_000, "plain": 64_000},
        )

        selected = runtime.switch_model("qwen-3.8-27b")
        assert selected.active_preset.name == "Qwen Deep Coding"
        assert selected.compaction_threshold == 102_400

        unmapped = runtime.switch_model("plain")
        assert unmapped.active_preset is None
        assert unmapped.effective_harness.parameters == {}
        assert unmapped.compaction_threshold is None
