"""Load harnesses and presets from YAML/JSON files."""

import json
from pathlib import Path

import yaml

from harness.data_model import Harness, Parameter, Preset


def load_harness_from_dict(data: dict) -> Harness:
    """Load a Harness from a dictionary.

    Args:
        data: Dictionary with at least a 'name' key and optional 'parameters'.

    Returns:
        A Harness instance.

    Raises:
        ValueError: If 'name' is missing or parameter entries are invalid.
    """
    name = data.get("name")
    if not name:
        raise ValueError("Harness must have a 'name' field")

    description = data.get("description", "")
    parameters: dict[str, Parameter] = {}

    for param_name, param_data in data.get("parameters", {}).items():
        if not isinstance(param_data, dict):
            raise ValueError(
                f"Parameter '{param_name}' in harness '{name}' "
                f"must be a mapping, got {type(param_data).__name__}"
            )
        if "value" not in param_data:
            raise ValueError(
                f"Parameter '{param_name}' in harness '{name}' "
                f"must have a 'value' field"
            )
        parameters[param_name] = Parameter(
            value=param_data["value"],
            enforced=param_data.get("enforced", False),
        )

    return Harness(
        name=name,
        description=description,
        parameters=parameters,
    )


def load_harness_from_file(filepath: str | Path) -> Harness:
    """Load a Harness from a YAML or JSON file.

    The file extension determines the format (.yaml, .yml, .json).

    Args:
        filepath: Path to the configuration file.

    Returns:
        A Harness instance.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If the configuration is invalid.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    text = path.read_text(encoding="utf-8")

    try:
        data = _load_yaml_or_json(path, text)
    except (yaml.YAMLError, json.JSONDecodeError) as e:
        raise ValueError(f"Could not parse '{path}': {e}") from e

    if not isinstance(data, dict):
        raise ValueError(f"Config file must contain a mapping, got {type(data).__name__}")

    return load_harness_from_dict(data)


def _load_yaml_or_json(path: Path, text: str) -> dict:
    """Parse text as YAML or JSON based on file extension.

    Raises:
        ValueError: If parsing fails.
    """
    if path.suffix in (".yaml", ".yml"):
        return yaml.safe_load(text)
    elif path.suffix == ".json":
        return json.loads(text)
    else:
        try:
            return yaml.safe_load(text)
        except yaml.YAMLError:
            return json.loads(text)


def load_preset_from_file(filepath: str | Path) -> Preset:
    """Load a Preset from a YAML or JSON file.

    Expected format:
        name: My Preset
        harnesses:
          - harness-a
          - harness-b
        model: model-id
    """
    path = Path(filepath)
    text = path.read_text(encoding="utf-8")

    try:
        data = _load_yaml_or_json(path, text)
    except (yaml.YAMLError, json.JSONDecodeError) as e:
        raise ValueError(f"Could not parse '{path}': {e}") from e

    if not isinstance(data, dict):
        raise ValueError("Preset file must contain a mapping")

    return Preset(
        name=data.get("name", "Unnamed"),
        harnesses=data.get("harnesses", []),
        model=data.get("model", ""),
    )
