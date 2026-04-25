"""CLI formatting helpers for source graph discovery and node explanation."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Sequence
from typing import Any

from app.models.source_graph import GraphEdge, GraphNode, SourceGraph


def filter_source_graph(
    graph: SourceGraph,
    *,
    node_type: str | None = None,
    token: str | None = None,
    limit: int | None = None,
) -> SourceGraph:
    """Return a filtered graph view for CLI output."""

    nodes = list(graph.nodes)
    if node_type:
        nodes = [node for node in nodes if node.node_type == node_type]
    if token:
        normalized = token.lower()
        nodes = [node for node in nodes if normalized in node.domain_tokens]
    node_ids = {node.id for node in nodes}
    edges = [
        edge
        for edge in graph.edges
        if edge.source_id in node_ids and edge.target_id in node_ids
    ]
    if limit is not None and limit > 0:
        nodes = nodes[:limit]
        node_ids = {node.id for node in nodes}
        edges = [
            edge
            for edge in edges
            if edge.source_id in node_ids and edge.target_id in node_ids
        ][:limit]
    return SourceGraph(nodes=nodes, edges=edges, metadata=dict(graph.metadata))


def format_source_graph_json(graph: SourceGraph) -> str:
    """Render a SourceGraph as deterministic JSON."""

    return json.dumps(graph.model_dump(mode="python"), indent=2, sort_keys=False)


def format_source_graph_text(graph: SourceGraph, *, limit: int = 20) -> str:
    """Render a compact human-readable source graph summary."""

    lines = [
        "Source Graph",
        f"total nodes: {len(graph.nodes)}",
        f"total edges: {len(graph.edges)}",
        "",
        "Nodes by repo and type:",
    ]
    grouped: dict[tuple[str, str], list[GraphNode]] = {}
    for node in graph.nodes:
        grouped.setdefault((node.repo_name, node.node_type), []).append(node)
    if not grouped:
        lines.append("-")
    for (repo_name, node_type), nodes in sorted(grouped.items()):
        lines.append(f"- {repo_name} / {node_type}: {len(nodes)}")
        for node in nodes[:limit]:
            token_text = f" [{', '.join(node.domain_tokens[:4])}]" if node.domain_tokens else ""
            lines.append(f"  - {node.path}{token_text}")

    lines.extend(["", "Top domain tokens:"])
    token_counts = Counter(token for node in graph.nodes for token in node.domain_tokens)
    if not token_counts:
        lines.append("-")
    else:
        lines.append(", ".join(f"{token}={count}" for token, count in token_counts.most_common(12)))

    node_by_id = {node.id: node for node in graph.nodes}
    lines.extend(["", "Top edges:"])
    if not graph.edges:
        lines.append("-")
    else:
        for edge in graph.edges[:limit]:
            source = node_by_id.get(edge.source_id)
            target = node_by_id.get(edge.target_id)
            source_path = source.path if source is not None else edge.source_id
            target_path = target.path if target is not None else edge.target_id
            lines.append(
                f"- {edge.edge_type}: {source_path} -> {target_path} ({edge.confidence}) - {edge.reason}"
            )
    return "\n".join(lines)


def format_source_graph_mermaid(graph: SourceGraph, *, limit: int = 40) -> str:
    """Render a simple Mermaid graph diagram."""

    lines = ["graph TD"]
    nodes = graph.nodes[:limit]
    node_ids = {node.id for node in nodes}
    for node in nodes:
        lines.append(f"  {mermaid_id(node.id)}[\"{_escape_label(node.node_type + ': ' + node.path)}\"]")
    for edge in graph.edges:
        if edge.source_id not in node_ids or edge.target_id not in node_ids:
            continue
        lines.append(
            f"  {mermaid_id(edge.source_id)} -- \"{_escape_label(edge.edge_type)}\" --> {mermaid_id(edge.target_id)}"
        )
    if len(lines) == 1:
        lines.append("  empty[\"No graph nodes\"]")
    return "\n".join(lines)


def explain_graph_node(graph: SourceGraph, path: str) -> dict[str, Any]:
    """Return node and connected-edge details for a path."""

    matches = [node for node in graph.nodes if node.path == path or node.path.endswith(path)]
    if not matches:
        raise ValueError(f"Graph node not found for path: {path}")
    node = sorted(matches, key=lambda item: (item.repo_name, item.path, item.node_type))[0]
    connected = [
        edge
        for edge in graph.edges
        if edge.source_id == node.id or edge.target_id == node.id
    ]
    return {
        "node": node.model_dump(mode="python"),
        "connected_edges": [edge.model_dump(mode="python") for edge in connected],
        "classification_reason": node.metadata.get("classification_reason", ""),
    }


def format_graph_node_explanation(explanation: dict[str, Any]) -> str:
    """Render graph node explanation as deterministic JSON."""

    return json.dumps(explanation, indent=2, sort_keys=False)


def mermaid_id(value: str) -> str:
    """Return a Mermaid-safe identifier."""

    return "n_" + re.sub(r"[^a-zA-Z0-9_]", "_", value)


def _escape_label(value: str) -> str:
    return value.replace('"', "'")
