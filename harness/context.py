"""Context management — compaction threshold configuration."""


class ContextConfig:
    """Configuration for context compaction."""

    def __init__(self, threshold: float = 0.80) -> None:
        """Initialize context configuration.

        Args:
            threshold: Fraction of context window at which to trigger compaction.
                       0.0 = no compaction, 1.0 = trigger at full capacity.
                       Default is 0.80 (80%).

        Raises:
            ValueError: If threshold is not between 0.0 and 1.0 inclusive.
        """
        if not 0.0 <= threshold <= 1.0:
            raise ValueError(
                f"threshold must be between 0.0 and 1.0, got {threshold}"
            )
        self.threshold = threshold


def compute_compaction_threshold(context_window: int, threshold: float) -> int:
    """Compute the absolute compaction trigger based on context window and threshold.

    The threshold is a fraction (0.0–1.0) of the available context window.
    No fixed reserve value is baked in — the trigger scales purely with
    the context window size.

    Examples:
        128k × 0.80 = 102,400
        256k × 0.80 = 204,800

    Args:
        context_window: Available context window size in tokens.
        threshold: Fraction of context window (0.0 to 1.0).

    Returns:
        Absolute token count at which compaction should trigger.
    """
    return int(context_window * threshold)
