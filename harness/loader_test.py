"""Test harness loading from YAML/JSON files.

DoD TODO-006:
- Ein Harness kann aus einer Datei geladen werden.
- Ungültige Konfiguration erzeugt verständlichen Fehler.
- Geladener Harness ist intern verfügbar.
- Einfacher Test für Laden vorhanden.
"""

import json
import tempfile
from pathlib import Path

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_file, load_harness_from_dict, load_preset_from_file


class TestLoadHarnessFromDict:
    """Tests for loading a harness from a dictionary."""

    def test_load_simple_harness(self):
        data = {
            "name": "qwen-base",
            "description": "Qwen-specific defaults",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
                "top_p": {"value": 0.95, "enforced": True},
                "thinking": {"value": "enabled", "enforced": True},
            },
        }
        h = load_harness_from_dict(data)
        assert h.name == "qwen-base"
        assert h.description == "Qwen-specific defaults"
        assert h.has_parameter("temperature")
        assert h.has_parameter("top_p")
        assert h.has_parameter("thinking")

    def test_load_harness_enforced_values(self):
        data = {
            "name": "test",
            "parameters": {
                "temperature": {"value": 1.0, "enforced": True},
            },
        }
        h = load_harness_from_dict(data)
        temp = h.get_parameter("temperature")
        assert temp is not None
        assert temp.value == 1.0
        assert temp.is_enforced()

    def test_load_harness_normal_parameters(self):
        data = {
            "name": "test",
            "parameters": {
                "max_iterations": {"value": 30},
            },
        }
        h = load_harness_from_dict(data)
        max_iter = h.get_parameter("max_iterations")
        assert max_iter is not None
        assert max_iter.value == 30
        assert not max_iter.is_enforced()

    def test_load_harness_minimal(self):
        data = {"name": "minimal"}
        h = load_harness_from_dict(data)
        assert h.name == "minimal"
        assert h.parameters == {}

    def test_load_harness_missing_name_raises(self):
        data = {"parameters": {}}
        try:
            load_harness_from_dict(data)
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "name" in str(e).lower()

    def test_load_harness_invalid_parameter_enforced_without_value_raises(self):
        data = {
            "name": "bad",
            "parameters": {
                "temperature": {"enforced": True},
            },
        }
        try:
            load_harness_from_dict(data)
            assert False, "Expected ValueError"
        except ValueError as e:
            assert "value" in str(e).lower()

    def test_load_harness_invalid_parameter_missing_enforced_field(self):
        data = {
            "name": "bad",
            "parameters": {
                "temperature": {"value": 1.0},
            },
        }
        h = load_harness_from_dict(data)
        p = h.get_parameter("temperature")
        assert p is not None
        assert not p.is_enforced()


class TestLoadHarnessFromFile:
    """Tests for loading a harness from a file."""

    def test_load_yaml_harness(self):
        yaml_content = """
name: qwen-base
description: Qwen-specific defaults
parameters:
  temperature:
    value: 1.0
    enforced: true
  top_p:
    value: 0.95
    enforced: true
"""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(yaml_content)
            f.flush()
            h = load_harness_from_file(f.name)
            assert h.name == "qwen-base"
            temp = h.get_parameter("temperature")
            assert temp is not None
            assert temp.value == 1.0
            assert temp.is_enforced()
            top_p = h.get_parameter("top_p")
            assert top_p is not None
            assert top_p.value == 0.95
            assert top_p.is_enforced()

    def test_load_json_harness(self):
        json_content = json.dumps(
            {
                "name": "coding",
                "parameters": {
                    "max_iterations": {"value": 30},
                },
            }
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            f.write(json_content)
            f.flush()
            h = load_harness_from_file(f.name)
            assert h.name == "coding"
            max_iter = h.get_parameter("max_iterations")
            assert max_iter is not None
            assert max_iter.value == 30

    def test_load_nonexistent_file_raises(self):
        try:
            load_harness_from_file("/nonexistent/harness.yaml")
            assert False, "Expected FileNotFoundError"
        except FileNotFoundError:
            pass

    def test_load_invalid_yaml_raises(self):
        content = "invalid: yaml: [broken"
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(content)
            f.flush()
            try:
                load_harness_from_file(f.name)
                assert False, "Expected exception"
            except Exception:
                pass


class TestLoadPresetFromFile:
    """Tests for loading a preset from a file."""

    def test_load_preset_yaml(self):
        yaml_content = """
name: Qwen Deep Coding
harnesses:
  - qwen-base
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
            p = load_preset_from_file(f.name)
            assert p.name == "Qwen Deep Coding"
            assert len(p.harnesses) == 4
            assert p.model == "qwen-3.8-27b"
