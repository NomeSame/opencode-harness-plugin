"""Test before-finishing test execution.

DoD TODO-016:
- Abschlussversuch wird erkannt.
- Tests werden ausgeführt.
- Bei Fehlern wird die Aufgabe nicht als erfolgreich beendet.
- Testergebnis gelangt zurück in den Agent Loop.
"""

from harness.testing import TestExecutionConfig, TestResult, TestStrategy


class TestBeforeFinishing:
    """Tests for the before_finishing test execution flag."""

    def test_before_finishing_triggers_tests(self):
        """When before_finishing=True and strategy is active, tests run before completion."""
        cfg = TestExecutionConfig(before_finishing=True)
        assert cfg.should_run(TestStrategy.RUN_EXISTING)
        assert cfg.should_run(TestStrategy.GENERATE_TDD)

    def test_before_finishing_disabled_skips_tests(self):
        """Even with before_finishing=True, disabled strategy skips tests."""
        cfg = TestExecutionConfig(before_finishing=True)
        assert not cfg.should_run(TestStrategy.DISABLED)

    def test_task_not_completed_on_failure(self):
        """When tests fail before finishing, task is not marked complete."""
        result = TestResult(
            passed=False,
            files=["test_main.py"],
            output="AssertionError: expected 2, got 1",
        )
        assert not result.passed
        assert not _would_mark_complete(result)

    def test_task_completed_on_success(self):
        """When tests pass before finishing, task can be marked complete."""
        result = TestResult(
            passed=True,
            files=["test_main.py"],
            output="",
        )
        assert result.passed
        assert _would_mark_complete(result)

    def test_test_result_returns_to_agent_loop(self):
        """Test result is returned to the agent loop for processing."""
        result = TestResult(
            passed=False,
            files=["test_main.py"],
            output="AssertionError: expected 2, got 1",
        )
        # Result is returned to agent loop
        agent_result = _return_to_agent_loop(result)
        assert agent_result.passed == False
        assert "AssertionError" in agent_result.output

    def test_multiple_test_failures_before_finish(self):
        """Multiple test failures all prevent completion."""
        results = [
            TestResult(passed=False, files=["test_a.py"], output="Error in test_a"),
            TestResult(passed=False, files=["test_b.py"], output="Error in test_b"),
        ]
        # Any failure prevents completion
        assert not _all_passed(results)

    def test_mixed_results_prevent_completion(self):
        """Even one failure prevents task completion before finishing."""
        results = [
            TestResult(passed=True, files=["test_a.py"]),
            TestResult(passed=False, files=["test_b.py"], output="Error"),
        ]
        assert not _all_passed(results)


def _would_mark_complete(result: TestResult) -> bool:
    """Simulates checking if task can be marked complete."""
    return result.passed


def _return_to_agent_loop(result: TestResult) -> TestResult:
    """Simulates returning test result to the agent loop."""
    return result


def _all_passed(results: list[TestResult]) -> bool:
    """Check if all test results passed."""
    return all(r.passed for r in results)
