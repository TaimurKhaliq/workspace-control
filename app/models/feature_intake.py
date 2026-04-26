"""Typed feature intake models for clarification-before-planning workflows."""

from typing import Literal

from pydantic import BaseModel, Field

from workspace_control.models import ConceptGrounding


class RepoCapabilitySummary(BaseModel):
    """High-level repo capability summary for intake UI cards."""

    frontend_available: bool = False
    backend_available: bool = False
    persistence_available: bool = False
    detected_frameworks: list[str] = Field(default_factory=list)


class IntakeFieldDefault(BaseModel):
    """Suggested field default that still requires human confirmation."""

    name: str
    type: str
    required: bool = False
    source: Literal["suggested_default", "inferred_from_request"] = "suggested_default"


class IntakeApiEndpointDefault(BaseModel):
    """Suggested API endpoint default for a draft feature spec."""

    method: str
    path: str
    purpose: str
    source: Literal["suggested_default", "inferred_from_request"] = "suggested_default"


class IntakeBackendObjectDefault(BaseModel):
    """Suggested backend object default for a draft feature spec."""

    name: str
    kind: str
    required: bool = True
    source: Literal["suggested_default", "inferred_from_request"] = "suggested_default"


class ProposedFeatureDefaults(BaseModel):
    """Draft defaults the user can accept or revise before precise planning."""

    route_path: str | None = None
    page_name: str | None = None
    form_name: str | None = None
    domain_model_name: str | None = None
    fields: list[IntakeFieldDefault] = Field(default_factory=list)
    api_endpoints: list[IntakeApiEndpointDefault] = Field(default_factory=list)
    backend_objects: list[IntakeBackendObjectDefault] = Field(default_factory=list)


class FeatureIntake(BaseModel):
    """Structured draft spec extracted from a freeform feature request."""

    feature_request: str
    detected_intents: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    new_domain_candidates: list[str] = Field(default_factory=list)
    grounded_concepts: list[ConceptGrounding] = Field(default_factory=list)
    ungrounded_concepts: list[ConceptGrounding] = Field(default_factory=list)
    repo_capability_summary: RepoCapabilitySummary = Field(default_factory=RepoCapabilitySummary)
    proposed_defaults: ProposedFeatureDefaults = Field(default_factory=ProposedFeatureDefaults)
    missing_details: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    can_generate_plan: bool = False
    caveats: list[str] = Field(default_factory=list)
