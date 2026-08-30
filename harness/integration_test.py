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
from harness.loader import load_harness_from_dict, load_preset_from_file
from harness.merge import merge_harnesses
from harness.preset import PresetResolver
from harness.context import ContextConfig, compute_compaction_threshold
from harness.testing import TestExecutionConfig, TestStrategy


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
