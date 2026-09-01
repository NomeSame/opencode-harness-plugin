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

    def absolute_threshold(self, context_window: int) -> int:
        """Return this policy's absolute trigger for a model context window."""
        return compute_compaction_threshold(context_window, self.threshold)

    def is_compaction_due(self, used_tokens: int, context_window: int) -> bool:
        """Return whether the current usage has reached the configured trigger."""
        return should_compact(used_tokens, context_window, self.threshold)


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
    _validate_context_window(context_window)
    _validate_threshold(threshold)
    return int(context_window * threshold)


def should_compact(used_tokens: int, context_window: int, threshold: float) -> bool:
    """Return whether compaction should be triggered at the current usage.

    The comparison is inclusive: usage exactly at the calculated threshold is
    due for compaction. A threshold of ``0.0`` deliberately disables the
    trigger, even though every non-negative usage would otherwise compare
    greater than or equal to zero.
    """
    if isinstance(used_tokens, bool) or not isinstance(used_tokens, int):
        raise TypeError("used_tokens must be an integer")
    if used_tokens < 0:
        raise ValueError(f"used_tokens must be non-negative, got {used_tokens}")

    trigger = compute_compaction_threshold(context_window, threshold)
    return trigger > 0 and used_tokens >= trigger


def _validate_context_window(context_window: int) -> None:
    """Reject values that cannot describe a real model context window."""
    if isinstance(context_window, bool) or not isinstance(context_window, int):
        raise TypeError("context_window must be an integer")
    if context_window <= 0:
        raise ValueError(
            f"context_window must be greater than zero, got {context_window}"
        )


def _validate_threshold(threshold: float) -> None:
    """Validate a threshold used outside ContextConfig as well."""
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
        raise TypeError("threshold must be a number")
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(
            f"threshold must be between 0.0 and 1.0, got {threshold}"
        )
