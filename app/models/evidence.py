"""Evidence models emitted by architecture adapters."""

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    """One deterministic signal that a repository matches an adapter."""

    repo_name: str
    adapter: str
    signal: str
    weight: int = 1
    details: dict[str, str] = Field(default_factory=dict)
