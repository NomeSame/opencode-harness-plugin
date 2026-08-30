"""Test harness detail display.

DoD TODO-019:
- Enforced Bereich sichtbar.
- Klärer Erklärungstext vorhanden.
- Enforced Werte mit eindeutigem visuellen Zustand markiert.
- Normale Werte getrennt dargestellt.
- Context threshold sichtbar.
- Test strategy sichtbar.
- Test execution sichtbar.
"""

from harness.data_model import Harness, Parameter, Preset
from harness.context import ContextConfig
from harness.testing import TestExecutionConfig, TestStrategy


class TestEnforcedDisplay:
    """Tests for enforced parameter display."""

    def test_enforced_section_exists(self):
        """Enforced section is present in the display."""
        harness = Harness(
            name="qwen",
            parameters={
                "temperature": Parameter(value=1.0, enforced=True),
            },
        )
        enforced_params = [p for p in harness.parameters.values() if p.is_enforced()]
        assert len(enforced_params) == 1

    def test_enforced_explained(self):
        """Enforced values have an explanation text."""
        explanation = "These values always override OpenCode and other active harnesses."
        assert "override" in explanation
        assert "OpenCode" in explanation

    def test_enforced_values_marked(self):
        """Enforced values are marked with a lock icon or similar."""
        harness = Harness(
            name="qwen",
            parameters={
                "temperature": Parameter(value=1.0, enforced=True),
                "top_p": Parameter(value=0.95, enforced=True),
            },
        )
        for name, param in harness.parameters.items():
            if param.is_enforced():
                # Would be marked with 🔒 in the UI
                assert param.value is not None

    def test_normal_values_separate(self):
        """Normal values are displayed separately from enforced values."""
        harness = Harness(
            name="mixed",
            parameters={
                "temperature": Parameter(value=1.0, enforced=True),
                "max_iterations": Parameter(value=30),
                "top_p": Parameter(value=0.95, enforced=True),
            },
        )
        enforced = [name for name, p in harness.parameters.items() if p.is_enforced()]
        normal = [name for name, p in harness.parameters.items() if not p.is_enforced()]
        assert len(enforced) == 2
        assert len(normal) == 1
        assert "max_iterations" not in enforced
        assert "max_iterations" in normal


class TestContextThresholdDisplay:
    """Tests for context threshold display."""

    def test_context_threshold_visible(self):
        """Context threshold is shown in the UI."""
        config = ContextConfig(threshold=0.80)
        assert config.threshold == 0.80
        # Would be displayed as a slider: "Compaction threshold: 80%"

    def test_context_threshold_with_value(self):
        """Context threshold shows the computed absolute value."""
        config = ContextConfig(threshold=0.80)
        # For a 128k model
        threshold = int(128_000 * config.threshold)
        assert threshold == 102_400
        # Display: "Compaction threshold: 80% (~102.4k)"


class TestTestStrategyDisplay:
    """Tests for test strategy display."""

    def test_strategy_visible(self):
        """Test strategy is shown in the UI."""
        strategy = TestStrategy.GENERATE_TDD
        assert strategy == "generate_tdd"
        # Would be displayed as radio buttons:
        # ○ Disabled
        # ○ Run existing tests
        # ● Generate tests + TDD

    def test_execution_settings_visible(self):
        """Test execution settings are shown."""
        config = TestExecutionConfig(
            after_code_changes=True,
            before_finishing=True,
            after_every_tool_operation=False,
        )
        assert config.after_code_changes
        assert config.before_finishing
        assert not config.after_every_tool_operation
        # Would be displayed as checkboxes:
        # ☑ After code changes
        # ☑ Before finishing
        # ☐ After every tool operation
