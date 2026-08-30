"""Command-line interface for resolving harness presets.

Usage:
    python -m harness.cli resolve --preset "Qwen Deep Coding" --dir ./harness_configs

Output on success: resolved parameters as JSON on stdout, exit code 0.
Output on failure: {"error": "..."} on stderr, exit code != 0.
"""

import argparse
import json
import sys
from pathlib import Path

import yaml

from harness.data_model import Harness, Preset
from harness.loader import load_harness_from_dict
from harness.preset import PresetResolver

_CONFIG_SUFFIXES = (".yaml", ".yml", ".json")


def _load_mapping(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if path.suffix in (".yaml", ".yml"):
        data = yaml.safe_load(text)
    elif path.suffix == ".json":
        data = json.loads(text)
    else:
        data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError(f"must contain a mapping, got {type(data).__name__}")
    return data


def load_config_files(directory: Path) -> tuple[dict[str, Harness], list[Preset]]:
    """Load all harness and preset definitions from a config directory.

    A file is a preset if it has a 'harnesses' key, otherwise a harness
    (requires a 'name' key). Files without a 'name' are skipped.
    """
    if not directory.is_dir():
        raise FileNotFoundError(f"Harness config directory not found: {directory}")

    harnesses: dict[str, Harness] = {}
    presets: list[Preset] = []

    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.suffix not in _CONFIG_SUFFIXES:
            continue
        try:
            data = _load_mapping(path)
        except (yaml.YAMLError, json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"Invalid config file {path.name}: {exc}") from exc

        if not data.get("name"):
            continue

        if "harnesses" in data:
            harness_refs = data["harnesses"]
            if not isinstance(harness_refs, list) or not all(
                isinstance(item, str) for item in harness_refs
            ):
                raise ValueError(
                    f"Preset file {path.name}: 'harnesses' must be a list of names"
                )
            presets.append(
                Preset(
                    name=str(data["name"]),
                    harnesses=list(harness_refs),
                    model=str(data.get("model", "")),
                )
            )
        else:
            try:
                harnesses[str(data["name"])] = load_harness_from_dict(data)
            except ValueError as exc:
                raise ValueError(f"Invalid harness file {path.name}: {exc}") from exc

    return harnesses, presets


def _find_preset(presets: list[Preset], preset_name: str) -> Preset:
    for preset in presets:
        if preset.name == preset_name:
            return preset
    for preset in presets:
        if preset.name.lower() == preset_name.lower():
            return preset
    available = ", ".join(sorted(p.name for p in presets)) or "(none)"
    raise ValueError(
        f"Preset '{preset_name}' not found. Available presets: {available}"
    )


def resolve_preset_to_params(preset_name: str, harness_dir: str | Path) -> dict:
    """Resolve a preset from a config directory to a plain JSON dict.

    Returns e.g. {"temperature": {"value": 1.0, "enforced": true}, ...}.

    Raises:
        FileNotFoundError: If the directory does not exist.
        ValueError: If a config file is invalid or the preset is unknown.
        KeyError: If the preset references a harness that is not in the store.
    """
    directory = Path(harness_dir)
    harnesses, presets = load_config_files(directory)
    preset = _find_preset(presets, preset_name)
    merged = PresetResolver(harnesses).resolve(preset)
    return {
        name: {"value": param.value, "enforced": param.enforced}
        for name, param in merged.parameters.items()
    }


class CliUsageError(Exception):
    """A usage error reported as structured JSON instead of argparse text."""


class _CliArgumentParser(argparse.ArgumentParser):
    """ArgumentParser that raises CliUsageError instead of printing usage text."""

    def error(self, message: str) -> None:  # type: ignore[override]
        raise CliUsageError(message)


def _build_parser() -> _CliArgumentParser:
    parser = _CliArgumentParser(
        prog="harness",
        description="Resolve harness presets to model parameters.",
    )
    subparsers = parser.add_subparsers(dest="command")

    resolve = subparsers.add_parser(
        "resolve", help="Resolve a preset to a JSON parameter dict."
    )
    resolve.add_argument("--preset", required=True, help="Preset name to resolve.")
    resolve.add_argument("--dir", required=True, help="Directory with config files.")

    list_presets = subparsers.add_parser(
        "list-presets", help="List all available preset names."
    )
    list_presets.add_argument("--dir", required=True, help="Directory with config files.")

    edit = subparsers.add_parser(
        "edit", help="Edit a harness (set/remove parameters, save)."
    )
    edit.add_argument("--name", required=True, help="Harness name to edit.")
    edit.add_argument("--dir", required=True, help="Directory with config files.")
    edit.add_argument("--set-parameter", action="append", help="Set parameter: name=value,enforced (repeatable).")
    edit.add_argument("--remove-parameter", action="append", help="Remove parameter by name (repeatable).")
    edit.add_argument("--output", help="Output file name (default: <harness-name>.json).")
    return parser


def _error(message: str) -> str:
    return json.dumps({"error": message})


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    try:
        args = parser.parse_args(argv)
    except CliUsageError as exc:
        print(_error(str(exc)), file=sys.stderr)
        return 1
    except SystemExit as exc:
        return 0 if exc.code in (0, None) else 1

    if args.command is None:
        print(_error("No command specified. Use --help for usage."), file=sys.stderr)
        return 1

    if args.command == "resolve":
        try:
            result = resolve_preset_to_params(args.preset, args.dir)
        except (FileNotFoundError, ValueError) as exc:
            print(_error(str(exc)), file=sys.stderr)
            return 1
        except KeyError as exc:
            message = str(exc.args[0]) if exc.args else str(exc)
            print(_error(message), file=sys.stderr)
            return 1

        print(json.dumps(result, indent=2))
        return 0

    if args.command == "list-presets":
        try:
            directory = Path(args.dir)
            harnesses, presets = load_config_files(directory)
            names = sorted(p.name for p in presets)
            print(json.dumps(names))
        except (FileNotFoundError, ValueError) as exc:
            print(_error(str(exc)), file=sys.stderr)
            return 1

        return 0

    if args.command == "edit":
        try:
            from harness.editor import HarnessEditor
            from harness.data_model import Parameter

            directory = Path(args.dir)
            harnesses, presets = load_config_files(directory)

            # Find harness by name
            harness = None
            for h in harnesses.values():
                if h.name.lower() == args.name.lower():
                    harness = h
                    break

            if not harness:
                available = ", ".join(h.name for h in harnesses.values())
                raise ValueError(f"Harness '{args.name}' not found. Available: {available}")

            editor = HarnessEditor(harness)

            # Apply operations
            if args.set_parameter:
                import ast

                for param_str in args.set_parameter:
                    # Format: name=value,enforced
                    name, rest = param_str.split("=", 1)
                    value_str, enforced_str = rest.rsplit(",", 1)
                    value = ast.literal_eval(value_str)
                    enforced = enforced_str.lower() == "true"
                    editor.set_parameter(name, value, enforced)

            if args.remove_parameter:
                for name in args.remove_parameter:
                    editor.remove_parameter(name)

            # Save to file
            output_file = args.output or f"{args.name.lower().replace(' ', '-')}.json"
            editor.save_to_file(Path(args.dir) / output_file)

            print(json.dumps({
                "name": harness.name,
                "parameters": {
                    name: {"value": p.value, "enforced": p.enforced}
                    for name, p in harness.parameters.items()
                },
            }, indent=2))

        except (FileNotFoundError, ValueError) as exc:
            print(_error(str(exc)), file=sys.stderr)
            return 1

        return 0

    print(_error(f"Unknown command: {args.command}. Use --help for usage."), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
