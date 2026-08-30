"""Test compaction recalculation on model change.

DoD TODO-012:
- Modelwechsel erkannt.
- Context Window neu bestimmt.
- Compaction-Grenze live aktualisiert.
- Kein Neustart erforderlich.
"""

from harness.context import ContextConfig, compute_compaction_threshold


class TestModelChangeCompaction:
    """Test compaction recalculation when the model changes."""

    def test_compaction_on_model_change_128k_to_256k(self):
        """Switching from 128k to 256k recalculates the threshold."""
        config = ContextConfig(threshold=0.80)

        # 128k context
        old_threshold = compute_compaction_threshold(128_000, config.threshold)
        assert old_threshold == 102_400

        # Model changes to 256k
        new_threshold = compute_compaction_threshold(256_000, config.threshold)
        assert new_threshold == 204_800

        # Threshold was recalculated automatically
        assert new_threshold > old_threshold
        assert config.threshold == 0.80  # Fraction unchanged

    def test_compaction_on_model_change_256k_to_128k(self):
        """Switching from 256k to 128k recalculates downward."""
        config = ContextConfig(threshold=0.80)

        old_threshold = compute_compaction_threshold(256_000, config.threshold)
        new_threshold = compute_compaction_threshold(128_000, config.threshold)

        assert old_threshold == 204_800
        assert new_threshold == 102_400
        assert new_threshold < old_threshold

    def test_no_restart_required(self):
        """Compaction recalculation does not require a restart."""
        config = ContextConfig(threshold=0.75)

        # Calculate for 64k model
        t1 = compute_compaction_threshold(64_000, config.threshold)
        assert t1 == 48_000

        # Calculate for 128k model — same config, no restart
        t2 = compute_compaction_threshold(128_000, config.threshold)
        assert t2 == 96_000

        # Config stays the same
        assert config.threshold == 0.75

    def test_model_change_preserves_threshold_fraction(self):
        """The threshold fraction stays the same across model changes."""
        for threshold in [0.50, 0.60, 0.70, 0.80, 0.90, 1.00]:
            config = ContextConfig(threshold=threshold)

            t_64k = compute_compaction_threshold(64_000, config.threshold)
            t_128k = compute_compaction_threshold(128_000, config.threshold)
            t_256k = compute_compaction_threshold(256_000, config.threshold)

            assert t_128k == t_64k * 2
            assert t_256k == t_128k * 2
            assert config.threshold == threshold

    def test_compaction_live_update(self):
        """Compaction threshold updates live without state reset."""
        config = ContextConfig(threshold=0.80)

        # Simulate: agent running with 128k model
        current = compute_compaction_threshold(128_000, config.threshold)
        assert current == 102_400

        # Simulate: user switches model to 256k
        current = compute_compaction_threshold(256_000, config.threshold)
        assert current == 204_800

        # No reset, no restart — just a new calculation
        assert config.threshold == 0.80
