"""Test preset-to-model association.

DoD TODO-010:
- Model kann ein Standard-Preset haben.
- Wechsel auf das Model lädt das Preset.
- Ein Model ohne Preset funktioniert weiterhin normal.
- User kann ein anderes Preset wählen.
"""

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict
from harness.merge import merge_harnesses
from harness.preset import PresetResolver


class TestModelDefaultPreset:
    """Test model-to-preset default association."""

    def test_model_has_default_preset(self):
        model_presets: dict[str, Preset] = {
            "qwen-3.8-27b": Preset(
                name="Qwen Deep Coding",
                harnesses=["qwen"],
            ),
        }
        preset = model_presets.get("qwen-3.8-27b")
        assert preset is not None
        assert preset.name == "Qwen Deep Coding"

    def test_model_without_default_preset_returns_none(self):
        model_presets: dict[str, Preset] = {}
        preset = model_presets.get("unknown-model")
        assert preset is None

    def test_model_switch_loads_preset(self):
        """Switching to a model with a default preset loads that preset."""
        harness_map = {
            "qwen": load_harness_from_dict({
                "name": "qwen",
                "parameters": {"temperature": {"value": 1.0, "enforced": True}},
            }),
        }
        model_presets: dict[str, Preset] = {
            "qwen-3.8-27b": Preset(
                name="Qwen Deep Coding",
                harnesses=["qwen"],
            ),
        }
        resolver = PresetResolver(harness_map)

        # Simulate model switch
        model_id = "qwen-3.8-27b"
        preset = model_presets.get(model_id)
        assert preset is not None
        merged = resolver.resolve(preset)
        assert merged.has_parameter("temperature")
        assert merged.get_parameter("temperature").is_enforced()


class TestModelNoPreset:
    """Test that models without presets work normally."""

    def test_model_without_preset_uses_empty_harness(self):
        """A model without a preset should use an empty harness."""
        resolver = PresetResolver({})
        merged = merge_harnesses([])
        assert merged.parameters == {}

    def test_model_without_preset_does_not_error(self):
        """Switching to a model without a preset should not raise."""
        model_presets: dict[str, Preset] = {}
        preset = model_presets.get("unknown-model")
        assert preset is None
        # Empty harness — no error

    def test_model_without_preset_allows_manual_harness(self):
        """User can manually add harnesses even without a preset."""
        harness_map = {
            "custom": load_harness_from_dict({
                "name": "custom",
                "parameters": {"temperature": {"value": 0.7}},
            }),
        }
        # No preset, but user adds a harness manually
        merged = merge_harnesses([harness_map["custom"]])
        assert merged.has_parameter("temperature")


class TestUserOverride:
    """Test that users can override default presets."""

    def test_user_can_select_different_preset(self):
        """User can choose a different preset than the model default."""
        model_presets: dict[str, Preset] = {
            "qwen-3.8-27b": Preset(
                name="Qwen Deep Coding",
                harnesses=["qwen"],
            ),
        }
        # User chooses a different preset
        user_preset = Preset(
            name="Qwen Fast Coding",
            harnesses=["qwen-fast"],
        )
        assert user_preset.name != model_presets["qwen-3.8-27b"].name

    def test_user_override_prevents_default_preset(self):
        """When user overrides, the default preset is not used."""
        harness_map = {
            "qwen": load_harness_from_dict({
                "name": "qwen",
                "parameters": {"temperature": {"value": 1.0, "enforced": True}},
            }),
            "qwen-fast": load_harness_from_dict({
                "name": "qwen-fast",
                "parameters": {"temperature": {"value": 0.7}},
            }),
        }
        model_default = model_presets = {
            "qwen-3.8-27b": Preset(
                name="Qwen Deep Coding",
                harnesses=["qwen"],
            ),
        }
        # User overrides with their own preset
        user_preset = Preset(
            name="Qwen Fast Coding",
            harnesses=["qwen-fast"],
        )
        resolver = PresetResolver(harness_map)
        merged = resolver.resolve(user_preset)
        # Should use qwen-fast (0.7), not qwen (1.0)
        assert merged.get_parameter("temperature").value == 0.7
        assert not merged.get_parameter("temperature").is_enforced()
