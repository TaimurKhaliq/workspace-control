"""Build a deterministic source/surface graph from discovery snapshots."""

from __future__ import annotations

from collections.abc import Sequence

from app.graph.pattern_packs.base import compact_tokens, dedupe
from app.graph.pattern_packs.openapi_contracts import OpenApiContractPack
from app.graph.pattern_packs.react_components import ReactComponentPack
from app.graph.pattern_packs.spring_mvc import SpringMvcPack
from app.graph.pattern_packs.base import SourcePatternPack
from app.models.discovery import DiscoverySnapshot
from app.models.source_graph import GraphEdge, GraphNode, SourceGraph

FRONTEND_NODE_TYPES = {
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
}
BACKEND_NODE_TYPES = {
    "api_contract",
    "api_controller",
    "service_layer",
    "domain_model",
    "repository",
    "migration",
    "event_publisher",
    "event_consumer",
}
EDGE_STOP_TOKENS = {
    "app",
    "apps",
    "base",
    "bases",
    "clinic",
    "clinics",
    "data",
    "date",
    "dates",
    "description",
    "descriptions",
    "error",
    "errors",
    "example",
    "examples",
    "field",
    "fields",
    "http",
    "https",
    "id",
    "ids",
    "index",
    "indexes",
    "info",
    "infos",
    "impl",
    "impls",
    "jdbc",
    "jdbcs",
    "jpa",
    "jpas",
    "localhost",
    "localhosts",
    "main",
    "mains",
    "mapper",
    "mappers",
    "message",
    "messages",
    "petclinic",
    "petclinics",
    "root",
    "roots",
    "sample",
    "samples",
    "spring",
    "springdata",
    "springdatajpa",
    "springframework",
    "type",
    "types",
    "title",
    "titles",
    "url",
    "urls",
}


class SourceGraphBuilder:
    """Build graph nodes and edges from registered deterministic pattern packs."""

    def __init__(self, pattern_packs: Sequence[SourcePatternPack] | None = None):
        self._pattern_packs = tuple(
            pattern_packs
            if pattern_packs is not None
            else (
                ReactComponentPack(),
                SpringMvcPack(),
                OpenApiContractPack(),
            )
        )

    def build(self, discovery_snapshot: DiscoverySnapshot) -> SourceGraph:
        """Build a SourceGraph from a complete discovery snapshot."""

        nodes: list[GraphNode] = []
        for pack in self._pattern_packs:
            nodes.extend(
                pack.extract_nodes(
                    discovery_snapshot.workspace,
                    discovery_snapshot,
                    framework_pack_context={"loaded_framework_packs": discovery_snapshot.loaded_framework_packs},
                )
            )
        merged_nodes = _dedupe_nodes(nodes)
        graph = SourceGraph(
            nodes=merged_nodes,
            edges=[],
            metadata={
                "builder": "SourceGraphBuilder",
                "pattern_packs": ",".join(pack.name for pack in self._pattern_packs),
            },
        )

        edges: list[GraphEdge] = []
        for pack in self._pattern_packs:
            edges.extend(pack.extract_edges(graph))
        edges.extend(_structural_edges(graph.nodes))
        edges.extend(_token_edges(graph.nodes))
        graph.edges = _dedupe_edges(edges)
        return graph


def _dedupe_nodes(nodes: Sequence[GraphNode]) -> list[GraphNode]:
    by_key: dict[tuple[str, str, str], GraphNode] = {}
    for node in nodes:
        key = (node.repo_name, node.path, node.node_type)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = node
            continue
        by_key[key] = existing.model_copy(
            update={
                "domain_tokens": dedupe([*existing.domain_tokens, *node.domain_tokens]),
                "symbols": dedupe([*existing.symbols, *node.symbols]),
                "evidence_sources": dedupe([*existing.evidence_sources, *node.evidence_sources]),
                "confidence": _max_confidence(existing.confidence, node.confidence),
                "metadata": {**existing.metadata, **node.metadata},
            }
        )
    return sorted(by_key.values(), key=lambda item: (item.repo_name, item.node_type, item.path))


def _dedupe_edges(edges: Sequence[GraphEdge]) -> list[GraphEdge]:
    by_key: dict[tuple[str, str, str], GraphEdge] = {}
    for edge in edges:
        key = (edge.source_id, edge.target_id, edge.edge_type)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = edge
            continue
        by_key[key] = existing.model_copy(
            update={
                "confidence": _max_confidence(existing.confidence, edge.confidence),
                "evidence_sources": dedupe([*existing.evidence_sources, *edge.evidence_sources]),
                "metadata": {**existing.metadata, **edge.metadata},
            }
        )
    return sorted(by_key.values(), key=lambda item: (item.source_id, item.edge_type, item.target_id))


def _structural_edges(nodes: Sequence[GraphNode]) -> list[GraphEdge]:
    edges: list[GraphEdge] = []
    by_repo: dict[str, list[GraphNode]] = {}
    for node in nodes:
        by_repo.setdefault(node.repo_name, []).append(node)

    for repo_nodes in by_repo.values():
        entrypoints = [node for node in repo_nodes if node.node_type == "frontend_entrypoint"]
        app_shells = [node for node in repo_nodes if node.node_type == "app_shell"]
        landing_pages = [node for node in repo_nodes if node.node_type == "landing_page"]
        for entrypoint in entrypoints:
            for app_shell in app_shells:
                edges.append(
                    _edge(
                        entrypoint,
                        app_shell,
                        "route_or_entrypoint_link",
                        "high",
                        "frontend entrypoint likely bootstraps the app shell",
                        "source_graph_structural",
                    )
                )
        for app_shell in app_shells:
            for landing_page in landing_pages:
                edges.append(
                    _edge(
                        app_shell,
                        landing_page,
                        "renders_or_composes",
                        "medium",
                        "app shell and landing page coexist in the same React repo",
                        "source_graph_structural",
                    )
                )
    return edges


def _token_edges(nodes: Sequence[GraphNode]) -> list[GraphEdge]:
    edges: list[GraphEdge] = []
    for left in nodes:
        for right in nodes:
            if left.id == right.id or left.repo_name != right.repo_name:
                continue
            overlap = _token_overlap(left, right)
            if not overlap:
                continue
            if left.node_type in FRONTEND_NODE_TYPES and right.node_type in BACKEND_NODE_TYPES:
                if not _path_token_overlap(left, right, overlap):
                    continue
                edges.append(
                    _edge(
                        left,
                        right,
                        "likely_frontend_backend_link",
                        "medium",
                        f"frontend and backend surfaces share domain token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
            elif left.node_type == "api_controller" and right.node_type == "domain_model":
                if not _path_token_overlap(left, right, overlap):
                    continue
                edges.append(
                    _edge(
                        left,
                        right,
                        "api_handles_domain",
                        "medium",
                        f"controller and domain model share token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
            elif left.node_type == "service_layer" and right.node_type == "domain_model":
                edges.append(
                    _edge(
                        left,
                        right,
                        "service_handles_domain",
                        "medium",
                        f"service and domain model share token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
            elif left.node_type == "domain_model" and right.node_type == "repository":
                if not _path_token_overlap(left, right, overlap):
                    continue
                edges.append(
                    _edge(
                        left,
                        right,
                        "model_persists_domain",
                        "medium",
                        f"domain model and repository share token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
            elif left.node_type == "api_contract" and right.node_type in {"api_controller", "domain_model"}:
                edges.append(
                    _edge(
                        left,
                        right,
                        "contract_mentions_domain",
                        "medium",
                        f"API contract and source surface share token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
            elif left.node_type in BACKEND_NODE_TYPES and right.node_type in BACKEND_NODE_TYPES:
                if left.id > right.id or _semantic_root_count(overlap) < 2:
                    continue
                edges.append(
                    _edge(
                        left,
                        right,
                        "shares_domain_token",
                        "low",
                        f"backend surfaces share token(s): {', '.join(overlap[:4])}",
                        "source_graph_token_overlap",
                        tokens=overlap,
                    )
                )
    return edges


def _token_overlap(left: GraphNode, right: GraphNode) -> list[str]:
    return sorted((set(left.domain_tokens) & set(right.domain_tokens)) - EDGE_STOP_TOKENS)


def _path_token_overlap(left: GraphNode, right: GraphNode, overlap: Sequence[str]) -> list[str]:
    overlap_tokens = set(overlap)
    return sorted((_path_tokens(left) & _path_tokens(right)) & overlap_tokens)


def _path_tokens(node: GraphNode) -> set[str]:
    return set(compact_tokens([node.path]))


def _semantic_root_count(tokens: Sequence[str]) -> int:
    return len({_semantic_root(token) for token in tokens})


def _semantic_root(token: str) -> str:
    if token.endswith("ies") and len(token) > 3:
        return f"{token[:-3]}y"
    if token.endswith("s") and len(token) > 3:
        return token[:-1]
    return token


def _edge(
    source: GraphNode,
    target: GraphNode,
    edge_type: str,
    confidence: str,
    reason: str,
    evidence_source: str,
    *,
    tokens: Sequence[str] = (),
) -> GraphEdge:
    metadata = {"tokens": ",".join(tokens)} if tokens else {}
    return GraphEdge(
        source_id=source.id,
        target_id=target.id,
        edge_type=edge_type,
        confidence=confidence,
        reason=reason,
        evidence_sources=[evidence_source],
        metadata=metadata,
    )


def _max_confidence(left: str, right: str) -> str:
    order = {"low": 0, "medium": 1, "high": 2}
    return left if order[left] >= order[right] else right
