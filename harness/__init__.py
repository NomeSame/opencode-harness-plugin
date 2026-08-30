"""OpenCode Harness -- configurable policy layer between OpenCode and the model."""

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict, load_harness_from_file, load_preset_from_file
from harness.merge import merge_harnesses
from harness.preset import PresetResolver
from harness.context import ContextConfig, compute_compaction_threshold
from harness.testing import TestStrategy, TestExecutionConfig, TestResult
from harness.editor import HarnessEditor
from harness.test_runner import TDDRunner, detect_changed_files, run_tests, snapshot_files

__all__ = [
    "Harness",
    "Parameter",
    "Preset",
    "load_harness_from_dict",
    "load_harness_from_file",
    "load_preset_from_file",
    "merge_harnesses",
    "PresetResolver",
    "ContextConfig",
    "compute_compaction_threshold",
    "TestStrategy",
    "TestExecutionConfig",
    "TestResult",
    "HarnessEditor",
    "TDDRunner",
    "detect_changed_files",
    "run_tests",
    "snapshot_files",
]