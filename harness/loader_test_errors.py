"""Tests für TODO-037: bessere Fehlermeldungen im Loader.

DoD:
- Ungültiges YAML/JSON erzeugt eine Fehlermeldung mit Dateipfad +
  verstaendlicher Ursache statt eines rohen Parser-Stacktraces.
- Test mit einer bewusst kaputten Testdatei deckt das ab.
- Gueltige Dateien laden weiterhin unveraendert.
"""

import tempfile
import os

import pytest
import yaml

from harness.loader import load_harness_from_file


class TestLoaderErrorMessages:
    """Tests for improved error messages (TODO-037)."""

    def test_invalid_yaml_error_contains_filepath(self):
        """Invalid YAML error should include the file path."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write("name: broken\n  invalid: yaml: [unclosed")
            filepath = f.name

        try:
            with pytest.raises(ValueError) as exc_info:
                load_harness_from_file(filepath)
            assert filepath in str(exc_info.value), (
                f"Error should contain filepath, got: {exc_info.value}"
            )
        finally:
            os.unlink(filepath)

    def test_invalid_json_error_contains_filepath(self):
        """Invalid JSON error should include the file path."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            f.write("{ broken json")
            filepath = f.name

        try:
            with pytest.raises(ValueError) as exc_info:
                load_harness_from_file(filepath)
            assert filepath in str(exc_info.value)
        finally:
            os.unlink(filepath)

    def test_invalid_yaml_error_mentions_yaml(self):
        """Error should mention YAML parsing failure."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write("name: broken\n  bad: yaml: [")
            filepath = f.name

        try:
            with pytest.raises(ValueError) as exc_info:
                load_harness_from_file(filepath)
            msg = str(exc_info.value).lower()
            assert "yaml" in msg or "parse" in msg
        finally:
            os.unlink(filepath)

    def test_valid_yaml_still_works(self):
        """Valid YAML should still load without error."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write("name: valid\nparameters:\n  temp: {value: 0.5}\n")
            filepath = f.name

        try:
            harness = load_harness_from_file(filepath)
            assert harness.name == "valid"
            assert harness.has_parameter("temp")
        finally:
            os.unlink(filepath)

    def test_valid_json_still_works(self):
        """Valid JSON should still load without error."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            f.write('{"name": "valid-json", "parameters": {"temp": {"value": 0.7}}}')
            filepath = f.name

        try:
            harness = load_harness_from_file(filepath)
            assert harness.name == "valid-json"
        finally:
            os.unlink(filepath)
