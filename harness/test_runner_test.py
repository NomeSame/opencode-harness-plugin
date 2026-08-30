"""Tests for real code-change detection and test execution (TODO-015/016/017)."""

from harness.test_runner import TDDRunner, detect_changed_files, run_tests, snapshot_files


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


class TestTDDRunner:
    def test_red_then_green_cycle(self, tmp_path):
        test_file = tmp_path / "test_spec.py"
        test_file.write_text("def test_spec():\n    assert False\n")
        runner = TDDRunner([str(test_file)])

        red = runner.run()
        assert not red.passed
        assert not runner.all_passed()

        test_file.write_text("def test_spec():\n    assert True\n")
        green = runner.run()
        assert green.passed
        assert runner.all_passed()
        assert runner.history == [red, green]

    def test_all_passed_false_before_any_run(self, tmp_path):
        runner = TDDRunner([str(tmp_path / "test_spec.py")])
        assert not runner.all_passed()
