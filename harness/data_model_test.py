"""Tests for harness data model.

DoD TODO-005:
- Datenmodell dokumentiert
- Normale Parameter unterstützt
- Enforced Parameter unterstützt
- Harness-Metadaten definiert
- Noch keine UI erforderlich
"""

from harness.data_model import Parameter, Harness, Preset


class TestParameter:
    """Tests for the Parameter class."""

    def test_parameter_default_not_enforced(self):
        p = Parameter(value=1.0)
        assert p.value == 1.0
        assert not p.is_enforced()

    def test_parameter_enforced(self):
        p = Parameter(value=1.0, enforced=True)
        assert p.value == 1.0
        assert p.is_enforced()

    def test_parameter_string_value(self):
        p = Parameter(value="enabled")
        assert p.value == "enabled"

    def test_parameter_int_value(self):
        p = Parameter(value=30)
        assert p.value == 30

    def test_parameter_equality(self):
        p1 = Parameter(value=1.0, enforced=True)
        p2 = Parameter(value=1.0, enforced=True)
        p3 = Parameter(value=1.0, enforced=False)
        assert p1 == p2
        assert p1 != p3

    def test_repr_contains_enforced_when_set(self):
        p = Parameter(value=1.0, enforced=True)
        assert "[ENFORCED]" in repr(p)

    def test_repr_without_enforced(self):
        p = Parameter(value=1.0)
        assert "[ENFORCED]" not in repr(p)


class TestHarness:
    """Tests for the Harness class."""

    def test_harness_minimal(self):
        h = Harness(name="test")
        assert h.name == "test"
        assert h.description == ""
        assert h.parameters == {}

    def test_harness_with_description(self):
        h = Harness(name="qwen-base", description="Qwen-specific defaults")
        assert h.description == "Qwen-specific defaults"

    def test_harness_has_parameter(self):
        h = Harness(
            name="test",
            parameters={"temperature": Parameter(value=1.0, enforced=True)},
        )
        assert h.has_parameter("temperature")
        assert not h.has_parameter("nonexistent")

    def test_harness_get_parameter_exists(self):
        p = Parameter(value=1.0, enforced=True)
        h = Harness(name="test", parameters={"temperature": p})
        found = h.get_parameter("temperature")
        assert found is p
        assert found.value == 1.0
        assert found.is_enforced()

    def test_harness_get_parameter_missing(self):
        h = Harness(name="test")
        found = h.get_parameter("nonexistent")
        assert found is None

    def test_harness_equality(self):
        h1 = Harness(name="test", parameters={"a": Parameter(value=1)})
        h2 = Harness(name="test", parameters={"a": Parameter(value=1)})
        h3 = Harness(name="other", parameters={"a": Parameter(value=1)})
        assert h1 == h2
        assert h1 != h3

    def test_repr(self):
        h = Harness(name="test", parameters={"a": Parameter(value=1)})
        assert "test" in repr(h)


class TestPreset:
    """Tests for the Preset class."""

    def test_preset_minimal(self):
        p = Preset(name="Vanilla")
        assert p.name == "Vanilla"
        assert p.harnesses == []
        assert p.model == ""

    def test_preset_with_harnesses(self):
        p = Preset(name="Qwen Deep Coding", harnesses=["qwen", "coding"])
        assert len(p.harnesses) == 2
        assert "qwen" in p.harnesses
        assert "coding" in p.harnesses

    def test_preset_with_model(self):
        p = Preset(name="Qwen Deep Coding", model="qwen-3.8-27b")
        assert p.model == "qwen-3.8-27b"

    def test_preset_full(self):
        p = Preset(
            name="Qwen Deep Coding",
            harnesses=["qwen", "coding", "long-context", "testing"],
            model="qwen-3.8-27b",
        )
        assert len(p.harnesses) == 4
        assert p.model == "qwen-3.8-27b"

    def test_preset_equality(self):
        p1 = Preset(name="test", harnesses=["a"])
        p2 = Preset(name="test", harnesses=["a"])
        p3 = Preset(name="test", harnesses=["b"])
        assert p1 == p2
        assert p1 != p3

    def test_repr(self):
        p = Preset(name="Qwen Deep Coding", harnesses=["qwen"])
        assert "Qwen Deep Coding" in repr(p)
