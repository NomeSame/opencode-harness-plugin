"""Resolve presets to merged harnesses."""

from harness.data_model import Harness, Preset
from harness.merge import merge_harnesses


class PresetResolver:
    """Resolves presets to merged Harness instances."""

    def __init__(self, harness_store: dict[str, Harness]) -> None:
        self._store = harness_store

    def resolve(self, preset: Preset) -> Harness:
        """Resolve a preset to a merged Harness.

        Args:
            preset: The preset to resolve.

        Returns:
            A merged Harness containing all parameters from referenced harnesses.

        Raises:
            KeyError: If a referenced harness is not found.
        """
        missing = [name for name in preset.harnesses if name not in self._store]
        if missing:
            raise KeyError(
                f"Preset '{preset.name}' references unknown harnesses: {missing}"
            )

        harnesses = [self._store[name] for name in preset.harnesses]
        return merge_harnesses(harnesses)

    def resolve_by_name(self, preset_name: str, harnesses: list[Harness]) -> Harness:
        """Resolve a preset by name and list of harnesses.

        This is a convenience method for when harnesses are loaded
        but not yet stored in a PresetResolver.

        Args:
            preset_name: Name of the preset.
            harnesses: List of Harness instances in preset order.

        Returns:
            A merged Harness.
        """
        return merge_harnesses(harnesses)
