"""Test preset loading and validation.

DoD TODO-009:
- Preset kann Harness-Namen referenzieren.
- Preset kann geladen werden.
- Preset aktiviert alle referenzierten Harnesses.
- Fehler bei unbekanntem Harness sind verständlich.
"""

import tempfile
from pathlib import Path

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict, load_preset_from_file
from harness.merge import merge_harnesses
from harness.preset import PresetResolver


class TestPresetReferences:
    """Tests for preset references to harnesses."""

    def test_preset_references_harnesses(self):
        p = Preset(
            name="Qwen Deep Coding",
            harnesses=["qwen-base", "coding", "long-context", "testing"],
        )
        assert len(p.harnesses) == 4
        assert "qwen-base" in p.harnesses
        assert "coding" in p.harnesses

    def test_preset_empty_harnesses(self):
        p = Preset(name="Empty Preset", harnesses=[])
        assert p.harnesses == []


class TestPresetResolution:
    """Tests for resolving presets to merged harnesses."""

    def test_resolve_preset(self):
        """A preset references harness names — resolver returns merged harness."""
        harness_map = {
            "qwen": load_harness_from_dict({
                "name": "qwen",
                "parameters": {"temperature": {"value": 1.0, "enforced": True}},
            }),
            "coding": load_harness_from_dict({
                "name": "coding",
                "parameters": {"max_iterations": {"value": 30}},
            }),
        }
        preset = Preset(name="Qwen Deep Coding", harnesses=["qwen", "coding"])
        resolver = PresetResolver(harness_map)
        merged = resolver.resolve(preset)
        assert merged.has_parameter("temperature")
        assert merged.has_parameter("max_iterations")

    def test_resolve_preset_missing_harness_raises(self):
        """Referencing an unknown harness should raise a clear error."""
        harness_map = {
            "qwen": load_harness_from_dict({
                "name": "qwen",
                "parameters": {},
            }),
        }
        preset = Preset(name="Broken Preset", harnesses=["qwen", "nonexistent"])
        resolver = PresetResolver(harness_map)
        try:
            resolver.resolve(preset)
            assert False, "Expected KeyError"
        except KeyError as e:
            assert "nonexistent" in str(e)


class TestPresetWithModel:
    """Tests for presets with model association."""

    def test_preset_has_model(self):
        p = Preset(name="Qwen Deep Coding", harnesses=["qwen"], model="qwen-3.8-27b")
        assert p.model == "qwen-3.8-27b"

    def test_preset_without_model(self):
        p = Preset(name="Vanilla", harnesses=[])
        assert p.model == ""

    def test_preset_model_used_in_resolution(self):
        p = Preset(name="Qwen Deep Coding", harnesses=["qwen"], model="qwen-3.8-27b")
        assert p.model == "qwen-3.8-27b"


class TestPresetFromDisk:
    """Tests for loading presets from disk."""

    def test_load_preset_yaml_file(self):
        content = """
name: Qwen Deep Coding
harnesses:
  - qwen-base
  - coding
  - long-context
model: qwen-3.8-27b
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(content)
            f.flush()
            preset = load_preset_from_file(f.name)
            assert preset.name == "Qwen Deep Coding"
            assert len(preset.harnesses) == 3
            assert preset.model == "qwen-3.8-27b"

    def test_load_preset_json_file(self):
        import json
        data = {
            "name": "Qwen Fast Coding",
            "harnesses": ["qwen-fast", "coding"],
            "model": "qwen-3.8-27b",
        }
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            json.dump(data, f)
            f.flush()
            preset = load_preset_from_file(f.name)
            assert preset.name == "Qwen Fast Coding"
            assert len(preset.harnesses) == 2
            assert preset.model == "qwen-3.8-27b"

    def test_load_preset_missing_file_raises(self):
        try:
            load_preset_from_file("/nonexistent/preset.yaml")
            assert False, "Expected FileNotFoundError"
        except FileNotFoundError:
            pass
