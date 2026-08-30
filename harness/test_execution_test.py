"""Test test execution data model.

DoD TODO-014:
- Jede Einstellung separat aktivierbar.
- Mehrere Einstellungen gleichzeitig möglich.
- Zustand wird im Harness gespeichert.
"""

from harness.testing import TestExecutionConfig


class TestExecutionConfigSeparateFlags:
    """Test that each execution flag can be toggled independently."""

    def test_each_flag_independent(self):
        """All three flags can be independently enabled/disabled."""
        cfg = TestExecutionConfig(
            after_code_changes=False,
            before_finishing=False,
            after_every_tool_operation=False,
        )
        assert not cfg.after_code_changes
        assert not cfg.before_finishing
        assert not cfg.after_every_tool_operation

        cfg.after_code_changes = True
        assert cfg.after_code_changes
        assert not cfg.before_finishing
        assert not cfg.after_every_tool_operation

        cfg.before_finishing = True
        assert cfg.after_code_changes
        assert cfg.before_finishing
        assert not cfg.after_every_tool_operation

        cfg.after_every_tool_operation = True
        assert cfg.after_code_changes
        assert cfg.before_finishing
        assert cfg.after_every_tool_operation

    def test_single_flag_only(self):
        """Only after_code_changes enabled."""
        cfg = TestExecutionConfig(after_code_changes=True)
        assert cfg.after_code_changes
        assert not cfg.before_finishing
        assert not cfg.after_every_tool_operation

    def test_two_flags_enabled(self):
        """after_code_changes + before_finishing enabled."""
        cfg = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
        )
        assert cfg.after_code_changes
        assert cfg.before_finishing
        assert not cfg.after_every_tool_operation

    def test_all_flags_disabled(self):
        """All flags can be disabled."""
        cfg = TestExecutionConfig(
            after_code_changes=False,
            before_finishing=False,
            after_every_tool_operation=False,
        )
        assert not cfg.should_run("run_existing")
        assert not cfg.should_run("generate_tdd")
