"""Typed evidence models used by discovery and feature analysis."""

from pydantic import BaseModel, Field


class Evidence(BaseModel):
    """One deterministic signal that contributes to repository analysis."""

    repo_name: str
    source: str
    category: str
    signal: str
    weight: int = 1
    details: dict[str, str] = Field(default_factory=dict)
