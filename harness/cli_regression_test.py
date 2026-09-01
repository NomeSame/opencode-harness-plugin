"""Regression tests for strict CLI validation and preset composition safety."""

import json
from pathlib import Path

from harness.cli import _parse_parameter_spec, main


def test_parameter_spec_rejects_unknown_enforced_value():
    try:
        _parse_parameter_spec("temperature=1.5,maybe")
    except ValueError as exc:
        assert "enforced" in str(exc)
    else:
        raise AssertionError("invalid enforced value must be rejected")


def test_parameter_spec_rejects_malformed_value():
    try:
        _parse_parameter_spec("temperature")
    except ValueError as exc:
        assert "name=value" in str(exc)
    else:
        raise AssertionError("malformed parameter spec must be rejected")


def test_edit_preset_rejects_unknown_harness_without_writing(tmp_path: Path, capsys):
    (tmp_path / "known.yaml").write_text(
        "name: known\nparameters:\n  temperature: {value: 1.0}\n",
        encoding="utf-8",
    )
    preset_path = tmp_path / "preset.yaml"
    preset_path.write_text(
        "name: P\nharnesses:\n  - known\n",
        encoding="utf-8",
    )
    before = preset_path.read_text(encoding="utf-8")

    assert main([
        "edit-preset",
        "--name", "P",
        "--dir", str(tmp_path),
        "--add-harness", "ghost",
    ]) == 1

    error = json.loads(capsys.readouterr().err)
    assert "ghost" in error["error"]
    assert preset_path.read_text(encoding="utf-8") == before
