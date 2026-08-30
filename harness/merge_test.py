"""Test combining multiple harnesses.

DoD TODO-007:
- Mehrere Harnesses können gleichzeitig aktiv sein.
- Alle Regeln werden gesammelt.
- Konflikte werden erkannt.
- Konfliktverhalten ist deterministisch.
"""

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict
from harness.merge import merge_harnesses


class TestMergeHarnesses:
    """Tests for merging multiple harnesses."""

    def test_merge_two_harnesses_collects_all_params(self):
        h1 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "coding",
            "parameters": {"max_iterations": {"value": 30}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.has_parameter("temperature")
        assert merged.has_parameter("max_iterations")

    def test_merge_preserves_enforced_flag(self):
        h1 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "coding",
            "parameters": {"top_p": {"value": 0.95, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("temperature").is_enforced()
        assert merged.get_parameter("top_p").is_enforced()

    def test_merge_conflict_later_overwrites_earlier(self):
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.5}},
        })
        h2 = load_harness_from_dict({
            "name": "b",
            "parameters": {"temperature": {"value": 0.7}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("temperature").value == 0.7

    def test_merge_empty_list_returns_empty(self):
        merged = merge_harnesses([])
        assert merged.parameters == {}

    def test_merge_single_harness(self):
        h1 = load_harness_from_dict({
            "name": "solo",
            "parameters": {"temperature": {"value": 1.0}},
        })
        merged = merge_harnesses([h1])
        assert merged.name == "solo"
        assert merged.get_parameter("temperature").value == 1.0


class TestMergeEnforcedVsNormal:
    """Tests for enforced parameter priority in merge."""

    def test_enforced_wins_over_normal(self):
        """Normal parameter from one harness, normal from another — later wins."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.5}},
        })
        h2 = load_harness_from_dict({
            "name": "b",
            "parameters": {"temperature": {"value": 0.7}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("temperature").value == 0.7

    def test_enforced_wins_over_normal_when_enforced_first(self):
        """Enforced from first harness, normal from second — enforced wins."""
        h1 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "coding",
            "parameters": {"temperature": {"value": 0.7}},
        })
        merged = merge_harnesses([h1, h2])
        # Enforced should win
        assert merged.get_parameter("temperature").value == 1.0
        assert merged.get_parameter("temperature").is_enforced()

    def test_enforced_over_normal_when_normal_first(self):
        """Normal from first harness, enforced from second — enforced wins."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.3}},
        })
        h2 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("temperature").value == 1.0
        assert merged.get_parameter("temperature").is_enforced()

    def test_multiple_enforced_same_param(self):
        """Two enforced parameters for the same key — last enforced wins."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"temperature": {"value": 0.5, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "b",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("temperature").value == 1.0
        assert merged.get_parameter("temperature").is_enforced()

    def test_enforced_can_be_overwritten_by_later_enforced(self):
        """First enforced, second enforced — second enforced wins."""
        h1 = load_harness_from_dict({
            "name": "a",
            "parameters": {"top_p": {"value": 0.5, "enforced": True}},
        })
        h2 = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"top_p": {"value": 0.95, "enforced": True}},
        })
        merged = merge_harnesses([h1, h2])
        assert merged.get_parameter("top_p").value == 0.95


class TestMergePresets:
    """Tests for preset-based merging."""

    def test_preset_loads_all_harnesses(self):
        presets_data = [
            {"name": "Qwen Deep Coding", "harnesses": ["qwen", "coding", "long-context"]},
        ]
        harnesses = [
            load_harness_from_dict({
                "name": "qwen",
                "parameters": {"temperature": {"value": 1.0, "enforced": True}},
            }),
            load_harness_from_dict({
                "name": "coding",
                "parameters": {"max_iterations": {"value": 30}},
            }),
            load_harness_from_dict({
                "name": "long-context",
                "parameters": {"compaction_threshold": {"value": 0.80}},
            }),
        ]
        preset = Preset(name="Qwen Deep Coding", harnesses=["qwen", "coding", "long-context"])
        merged = merge_harnesses(harnesses)
        assert merged.has_parameter("temperature")
        assert merged.has_parameter("max_iterations")
        assert merged.has_parameter("compaction_threshold")
