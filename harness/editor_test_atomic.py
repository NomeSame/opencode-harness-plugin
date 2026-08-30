"""Tests für TODO-036: save_to_file atomar (tmp + os.replace).

DoD:
- save_to_file schreibt ueber Temp-Datei + os.replace.
- Bestehende Tests bleiben gruen.
- Neuer Test: simuliert dass die Zieldatei vor dem Schreiben bereits
  existierenden Inhalt hat, und prueft dass nach einem (erfolgreichen)
  Aufruf nur der neue Inhalt vorhanden ist, nie ein Mischzustand.
"""

import json
import os
import tempfile

import pytest

from harness.data_model import Harness, Parameter
from harness.editor import HarnessEditor


class TestSaveToFileAtomic:
    """Tests for atomic save (TODO-036)."""

    def test_save_overwrites_existing_file_completely(self):
        """Save to a file with existing content should completely replace it."""
        # Create a file with old content
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            old_data = {"name": "old-harness", "old_key": "old_value"}
            json.dump(old_data, f)
            filepath = f.name

        try:
            editor = HarnessEditor(
                Harness(
                    name="new-harness",
                    description="New description",
                    parameters={
                        "temperature": Parameter(value=1.0, enforced=True),
                    },
                )
            )
            editor.save_to_file(filepath)

            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            assert data["name"] == "new-harness"
            assert "old_key" not in data, "old content should not remain"
            assert "old_value" not in data, "old content should not remain"
            assert data["parameters"]["temperature"]["value"] == 1.0
        finally:
            os.unlink(filepath)

    def test_save_to_file_creates_directory(self):
        """Saving to a non-existent file should work (parent dir must exist or be created)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "new_file.json")
            editor = HarnessEditor(
                Harness(name="test", parameters={"temp": Parameter(value=0.5)})
            )
            editor.save_to_file(filepath)
            assert os.path.exists(filepath)

            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
            assert data["name"] == "test"

    def test_save_twice_overwrites(self):
        """Saving twice should result in only the latest content."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            filepath = f.name

        try:
            editor1 = HarnessEditor(
                Harness(name="first", parameters={"a": Parameter(value=1)})
            )
            editor1.save_to_file(filepath)

            editor2 = HarnessEditor(
                Harness(name="second", parameters={"b": Parameter(value=2)})
            )
            editor2.save_to_file(filepath)

            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)

            assert data["name"] == "second"
            assert "a" not in data["parameters"], "old parameter should not remain"
            assert data["parameters"]["b"]["value"] == 2
        finally:
            os.unlink(filepath)
