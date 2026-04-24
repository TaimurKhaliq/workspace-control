"""Discovery models used to report adapter findings by repository."""

from typing import Literal

from pydantic import BaseModel, Field

from .evidence import Evidence


class AdapterDiscovery(BaseModel):
    """Locations and framework hints discovered by one repository adapter."""

    adapter: str
    frameworks: list[str] = Field(default_factory=list)
    api_locations: list[str] = Field(default_factory=list)
    service_locations: list[str] = Field(default_factory=list)
    persistence_locations: list[str] = Field(default_factory=list)
    ui_locations: list[str] = Field(default_factory=list)
    event_locations: list[str] = Field(default_factory=list)


class RepoDiscovery(BaseModel):
    """Architecture signals and likely code locations collected for one repository."""

    repo_name: str
    repo_type: str
    language: str
    domain: str
    evidence_mode: Literal["metadata-only", "mixed", "source-discovered"] = "metadata-only"
    confidence: Literal["high", "medium", "low"] = "low"
    missing_evidence: list[str] = Field(default_factory=list)
    detected_frameworks: list[str] = Field(default_factory=list)
    hinted_frameworks: list[str] = Field(default_factory=list)
    likely_api_locations: list[str] = Field(default_factory=list)
    likely_service_locations: list[str] = Field(default_factory=list)
    likely_persistence_locations: list[str] = Field(default_factory=list)
    likely_ui_locations: list[str] = Field(default_factory=list)
    likely_event_locations: list[str] = Field(default_factory=list)
    hinted_api_locations: list[str] = Field(default_factory=list)
    hinted_service_locations: list[str] = Field(default_factory=list)
    hinted_persistence_locations: list[str] = Field(default_factory=list)
    hinted_ui_locations: list[str] = Field(default_factory=list)
    hinted_event_locations: list[str] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)


class ArchitectureDiscoveryReport(BaseModel):
    """Deterministic architecture discovery output across all repositories."""

    repos: list[RepoDiscovery] = Field(default_factory=list)
