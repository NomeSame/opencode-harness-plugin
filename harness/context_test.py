"""Test compaction threshold configuration.

DoD TODO-011:
- 0.80 bedeutet 80%.
- Absolute Context-Größe wird aus dem aktuellen Model bestimmt.
- Kein fest eingebauter Reserve-Wert ist für den Harness notwendig.
- Bei 128k wird ungefähr bei 102.4k getriggert.
- Bei 256k wird ungefähr bei 204.8k getriggert.
"""

from harness.context import ContextConfig, compute_compaction_threshold


class TestContextConfig:
    """Tests for the ContextConfig data model."""

    def test_context_config_default_threshold(self):
        cfg = ContextConfig()
        assert cfg.threshold == 0.80

    def test_context_config_custom_threshold(self):
        cfg = ContextConfig(threshold=0.75)
        assert cfg.threshold == 0.75

    def test_context_config_threshold_bounds(self):
        """Threshold should be between 0 and 1."""
        cfg = ContextConfig(threshold=0.0)
        assert cfg.threshold == 0.0

        cfg = ContextConfig(threshold=1.0)
        assert cfg.threshold == 1.0


class TestComputeCompactionThreshold:
    """Tests for compaction threshold computation."""

    def test_80_percent_of_128k(self):
        """128k context × 0.80 = 102.4k."""
        threshold = compute_compaction_threshold(128_000, 0.80)
        assert threshold == 102_400

    def test_80_percent_of_256k(self):
        """256k context × 0.80 = 204.8k."""
        threshold = compute_compaction_threshold(256_000, 0.80)
        assert threshold == 204_800

    def test_100_percent_of_context(self):
        """100% threshold means trigger at full context."""
        threshold = compute_compaction_threshold(64_000, 1.0)
        assert threshold == 64_000

    def test_50_percent_of_context(self):
        """50% threshold means trigger at half context."""
        threshold = compute_compaction_threshold(64_000, 0.50)
        assert threshold == 32_000

    def test_threshold_0_means_no_compaction(self):
        """0 threshold means no compaction trigger."""
        threshold = compute_compaction_threshold(64_000, 0.0)
        assert threshold == 0

    def test_large_context_window(self):
        """256k context with 80% threshold."""
        threshold = compute_compaction_threshold(256_000, 0.80)
        assert threshold == 204_800

    def test_small_context_window(self):
        """16k context with 80% threshold."""
        threshold = compute_compaction_threshold(16_000, 0.80)
        assert threshold == 12_800

    def test_no_fixed_reserve_value(self):
        """The harness should not bake in any fixed reserve value.
        The threshold is purely percentage-based."""
        # Same threshold, different context sizes — ratio stays constant
        t1 = compute_compaction_threshold(64_000, 0.80)
        t2 = compute_compaction_threshold(128_000, 0.80)
        assert t2 / t1 == 2.0  # Double the context = double the trigger
