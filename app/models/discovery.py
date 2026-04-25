"""Discovery models used to target, materialize, and report repository findings."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .evidence import Evidence
from .framework_descriptor import FrameworkDescriptor
from .source_graph import SourceGraph


class DiscoveryTarget(BaseModel):
    """Source-agnostic description of where discovery input should come from."""

    source: Literal["local_path", "git_url", "remote_agent"]
    location: str
    ref: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)

    @classmethod
    def local_path(cls, path: Path | str) -> "DiscoveryTarget":
        """Build a target for an already-present local workspace path."""

        return cls(source="local_path", location=str(path))


class DiscoveryTargetRecord(BaseModel):
    """Registered discovery target stored by workspace-control."""

    id: str
    source_type: Literal["local_path", "git_url", "remote_agent"]
    locator: str
    ref: str | None = None
    hints: dict[str, str] = Field(default_factory=dict)

    def to_target(self) -> DiscoveryTarget:
        """Convert a registry record to a provider-facing discovery target."""

        return DiscoveryTarget(
            source=self.source_type,
            location=self.locator,
            ref=self.ref,
            metadata=self.hints,
        )


class DiscoveryTargetRegistryState(BaseModel):
    """JSON-serializable registry state for discovery targets."""

    targets: list[DiscoveryTargetRecord] = Field(default_factory=list)


class MaterializedWorkspace(BaseModel):
    """Read-only local workspace view produced by a discovery provider."""

    target: DiscoveryTarget
    root_path: Path
    provider: str
    read_only: bool = True
    cleanup_required: bool = False


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
    framework_detections: list[FrameworkDescriptor] = Field(default_factory=list)
    loaded_framework_packs: list[str] = Field(default_factory=list)
    framework_hints: list[str] = Field(default_factory=list)
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


class DiscoverySnapshot(BaseModel):
    """Complete source-agnostic discovery result for a materialized target."""

    target: DiscoveryTarget
    workspace: MaterializedWorkspace
    report: ArchitectureDiscoveryReport
    detected_frameworks: list[FrameworkDescriptor] = Field(default_factory=list)
    loaded_framework_packs: list[str] = Field(default_factory=list)
    framework_hints: dict[str, list[str]] = Field(default_factory=dict)
    source_graph: SourceGraph | None = None
