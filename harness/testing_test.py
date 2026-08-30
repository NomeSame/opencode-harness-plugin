"""Test testing strategy data model.

DoD TODO-013:
- Drei Zustände existieren.
- Zustand wird im Harness gespeichert.
- Default ist definiert.
- Keine Testausführung bei Disabled.
"""

from harness.testing import TestStrategy, TestExecutionConfig


class TestTestStrategy:
    """Tests for the TestStrategy string constants."""

    def test_three_states_exist(self):
        """Disabled, Run existing, Generate TDD — three states."""
        assert TestStrategy.DISABLED == "disabled"
        assert TestStrategy.RUN_EXISTING == "run_existing"
        assert TestStrategy.GENERATE_TDD == "generate_tdd"

    def test_all_states_distinct(self):
        """All three states have distinct values."""
        values = [TestStrategy.DISABLED, TestStrategy.RUN_EXISTING, TestStrategy.GENERATE_TDD]
        assert len(values) == len(set(values))

    def test_from_string_disabled(self):
        s = TestStrategy("disabled")
        assert s == TestStrategy.DISABLED

    def test_from_string_run_existing(self):
        s = TestStrategy("run_existing")
        assert s == TestStrategy.RUN_EXISTING

    def test_from_string_generate_tdd(self):
        s = TestStrategy("generate_tdd")
        assert s == TestStrategy.GENERATE_TDD

    def test_from_string_invalid_raises(self):
        try:
            TestStrategy("invalid")
            assert False, "Expected ValueError"
        except ValueError:
            pass

    def test_default_is_disabled(self):
        assert TestStrategy.DISABLED == "disabled"

    def test_is_disabled_method(self):
        assert TestStrategy.DISABLED.is_disabled()
        assert not TestStrategy.RUN_EXISTING.is_disabled()
        assert not TestStrategy.GENERATE_TDD.is_disabled()


class TestTestExecutionConfig:
    """Tests for the TestExecutionConfig data model."""

    def test_all_false_by_default(self):
        cfg = TestExecutionConfig()
        assert not cfg.after_code_changes
        assert not cfg.before_finishing
        assert not cfg.after_every_tool_operation

    def test_enable_all(self):
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
            after_every_tool_operation=True,
        )
        assert cfg.after_code_changes
        assert cfg.before_finishing
        assert cfg.after_every_tool_operation

    def test_enable_selective(self):
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        assert cfg.after_code_changes
        assert cfg.before_finishing
        assert not cfg.after_every_tool_operation

    def test_disabled_strategy_no_execution(self):
        """When strategy is disabled, no tests should run."""
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        strategy = TestStrategy.DISABLED
        assert strategy.is_disabled()
        assert not cfg.should_run(strategy)

    def test_existing_strategy_runs(self):
        """Run existing strategy triggers tests."""
        cfg = TestExecutionConfig(
            after_code_changes=True,
        )
        strategy = TestStrategy.RUN_EXISTING
        assert cfg.should_run(strategy)

    def test_tdd_strategy_runs(self):
        """Generate TDD strategy triggers tests."""
        cfg = TestExecutionConfig(
            before_finishing=True,
        )
        strategy = TestStrategy.GENERATE_TDD
        assert cfg.should_run(strategy)

    def test_execution_flag_required_for_run(self):
        """Even with a valid strategy, execution must be enabled."""
        cfg = TestExecutionConfig(after_code_changes=False)
        strategy = TestStrategy.RUN_EXISTING
        assert not cfg.should_run(strategy)