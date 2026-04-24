"""Typed models for deterministic inferred repository metadata profiles."""

from typing import Literal

from pydantic import BaseModel, Field


class InferredRepoProfile(BaseModel):
    """Source-derived repository profile used when explicit metadata is absent."""

    repo_name: str
    metadata_mode: Literal[
        "explicit-metadata",
        "explicit-plus-inferred",
        "inferred-metadata",
    ]
    explicit_metadata_present: bool = False
    inferred_repo_type: str = ""
    inferred_language: str = ""
    inferred_frameworks: list[str] = Field(default_factory=list)
    inferred_domain_keywords: list[str] = Field(default_factory=list)
    inferred_api_paths: list[str] = Field(default_factory=list)
    inferred_ui_paths: list[str] = Field(default_factory=list)
    inferred_persistence_paths: list[str] = Field(default_factory=list)
    inferred_event_paths: list[str] = Field(default_factory=list)
    inferred_validation_commands: list[str] = Field(default_factory=list)
    inferred_role_hints: list[str] = Field(default_factory=list)
    inferred_owns_entities: list[str] = Field(default_factory=list)
    inferred_owns_fields: list[str] = Field(default_factory=list)
    inferred_owns_tables: list[str] = Field(default_factory=list)
    inferred_api_keywords: list[str] = Field(default_factory=list)


class RepoProfileBootstrapReport(BaseModel):
    """Deterministic bootstrap metadata report for a discovery snapshot."""

    profiles: list[InferredRepoProfile] = Field(default_factory=list)
