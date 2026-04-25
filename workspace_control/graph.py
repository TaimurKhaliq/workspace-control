"""CLI formatting helpers for source graph discovery and node explanation."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Sequence
from typing import Any

from app.models.source_graph import GraphEdge, GraphNode, SourceGraph

LIKELY_NOISY_TOKENS = {
    "app",
    "base",
    "data",
    "id",
    "index",
    "info",
    "main",
    "type",
}


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

    node_limit = limit if limit > 0 else len(graph.nodes)
    edge_limit = limit if limit > 0 else len(graph.edges)
    displayed_nodes = graph.nodes[:node_limit]
    displayed_edges = graph.edges[:edge_limit]
    lines = [
        "Source Graph",
        f"total nodes: {len(graph.nodes)}",
        f"total edges: {len(graph.edges)}",
        f"showing nodes: {len(displayed_nodes)}",
        f"showing edges: {len(displayed_edges)}",
        "",
        "Nodes by repo and type:",
    ]
    grouped: dict[tuple[str, str], list[GraphNode]] = {}
    all_group_counts = Counter((node.repo_name, node.node_type) for node in graph.nodes)
    for node in displayed_nodes:
        grouped.setdefault((node.repo_name, node.node_type), []).append(node)
    if not grouped:
        lines.append("-")
    for (repo_name, node_type), nodes in sorted(grouped.items()):
        lines.append(f"- {repo_name} / {node_type}: {all_group_counts[(repo_name, node_type)]}")
        for node in nodes:
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
    if not displayed_edges:
        lines.append("-")
    else:
        for edge in displayed_edges:
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


def build_graph_quality_report(graph: SourceGraph) -> dict[str, Any]:
    """Compute deterministic source-graph quality diagnostics."""

    node_by_id = {node.id: node for node in graph.nodes}
    node_counts = Counter(node.node_type for node in graph.nodes)
    edge_counts = Counter(edge.edge_type for edge in graph.edges)
    token_counts = Counter(token for node in graph.nodes for token in node.domain_tokens)
    confidence_counts = Counter(edge.confidence for edge in graph.edges)
    degree_counts: Counter[str] = Counter()
    token_degree_counts: Counter[str] = Counter()

    for edge in graph.edges:
        degree_counts[edge.source_id] += 1
        degree_counts[edge.target_id] += 1

    for node in graph.nodes:
        degree = degree_counts[node.id]
        for token in node.domain_tokens:
            token_degree_counts[token] += degree

    orphan_nodes = [
        _node_summary(node, degree=0)
        for node in graph.nodes
        if degree_counts[node.id] == 0
    ]
    dense_edge_types = _suspicious_dense_edge_types(edge_counts, len(graph.nodes), len(graph.edges))
    noisy_tokens = _likely_noisy_tokens(token_counts)

    return {
        "total_nodes": len(graph.nodes),
        "total_edges": len(graph.edges),
        "node_counts_by_node_type": dict(sorted(node_counts.items())),
        "edge_counts_by_edge_type": dict(sorted(edge_counts.items())),
        "top_domain_tokens": _counter_items(token_counts, 15),
        "highest_degree_nodes": [
            _node_summary(node_by_id[node_id], degree=degree)
            for node_id, degree in degree_counts.most_common(10)
            if node_id in node_by_id
        ],
        "highest_degree_tokens": _counter_items(token_degree_counts, 15),
        "orphan_nodes": orphan_nodes[:20],
        "orphan_node_count": len(orphan_nodes),
        "edges_grouped_by_confidence": {
            confidence: confidence_counts.get(confidence, 0)
            for confidence in ("high", "medium", "low")
        },
        "suspicious_dense_edge_types": dense_edge_types,
        "likely_noisy_generic_tokens": noisy_tokens,
    }


def format_graph_quality_report(report: dict[str, Any]) -> str:
    """Render source-graph quality diagnostics as compact text."""

    lines = [
        "Graph Quality",
        f"total nodes: {report['total_nodes']}",
        f"total edges: {report['total_edges']}",
        "",
        "Node counts by node_type:",
    ]
    lines.extend(_format_mapping(report["node_counts_by_node_type"]))
    lines.extend(["", "Edge counts by edge_type:"])
    lines.extend(_format_mapping(report["edge_counts_by_edge_type"]))
    lines.extend(["", "Top domain tokens:"])
    lines.append(_format_counter_items(report["top_domain_tokens"]))
    lines.extend(["", "Highest-degree nodes:"])
    lines.extend(_format_node_summaries(report["highest_degree_nodes"]))
    lines.extend(["", "Highest-degree tokens:"])
    lines.append(_format_counter_items(report["highest_degree_tokens"]))
    lines.extend(["", f"Orphan nodes: {report['orphan_node_count']}"])
    lines.extend(_format_node_summaries(report["orphan_nodes"]))
    lines.extend(["", "Edges grouped by confidence:"])
    lines.extend(_format_mapping(report["edges_grouped_by_confidence"]))
    lines.extend(["", "Suspicious dense edge types:"])
    lines.extend(_format_dense_edges(report["suspicious_dense_edge_types"]))
    lines.extend(["", "Likely noisy generic tokens:"])
    lines.append(_format_counter_items(report["likely_noisy_generic_tokens"]))
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


def _counter_items(counter: Counter[str], limit: int) -> list[dict[str, Any]]:
    return [
        {"value": value, "count": count}
        for value, count in counter.most_common(limit)
    ]


def _node_summary(node: GraphNode, *, degree: int) -> dict[str, Any]:
    return {
        "repo_name": node.repo_name,
        "path": node.path,
        "node_type": node.node_type,
        "degree": degree,
    }


def _suspicious_dense_edge_types(
    edge_counts: Counter[str],
    node_count: int,
    edge_count: int,
) -> list[dict[str, Any]]:
    if not edge_counts or node_count == 0:
        return []
    threshold = max(20, node_count * 2)
    suspicious: list[dict[str, Any]] = []
    for edge_type, count in edge_counts.most_common():
        if count >= threshold or count / max(edge_count, 1) >= 0.65:
            suspicious.append({"edge_type": edge_type, "count": count})
    return suspicious


def _likely_noisy_tokens(token_counts: Counter[str]) -> list[dict[str, Any]]:
    if not token_counts:
        return []
    noisy = Counter(
        {
            token: count
            for token, count in token_counts.items()
            if token in LIKELY_NOISY_TOKENS
        }
    )
    return _counter_items(noisy, 15)


def _format_mapping(values: dict[str, int]) -> list[str]:
    if not values:
        return ["-"]
    return [f"- {key}: {value}" for key, value in values.items()]


def _format_counter_items(items: Sequence[dict[str, Any]]) -> str:
    if not items:
        return "-"
    return ", ".join(f"{item['value']}={item['count']}" for item in items)


def _format_node_summaries(nodes: Sequence[dict[str, Any]]) -> list[str]:
    if not nodes:
        return ["-"]
    return [
        f"- {node['path']} ({node['node_type']}, degree={node['degree']})"
        for node in nodes
    ]


def _format_dense_edges(items: Sequence[dict[str, Any]]) -> list[str]:
    if not items:
        return ["-"]
    return [f"- {item['edge_type']}: {item['count']}" for item in items]
