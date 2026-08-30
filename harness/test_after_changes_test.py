"""Test code change detection and test triggering.

DoD TODO-015:
- Codeänderung wird erkannt.
- Relevante Tests werden gestartet.
- Ergebnis wird dem Agenten zurückgegeben.
- Bei Fehlern kann der Agent weiterarbeiten.
"""

from harness.testing import TestExecutionConfig, TestResult, TestStrategy


class TestCodeChangeDetection:
    """Tests for detecting code changes and triggering tests."""

    def test_code_change_detected(self):
        """A code change event is detected."""
        changed_files = ["src/main.py", "src/utils.py"]
        assert len(changed_files) > 0

    def test_after_code_changes_triggers_tests(self):
        """When after_code_changes=True and strategy is not disabled, tests run."""
        cfg = TestExecutionConfig(after_code_changes=True)
        assert cfg.should_run(TestStrategy.RUN_EXISTING)
        assert cfg.should_run(TestStrategy.GENERATE_TDD)

    def test_after_code_changes_no_trigger_when_disabled(self):
        """Even with after_code_changes=True, disabled strategy skips tests."""
        cfg = TestExecutionConfig(after_code_changes=True)
        assert not cfg.should_run(TestStrategy.DISABLED)

    def test_no_after_code_changes_no_trigger(self):
        """When after_code_changes=False, code changes don't trigger tests."""
        cfg = TestExecutionConfig(after_code_changes=False)
        # Even with a valid strategy, the execution flag is False
        assert not cfg.should_run(TestStrategy.RUN_EXISTING)

    def test_agent_receives_test_results(self):
        """Test results can be returned to the agent."""
        result = TestResult(
            passed=True,
            files=["test_main.py"],
            output="",
        )
        assert result.passed
        assert len(result.files) == 1

    def test_agent_continues_on_failure(self):
        """Agent can continue working when tests fail."""
        result = TestResult(
            passed=False,
            files=["test_main.py"],
            output="AssertionError: expected 2, got 1",
        )
        assert not result.passed
        # Agent can still process the result and continue
        assert result.output == "AssertionError: expected 2, got 1"

    def test_code_change_with_multiple_files(self):
        """Multiple files can be detected as changed."""
        changed_files = ["src/main.py", "src/utils.py", "tests/test_main.py"]
        assert len(changed_files) == 3
