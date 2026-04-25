"""Typed source/surface graph models for deterministic workspace discovery."""

from typing import Literal

from pydantic import BaseModel, Field

NodeType = Literal[
    "frontend_entrypoint",
    "app_shell",
    "landing_page",
    "route_page",
    "page_component",
    "edit_surface",
    "form_component",
    "detail_component",
    "list_component",
    "shared_component",
    "frontend_type",
    "static_asset",
    "public_html",
    "api_contract",
    "api_controller",
    "api_dto",
    "service_layer",
    "domain_model",
    "repository",
    "mapper",
    "migration",
    "event_publisher",
    "event_consumer",
    "unknown",
]

EdgeType = Literal[
    "shares_domain_token",
    "imports_or_references",
    "renders_or_composes",
    "route_or_entrypoint_link",
    "api_handles_domain",
    "service_handles_domain",
    "model_persists_domain",
    "contract_mentions_domain",
    "likely_frontend_backend_link",
]

Confidence = Literal["high", "medium", "low"]


class GraphNode(BaseModel):
    """One normalized source surface discovered in a repository."""

    id: str
    repo_name: str
    path: str
    node_type: NodeType
    framework: str | None = None
    language: str | None = None
    domain_tokens: list[str] = Field(default_factory=list)
    symbols: list[str] = Field(default_factory=list)
    confidence: Confidence = "medium"
    evidence_sources: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    """One deterministic relationship between normalized graph nodes."""

    source_id: str
    target_id: str
    edge_type: EdgeType
    confidence: Confidence = "medium"
    reason: str
    evidence_sources: list[str] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)


class SourceGraph(BaseModel):
    """Workspace-level source/surface graph built from deterministic pattern packs."""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
