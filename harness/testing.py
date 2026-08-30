"""Testing strategy and execution configuration."""

from enum import StrEnum


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


class TestResult:
    """Outcome of a test run, handed back to the agent loop."""

    __test__ = False  # not a pytest test class

    def __init__(self, passed: bool, files: list[str], output: str = "") -> None:
        self.passed = passed
        self.files = files
        self.output = output


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

    def should_run(self, strategy: str | TestStrategy) -> bool:
        if strategy == TestStrategy.DISABLED:
            return False
        if self.after_code_changes:
            return True
        if self.before_finishing:
            return True
        if self.after_every_tool_operation:
            return True
        return False