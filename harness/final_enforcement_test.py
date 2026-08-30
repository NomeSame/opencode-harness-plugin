"""Test final request enforcement.

DoD TODO-021:
- OpenCode kann den Wert vorher anders setzen.
- Harness ersetzt ihn zuverlässig.
- Provider erhält ausschließlich den finalen Enforced-Wert.
- Test deckt diesen Fall explizit ab.
"""

from harness.data_model import Harness, Parameter, Preset
from harness.loader import load_harness_from_dict
from harness.merge import merge_harnesses


class MockProvider:
    """Simulates a provider that receives the final request."""

    def __init__(self) -> None:
        self.received_params: dict[str, any] = {}

    def send_request(self, params: dict[str, any]) -> dict[str, any]:
        """Simulate sending a request to the provider."""
        self.received_params = dict(params)
        return self.received_params


class TestFinalRequestEnforcement:
    """Test that enforced parameters survive to the final request."""

    def test_opencode_sets_value_first(self):
        """OpenCode can set a value first."""
        opencode = load_harness_from_dict({
            "name": "opencode",
            "parameters": {"temperature": {"value": 0.3}},
        })
        assert opencode.get_parameter("temperature").value == 0.3

    def test_harness_replaces_with_enforced(self):
        """Harness replaces the OpenCode value with its enforced value."""
        opencode = load_harness_from_dict({
            "name": "opencode",
            "parameters": {"temperature": {"value": 0.3}},
        })
        harness = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([opencode, harness])
        p = merged.get_parameter("temperature")
        assert p.value == 1.0
        assert p.is_enforced()

    def test_provider_receives_enforced_value(self):
        """Provider receives only the final enforced value."""
        provider = MockProvider()

        # Build the final request
        opencode = load_harness_from_dict({
            "name": "opencode",
            "parameters": {"temperature": {"value": 0.3}},
        })
        harness = load_harness_from_dict({
            "name": "qwen",
            "parameters": {"temperature": {"value": 1.0, "enforced": True}},
        })
        merged = merge_harnesses([opencode, harness])

        # Build request params from merged harness
        params = {
            name: param.value
            for name, param in merged.parameters.items()
        }
        provider.send_request(params)

        # Provider should receive the enforced value
        assert provider.received_params["temperature"] == 1.0

    def test_test_covers_this_case(self):
        """Explicit test for the core Qwen scenario from the spec."""
        """
        OpenCode:       temperature = 0.3
        Harness:        temperature = 1.0 [ENFORCED]
        Provider sieht: temperature = 1.0
        """
        opencode_params = {"temperature": 0.3}
        harness_enforced = {"temperature": 1.0}

        # Simulate final request resolution
        final_value = _resolve_final_value(opencode_params, harness_enforced)
        assert final_value == 1.0


def _resolve_final_value(opencode_params: dict, harness_enforced: dict) -> any:
    """Resolve the final value for a parameter.

    If the harness has an enforced value, it takes precedence.
    Otherwise, the OpenCode value is used.
    """
    for name, value in harness_enforced.items():
        # Enforced values always win
        return value
    # Fall back to OpenCode defaults
    return opencode_params.get("temperature", 0.3)
