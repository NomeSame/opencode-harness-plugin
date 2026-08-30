"""In-memory editor for harnesses and presets (TODO-020)."""

import json
import os
import tempfile
from pathlib import Path

from harness.data_model import Harness, Parameter


class HarnessEditor:
    """Simple in-memory editor for harnesses."""

    def __init__(self, harness: Harness) -> None:
        self._harness = harness

    def get_harness(self) -> Harness:
        return self._harness

    def set_parameter(self, name: str, value: any, enforced: bool = False) -> None:
        self._harness.parameters[name] = Parameter(value=value, enforced=enforced)

    def remove_parameter(self, name: str) -> None:
        if name in self._harness.parameters:
            del self._harness.parameters[name]

    def save_to_file(self, filepath: str | Path) -> None:
        """Save the current harness to a file atomically.

        Writes to a temporary file in the same directory, then uses
        os.replace() to atomically rename it to the target path.
        This prevents partial/corrupt files on process crash.
        """
        filepath = Path(filepath)
        data = {
            "name": self._harness.name,
            "description": self._harness.description,
            "parameters": {
                name: {"value": p.value, "enforced": p.enforced}
                for name, p in self._harness.parameters.items()
            },
        }
        content = json.dumps(data, indent=2)
        target_dir = filepath.parent
        target_dir.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(
            dir=str(target_dir), suffix=".tmp", prefix=".harness-"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp_path, str(filepath))
        except BaseException:
            os.unlink(tmp_path)
            raise
