"""Typed models for optional LLM semantic graph enrichment."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class SemanticEvidence(BaseModel):
    """Evidence item supporting a semantic claim."""

    source: Literal["feature_request", "source_graph", "source_snippet", "framework_pack", "recipe"]
    claim: str
    repo_name: str | None = None
    path: str | None = None
    graph_node_id: str | None = None
    snippet: str | None = None


class SemanticFeatureSpec(BaseModel):
    """LLM-enriched feature understanding constrained to structured JSON."""

    feature_request: str
    normalized_request: str
    domain_concepts: list[str] = Field(default_factory=list)
    technical_intents: list[str] = Field(default_factory=list)
    technical_intent_labels: list[str] = Field(default_factory=list)
    new_domain_candidates: list[str] = Field(default_factory=list)
    missing_details: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    evidence: list[SemanticEvidence] = Field(default_factory=list)


class SemanticGraphAnnotation(BaseModel):
    """Semantic labels attached to one deterministic source graph node."""

    target_id: str
    repo_name: str
    path: str
    graph_node_id: str
    semantic_roles: list[str] = Field(default_factory=list)
    domain_concepts: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    relevant_feature_intents: list[str] = Field(default_factory=list)
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: Literal["high", "medium", "low"] = "medium"
    evidence: list[SemanticEvidence] = Field(default_factory=list)


class SemanticSourceSlice(BaseModel):
    """Compact source graph node context sent to a semantic provider."""

    graph_node_id: str
    repo_name: str
    path: str
    node_type: str
    framework: str | None = None
    language: str | None = None
    domain_tokens: list[str] = Field(default_factory=list)
    symbols: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    snippet: str | None = None


class SemanticEnrichmentRequest(BaseModel):
    """Provider request payload for semantic enrichment."""

    target_id: str
    feature_request: str
    normalized_request: str
    deterministic_intents: list[str] = Field(default_factory=list)
    concept_grounding: list[dict[str, object]] = Field(default_factory=list)
    framework_packs: list[str] = Field(default_factory=list)
    recipe_matches: list[dict[str, object]] = Field(default_factory=list)
    source_slices: list[SemanticSourceSlice] = Field(default_factory=list)


class SemanticEnrichmentResult(BaseModel):
    """Complete optional semantic enrichment artifact."""

    feature_request: str
    target_id: str
    generated_at: str
    feature_spec: SemanticFeatureSpec
    annotations: list[SemanticGraphAnnotation] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
    model_info: dict[str, Any] = Field(default_factory=dict)
