"""Merge multiple harnesses into a single combined harness."""

from harness.data_model import Harness, Parameter


def merge_harnesses(harnesses: list[Harness]) -> Harness:
    """Merge multiple harnesses into one.

    Rules:
    - Parameters from later harnesses overwrite earlier ones (by default).
    - If any harness marks a parameter as enforced, the last enforced value wins.
    - Enforced parameters always beat normal parameters regardless of order.

    Args:
        harnesses: List of Harness instances to merge. Order matters.

    Returns:
        A combined Harness with all parameters merged according to the rules.
    """
    merged_params: dict[str, Parameter] = {}
    merged_name = ""

    for harness in harnesses:
        merged_name = harness.name or merged_name
        for name, param in harness.parameters.items():
            if name not in merged_params:
                merged_params[name] = param
                continue

            existing = merged_params[name]
            if param.is_enforced():
                merged_params[name] = param
            elif existing.is_enforced():
                # Existing enforced wins — keep it
                pass
            else:
                # Neither enforced — later wins
                merged_params[name] = param

    return Harness(
        name=merged_name,
        parameters=merged_params,
    )
