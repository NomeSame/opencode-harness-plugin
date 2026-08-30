"""Real code-change detection and test execution (TODO-015/016/017).

Provides genuine (non-simulated) building blocks that
`harness/testing.py`'s decision logic (`TestExecutionConfig.should_run`)
was missing: hash-based change detection and an actual pytest subprocess
runner, plus a small driver for the red/green TDD cycle.
"""

import hashlib
import subprocess
import sys
from pathlib import Path

from harness.testing import TestResult


def snapshot_files(paths: list[str]) -> dict[str, str]:
    """Hash the current content of each path. Missing files hash to ''."""
    snapshot = {}
    for path in paths:
        p = Path(path)
        snapshot[path] = hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else ""
    return snapshot


def detect_changed_files(before: dict[str, str], after: dict[str, str]) -> list[str]:
    """Compare two snapshots (from `snapshot_files`) and return changed/added paths."""
    return sorted(path for path, digest in after.items() if digest != before.get(path))


def run_tests(test_paths: list[str], cwd: str | Path | None = None) -> TestResult:
    """Actually invoke pytest on `test_paths` and return the real result."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", *test_paths],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    return TestResult(passed=proc.returncode == 0, files=list(test_paths), output=proc.stdout + proc.stderr)


class TDDRunner:
    """Drives a real red/green TDD cycle by actually executing tests."""

    def __init__(self, test_paths: list[str], cwd: str | Path | None = None) -> None:
        self.test_paths = test_paths
        self.cwd = cwd
        self.history: list[TestResult] = []

    def run(self) -> TestResult:
        """Execute the test suite now (via `run_tests`) and record the result."""
        result = run_tests(self.test_paths, cwd=self.cwd)
        self.history.append(result)
        return result

    def all_passed(self) -> bool:
        return bool(self.history) and self.history[-1].passed
