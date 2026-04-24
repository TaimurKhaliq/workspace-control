"""Discovery models used to report adapter evidence by repository."""

from pydantic import BaseModel, Field

from .evidence import Evidence


class RepoDiscovery(BaseModel):
    """Architecture signals collected for one repository."""

    repo_name: str
    repo_type: str
    language: str
    domain: str
    evidence: list[Evidence] = Field(default_factory=list)


class ArchitectureDiscoveryReport(BaseModel):
    """Deterministic architecture discovery output across all repositories."""

    repos: list[RepoDiscovery] = Field(default_factory=list)
