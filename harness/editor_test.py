"""Test harness editor functionality.

DoD TODO-020:
- Harness kann erstellt werden.
- Harness kann dupliziert werden.
- Parameter können geändert werden.
- Enforced kann gesetzt/entfernt werden.
- Preset kann Harnesses hinzufügen/entfernen.
- Änderungen werden persistent gespeichert.
"""

import tempfile

from harness.data_model import Harness, Parameter, Preset
from harness.editor import HarnessEditor, PresetEditor
from harness.loader import load_harness_from_dict, load_harness_from_file, load_preset_from_file


class TestHarnessCreation:
    """Tests for harness creation."""

    def test_create_harness(self):
        h = Harness(name="new-harness")
        assert h.name == "new-harness"
        assert h.parameters == {}

    def test_create_harness_with_parameters(self):
        h = Harness(
            name="new-harness",
            parameters={
                "temperature": Parameter(value=1.0, enforced=True),
            },
        )
        assert h.has_parameter("temperature")


class TestHarnessDuplication:
    """Tests for harness duplication."""

    def test_duplicate_harness(self):
        original = Harness(
            name="original",
            parameters={
                "temperature": Parameter(value=1.0, enforced=True),
                "max_iterations": Parameter(value=30),
            },
        )
        # Duplicate
        duplicate = Harness(
            name="original-copy",
            parameters=dict(original.parameters),
            description=original.description,
        )
        # Same parameters
        assert len(duplicate.parameters) == len(original.parameters)
        assert duplicate.get_parameter("temperature").value == 1.0
        assert duplicate.get_parameter("temperature").is_enforced()
        assert duplicate.get_parameter("max_iterations").value == 30
        # Different name
        assert duplicate.name == "original-copy"


class TestParameterEditing:
    """Tests for parameter editing."""

    def test_edit_parameter_value(self):
        editor = HarnessEditor(
            Harness(name="test", parameters={"temperature": Parameter(value=0.5)})
        )
        editor.set_parameter("temperature", value=1.0)
        h = editor.get_harness()
        assert h.get_parameter("temperature").value == 1.0

    def test_set_enforced(self):
        editor = HarnessEditor(
            Harness(name="test", parameters={"temperature": Parameter(value=0.5)})
        )
        editor.set_parameter("temperature", value=0.5, enforced=True)
        h = editor.get_harness()
        assert h.get_parameter("temperature").is_enforced()

    def test_remove_enforced(self):
        editor = HarnessEditor(
            Harness(name="test", parameters={"temperature": Parameter(value=0.5, enforced=True)})
        )
        editor.set_parameter("temperature", value=0.5, enforced=False)
        h = editor.get_harness()
        assert not h.get_parameter("temperature").is_enforced()

    def test_remove_parameter(self):
        editor = HarnessEditor(
            Harness(name="test", parameters={
                "temperature": Parameter(value=0.5),
                "max_iterations": Parameter(value=30),
            })
        )
        editor.remove_parameter("temperature")
        h = editor.get_harness()
        assert not h.has_parameter("temperature")
        assert h.has_parameter("max_iterations")


class TestPresetEditing:
    """Tests for preset editing."""

    def test_add_harness_to_preset(self):
        preset = Preset(name="test", harnesses=["a"])
        preset.harnesses.append("b")
        assert len(preset.harnesses) == 2
        assert "b" in preset.harnesses

    def test_remove_harness_from_preset(self):
        preset = Preset(name="test", harnesses=["a", "b", "c"])
        preset.harnesses.remove("b")
        assert len(preset.harnesses) == 2
        assert "b" not in preset.harnesses

    def test_add_and_remove_from_preset(self):
        preset = Preset(name="test", harnesses=["a"])
        preset.harnesses.append("b")
        preset.harnesses.remove("a")
        assert len(preset.harnesses) == 1
        assert "b" in preset.harnesses
        assert "a" not in preset.harnesses

    def test_preset_editor_changes_composition(self):
        editor = PresetEditor(Preset(name="test", harnesses=["qwen", "coding"], model="model-a"))
        editor.add_harness("long-context")
        editor.remove_harness("coding")

        assert editor.get_preset().harnesses == ["qwen", "long-context"]
        assert editor.get_preset().model == "model-a"


class TestPersistence:
    """Tests for persistent storage."""

    def test_save_and_load(self):
        editor = HarnessEditor(
            Harness(
                name="test",
                description="Test harness",
                parameters={
                    "temperature": Parameter(value=1.0, enforced=True),
                    "max_iterations": Parameter(value=30),
                },
            )
        )
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False
        ) as f:
            f.name
            filepath = f.name
        editor.save_to_file(filepath)
        loaded = load_harness_from_file(filepath)
        assert loaded.name == "test"
        assert loaded.has_parameter("temperature")
        assert loaded.get_parameter("temperature").is_enforced()
        assert loaded.get_parameter("max_iterations").value == 30

    def test_preset_editor_persists_existing_yaml_composition(self, tmp_path):
        source = tmp_path / "preset.yaml"
        source.write_text(
            "name: Test\nharnesses:\n  - qwen\nmodel: model-a\n",
            encoding="utf-8",
        )
        editor = PresetEditor(Preset(name="Test", harnesses=["qwen", "coding"], model="model-a"))
        editor.save_to_file(source)
        loaded = load_preset_from_file(source)

        assert loaded.harnesses == ["qwen", "coding"]
        assert loaded.model == "model-a"
