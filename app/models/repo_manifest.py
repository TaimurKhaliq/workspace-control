"""Manifest model used by app services to read stackpilot metadata deterministically."""

from pydantic import BaseModel, ConfigDict, Field


class RepoManifest(BaseModel):
    """Normalized `stackpilot.yml` shape consumed by adapters."""

    model_config = ConfigDict(extra="ignore")

    type: str
    language: str
    domain: str
    build_commands: list[str] = Field(default_factory=list)
    test_commands: list[str] = Field(default_factory=list)
    owns_entities: list[str] = Field(default_factory=list)
    owns_fields: list[str] = Field(default_factory=list)
    owns_tables: list[str] = Field(default_factory=list)
    api_keywords: list[str] = Field(default_factory=list)
