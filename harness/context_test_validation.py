"""Tests für TODO-035: ContextConfig threshold validation.

DoD:
- Werte ausserhalb [0, 1] loesen ValueError mit verstaendlicher Meldung aus.
- Gueltige Werte (inkl. Randwerte 0 und 1) funktionieren weiterhin.
- Test deckt mindestens einen unguenstigen und die beiden Randwerte ab.
"""

import pytest

from harness.context import ContextConfig


class TestContextConfigThresholdValidation:
    """Tests for threshold validation (TODO-035)."""

    def test_threshold_zero_is_valid(self):
        """0.0 is the lower bound and should be valid."""
        cfg = ContextConfig(threshold=0.0)
        assert cfg.threshold == 0.0

    def test_threshold_one_is_valid(self):
        """1.0 is the upper bound and should be valid."""
        cfg = ContextConfig(threshold=1.0)
        assert cfg.threshold == 1.0

    def test_threshold_negative_raises_value_error(self):
        """Negative thresholds must raise ValueError."""
        with pytest.raises(ValueError, match="threshold"):
            ContextConfig(threshold=-0.1)

    def test_threshold_over_one_raises_value_error(self):
        """Thresholds above 1.0 must raise ValueError."""
        with pytest.raises(ValueError, match="threshold"):
            ContextConfig(threshold=1.1)

    def test_threshold_extreme_negative_raises_value_error(self):
        with pytest.raises(ValueError, match="threshold"):
            ContextConfig(threshold=-100)

    def test_threshold_extreme_over_one_raises_value_error(self):
        with pytest.raises(ValueError, match="threshold"):
            ContextConfig(threshold=999.0)

    def test_error_message_contains_invalid_value(self):
        """Error message should name the invalid value."""
        with pytest.raises(ValueError) as exc_info:
            ContextConfig(threshold=2.5)
        assert "2.5" in str(exc_info.value)
