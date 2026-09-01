"""Runtime-near coordination of model, preset and context state.

This module owns session transitions only. Presets and harnesses remain the
existing domain objects and are resolved by :class:`PresetResolver`.
"""

from dataclasses import dataclass
from collections.abc import Iterable, Mapping

from harness.context import ContextConfig, should_compact
from harness.data_model import Harness, Preset
from harness.merge import merge_harnesses
from harness.preset import PresetResolver


@dataclass(frozen=True)
class RuntimeSnapshot:
    """Immutable view of the effective session configuration."""

    model_id: str | None
    active_preset: Preset | None
    effective_harness: Harness
    manual_preset: bool
    context_window: int | None
    compaction_threshold: int | None


class HarnessRuntimeCoordinator:
    """Coordinate model changes and session-local preset selection.

    A preset whose existing ``Preset.model`` field matches the selected model
    is the model default. A manual selection is session-local and remains in
    force across model changes until :meth:`clear_manual_preset` is called.
    Models without a default never inherit the previous model's automatic
    preset; they produce an empty effective harness.
    """

    def __init__(
        self,
        presets: Mapping[str, Preset] | Iterable[Preset],
        harness_store: Mapping[str, Harness],
        model_context_windows: Mapping[str, int],
        context_config: ContextConfig | None = None,
    ) -> None:
        self._presets = self._index_presets(presets)
        self._defaults_by_model = self._index_model_defaults(self._presets.values())
        self._resolver = PresetResolver(dict(harness_store))
        self._context_windows = dict(model_context_windows)
        for context_window in self._context_windows.values():
            self._validate_context_window(context_window)

        # A context policy is active only when a Long-Context harness supplies
        # one, unless an explicit runtime-wide policy was requested by the
        # caller.  A model without a default preset must not inherit a hidden
        # compaction override.
        self._fallback_context_config = context_config
        self._context_config: ContextConfig | None = context_config
        self._model_id: str | None = None
        self._active_preset: Preset | None = None
        self._manual_preset = False
        self._context_window: int | None = None
        self._compaction_threshold: int | None = None

    @staticmethod
    def _index_presets(
        presets: Mapping[str, Preset] | Iterable[Preset],
    ) -> dict[str, Preset]:
        values = presets.values() if isinstance(presets, Mapping) else presets
        indexed: dict[str, Preset] = {}
        for preset in values:
            if not preset.name:
                raise ValueError("Preset names must not be empty")
            if preset.name in indexed:
                raise ValueError(f"Duplicate preset name: {preset.name}")
            indexed[preset.name] = preset
        return indexed

    @staticmethod
    def _index_model_defaults(presets: Iterable[Preset]) -> dict[str, Preset]:
        defaults: dict[str, Preset] = {}
        for preset in presets:
            if not preset.model:
                continue
            existing = defaults.get(preset.model)
            if existing is not None and existing.name != preset.name:
                raise ValueError(
                    f"Multiple default presets configured for model '{preset.model}': "
                    f"'{existing.name}' and '{preset.name}'"
                )
            defaults[preset.model] = preset
        return defaults

    @staticmethod
    def _validate_context_window(context_window: int) -> None:
        if isinstance(context_window, bool) or not isinstance(context_window, int):
            raise TypeError("context window must be an integer")
        if context_window <= 0:
            raise ValueError(
                f"context window must be greater than zero, got {context_window}"
            )

    def switch_model(self, model_id: str) -> RuntimeSnapshot:
        """Switch the active model and recalculate its absolute threshold."""
        if not isinstance(model_id, str) or not model_id:
            raise ValueError("model_id must be a non-empty string")

        candidate = (
            self._active_preset
            if self._manual_preset
            else self._defaults_by_model.get(model_id)
        )
        effective_harness = self._resolve_or_empty(candidate)
        context_window = self._context_windows.get(model_id)
        context_config = self._context_policy(effective_harness)
        threshold = (
            context_config.absolute_threshold(context_window)
            if context_window is not None and context_config is not None
            else None
        )

        self._model_id = model_id
        self._active_preset = candidate
        self._context_window = context_window
        self._compaction_threshold = threshold
        self._context_config = context_config
        return self.snapshot(effective_harness)

    def select_preset(self, preset_name: str) -> RuntimeSnapshot:
        """Manually select a known preset for the current session."""
        if preset_name not in self._presets:
            raise KeyError(f"Unknown preset: {preset_name}")

        candidate = self._presets[preset_name]
        effective_harness = self._resolve_or_empty(candidate)
        self._active_preset = candidate
        self._manual_preset = True
        self._context_config = self._context_policy(effective_harness)
        self._compaction_threshold = (
            self._context_config.absolute_threshold(self._context_window)
            if self._context_config is not None and self._context_window is not None
            else None
        )
        return self.snapshot(effective_harness)

    def clear_manual_preset(self) -> RuntimeSnapshot:
        """Return control to the current model's default preset, if any."""
        candidate = self._defaults_by_model.get(self._model_id or "")
        effective_harness = self._resolve_or_empty(candidate)
        self._active_preset = candidate
        self._manual_preset = False
        self._context_config = self._context_policy(effective_harness)
        self._compaction_threshold = (
            self._context_config.absolute_threshold(self._context_window)
            if self._context_config is not None and self._context_window is not None
            else None
        )
        return self.snapshot(effective_harness)

    def snapshot(self, effective_harness: Harness | None = None) -> RuntimeSnapshot:
        """Return the current effective state without changing it."""
        if effective_harness is None:
            effective_harness = self._resolve_or_empty(self._active_preset)
        return RuntimeSnapshot(
            model_id=self._model_id,
            active_preset=self._active_preset,
            effective_harness=effective_harness,
            manual_preset=self._manual_preset,
            context_window=self._context_window,
            compaction_threshold=self._compaction_threshold,
        )

    def should_compact(self, used_tokens: int) -> bool:
        """Evaluate the current context usage against the live model limit."""
        if self._context_window is None:
            raise RuntimeError(
                f"No context window is configured for model '{self._model_id}'"
            )
        if self._context_config is None:
            raise RuntimeError("No Long-Context policy is active")
        return should_compact(
            used_tokens,
            self._context_window,
            self._context_config.threshold,
        )

    def _resolve_or_empty(self, preset: Preset | None) -> Harness:
        return self._resolver.resolve(preset) if preset is not None else merge_harnesses([])

    def _context_policy(self, effective_harness: Harness) -> ContextConfig | None:
        parameter = effective_harness.get_parameter("compaction_threshold")
        if parameter is None:
            return self._fallback_context_config
        value = parameter.value
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise TypeError("compaction_threshold must be a number")
        return ContextConfig(float(value))

    @property
    def model_id(self) -> str | None:
        return self._model_id

    @property
    def active_preset(self) -> Preset | None:
        return self._active_preset

    @property
    def manual_preset(self) -> bool:
        return self._manual_preset

    @property
    def context_window(self) -> int | None:
        return self._context_window

    @property
    def compaction_threshold(self) -> int | None:
        return self._compaction_threshold

    @property
    def context_config(self) -> ContextConfig | None:
        return self._context_config
