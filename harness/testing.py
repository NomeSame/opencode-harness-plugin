"""Testing strategy and execution policy.

This module deliberately contains policy, not an agent-loop implementation.
It answers *when* a test run is required and exposes that decision in a
structured form so an integration layer can execute it and return the result.
"""

from enum import StrEnum
from typing import Iterable


class TestStrategy(StrEnum):
    """Test execution strategy for the harness."""

    __test__ = False  # not a pytest test class

    DISABLED = "disabled"
    RUN_EXISTING = "run_existing"
    GENERATE_TDD = "generate_tdd"

    @classmethod
    def _missing_(cls, value):
        valid = ", ".join(sorted(m.value for m in cls))
        raise ValueError(
            f"Unknown test strategy: {value!r}. Valid options: {valid}"
        )

    def is_disabled(self) -> bool:
        return self == TestStrategy.DISABLED


class TestTrigger(StrEnum):
    """Events that can cause the configured test strategy to run."""

    __test__ = False  # not a pytest test class

    AFTER_CODE_CHANGES = "after_code_changes"
    BEFORE_FINISHING = "before_finishing"
    AFTER_EVERY_TOOL_OPERATION = "after_every_tool_operation"


class TestResult:
    """Outcome of a test run, handed back to the agent loop."""

    __test__ = False  # not a pytest test class

    def __init__(
        self,
        passed: bool,
        files: list[str],
        output: str = "",
        returncode: int | None = None,
    ) -> None:
        self.passed = passed
        self.files = files
        self.output = output
        self.returncode = returncode

    @property
    def should_continue(self) -> bool:
        """Whether an agent may continue after handing this result back.

        A failed test is feedback for the next iteration, not permission to
        silently finish.  The integration layer decides how to continue; the
        result itself never raises merely because an assertion failed.
        """

        return not self.passed


class TestExecutionDecision:
    """Auditable answer to whether a concrete trigger requires a test run."""

    __test__ = False

    def __init__(
        self,
        should_run: bool,
        strategy: TestStrategy,
        trigger: TestTrigger,
        reason: str,
        changed_files: tuple[str, ...] = (),
    ) -> None:
        self.should_run = should_run
        self.strategy = strategy
        self.trigger = trigger
        self.reason = reason
        self.changed_files = changed_files


class TestExecutionConfig:
    """When to execute tests, independent of the strategy."""

    __test__ = False  # not a pytest test class

    def __init__(
        self,
        after_code_changes: bool = False,
        before_finishing: bool = False,
        after_every_tool_operation: bool = False,
    ) -> None:
        self.after_code_changes = after_code_changes
        self.before_finishing = before_finishing
        self.after_every_tool_operation = after_every_tool_operation

    @staticmethod
    def _strategy(strategy: str | TestStrategy) -> TestStrategy:
        return strategy if isinstance(strategy, TestStrategy) else TestStrategy(strategy)

    @staticmethod
    def _trigger(trigger: str | TestTrigger) -> TestTrigger:
        return trigger if isinstance(trigger, TestTrigger) else TestTrigger(trigger)

    def decision(
        self,
        strategy: str | TestStrategy,
        trigger: str | TestTrigger,
        changed_files: Iterable[str] | None = None,
    ) -> TestExecutionDecision:
        """Return a concrete, explainable decision for one runtime event.

        ``AFTER_CODE_CHANGES`` only fires when the caller supplies at least
        one actually changed path.  This prevents a flag from turning every
        unrelated event into a test run.  The other triggers represent their
        event directly and therefore need no file list.
        """

        resolved_strategy = self._strategy(strategy)
        resolved_trigger = self._trigger(trigger)
        files = tuple(sorted({str(path) for path in (changed_files or ())}))

        if resolved_strategy is TestStrategy.DISABLED:
            return TestExecutionDecision(
                False,
                resolved_strategy,
                resolved_trigger,
                "test strategy is disabled",
                files,
            )

        enabled = {
            TestTrigger.AFTER_CODE_CHANGES: self.after_code_changes,
            TestTrigger.BEFORE_FINISHING: self.before_finishing,
            TestTrigger.AFTER_EVERY_TOOL_OPERATION: self.after_every_tool_operation,
        }[resolved_trigger]
        if not enabled:
            return TestExecutionDecision(
                False,
                resolved_strategy,
                resolved_trigger,
                f"{resolved_trigger.value} is disabled",
                files,
            )
        if resolved_trigger is TestTrigger.AFTER_CODE_CHANGES and not files:
            return TestExecutionDecision(
                False,
                resolved_strategy,
                resolved_trigger,
                "no changed files were reported",
                files,
            )
        return TestExecutionDecision(
            True,
            resolved_strategy,
            resolved_trigger,
            f"{resolved_trigger.value} is enabled",
            files,
        )

    def should_run_for(
        self,
        strategy: str | TestStrategy,
        trigger: str | TestTrigger,
        changed_files: Iterable[str] | None = None,
    ) -> bool:
        """Compatibility-friendly boolean view of :meth:`decision`."""

        return self.decision(strategy, trigger, changed_files).should_run

    def should_run(self, strategy: str | TestStrategy) -> bool:
        """Return whether any configured execution event is enabled.

        Kept for the original public API.  Runtime integrations should use
        :meth:`decision`/``should_run_for`` because they identify the event.
        """

        resolved_strategy = self._strategy(strategy)
        if resolved_strategy is TestStrategy.DISABLED:
            return False
        return any(
            (
                self.after_code_changes,
                self.before_finishing,
                self.after_every_tool_operation,
            )
        )
