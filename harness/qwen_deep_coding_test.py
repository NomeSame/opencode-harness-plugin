"""Test the Qwen Deep Coding preset.

DoD TODO-024:
- Preset existiert.
- Alle Module geladen.
- Enforced Werte funktionieren.
- Compaction Threshold funktioniert.
- TDD-Option funktioniert.
- Test Execution funktioniert.
"""

import tempfile
from pathlib import Path

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict, load_preset_from_file
from harness.merge import merge_harnesses
from harness.preset import PresetResolver
from harness.context import ContextConfig, compute_compaction_threshold
from harness.testing import TestExecutionConfig, TestStrategy


class TestQwenDeepCodingPreset:
    """Tests for the Qwen Deep Coding preset."""

    def test_preset_exists(self):
        """Qwen Deep Coding preset exists."""
        preset = Preset(
            name="Qwen Deep Coding",
            harnesses=["qwen", "coding", "long-context", "testing"],
        )
        assert preset.name == "Qwen Deep Coding"
        assert len(preset.harnesses) == 4

    def test_all_modules_loaded(self):
        """All four modules are loaded and functional."""
        store = {
            "qwen": load_harness_from_dict({
                "name": "qwen",
                "parameters": {
                    "temperature": {"value": 1.0, "enforced": True},
                    "top_p": {"value": 0.95, "enforced": True},
                    "thinking": {"value": "enabled", "enforced": True},
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
        assert len(store) == 4

    def test_enforced_values_work(self):
        """Enforced values from the Qwen harness work correctly."""
        merged = merge_harnesses(list(store.values()))
        temp = merged.get_parameter("temperature")
        assert temp is not None
        assert temp.value == 1.0
        assert temp.is_enforced()

        top_p = merged.get_parameter("top_p")
        assert top_p is not None
        assert top_p.value == 0.95
        assert top_p.is_enforced()

        thinking = merged.get_parameter("thinking")
        assert thinking is not None
        assert thinking.value == "enabled"
        assert thinking.is_enforced()

    def test_compaction_threshold_works(self):
        """Compaction threshold is properly set."""
        merged = merge_harnesses(list(store.values()))
        ct = merged.get_parameter("compaction_threshold")
        assert ct is not None
        assert ct.value == 0.80
        # Verify it computes correctly for different context sizes
        t_128k = compute_compaction_threshold(128_000, ct.value)
        t_256k = compute_compaction_threshold(256_000, ct.value)
        assert t_128k == 102_400
        assert t_256k == 204_800

    def test_tdd_option_works(self):
        """TDD test strategy is properly set."""
        merged = merge_harnesses(list(store.values()))
        strategy = merged.get_parameter("test_strategy")
        assert strategy is not None
        assert strategy.value == "generate_tdd"

        # Verify the strategy works with execution config
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        assert cfg.should_run(strategy.value)

    def test_test_execution_works(self):
        """Test execution config works with the preset."""
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        strategy = "generate_tdd"
        assert cfg.should_run(strategy)

        # Disabled strategy should skip tests
        assert not cfg.should_run(TestStrategy.DISABLED)

    def test_preset_from_file(self):
        """Qwen Deep Coding preset can be loaded from YAML file."""
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

        assert preset.name == "Qwen Deep Coding"
        assert len(preset.harnesses) == 4
        assert preset.model == "qwen-3.8-27b"

        resolver = PresetResolver(store)
        merged = resolver.resolve(preset)
        assert merged.has_parameter("temperature")
        assert merged.get_parameter("temperature").is_enforced()
        assert merged.get_parameter("temperature").value == 1.0
        assert merged.has_parameter("max_iterations")
        assert merged.has_parameter("compaction_threshold")
        assert merged.has_parameter("test_strategy")


# Store for tests
store = {
    "qwen": None,
    "coding": None,
    "long-context": None,
    "testing": None,
}
store["qwen"] = load_harness_from_dict({
    "name": "qwen",
    "parameters": {
        "temperature": {"value": 1.0, "enforced": True},
        "top_p": {"value": 0.95, "enforced": True},
        "thinking": {"value": "enabled", "enforced": True},
    },
})
store["coding"] = load_harness_from_dict({
    "name": "coding",
    "parameters": {
        "max_iterations": {"value": 30},
    },
})
store["long-context"] = load_harness_from_dict({
    "name": "long-context",
    "parameters": {
        "compaction_threshold": {"value": 0.80},
    },
})
store["testing"] = load_harness_from_dict({
    "name": "testing",
    "parameters": {
        "test_strategy": {"value": "generate_tdd"},
    },
})
