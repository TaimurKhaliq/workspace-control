"""Optional semantic enrichment over deterministic source graph evidence."""

from __future__ import annotations

import json
import os
import re
import urllib.request
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from app.graph.pattern_packs.base import compact_tokens
from app.models.discovery import DiscoverySnapshot
from app.models.recipe_suggestion import RecipeSuggestionReport
from app.models.semantic_enrichment import (
    SemanticEnrichmentRequest,
    SemanticEnrichmentResult,
    SemanticEvidence,
    SemanticFeatureSpec,
    SemanticGraphAnnotation,
    SemanticSourceSlice,
)
from app.models.source_graph import GraphNode
from app.services.concept_grounding import ConceptGroundingService
from app.services.feature_intent_classifier import FeatureIntentClassifier
from app.services.repo_paths import repo_path_for
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService
from app.services.text_normalization import normalize_text, tokenize_text
from workspace_control.models import InventoryRow

DEFAULT_SEMANTIC_ROOT = Path.cwd() / "data" / "semantic"
MAX_SNIPPET_CHARS = 900
REQUEST_STOPWORDS = {
    "a",
    "ability",
    "add",
    "and",
    "for",
    "from",
    "of",
    "the",
    "to",
    "your",
}
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
}
BACKEND_NODE_TYPES = {
    "api_contract",
    "api_controller",
    "api_dto",
    "service_layer",
    "domain_model",
    "repository",
    "migration",
}


class SemanticProvider(Protocol):
    """Provider contract for semantic graph enrichment."""

    name: str

    def enrich(self, request: SemanticEnrichmentRequest) -> SemanticEnrichmentResult:
        """Return structured semantic enrichment JSON."""


class MockSemanticProvider:
    """Deterministic semantic provider used for tests and local dry-runs."""

    name = "mock"

    def enrich(self, request: SemanticEnrichmentRequest) -> SemanticEnrichmentResult:
        """Return deterministic annotations from source-slice metadata."""

        request_tokens = tokenize_text(request.normalized_request, stopwords=REQUEST_STOPWORDS)
        domain_concepts = _domain_concepts_from_request(request, request_tokens)
        technical_intents = _technical_intents_from_request(request, request_tokens)
        new_domain_candidates = [
            str(item.get("concept"))
            for item in request.concept_grounding
            if item.get("status") == "ungrounded_new_domain_candidate"
        ]
        annotations = [
            _mock_annotation(request.target_id, slice_item, domain_concepts, technical_intents, request_tokens)
            for slice_item in request.source_slices
        ]
        annotations = [item for item in annotations if item.relevance_score > 0]
        annotations.sort(key=lambda item: (-item.relevance_score, item.repo_name, item.path))
        feature_spec = SemanticFeatureSpec(
            feature_request=request.feature_request,
            normalized_request=request.normalized_request,
            domain_concepts=domain_concepts,
            technical_intents=technical_intents,
            new_domain_candidates=new_domain_candidates,
            missing_details=_mock_missing_details(technical_intents, new_domain_candidates),
            clarifying_questions=_mock_questions(technical_intents, new_domain_candidates),
            confidence="medium" if new_domain_candidates or "file_upload" in technical_intents else "high",
            evidence=[
                SemanticEvidence(
                    source="feature_request",
                    claim=f"Request tokens suggest semantic intent(s): {', '.join(technical_intents) or 'none'}",
                )
            ],
        )
        return SemanticEnrichmentResult(
            feature_request=request.feature_request,
            target_id=request.target_id,
            generated_at=_timestamp(),
            feature_spec=feature_spec,
            annotations=annotations,
            caveats=[
                "Mock semantic provider is deterministic and does not call an LLM.",
                "Semantic enrichment is supplemental evidence; deterministic source graph remains the source of truth.",
            ],
            model_info={"provider": self.name, "model": "mock-semantic-v1"},
        )


class OpenAICompatibleSemanticProvider:
    """Optional OpenAI-compatible chat completions provider."""

    name = "openai-compatible"

    def __init__(self) -> None:
        self.base_url = os.getenv("STACKPILOT_SEMANTIC_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("STACKPILOT_SEMANTIC_API_KEY", "")
        self.model = os.getenv("STACKPILOT_SEMANTIC_MODEL", "")

    def enrich(self, request: SemanticEnrichmentRequest) -> SemanticEnrichmentResult:
        """Call an OpenAI-compatible endpoint and parse structured JSON."""

        if not self.base_url or not self.api_key or not self.model:
            raise ValueError(
                "OpenAI-compatible semantic provider requires STACKPILOT_SEMANTIC_BASE_URL, "
                "STACKPILOT_SEMANTIC_API_KEY, and STACKPILOT_SEMANTIC_MODEL."
            )
        payload = {
            "model": self.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": _semantic_system_prompt()},
                {"role": "user", "content": json.dumps(request.model_dump(mode="python"), sort_keys=True)},
            ],
        }
        endpoint = f"{self.base_url}/chat/completions"
        http_request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(http_request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        parsed.setdefault("feature_request", request.feature_request)
        parsed.setdefault("target_id", request.target_id)
        parsed.setdefault("generated_at", _timestamp())
        parsed.setdefault("model_info", {"provider": self.name, "model": self.model})
        return SemanticEnrichmentResult.model_validate(parsed)


class SemanticEnrichmentService:
    """Build source slices and run optional semantic enrichment providers."""

    def __init__(self, provider: SemanticProvider | None = None) -> None:
        self.provider = provider or OpenAICompatibleSemanticProvider()

    def enrich(
        self,
        *,
        target_id: str,
        feature_request: str,
        rows: Sequence[InventoryRow],
        discovery_snapshot: DiscoverySnapshot,
        recipe_report: RecipeSuggestionReport | None = None,
        max_nodes: int = 20,
        include_snippets: bool = False,
    ) -> SemanticEnrichmentResult:
        """Create semantic enrichment from deterministic graph context."""

        effective_rows = RepoProfileBootstrapService().effective_inventory_for_scan(
            rows,
            scan_root=discovery_snapshot.workspace.root_path,
            discovery_snapshot=discovery_snapshot,
        )
        grounding = ConceptGroundingService().ground(
            feature_request,
            effective_rows,
            scan_root=discovery_snapshot.workspace.root_path,
            discovery_snapshot=discovery_snapshot,
        )
        request = SemanticEnrichmentRequest(
            target_id=target_id,
            feature_request=feature_request,
            normalized_request=normalize_text(feature_request),
            deterministic_intents=FeatureIntentClassifier().classify(feature_request),
            concept_grounding=[item.model_dump(mode="python") for item in grounding],
            framework_packs=list(discovery_snapshot.loaded_framework_packs),
            recipe_matches=_recipe_matches(recipe_report),
            source_slices=select_source_slices(
                feature_request,
                discovery_snapshot,
                max_nodes=max_nodes,
                include_snippets=include_snippets,
            ),
        )
        return self.provider.enrich(request)


def provider_for_name(name: str) -> SemanticProvider:
    """Return a semantic provider by CLI name."""

    if name == "mock":
        return MockSemanticProvider()
    if name == "openai-compatible":
        return OpenAICompatibleSemanticProvider()
    raise ValueError(f"Unknown semantic provider: {name}")


def select_source_slices(
    feature_request: str,
    discovery_snapshot: DiscoverySnapshot,
    *,
    max_nodes: int = 20,
    include_snippets: bool = False,
) -> list[SemanticSourceSlice]:
    """Select compact graph-node slices relevant to a feature request."""

    graph = discovery_snapshot.source_graph
    if graph is None:
        return []
    request_tokens = tokenize_text(feature_request, stopwords=REQUEST_STOPWORDS)
    scored = [
        (_node_relevance(node, request_tokens), node)
        for node in graph.nodes
    ]
    scored = [(score, node) for score, node in scored if score > 0]
    scored.sort(key=lambda item: (-item[0], item[1].repo_name, item[1].node_type, item[1].path))

    selected: list[GraphNode] = []
    seen_ids: set[str] = set()
    for _score, node in scored:
        if node.id in seen_ids:
            continue
        selected.append(node)
        seen_ids.add(node.id)
        if len(selected) >= max_nodes:
            break
    if len(selected) < max_nodes:
        selected.extend(_neighbor_nodes(graph.nodes, graph.edges, seen_ids, max_nodes - len(selected)))

    return [
        _slice_for_node(node, discovery_snapshot, include_snippets=include_snippets)
        for node in selected[:max_nodes]
    ]


def save_semantic_enrichment(
    result: SemanticEnrichmentResult,
    *,
    semantic_root: Path = DEFAULT_SEMANTIC_ROOT,
) -> Path:
    """Persist latest semantic enrichment for a target."""

    path = semantic_result_path(result.target_id, semantic_root=semantic_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_semantic_enrichment_json(result) + "\n", encoding="utf-8")
    return path


def load_latest_semantic_enrichment(
    target_id: str,
    *,
    semantic_root: Path = DEFAULT_SEMANTIC_ROOT,
) -> SemanticEnrichmentResult | None:
    """Load the latest semantic enrichment artifact for a target if present."""

    path = semantic_result_path(target_id, semantic_root=semantic_root)
    if not path.is_file():
        return None
    return SemanticEnrichmentResult.model_validate_json(path.read_text(encoding="utf-8"))


def semantic_result_path(target_id: str, *, semantic_root: Path = DEFAULT_SEMANTIC_ROOT) -> Path:
    """Return the stable latest semantic enrichment path for a target."""

    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", target_id)
    return semantic_root / safe / "latest_semantic_enrichment.json"


def format_semantic_enrichment_json(result: SemanticEnrichmentResult) -> str:
    """Render semantic enrichment as stable JSON."""

    return json.dumps(result.model_dump(mode="python"), indent=2, sort_keys=False)


def _node_relevance(node: GraphNode, request_tokens: set[str]) -> int:
    path_tokens = set(compact_tokens([node.path, *node.symbols]))
    domain_tokens = set(node.domain_tokens)
    path_overlap = request_tokens & path_tokens
    domain_overlap = request_tokens & domain_tokens
    score = len(path_overlap) * 16 + len(domain_overlap - path_overlap) * 4
    if {"upload", "picture", "photo", "image"} & request_tokens and "pet" in path_tokens:
        score += 20
    if {"page", "screen", "form"} & request_tokens and node.node_type in FRONTEND_NODE_TYPES:
        score += 5
    if {"api", "backend", "retrieve", "persist", "store"} & request_tokens and node.node_type in BACKEND_NODE_TYPES:
        score += 5
    if node.confidence == "high":
        score += 2
    return score


def _neighbor_nodes(nodes: Sequence[GraphNode], edges, seen_ids: set[str], remaining: int) -> list[GraphNode]:
    if remaining <= 0 or not seen_ids:
        return []
    by_id = {node.id: node for node in nodes}
    neighbor_ids: list[str] = []
    for edge in edges:
        if edge.source_id in seen_ids and edge.target_id not in seen_ids:
            neighbor_ids.append(edge.target_id)
        if edge.target_id in seen_ids and edge.source_id not in seen_ids:
            neighbor_ids.append(edge.source_id)
    result: list[GraphNode] = []
    for node_id in neighbor_ids:
        node = by_id.get(node_id)
        if node is None or node.id in seen_ids:
            continue
        result.append(node)
        seen_ids.add(node.id)
        if len(result) >= remaining:
            break
    return result


def _slice_for_node(
    node: GraphNode,
    discovery_snapshot: DiscoverySnapshot,
    *,
    include_snippets: bool,
) -> SemanticSourceSlice:
    return SemanticSourceSlice(
        graph_node_id=node.id,
        repo_name=node.repo_name,
        path=node.path,
        node_type=node.node_type,
        framework=node.framework,
        language=node.language,
        domain_tokens=list(node.domain_tokens[:12]),
        symbols=list(node.symbols[:12]),
        metadata=dict(sorted(node.metadata.items())),
        snippet=_snippet_for_node(node, discovery_snapshot) if include_snippets else None,
    )


def _snippet_for_node(node: GraphNode, discovery_snapshot: DiscoverySnapshot) -> str | None:
    repo_path = repo_path_for(discovery_snapshot.workspace.root_path, node.repo_name)
    path = repo_path / node.path
    if not path.is_file() or path.stat().st_size > 500_000:
        return None
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines: list[str] = []
    patterns = (
        r"\b(export\s+)?(default\s+)?(function|class|interface|record|enum)\b",
        r"\b(public|private|protected)\s+",
        r"\b(GET|POST|PUT|PATCH|DELETE|@Get|@Post|@Put|@Patch|@Delete|@RequestMapping)\b",
    )
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if any(re.search(pattern, stripped) for pattern in patterns):
            lines.append(stripped[:180])
        if sum(len(item) for item in lines) > MAX_SNIPPET_CHARS:
            break
    if not lines:
        lines = [line.strip()[:180] for line in text.splitlines() if line.strip()][:6]
    snippet = "\n".join(lines)
    return snippet[:MAX_SNIPPET_CHARS] if snippet else None


def _recipe_matches(recipe_report: RecipeSuggestionReport | None) -> list[dict[str, object]]:
    if recipe_report is None:
        return []
    return [
        {
            "recipe_id": recipe.recipe_id,
            "recipe_type": recipe.recipe_type,
            "structural_confidence": recipe.structural_confidence,
            "planner_effectiveness": recipe.planner_effectiveness,
            "why_matched": recipe.why_matched[:5],
        }
        for recipe in recipe_report.matched_recipes[:5]
    ]


def _domain_concepts_from_request(
    request: SemanticEnrichmentRequest,
    request_tokens: set[str],
) -> list[str]:
    concepts = [
        str(item.get("concept"))
        for item in request.concept_grounding
        if item.get("concept")
    ]
    for token in ("pet", "owner", "visit", "vet", "contact", "picture", "photo", "image"):
        if token in request_tokens:
            concepts.append("picture" if token in {"photo", "image"} else token)
    return _dedupe(concepts)


def _technical_intents_from_request(
    request: SemanticEnrichmentRequest,
    request_tokens: set[str],
) -> list[str]:
    intents = list(request.deterministic_intents)
    if {"upload", "picture", "photo", "image"} & request_tokens:
        intents.extend(["file_upload", "storage"])
    if {"persist", "store", "save"} & request_tokens:
        intents.append("persistence")
    if {"retrieve", "read", "list", "download"} & request_tokens:
        intents.append("retrieval")
    return _dedupe(intents)


def _mock_annotation(
    target_id: str,
    source_slice: SemanticSourceSlice,
    domain_concepts: Sequence[str],
    technical_intents: Sequence[str],
    request_tokens: set[str],
) -> SemanticGraphAnnotation:
    path_tokens = set(compact_tokens([source_slice.path, *source_slice.symbols]))
    path_matched_concepts = [
        concept
        for concept in domain_concepts
        if set(compact_tokens([concept])) & path_tokens
    ]
    loose_matched_concepts = [
        concept
        for concept in domain_concepts
        if concept not in path_matched_concepts
        and set(compact_tokens([concept])) & set(source_slice.domain_tokens)
    ]
    matched_concepts = [*path_matched_concepts, *loose_matched_concepts]
    roles = [_semantic_role(source_slice.node_type)]
    capabilities = _capabilities_for_slice(source_slice, technical_intents)
    relevant_intents = _relevant_intents_for_slice(source_slice, technical_intents)
    score = len(path_matched_concepts) * 35 + len(loose_matched_concepts) * 12 + len(relevant_intents) * 12 + len(capabilities) * 6
    if "pet" in path_matched_concepts and {"upload", "picture", "photo", "image"} & request_tokens:
        score += 15
    confidence = "high" if score >= 70 else "medium" if score >= 35 else "low"
    evidence = [
        SemanticEvidence(
            source="source_graph",
            claim=f"Source graph node `{source_slice.node_type}` matched semantic concepts/intents.",
            repo_name=source_slice.repo_name,
            path=source_slice.path,
            graph_node_id=source_slice.graph_node_id,
            snippet=source_slice.snippet,
        )
    ]
    return SemanticGraphAnnotation(
        target_id=target_id,
        repo_name=source_slice.repo_name,
        path=source_slice.path,
        graph_node_id=source_slice.graph_node_id,
        semantic_roles=_dedupe(roles),
        domain_concepts=_dedupe(matched_concepts),
        capabilities=_dedupe(capabilities),
        relevant_feature_intents=_dedupe(relevant_intents),
        relevance_score=min(score, 100),
        confidence=confidence,
        evidence=evidence,
    )


def _semantic_role(node_type: str) -> str:
    mapping = {
        "edit_surface": "edit_flow_surface",
        "form_component": "form_input_surface",
        "page_component": "ui_page_surface",
        "detail_component": "detail_display_surface",
        "api_controller": "api_entrypoint",
        "api_contract": "api_contract",
        "service_layer": "business_logic",
        "domain_model": "domain_object",
        "repository": "persistence_access",
        "migration": "schema_or_seed_data",
    }
    return mapping.get(node_type, node_type)


def _capabilities_for_slice(
    source_slice: SemanticSourceSlice,
    technical_intents: Sequence[str],
) -> list[str]:
    capabilities: list[str] = []
    if source_slice.node_type in FRONTEND_NODE_TYPES:
        capabilities.append("frontend_surface")
    if source_slice.node_type in {"edit_surface", "form_component"}:
        capabilities.append("form_input")
    if source_slice.node_type in {"api_controller", "api_contract", "api_dto"}:
        capabilities.append("api_surface")
    if source_slice.node_type in {"service_layer"}:
        capabilities.append("business_logic")
    if source_slice.node_type in {"domain_model", "repository", "migration"}:
        capabilities.append("persistence_related")
    if "file_upload" in technical_intents and source_slice.node_type in {"edit_surface", "form_component", "api_controller", "domain_model"}:
        capabilities.append("possible_file_upload_touchpoint")
    return capabilities


def _relevant_intents_for_slice(
    source_slice: SemanticSourceSlice,
    technical_intents: Sequence[str],
) -> list[str]:
    relevant: list[str] = []
    for intent in technical_intents:
        if intent == "ui" and source_slice.node_type in FRONTEND_NODE_TYPES:
            relevant.append(intent)
        elif intent in {"api", "retrieval"} and source_slice.node_type in {"api_controller", "api_contract", "api_dto", "service_layer"}:
            relevant.append(intent)
        elif intent in {"persistence", "storage"} and source_slice.node_type in {"domain_model", "repository", "migration", "service_layer"}:
            relevant.append(intent)
        elif intent == "file_upload" and source_slice.node_type in {"edit_surface", "form_component", "api_controller", "domain_model", "service_layer"}:
            relevant.append(intent)
    return relevant


def _mock_missing_details(
    technical_intents: Sequence[str],
    new_domain_candidates: Sequence[str],
) -> list[str]:
    details: list[str] = []
    if "file_upload" in technical_intents:
        details.extend(
            [
                "File storage strategy is not specified.",
                "Upload size/type validation is not specified.",
                "Whether uploaded files are retrieved through API or static URLs is not specified.",
            ]
        )
    if new_domain_candidates:
        details.append("New domain object shape is not grounded in existing source.")
    return details


def _mock_questions(
    technical_intents: Sequence[str],
    new_domain_candidates: Sequence[str],
) -> list[str]:
    questions: list[str] = []
    if "file_upload" in technical_intents:
        questions.extend(
            [
                "Where should uploaded files be stored?",
                "What file types and size limits should be allowed?",
                "Should uploads be retrievable from the existing API?",
            ]
        )
    if new_domain_candidates:
        questions.append("What fields should the new domain object contain?")
    return questions


def _timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _semantic_system_prompt() -> str:
    return (
        "You are enriching deterministic source graph semantics. You are not editing code. "
        "Only make claims supported by provided files, source graph nodes, framework packs, or the feature request. "
        "Return JSON only matching the SemanticEnrichmentResult shape. "
        "Every graph annotation must include evidence with repo_name, path, and graph_node_id. "
        "If evidence is missing, put that in missing_details or caveats instead of inventing facts."
    )


def _dedupe(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
