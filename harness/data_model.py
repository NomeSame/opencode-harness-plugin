class Parameter:
    """A single configurable parameter with optional enforced flag."""

    __slots__ = ("value", "enforced")

    def __init__(self, value: any, enforced: bool = False) -> None:
        self.value = value
        self.enforced = enforced

    def is_enforced(self) -> bool:
        return self.enforced

    def __repr__(self) -> str:
        enforced_str = " [ENFORCED]" if self.enforced else ""
        return f"Parameter(value={self.value!r}, enforced={self.enforced}){enforced_str}"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Parameter):
            return NotImplemented
        return self.value == other.value and self.enforced == other.enforced


class Harness:
    """A modular set of configuration rules for operating a model."""

    __slots__ = ("name", "description", "parameters")

    def __init__(
        self,
        name: str,
        description: str = "",
        parameters: dict[str, Parameter] | None = None,
    ) -> None:
        self.name = name
        self.description = description
        self.parameters: dict[str, Parameter] = parameters or {}

    def has_parameter(self, name: str) -> bool:
        return name in self.parameters

    def get_parameter(self, name: str) -> Parameter | None:
        return self.parameters.get(name)

    def __repr__(self) -> str:
        return f"Harness(name={self.name!r}, params={len(self.parameters)})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Harness):
            return NotImplemented
        return (
            self.name == other.name
            and self.description == other.description
            and self.parameters == other.parameters
        )


class Preset:
    """Groups multiple harnesses under a single name for easy selection."""

    __slots__ = ("name", "harnesses", "model")

    def __init__(
        self,
        name: str,
        harnesses: list[str] | None = None,
        model: str = "",
    ) -> None:
        self.name = name
        self.harnesses: list[str] = harnesses or []
        self.model = model

    def __repr__(self) -> str:
        return f"Preset(name={self.name!r}, harnesses={self.harnesses})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Preset):
            return NotImplemented
        return (
            self.name == other.name
            and self.harnesses == other.harnesses
            and self.model == other.model
        )
