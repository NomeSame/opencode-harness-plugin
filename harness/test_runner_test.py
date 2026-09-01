"""Integration and edge-case tests for the real test runner and TDD protocol."""

import pytest

from harness.test_runner import (
    TDDPhase,
    TDDProtocolError,
    TDDRunner,
    TestingCoordinator,
    detect_changed_files,
    run_tests,
    snapshot_files,
)
from harness.testing import TestExecutionConfig, TestStrategy, TestTrigger


class TestSnapshotAndChangeDetection:
    def test_detects_content_change(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("x = 1")
        before = snapshot_files([str(f)])
        f.write_text("x = 2")
        after = snapshot_files([str(f)])
        assert detect_changed_files(before, after) == [str(f)]

    def test_no_change_detected_when_content_identical(self, tmp_path):
        f = tmp_path / "a.py"
        f.write_text("x = 1")
        before = snapshot_files([str(f)])
        after = snapshot_files([str(f)])
        assert detect_changed_files(before, after) == []

    def test_detects_new_file(self, tmp_path):
        f = tmp_path / "new.py"
        before = snapshot_files([str(f)])
        f.write_text("x = 1")
        after = snapshot_files([str(f)])
        assert detect_changed_files(before, after) == [str(f)]

    def test_missing_file_hashes_to_empty_string(self, tmp_path):
        f = tmp_path / "missing.py"
        assert snapshot_files([str(f)]) == {str(f): ""}


class TestRunTests:
    def test_run_tests_reports_pass(self, tmp_path):
        test_file = tmp_path / "test_ok.py"
        test_file.write_text("def test_ok():\n    assert True\n")
        result = run_tests([str(test_file)])
        assert result.passed
        assert result.files == [str(test_file)]

    def test_run_tests_reports_failure(self, tmp_path):
        test_file = tmp_path / "test_fail.py"
        test_file.write_text("def test_fail():\n    assert False\n")
        result = run_tests([str(test_file)])
        assert not result.passed
        assert "assert" in result.output.lower() or "fail" in result.output.lower()

    def test_empty_test_selection_is_a_visible_error(self):
        with pytest.raises(ValueError, match="at least one test path"):
            run_tests([])

    def test_invalid_working_directory_returns_failure_to_caller(self, tmp_path):
        result = run_tests([str(tmp_path / "test_missing.py")], cwd=tmp_path / "gone")
        assert not result.passed
        assert result.returncode is None
        assert "could not execute pytest" in result.output


class TestTDDRunner:
    def test_red_then_green_cycle(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        implementation = tmp_path / "implementation.txt"
        test_file.write_text(
            "from pathlib import Path\n"
            "def test_spec():\n"
            "    assert Path('implementation.txt').read_text() == 'green'\n"
        )
        implementation.write_text("red")
        runner = TDDRunner(
            [str(test_file)],
            cwd=tmp_path,
            implementation_paths=[str(implementation)],
        )

        runner.define_specification()
        red = runner.run_red()
        assert not red.passed
        assert red.returncode != 0
        assert runner.phase is TDDPhase.RED_CONFIRMED
        assert not runner.all_passed()

        implementation.write_text("green")
        runner.mark_implementation()
        assert runner.phase is TDDPhase.IMPLEMENTATION
        green = runner.run_green()
        assert green.passed
        assert green.returncode == 0
        assert runner.phase is TDDPhase.GREEN
        assert runner.all_passed()
        assert runner.history == [red, green]

    def test_all_passed_false_before_any_run(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        test_file.write_text("def test_spec():\n    assert True\n")
        runner = TDDRunner([str(test_file)])
        assert not runner.all_passed()

    def test_green_is_rejected_before_red(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        test_file.write_text("def test_spec():\n    assert True\n")
        runner = TDDRunner([str(test_file)])
        with pytest.raises(TDDProtocolError, match="green phase"):
            runner.run_green()

    def test_implementation_is_rejected_before_red(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        test_file.write_text("def test_spec():\n    assert False\n")
        runner = TDDRunner([str(test_file)])
        with pytest.raises(TDDProtocolError, match="confirmed red"):
            runner.mark_implementation()

    def test_unchanged_implementation_cannot_skip_implementation_step(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        implementation = tmp_path / "implementation.py"
        test_file.write_text("def test_spec():\n    assert False\n")
        implementation.write_text("value = 'red'\n")
        runner = TDDRunner(
            [str(test_file)],
            cwd=tmp_path,
            implementation_paths=[str(implementation)],
        )
        runner.run_red()
        with pytest.raises(TDDProtocolError, match="changed implementation"):
            runner.mark_implementation()

    def test_failed_green_run_keeps_cycle_open_for_next_attempt(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        implementation = tmp_path / "implementation.txt"
        test_file.write_text(
            "from pathlib import Path\n"
            "def test_spec():\n"
            "    assert Path('implementation.txt').read_text() == 'green'\n"
        )
        implementation.write_text("red")
        runner = TDDRunner(
            [str(test_file)],
            cwd=tmp_path,
            implementation_paths=[str(implementation)],
        )
        runner.run_red()
        implementation.write_text("still-red")
        runner.mark_implementation()
        failed_green = runner.run_green()
        assert not failed_green.passed
        assert failed_green.should_continue
        assert runner.phase is TDDPhase.IMPLEMENTATION
        implementation.write_text("green")
        passed_green = runner.run_green()
        assert passed_green.passed
        assert runner.phase is TDDPhase.GREEN

    def test_red_requires_existing_specification_file(self, tmp_path):
        runner = TDDRunner([str(tmp_path / "missing_test.py")])
        with pytest.raises(FileNotFoundError, match="specification files"):
            runner.run_red()


class TestTestingCoordinator:
    def _passing_test(self, tmp_path):
        test_file = tmp_path / "test_ok.py"
        test_file.write_text("def test_ok():\n    assert True\n")
        return test_file

    def test_disabled_never_executes_any_trigger(self, tmp_path):
        test_file = self._passing_test(tmp_path)
        coordinator = TestingCoordinator(
            TestStrategy.DISABLED,
            TestExecutionConfig(
                after_code_changes=True,
                before_finishing=True,
                after_every_tool_operation=True,
            ),
            [str(test_file)],
        )
        assert coordinator.execute(TestTrigger.AFTER_CODE_CHANGES, ["x.py"]) is None
        assert coordinator.execute(TestTrigger.BEFORE_FINISHING) is None
        assert coordinator.execute(TestTrigger.AFTER_EVERY_TOOL_OPERATION) is None
        assert coordinator.runs == []
        assert coordinator.can_finish()

    def test_run_existing_executes_after_real_code_change(self, tmp_path):
        test_file = self._passing_test(tmp_path)
        coordinator = TestingCoordinator(
            TestStrategy.RUN_EXISTING,
            TestExecutionConfig(after_code_changes=True),
            [str(test_file)],
            cwd=tmp_path,
        )
        assert coordinator.execute(TestTrigger.AFTER_CODE_CHANGES, []) is None
        result = coordinator.execute(
            TestTrigger.AFTER_CODE_CHANGES,
            ["src/main.py", "src/main.py"],
        )
        assert result is not None and result.passed
        assert coordinator.runs[0].decision.changed_files == ("src/main.py",)

    def test_all_execution_triggers_are_independent_and_real(self, tmp_path):
        test_file = self._passing_test(tmp_path)
        coordinator = TestingCoordinator(
            TestStrategy.GENERATE_TDD,
            TestExecutionConfig(
                after_code_changes=True,
                before_finishing=True,
                after_every_tool_operation=True,
            ),
            [str(test_file)],
            cwd=tmp_path,
        )
        for trigger, changed_files in (
            (TestTrigger.AFTER_CODE_CHANGES, ["code.py"]),
            (TestTrigger.BEFORE_FINISHING, None),
            (TestTrigger.AFTER_EVERY_TOOL_OPERATION, None),
        ):
            result = coordinator.execute(trigger, changed_files)
            assert result is not None and result.passed
        assert [run.decision.trigger for run in coordinator.runs] == [
            TestTrigger.AFTER_CODE_CHANGES,
            TestTrigger.BEFORE_FINISHING,
            TestTrigger.AFTER_EVERY_TOOL_OPERATION,
        ]
        assert coordinator.can_finish()

    def test_failure_is_returned_for_continuation_and_blocks_finish(self, tmp_path):
        test_file = tmp_path / "test_fail.py"
        test_file.write_text("def test_fail():\n    assert False\n")
        coordinator = TestingCoordinator(
            TestStrategy.RUN_EXISTING,
            TestExecutionConfig(before_finishing=True),
            [str(test_file)],
            cwd=tmp_path,
        )
        result = coordinator.execute(TestTrigger.BEFORE_FINISHING)
        assert result is not None and not result.passed
        assert result.should_continue
        assert coordinator.last_failure() is result
        assert not coordinator.can_finish()
