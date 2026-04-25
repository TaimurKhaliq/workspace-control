"""Typed local framework knowledge pack model for deterministic discovery priors."""

from pydantic import BaseModel, Field


class FrameworkPack(BaseModel):
    """Small hand-authored framework priors loaded from local JSON files."""

    name: str
    version: str | None = None
    backend_node_kinds: list[str] = Field(default_factory=list)
    frontend_node_kinds: list[str] = Field(default_factory=list)
    common_path_roots: dict[str, list[str]] = Field(default_factory=dict)
    naming_patterns: dict[str, list[str]] = Field(default_factory=dict)
    validation_command_hints: list[str] = Field(default_factory=list)
