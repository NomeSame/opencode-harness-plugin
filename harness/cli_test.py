"""Tests for the CLI interface (TODO-025).

DoD:
- CLI existiert (`harness/cli.py`, aufrufbar via `python -m harness.cli`).
- Presets loesen sich ueber die CLI.
- Ausgabe ist gueltiges JSON.
- Funktioniert mit dem "Qwen Deep Coding" Preset.
- Fehler: exit code != 0 + {"error": "..."} auf stderr.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

from harness.cli import default_preset_for_model, resolve_preset_to_params

PROJECT_ROOT = Path(__file__).resolve().parents[1]

QWEN_HARNESSES = {
    "qwen.yaml": (
        "name: qwen\n"
        "parameters:\n"
        "  temperature: {value: 1.0, enforced: true}\n"
        "  top_p: {value: 0.95, enforced: true}\n"
        "  thinking: {value: enabled, enforced: true}\n"
    ),
    "coding.yaml": (
        "name: coding\n"
        "parameters:\n"
        "  max_iterations: {value: 30}\n"
    ),
    "long-context.yaml": (
        "name: long-context\n"
        "parameters:\n"
        "  compaction_threshold: {value: 0.80}\n"
    ),
    "testing.yaml": (
        "name: testing\n"
        "parameters:\n"
        "  test_strategy: {value: generate_tdd}\n"
    ),
}

QWEN_PRESET = (
    "name: Qwen Deep Coding\n"
    "harnesses:\n"
    "  - qwen\n"
    "  - coding\n"
    "  - long-context\n"
    "  - testing\n"
    "model: qwen-3.8-27b\n"
)


@pytest.fixture
def qwen_dir(tmp_path: Path) -> Path:
    for filename, content in QWEN_HARNESSES.items():
        (tmp_path / filename).write_text(content, encoding="utf-8")
    (tmp_path / "qwen_deep_coding.yaml").write_text(QWEN_PRESET, encoding="utf-8")
    return tmp_path


@pytest.fixture
def qwen_json_dir(tmp_path: Path) -> Path:
    for filename, content in QWEN_HARNESSES.items():
        import yaml

        data = yaml.safe_load(content)
        (tmp_path / (Path(filename).stem + ".json")).write_text(
            json.dumps(data), encoding="utf-8"
        )
    (tmp_path / "qwen_deep_coding.json").write_text(
        json.dumps(
            {
                "name": "Qwen Deep Coding",
                "harnesses": ["qwen", "coding", "long-context", "testing"],
                "model": "qwen-3.8-27b",
            }
        ),
        encoding="utf-8",
    )
    return tmp_path


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "harness.cli", *args],
        capture_output=True,
        text=True,
        cwd=PROJECT_ROOT,
        timeout=60,
    )


class TestResolvePresetToParams:
    """Tests for the core resolution function."""

    def test_qwen_deep_coding_resolves_all_parameters(self, qwen_dir):
        result = resolve_preset_to_params("Qwen Deep Coding", qwen_dir)
        assert result["temperature"] == {"value": 1.0, "enforced": True}
        assert result["top_p"] == {"value": 0.95, "enforced": True}
        assert result["thinking"] == {"value": "enabled", "enforced": True}
        assert result["max_iterations"] == {"value": 30, "enforced": False}
        assert result["compaction_threshold"] == {"value": 0.80, "enforced": False}
        assert result["test_strategy"] == {"value": "generate_tdd", "enforced": False}

    def test_result_is_json_serializable(self, qwen_dir):
        result = resolve_preset_to_params("Qwen Deep Coding", qwen_dir)
        roundtrip = json.loads(json.dumps(result))
        assert roundtrip == result

    def test_works_with_json_config_files(self, qwen_json_dir):
        result = resolve_preset_to_params("Qwen Deep Coding", qwen_json_dir)
        assert result["temperature"]["enforced"] is True
        assert result["max_iterations"]["value"] == 30

    def test_preset_name_match_is_case_insensitive(self, qwen_dir):
        result = resolve_preset_to_params("qwen deep coding", qwen_dir)
        assert "temperature" in result

    def test_unknown_preset_raises_with_available_names(self, qwen_dir):
        with pytest.raises(ValueError, match="Noch nicht gefunden|not found"):
            resolve_preset_to_params("Kein Preset", qwen_dir)

    def test_missing_directory_raises_file_not_found(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            resolve_preset_to_params("Qwen Deep Coding", tmp_path / "does-not-exist")

    def test_preset_referencing_unknown_harness_raises(self, tmp_path):
        (tmp_path / "solo.yaml").write_text(
            "name: solo\nparameters:\n  temperature: {value: 0.5}\n",
            encoding="utf-8",
        )
        (tmp_path / "broken.yaml").write_text(
            "name: Broken\nharnesses:\n  - solo\n  - ghost\n", encoding="utf-8"
        )
        with pytest.raises((KeyError, ValueError), match="ghost"):
            resolve_preset_to_params("Broken", tmp_path)

    def test_unclassifiable_file_is_skipped(self, qwen_dir):
        (qwen_dir / "notes.yaml").write_text("just: some text\n", encoding="utf-8")
        result = resolve_preset_to_params("Qwen Deep Coding", qwen_dir)
        assert "temperature" in result

    def test_default_preset_for_model_returns_matching_preset(self, qwen_dir):
        assert default_preset_for_model("qwen-3.8-27b", qwen_dir) == "Qwen Deep Coding"

    def test_default_preset_for_unknown_model_returns_none(self, qwen_dir):
        assert default_preset_for_model("unknown-model", qwen_dir) is None

    def test_default_preset_rejects_empty_model(self, qwen_dir):
        with pytest.raises(ValueError, match="model_id"):
            default_preset_for_model("", qwen_dir)

    def test_non_config_files_are_skipped(self, qwen_dir):
        (qwen_dir / "README.txt").write_text("ignore me", encoding="utf-8")
        (qwen_dir / ".gitkeep").write_text("", encoding="utf-8")
        result = resolve_preset_to_params("Qwen Deep Coding", qwen_dir)
        assert "temperature" in result

    def test_invalid_parameter_raises_with_filename(self, tmp_path):
        (tmp_path / "bad.yaml").write_text(
            "name: bad\nparameters:\n  temperature: {enforced: true}\n",
            encoding="utf-8",
        )
        (tmp_path / "p.yaml").write_text(
            "name: P\nharnesses:\n  - bad\n", encoding="utf-8"
        )
        with pytest.raises(ValueError, match="bad\\.yaml"):
            resolve_preset_to_params("P", tmp_path)

    def test_preset_harnesses_must_be_a_list(self, tmp_path):
        (tmp_path / "odd.yaml").write_text(
            "name: Odd\nharnesses: not-a-list\n", encoding="utf-8"
        )
        with pytest.raises(ValueError, match="odd\\.yaml"):
            resolve_preset_to_params("Odd", tmp_path)

    def test_duplicate_harness_names_last_file_wins(self, tmp_path):
        (tmp_path / "a.yaml").write_text(
            "name: h\nparameters:\n  temperature: {value: 0.1}\n",
            encoding="utf-8",
        )
        (tmp_path / "b.yaml").write_text(
            "name: h\nparameters:\n  temperature: {value: 0.9}\n",
            encoding="utf-8",
        )
        (tmp_path / "p.yaml").write_text(
            "name: P\nharnesses:\n  - h\n", encoding="utf-8"
        )
        result = resolve_preset_to_params("P", tmp_path)
        assert result["temperature"]["value"] == 0.9


class TestCli:
    """Tests for the command-line interface (subprocess)."""

    def test_resolve_success_exits_zero_and_prints_valid_json(self, qwen_dir):
        proc = run_cli("resolve", "--preset", "Qwen Deep Coding", "--dir", str(qwen_dir))
        assert proc.returncode == 0, proc.stderr
        data = json.loads(proc.stdout)
        assert data["temperature"] == {"value": 1.0, "enforced": True}
        assert data["test_strategy"]["value"] == "generate_tdd"

    def test_resolve_unknown_preset_exits_nonzero_with_json_error(self, qwen_dir):
        proc = run_cli("resolve", "--preset", "Unbekannt", "--dir", str(qwen_dir))
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error
        assert "Unbekannt" in error["error"]

    def test_resolve_missing_dir_exits_nonzero_with_json_error(self, tmp_path):
        proc = run_cli(
            "resolve",
            "--preset",
            "Qwen Deep Coding",
            "--dir",
            str(tmp_path / "nope"),
        )
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error

    def test_help_exits_zero(self):
        proc = run_cli("--help")
        assert proc.returncode == 0
        assert "resolve" in proc.stdout

    def test_missing_required_args_exits_nonzero_with_json_error(self):
        proc = run_cli("resolve")
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error

    def test_unknown_command_exits_nonzero_with_json_error(self):
        proc = run_cli("frobnicate")
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error


class TestListPresets:
    """Tests for the list-presets CLI subcommand."""

    def test_list_presets_returns_json_array(self, qwen_dir):
        proc = run_cli("list-presets", "--dir", str(qwen_dir))
        assert proc.returncode == 0
        names = json.loads(proc.stdout)
        assert isinstance(names, list)
        assert "Qwen Deep Coding" in names

    def test_list_presets_returns_sorted_names(self, qwen_dir):
        proc = run_cli("list-presets", "--dir", str(qwen_dir))
        names = json.loads(proc.stdout)
        assert names == sorted(names)

    def test_list_presets_missing_dir_exits_nonzero(self, tmp_path):
        proc = run_cli("list-presets", "--dir", str(tmp_path / "nope"))
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error

    def test_list_presets_empty_dir_returns_empty_list(self, tmp_path):
        (tmp_path / "orphan.yaml").write_text(
            "name: orphan\nparameters:\n  temperature: {value: 0.5}\n",
            encoding="utf-8",
        )
        proc = run_cli("list-presets", "--dir", str(tmp_path))
        assert proc.returncode == 0
        names = json.loads(proc.stdout)
        assert names == []


class TestEdit:
    """Tests for the edit CLI subcommand."""

    def test_edit_set_parameter(self, qwen_dir):
        proc = run_cli(
            "edit",
            "--name", "qwen",
            "--dir", str(qwen_dir),
            "--set-parameter", "temperature=1.5,true",
        )
        assert proc.returncode == 0
        result = json.loads(proc.stdout)
        assert result["name"] == "qwen"
        assert result["parameters"]["temperature"]["value"] == 1.5
        assert result["parameters"]["temperature"]["enforced"] is True
        assert (qwen_dir / "qwen.yaml").read_text(encoding="utf-8").find("1.5") >= 0
        assert not (qwen_dir / "qwen.json").exists()

    def test_edit_remove_parameter(self, qwen_dir):
        proc = run_cli(
            "edit",
            "--name", "qwen",
            "--dir", str(qwen_dir),
            "--remove-parameter", "top_p",
        )
        assert proc.returncode == 0
        result = json.loads(proc.stdout)
        assert "top_p" not in result["parameters"]

    def test_edit_invalid_harness_name(self, tmp_path):
        proc = run_cli(
            "edit",
            "--name", "NonExistent",
            "--dir", str(tmp_path),
        )
        assert proc.returncode != 0
        error = json.loads(proc.stderr)
        assert "error" in error

    def test_edit_save_to_custom_output(self, tmp_path):
        (tmp_path / "test_harness.yaml").write_text(
            "name: Test Harness\nparameters:\n  temperature: {value: 0.7, enforced: false}\n",
            encoding="utf-8",
        )
        proc = run_cli(
            "edit",
            "--name", "Test Harness",
            "--dir", str(tmp_path),
            "--output", "edited.json",
        )
        assert proc.returncode == 0
        # File should be saved
        edited_file = tmp_path / "edited.json"
        assert edited_file.exists()
        saved = json.loads(edited_file.read_text())
        assert saved["name"] == "Test Harness"

    def test_edit_preset_updates_existing_source_file(self, qwen_dir):
        proc = run_cli(
            "edit-preset",
            "--name", "Qwen Deep Coding",
            "--dir", str(qwen_dir),
            "--remove-harness", "coding",
            "--add-harness", "qwen",
        )
        assert proc.returncode == 0
        result = json.loads(proc.stdout)
        assert result["harnesses"] == ["qwen", "long-context", "testing"]
        loaded = qwen_dir.joinpath("qwen_deep_coding.yaml").read_text(encoding="utf-8")
        assert "- coding" not in loaded
        assert "- qwen" in loaded


class TestRealConfigDir:
    """Tests against the real, production harness_configs/ directory (Fix #2).

    The canonical 'Qwen Deep Coding' preset must exist as real YAML config files
    in <project root>/harness_configs and be loadable by the harness loader.
    """

    @property
    def config_dir(self) -> Path:
        return PROJECT_ROOT / "harness_configs"

    def test_config_dir_exists(self):
        assert self.config_dir.is_dir(), "harness_configs/ must exist"

    def test_real_preset_resolves_all_canonical_parameters(self):
        result = resolve_preset_to_params("Qwen Deep Coding", self.config_dir)
        assert result["temperature"] == {"value": 1.0, "enforced": True}
        assert result["top_p"] == {"value": 0.95, "enforced": True}
        assert result["thinking"] == {"value": "enabled", "enforced": True}
        assert result["max_iterations"] == {"value": 30, "enforced": False}
        assert result["compaction_threshold"] == {"value": 0.80, "enforced": False}
        assert result["test_strategy"] == {"value": "generate_tdd", "enforced": False}

    def test_real_preset_is_listed_by_cli(self):
        proc = run_cli("list-presets", "--dir", str(self.config_dir))
        assert proc.returncode == 0, proc.stderr
        names = json.loads(proc.stdout)
        assert "Qwen Deep Coding" in names

    def test_default_preset_command_returns_model_mapping(self):
        proc = run_cli(
            "default-preset",
            "--model", "qwen-3.8-27b",
            "--dir", str(self.config_dir),
        )
        assert proc.returncode == 0, proc.stderr
        assert json.loads(proc.stdout) == {"preset": "Qwen Deep Coding"}
