"""Test the Qwen harness profile.

DoD TODO-023:
- Qwen-spezifische Sampling-Einstellungen definiert.
- Thinking-Verhalten definiert.
- Keine geheimen oder automatisch geratenen Werte.
- Enforced Werte explizit markiert.
"""

import tempfile
import yaml
from pathlib import Path

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict, load_harness_from_file


class TestQwenHarness:
    """Tests for the Qwen harness profile."""

    def test_qwen_harness_has_temperature(self):
        """Qwen harness defines temperature."""
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
            },
        })
        assert qwen.has_parameter("temperature")
        assert qwen.get_parameter("temperature").value == 1.0

    def test_qwen_harness_has_top_p(self):
        """Qwen harness defines top_p."""
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "top_p": {"value": 0.95, "enforced": True},
            },
        })
        assert qwen.has_parameter("top_p")
        assert qwen.get_parameter("top_p").value == 0.95

    def test_qwen_harness_has_thinking(self):
        """Qwen harness defines thinking behavior."""
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "thinking": {"value": "enabled", "enforced": True},
            },
        })
        assert qwen.has_parameter("thinking")
        assert qwen.get_parameter("thinking").value == "enabled"

    def test_no_hidden_values(self):
        """No hidden or guessed values in the Qwen harness."""
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
                "top_p": {"value": 0.95, "enforced": True},
                "thinking": {"value": "enabled", "enforced": True},
            },
        })
        # Only explicit parameters exist
        assert len(qwen.parameters) == 3

    def test_enforced_explicitly_marked(self):
        """All enforced values are explicitly marked."""
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
                "top_p": {"value": 0.95, "enforced": True},
                "thinking": {"value": "enabled", "enforced": True},
            },
        })
        for name, param in qwen.parameters.items():
            assert param.is_enforced(), f"Parameter {name} should be enforced"


class TestQwenHarnessFromYAML:
    """Tests for loading the Qwen harness from YAML."""

    def test_qwen_yaml(self):
        """Qwen harness can be loaded from YAML."""
        yaml_content = """
name: qwen
description: Qwen-specific defaults — enforced sampling + thinking

parameters:
  temperature:
    value: 1.0
    enforced: true
  top_p:
    value: 0.95
    enforced: true
  thinking:
    value: enabled
    enforced: true
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(yaml_content)
            f.flush()
            qwen = load_harness_from_file(f.name)

        assert qwen.name == "qwen"
        assert qwen.has_parameter("temperature")
        assert qwen.has_parameter("top_p")
        assert qwen.has_parameter("thinking")

        for name, param in qwen.parameters.items():
            assert param.is_enforced(), f"Parameter {name} should be enforced"
            assert param.value is not None, f"Parameter {name} should have a value"
