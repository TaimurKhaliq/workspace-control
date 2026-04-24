from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StackpilotManifest(BaseModel):
    """Schema for stackpilot.yml files."""

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


class InventoryRow(BaseModel):
    """Normalized row used for table rendering."""

    repo_name: str
    type: str
    language: str
    domain: str
    build_commands: list[str] = Field(default_factory=list)
    test_commands: list[str] = Field(default_factory=list)
    owns_entities: list[str] = Field(default_factory=list)
    owns_fields: list[str] = Field(default_factory=list)
    owns_tables: list[str] = Field(default_factory=list)
    api_keywords: list[str] = Field(default_factory=list)


class FeatureImpact(BaseModel):
    """Analysis result for one likely impacted repo."""

    repo_name: str
    role: Literal[
        "primary-owner",
        "direct-dependent",
        "possible-downstream",
        "weak-match",
    ]
    score: int
    reason: str
