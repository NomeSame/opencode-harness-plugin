"""Real code-change detection, execution, and TDD sequencing.

Provides genuine (non-simulated) building blocks that
`harness/testing.py`'s decision logic (`TestExecutionConfig.should_run`)
was missing: hash-based change detection and an actual pytest subprocess
runner, plus a small driver for the red/green TDD cycle.
"""

import hashlib
import subprocess
import sys
from pathlib import Path

from dataclasses import dataclass
from enum import StrEnum
from typing import Callable, Iterable

from harness.testing import (
    TestExecutionConfig,
    TestExecutionDecision,
    TestResult,
    TestStrategy,
    TestTrigger,
)


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
    if not test_paths:
        raise ValueError("at least one test path is required")
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", *test_paths],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        return TestResult(
            passed=False,
            files=list(test_paths),
            output=f"could not execute pytest: {exc}",
            returncode=None,
        )
    return TestResult(
        passed=proc.returncode == 0,
        files=list(test_paths),
        output=proc.stdout + proc.stderr,
        returncode=proc.returncode,
    )


@dataclass(frozen=True)
class TestRun:
    """One policy decision paired with the real result it produced."""

    __test__ = False  # not a pytest test class

    decision: TestExecutionDecision
    result: TestResult


class TestingCoordinator:
    """Execute configured triggers and expose a finish gate.

    This is the harness-side integration seam.  It deliberately does not
    pretend to own an LLM agent loop: callers provide the runtime events and
    receive the actual pytest result to feed into that loop.
    """

    __test__ = False  # not a pytest test class

    def __init__(
        self,
        strategy: str | TestStrategy,
        config: TestExecutionConfig,
        test_paths: list[str],
        cwd: str | Path | None = None,
        runner: Callable[[list[str], str | Path | None], TestResult] = run_tests,
    ) -> None:
        self.strategy = TestStrategy(strategy)
        self.config = config
        self.test_paths = list(test_paths)
        self.cwd = cwd
        self._runner = runner
        self.runs: list[TestRun] = []

    def execute(
        self,
        trigger: str | TestTrigger,
        changed_files: Iterable[str] | None = None,
    ) -> TestResult | None:
        """Run tests for an event, or return ``None`` when policy skips it."""

        decision = self.config.decision(self.strategy, trigger, changed_files)
        if not decision.should_run:
            return None
        result = self._runner(self.test_paths, self.cwd)
        self.runs.append(TestRun(decision=decision, result=result))
        return result

    def can_finish(self) -> bool:
        """Enforce a passing before-finish run when that trigger is enabled."""

        decision = self.config.decision(
            self.strategy,
            TestTrigger.BEFORE_FINISHING,
        )
        if not decision.should_run:
            return True
        return any(
            run.decision.trigger is TestTrigger.BEFORE_FINISHING
            and run.result.passed
            for run in self.runs
        )

    def last_failure(self) -> TestResult | None:
        """Return the latest failed result for the next agent iteration."""

        for run in reversed(self.runs):
            if not run.result.passed:
                return run.result
        return None


class TDDPhase(StrEnum):
    SPECIFICATION = "specification"
    RED_CONFIRMED = "red_confirmed"
    IMPLEMENTATION = "implementation"
    GREEN = "green"


class TDDProtocolError(RuntimeError):
    """Raised when a TDD phase is attempted out of order."""


class TDDRunner:
    """Drive a real red/green cycle with an enforced phase order.

    Test generation and code editing remain agent responsibilities.  This
    runner verifies the boundary: a real failing test run must precede the
    implementation marker, and only then can a real passing run complete the
    cycle.
    """

    def __init__(
        self,
        test_paths: list[str],
        cwd: str | Path | None = None,
        implementation_paths: list[str] | None = None,
    ) -> None:
        if not test_paths:
            raise ValueError("at least one test path is required")
        self.test_paths = list(test_paths)
        self.cwd = cwd
        self.implementation_paths = list(implementation_paths or [])
        self.phase = TDDPhase.SPECIFICATION
        self.history: list[TestResult] = []
        self._implementation_before: dict[str, str] = {}
        self._specification_defined = False

    def define_specification(self) -> None:
        """Record that the agent has created/selected the test specification."""

        if self.phase is not TDDPhase.SPECIFICATION or self._specification_defined:
            raise TDDProtocolError("the test specification can only be defined once")
        missing = [path for path in self.test_paths if not Path(path).is_file()]
        if missing:
            raise FileNotFoundError(
                f"TDD specification files do not exist: {', '.join(missing)}"
            )
        self._implementation_before = snapshot_files(self.implementation_paths)
        self._specification_defined = True

    def run_red(self) -> TestResult:
        """Execute the required failing (red) test run."""

        if self.phase is not TDDPhase.SPECIFICATION:
            raise TDDProtocolError("red phase can only start from specification")
        if not self._specification_defined:
            self.define_specification()
        result = run_tests(self.test_paths, cwd=self.cwd)
        self.history.append(result)
        if result.passed:
            raise TDDProtocolError(
                "TDD red phase must fail before implementation begins"
            )
        self.phase = TDDPhase.RED_CONFIRMED
        return result

    def mark_implementation(self) -> None:
        """Open the implementation phase after red has been confirmed."""

        if self.phase is not TDDPhase.RED_CONFIRMED:
            raise TDDProtocolError("implementation requires a confirmed red run")
        if self.implementation_paths:
            changed = detect_changed_files(
                self._implementation_before,
                snapshot_files(self.implementation_paths),
            )
            if not changed:
                raise TDDProtocolError(
                    "implementation phase requires a changed implementation file"
                )
        self.phase = TDDPhase.IMPLEMENTATION

    def run_green(self) -> TestResult:
        """Execute the green run after implementation has been supplied."""

        if self.phase is not TDDPhase.IMPLEMENTATION:
            raise TDDProtocolError("green phase requires implementation after red")
        result = run_tests(self.test_paths, cwd=self.cwd)
        self.history.append(result)
        if result.passed:
            self.phase = TDDPhase.GREEN
        return result

    def run(self) -> TestResult:
        """Run the next legal phase; kept as an explicit state-machine API."""

        if self.phase is TDDPhase.SPECIFICATION:
            return self.run_red()
        if self.phase is TDDPhase.RED_CONFIRMED:
            raise TDDProtocolError(
                "call mark_implementation() before the green run"
            )
        if self.phase is TDDPhase.IMPLEMENTATION:
            return self.run_green()
        raise TDDProtocolError("TDD cycle is already green")

    def all_passed(self) -> bool:
        return self.phase is TDDPhase.GREEN and bool(self.history)
