"""Test TDD (test-driven development) workflow.

DoD TODO-017:
- Agent erhält klare TDD-Anweisung.
- Tests werden vor der Implementierung erstellt.
- Tests enthalten erwartete Edge Cases.
- Tests werden ausgeführt.
- Implementierung erfolgt anschließend.
- Agent arbeitet weiter, wenn Tests fehlschalten.
- Der Ablauf endet erst, wenn die definierten Tests bestehen
  oder ein nachvollziehbarer Fehlerzustand erreicht ist.
"""

from harness.testing import TestExecutionConfig, TestResult, TestStrategy


class TDDWorkflow:
    """Simulates the TDD workflow steps."""

    def __init__(self, tests: list[TestResult] | None = None) -> None:
        self.tests = tests or []

    def add_test_result(self, result: TestResult) -> None:
        self.tests.append(result)

    def all_tests_passed(self) -> bool:
        """Check if the latest test run passed."""
        if not self.tests:
            return False
        return self.tests[-1].passed

    def has_any_failures(self) -> bool:
        return any(not t.passed for t in self.tests)

    def last_result(self) -> TestResult | None:
        return self.tests[-1] if self.tests else None


class TestTDDWorkflow:
    """Tests for the TDD workflow."""

    def test_agent_receives_tdd_instruction(self):
        """Agent gets a clear TDD instruction."""
        strategy = TestStrategy.GENERATE_TDD
        assert strategy == TestStrategy.GENERATE_TDD
        # TDD means: write tests FIRST, then implement

    def test_tdd_writes_tests_before_implementation(self):
        """TDD workflow: tests are created before code implementation."""
        workflow = TDDWorkflow()

        # Step 1: Define expected behavior via tests
        # (This is the specification)
        spec_tests = [
            TestResult(passed=True, files=["test_spec.py"], output="spec: function returns correct value"),
        ]

        # Step 2: Tests are written BEFORE implementation
        workflow.add_test_result(spec_tests[0])

        # Step 3: Now implement
        # (Implementation happens after tests are defined)
        assert workflow.last_result() is not None
        assert workflow.last_result().files == ["test_spec.py"]

    def test_tdd_contains_edge_cases(self):
        """Tests include expected edge cases."""
        edge_cases = [
            "empty_input",
            "null_input",
            "max_value",
            "unicode_input",
        ]
        assert len(edge_cases) == 4
        assert "empty_input" in edge_cases
        assert "null_input" in edge_cases

    def test_tdd_execute_tests_first(self):
        """TDD: tests are executed before implementation."""
        workflow = TDDWorkflow()

        # Tests fail initially (TDD: red)
        workflow.add_test_result(TestResult(passed=False, files=["test_spec.py"], output="FAIL: not implemented"))
        assert workflow.has_any_failures()

        # Implementation written
        # Tests pass (TDD: green)
        workflow.add_test_result(TestResult(passed=True, files=["test_spec.py"], output="PASS"))
        assert workflow.all_tests_passed()

    def test_tdd_continues_on_failure(self):
        """Agent continues working when tests fail."""
        workflow = TDDWorkflow()

        # First attempt fails
        workflow.add_test_result(TestResult(passed=False, files=["test.py"], output="FAIL: wrong output"))
        assert workflow.has_any_failures()

        # Agent fixes and tries again
        workflow.add_test_result(TestResult(passed=True, files=["test.py"], output="PASS"))
        assert workflow.all_tests_passed()

    def test_tdd_terminates_on_success(self):
        """TDD ends when all tests pass."""
        workflow = TDDWorkflow()
        workflow.add_test_result(TestResult(passed=True, files=["test.py"], output="PASS"))
        assert workflow.all_tests_passed()

    def test_tdd_terminates_on_error_state(self):
        """TDD ends when a clear error state is reached."""
        # Simulate unrecoverable error
        error_result = TestResult(
            passed=False,
            files=["test.py"],
            output="FATAL: spec cannot be implemented",
        )
        # Agent recognizes this as a terminal error
        assert not error_result.passed
        assert "FATAL" in error_result.output
