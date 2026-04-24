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


class FeaturePlan(BaseModel):
    """Deterministic execution plan derived from feature analysis."""

    feature_request: str
    feature_intents: list[
        Literal["ui", "persistence", "api", "event_integration"]
    ] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    missing_evidence: list[str] = Field(default_factory=list)
    primary_owner: str | None = None
    direct_dependents: list[str] = Field(default_factory=list)
    possible_downstreams: list[str] = Field(default_factory=list)
    db_change_needed: bool = False
    api_change_needed: bool = False
    ui_change_needed: bool = False
    likely_paths_by_repo: dict[str, list[str]] = Field(default_factory=dict)
    validation_commands: list[str] = Field(default_factory=list)
    ordered_steps: list[str] = Field(default_factory=list)
    requires_human_approval: bool = False
