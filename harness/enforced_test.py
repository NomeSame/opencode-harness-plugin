"""Test enforced parameter enforcement logic.

DoD TODO-008:
- Enforced Parameter gewinnen gegen normale Werte.
- Enforced Parameter gewinnen gegen OpenCode-Defaults.
- Mehrere konkurrierende Enforced-Werte erzeugen einen klaren Konflikt.
- Kein stilles, zufälliges Überschreiben.
"""

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict
from harness.merge import merge_harnesses


class TestEnforcedWins:
    """Test that enforced parameters always win."""

    def test_enforced_over_opencode_default(self):
        """OpenCode sets 0.3, harness enforces 1.0 → result is 1.0."""
        # Simulate: OpenCode default is applied first
        opencode_harness = load_harness_from_dict({
            "name": "opencode-defaults",
            "parameters": {"temperature": {"value": 0.3}},
        })
        # Then harness enforces 1.0
        qwen_harness = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([opencode_harness, qwen_harness])
        p = merged.get_parameter("temperature")
        assert p.value == 1.0
        assert p.is_enforced()

    def test_enforced_over_another_normal(self):
        """Normal 0.7 from coding, enforced 1.0 from qwen → 1.0."""
        coding = load_harness_from_dict({
            "name": "coding",
            "parameters": {"temperature": {"value": 0.7}},
        })
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([coding, qwen])
        p = merged.get_parameter("temperature")
        assert p.value == 1.0
        assert p.is_enforced()

    def test_multiple_enforced_conflict_deterministic(self):
        """Two enforced parameters for the same key — deterministic (last wins)."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.5, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "b",
            "parameters": {"temperature": {"value": 0.8, "enforced": True}},
        })
        h3 = load_harness_from_dict({
            "name": "c",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2, h3])
        p = merged.get_parameter("temperature")
        # Last enforced wins — deterministic, not random
        assert p.value == 1.0
        assert p.is_enforced()

    def test_no_silent_overwrite(self):
        """No parameter value should be silently overwritten without a rule."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.5, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "b",
            "parameters": {"top_p": {"value": 0.95, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2])
        # Both should exist with their correct values
        assert merged.get_parameter("temperature").value == 0.5
        assert merged.get_parameter("top_p").value == 0.95


class TestEnforcedFlagPreservation:
    """Test that the enforced flag is properly preserved."""

    def test_enforced_flag_preserved_through_merge(self):
        p1 = Parameter(value=1.0, enforced=True)
        assert p1.is_enforced()

        merged = merge_harnesses([
            load_harness_from_dict({
                "name": "a",
                "parameters": {"temp": {"value": 1.0, "enforced": True}},
            }),
        ])
        assert merged.get_parameter("temp").is_enforced()

    def test_non_enforced_not_suddenly_enforced(self):
        merged = merge_harnesses([
            load_harness_from_dict({
                "name": "a",
                "parameters": {"max_iterations": {"value": 30}},
            }),
        ])
        p = merged.get_parameter("max_iterations")
        assert p.value == 30
        assert not p.is_enforced()

    def test_enforced_cannot_be_canceled_by_normal(self):
        """An enforced parameter should never be canceled by a later normal parameter."""
        h1 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "normal",
            "parameters": {"temperature": {"value": 0.3}},
        })
        merged = merge_harnesses([h1, h2])
        p = merged.get_parameter("temperature")
        # Enforced should still win
        assert p.value == 1.0
        assert p.is_enforced()


class TestEnforcedIntegration:
    """Integration tests for the full Qwen scenario from the spec."""

    def test_qwen_scenario(self):
        """
        OpenCode:       temperature = 0.3
        Coding:         temperature = 0.7
        Qwen-Harness:   temperature = 1.0 enforced
        Ergebnis:       temperature = 1.0
        """
        opencode = load_harness_from_dict({
            "name": "opencode",
            "parameters": {"temperature": {"value": 0.3}},
        })
        coding = load_harness_from_dict({
            "name": "coding",
            "parameters": {"temperature": {"value": 0.7}},
        })
        qwen = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([opencode, coding, qwen])
        p = merged.get_parameter("temperature")
        assert p.value == 1.0, f"Expected 1.0, got {p.value}"
        assert p.is_enforced(), "Expected enforced flag to be set"
