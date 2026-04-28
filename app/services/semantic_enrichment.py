"""Optional semantic enrichment over deterministic source graph evidence."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from hashlib import sha256
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import ValidationError

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
SEMANTIC_INTENT_LABELS = (
    "ui",
    "api",
    "persistence",
    "storage",
    "file_upload",
    "media_upload",
    "retrieval",
    "display",
    "validation",
    "backend_model",
    "new_domain",
    "unknown",
)


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
            technical_intent_labels=_semantic_intent_labels_from_values(
                request.feature_request,
                technical_intents,
            ),
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


SemanticApiStyle = Literal["responses", "chat_completions"]


class OpenAICompatibleSemanticProvider:
    """Optional OpenAI-compatible semantic provider.

    Supports both OpenAI's native Responses API and OpenAI-compatible
    chat-completions endpoints. The Responses path intentionally sends only
    the minimal supported payload fields unless future config opts into more.
    """

    name = "openai-compatible"

    def __init__(self, semantic_root: Path | None = None) -> None:
        self.base_url = os.getenv("STACKPILOT_SEMANTIC_BASE_URL", "").rstrip("/")
        self.api_key = os.getenv("STACKPILOT_SEMANTIC_API_KEY", "")
        self.model = os.getenv("STACKPILOT_SEMANTIC_MODEL", "")
        self.api_style = os.getenv("STACKPILOT_SEMANTIC_API_STYLE", "auto").strip().lower() or "auto"
        self.semantic_root = semantic_root or Path(
            os.getenv("STACKPILOT_SEMANTIC_DEBUG_ROOT", str(DEFAULT_SEMANTIC_ROOT))
        )

    def enrich(self, request: SemanticEnrichmentRequest) -> SemanticEnrichmentResult:
        """Call an OpenAI-compatible endpoint and parse structured JSON."""

        if not self.base_url or not self.api_key or not self.model:
            raise ValueError(
                "OpenAI-compatible semantic provider requires STACKPILOT_SEMANTIC_BASE_URL, "
                "STACKPILOT_SEMANTIC_API_KEY, and STACKPILOT_SEMANTIC_MODEL."
            )
        api_style = self._resolved_api_style()
        endpoint, payload = self._request_for_style(api_style, request)
        http_request = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(http_request, timeout=60) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            detail = body.strip() or exc.reason
            raise ValueError(
                f"Semantic provider HTTP {exc.code} from {endpoint} "
                f"(api_style={api_style}): {detail}"
            ) from exc
        content = _response_content(data, api_style)
        parsed = _loads_provider_json(content)
        parsed = _normalize_provider_payload(parsed, request)
        parsed.setdefault("feature_request", request.feature_request)
        parsed.setdefault("target_id", request.target_id)
        parsed.setdefault("generated_at", _timestamp())
        existing_model_info = parsed.get("model_info")
        model_info = dict(existing_model_info) if isinstance(existing_model_info, dict) else {}
        model_info.update({"provider": self.name, "model": self.model, "api_style": api_style})
        parsed["model_info"] = model_info
        parsed = _normalize_semantic_result_payload(parsed)
        try:
            return SemanticEnrichmentResult.model_validate(parsed)
        except ValidationError as exc:
            debug_path = _write_semantic_validation_debug(
                request.target_id,
                content=content,
                parsed=parsed,
                error=str(exc),
                semantic_root=self.semantic_root,
            )
            raise ValueError(
                "Semantic provider returned JSON that failed validation. "
                f"Raw response saved to {debug_path}: {exc}"
            ) from exc

    def _resolved_api_style(self) -> SemanticApiStyle:
        if self.api_style not in {"auto", "responses", "chat_completions"}:
            raise ValueError(
                "STACKPILOT_SEMANTIC_API_STYLE must be one of: responses, "
                "chat_completions, auto."
            )
        if self.api_style == "responses":
            return "responses"
        if self.api_style == "chat_completions":
            return "chat_completions"
        if _is_responses_default_model(self.model):
            return "responses"
        return "chat_completions"

    def _request_for_style(
        self,
        api_style: SemanticApiStyle,
        request: SemanticEnrichmentRequest,
    ) -> tuple[str, dict[str, Any]]:
        request_json = json.dumps(request.model_dump(mode="python"), sort_keys=True)
        if api_style == "responses":
            return (
                f"{self.base_url}/responses",
                {
                    "model": self.model,
                    "input": _semantic_provider_prompt(request_json),
                },
            )
        return (
            f"{self.base_url}/chat/completions",
            {
                "model": self.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _semantic_system_prompt()},
                    {"role": "user", "content": _semantic_user_prompt(request_json)},
                ],
            },
        )


def _is_responses_default_model(model: str) -> bool:
    """Return true when auto mode should prefer the Responses API."""

    normalized_model = model.strip().lower()
    return normalized_model.startswith("gpt-5")


def _response_content(data: dict[str, Any], api_style: SemanticApiStyle) -> str:
    """Extract provider text content from a supported API response."""

    if api_style == "chat_completions":
        return str(data["choices"][0]["message"]["content"])
    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text
    output = data.get("output")
    if isinstance(output, list):
        text_parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for content_item in content:
                if not isinstance(content_item, dict):
                    continue
                text = content_item.get("text")
                if isinstance(text, str):
                    text_parts.append(text)
        if text_parts:
            return "\n".join(text_parts)
    raise ValueError("Semantic provider response did not include JSON text content.")


def _loads_provider_json(content: str) -> dict[str, Any]:
    """Parse provider JSON, tolerating simple Markdown JSON fences."""

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, flags=re.DOTALL)
        if match is None:
            raise
        parsed = json.loads(match.group(1))
    if not isinstance(parsed, dict):
        raise ValueError("Semantic provider returned JSON, but the top-level value was not an object.")
    return parsed


def _normalize_provider_payload(
    parsed: dict[str, Any],
    request: SemanticEnrichmentRequest,
) -> dict[str, Any]:
    """Normalize near-miss provider JSON into SemanticEnrichmentResult shape.

    The prompt asks for the full result object, but some models return only the
    feature-spec portion. Accept that conservative near miss so the command can
    still produce useful supplemental evidence while recording a caveat.
    """

    if isinstance(parsed.get("feature_spec"), dict):
        feature_spec = parsed["feature_spec"]
        feature_spec.setdefault("feature_request", request.feature_request)
        feature_spec.setdefault("normalized_request", request.normalized_request)
        feature_spec["technical_intent_labels"] = _semantic_intent_labels_from_feature_spec(
            feature_spec,
            request.feature_request,
        )
        parsed["feature_spec"] = feature_spec
        return parsed

    feature_spec_keys = {
        "normalized_request",
        "domain_concepts",
        "technical_intents",
        "new_domain_candidates",
        "missing_details",
        "clarifying_questions",
        "confidence",
        "evidence",
    }
    if not feature_spec_keys.intersection(parsed):
        return parsed

    caveats = list(parsed.get("caveats") or [])
    caveats.append(
        "Semantic provider returned a flat feature-spec object; StackPilot normalized it into SemanticEnrichmentResult."
    )
    return {
        "feature_request": parsed.get("feature_request", request.feature_request),
        "target_id": parsed.get("target_id", request.target_id),
        "generated_at": parsed.get("generated_at", _timestamp()),
        "feature_spec": {
            "feature_request": parsed.get("feature_request", request.feature_request),
            "normalized_request": parsed.get("normalized_request", request.normalized_request),
            "domain_concepts": parsed.get("domain_concepts", []),
            "technical_intents": parsed.get("technical_intents", []),
            "technical_intent_labels": _semantic_intent_labels_from_feature_spec(
                parsed,
                request.feature_request,
            ),
            "new_domain_candidates": parsed.get("new_domain_candidates", []),
            "missing_details": parsed.get("missing_details", []),
            "clarifying_questions": parsed.get("clarifying_questions", []),
            "confidence": parsed.get("confidence", "medium"),
            "evidence": parsed.get("evidence", []),
        },
        "annotations": parsed.get("annotations", []),
        "caveats": caveats,
        "model_info": parsed.get("model_info", {}),
    }


def _normalize_semantic_result_payload(parsed: dict[str, Any]) -> dict[str, Any]:
    """Normalize provider quirks before Pydantic validation."""

    feature_spec = parsed.get("feature_spec")
    if isinstance(feature_spec, dict):
        feature_spec["technical_intent_labels"] = _semantic_intent_labels_from_feature_spec(
            feature_spec,
            str(parsed.get("feature_request") or feature_spec.get("feature_request") or ""),
        )
        parsed["feature_spec"] = feature_spec

    annotations = parsed.get("annotations")
    if isinstance(annotations, list):
        parsed["annotations"] = [
            _normalize_annotation_payload(annotation)
            for annotation in annotations
        ]
    elif annotations is None:
        parsed["annotations"] = []

    model_info = parsed.get("model_info")
    if isinstance(model_info, dict):
        parsed["model_info"] = model_info
    elif model_info is None:
        parsed["model_info"] = {}
    else:
        parsed["model_info"] = {"value": model_info}
    return parsed


def _normalize_annotation_payload(annotation: Any) -> Any:
    if not isinstance(annotation, dict):
        return annotation
    normalized = dict(annotation)
    normalized["relevance_score"] = _normalize_relevance_score(
        normalized.get("relevance_score", 0.0)
    )
    return normalized


def _normalize_relevance_score(value: Any) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    if score > 1.0 and score <= 100.0:
        score = score / 100.0
    return max(0.0, min(score, 1.0))


def semantic_intent_labels_for_result(result: SemanticEnrichmentResult) -> list[str]:
    """Return normalized semantic technical intent labels for a result."""

    return _semantic_intent_labels_from_feature_spec(
        result.feature_spec.model_dump(mode="python"),
        result.feature_request,
    )


def _semantic_intent_labels_from_feature_spec(
    feature_spec: dict[str, Any],
    feature_request: str,
) -> list[str]:
    labels = _normalize_semantic_labels(feature_spec.get("technical_intent_labels", []))
    values = [
        feature_request,
        *[str(item) for item in feature_spec.get("technical_intents", []) if item],
        *[str(item) for item in feature_spec.get("missing_details", []) if item],
        *[str(item) for item in feature_spec.get("clarifying_questions", []) if item],
    ]
    derived = _semantic_intent_labels_from_values(*values)
    result = _dedupe([*labels, *derived])
    return result or ["unknown"]


def _semantic_intent_labels_from_values(*values: object) -> list[str]:
    text = " ".join(_flatten_semantic_values(values)).lower()
    labels: list[str] = []
    if re.search(r"\b(ui|frontend|screen|page|form|input|editor|component|affordance)\b", text):
        labels.append("ui")
    if re.search(r"\b(api|backend|endpoint|controller|rest|request|response|multipart)\b", text):
        labels.append("api")
    if re.search(r"\b(persist|persistence|database|db|repository|jdbc|schema|metadata)\b", text):
        labels.append("persistence")
    if re.search(r"\b(store|stored|storage|filesystem|file system|object storage|blob|s3|bucket)\b", text):
        labels.append("storage")
    if re.search(r"\b(upload|file upload|multipart)\b", text):
        labels.append("file_upload")
    if re.search(r"\b(picture|photo|image|media)\b", text):
        labels.append("media_upload")
    if re.search(r"\b(retrieve|retrieval|download|read|get|load|serve)\b", text):
        labels.append("retrieval")
    if re.search(r"\b(display|preview|show|view|render|thumbnail)\b", text):
        labels.append("display")
    if re.search(r"\b(validate|validation|allowed file|file type|mime|size limit|maximum file|replacement|deletion)\b", text):
        labels.append("validation")
    if re.search(r"\b(model|entity|dto|mapper|backend object|domain object)\b", text):
        labels.append("backend_model")
    if re.search(r"\b(new domain|new object|new entity|new model)\b", text):
        labels.append("new_domain")
    return _dedupe([label for label in labels if label in SEMANTIC_INTENT_LABELS])


def _normalize_semantic_labels(values: object) -> list[str]:
    normalized: list[str] = []
    for value in _flatten_semantic_values([values]):
        lowered = value.lower().strip().replace("-", "_").replace(" ", "_")
        if lowered in {"file", "upload"}:
            lowered = "file_upload"
        if lowered in {"media", "image_upload", "photo_upload", "picture_upload"}:
            lowered = "media_upload"
        if lowered in {"backend_objects", "backend_object", "model"}:
            lowered = "backend_model"
        if lowered in SEMANTIC_INTENT_LABELS:
            normalized.append(lowered)
    return _dedupe(normalized)


def _flatten_semantic_values(values: object) -> list[str]:
    result: list[str] = []
    if isinstance(values, str):
        return [values]
    if isinstance(values, dict):
        for value in values.values():
            result.extend(_flatten_semantic_values(value))
        return result
    if isinstance(values, Sequence) and not isinstance(values, (bytes, bytearray)):
        for value in values:
            result.extend(_flatten_semantic_values(value))
        return result
    if values is None:
        return []
    return [str(values)]


def _write_semantic_validation_debug(
    target_id: str,
    *,
    content: str,
    parsed: dict[str, Any],
    error: str,
    semantic_root: Path,
) -> Path:
    """Persist raw semantic provider output when validation fails."""

    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", target_id)
    path = semantic_root / safe / "latest_semantic_validation_error.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "target_id": target_id,
        "generated_at": _timestamp(),
        "error": error,
        "raw_response": content,
        "parsed_response": parsed,
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return path


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


def provider_for_name(name: str, *, semantic_root: Path | None = None) -> SemanticProvider:
    """Return a semantic provider by CLI name."""

    if name == "mock":
        return MockSemanticProvider()
    if name == "openai-compatible":
        return OpenAICompatibleSemanticProvider(semantic_root=semantic_root)
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

    result = _with_cache_metadata(result)
    path = semantic_result_path(result.target_id, semantic_root=semantic_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_semantic_enrichment_json(result) + "\n", encoding="utf-8")
    return path


def load_latest_semantic_enrichment(
    target_id: str,
    *,
    semantic_root: Path = DEFAULT_SEMANTIC_ROOT,
    feature_request: str | None = None,
) -> SemanticEnrichmentResult | None:
    """Load the latest semantic enrichment artifact for a target if present."""

    path = semantic_result_path(target_id, semantic_root=semantic_root)
    if not path.is_file():
        return None
    result = SemanticEnrichmentResult.model_validate_json(path.read_text(encoding="utf-8"))
    if feature_request is not None and not semantic_result_matches_request(result, feature_request):
        return None
    return result


def semantic_result_path(target_id: str, *, semantic_root: Path = DEFAULT_SEMANTIC_ROOT) -> Path:
    """Return the stable latest semantic enrichment path for a target."""

    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", target_id)
    return semantic_root / safe / "latest_semantic_enrichment.json"


def semantic_result_matches_request(
    result: SemanticEnrichmentResult,
    feature_request: str,
) -> bool:
    """Return whether a cached semantic result belongs to the current request."""

    if result.feature_request.strip() == feature_request.strip():
        return True
    current_normalized = normalize_text(feature_request)
    cached_normalized = (
        result.normalized_feature_request
        or result.feature_spec.normalized_request
        or normalize_text(result.feature_request)
    )
    return bool(current_normalized and cached_normalized and current_normalized == cached_normalized)


def semantic_request_hash(feature_request: str) -> str:
    """Return a stable hash for prompt-cache matching metadata."""

    return sha256(normalize_text(feature_request).encode("utf-8")).hexdigest()


def format_semantic_enrichment_json(result: SemanticEnrichmentResult) -> str:
    """Render semantic enrichment as stable JSON."""

    result = _with_cache_metadata(result)
    return json.dumps(result.model_dump(mode="python"), indent=2, sort_keys=False)


def _with_cache_metadata(result: SemanticEnrichmentResult) -> SemanticEnrichmentResult:
    normalized = (
        result.normalized_feature_request
        or result.feature_spec.normalized_request
        or normalize_text(result.feature_request)
    )
    request_hash = result.request_hash or semantic_request_hash(result.feature_request)
    without_content_hash = result.model_dump(mode="python", exclude={"content_hash"})
    content_hash = sha256(
        json.dumps(without_content_hash, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    return result.model_copy(
        update={
            "normalized_feature_request": normalized,
            "request_hash": request_hash,
            "content_hash": content_hash,
        }
    )


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
        relevance_score=min(score, 100) / 100.0,
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


def _semantic_provider_prompt(request_json: str) -> str:
    """Build a single prompt string for Responses API providers."""

    return f"{_semantic_system_prompt()}\n\n{_semantic_output_contract()}\n\n{_semantic_user_prompt(request_json)}"


def _semantic_user_prompt(request_json: str) -> str:
    """Build the user prompt around deterministic semantic context."""

    return (
        "Semantic enrichment request JSON:\n"
        f"{request_json}\n\n"
        "Return the SemanticEnrichmentResult JSON object only."
    )


def _semantic_output_contract() -> str:
    """Compact schema contract included in provider prompts."""

    return (
        "Required top-level JSON shape:\n"
        "{\n"
        '  "feature_request": string,\n'
        '  "target_id": string,\n'
        '  "generated_at": string,\n'
        '  "feature_spec": {\n'
        '    "feature_request": string,\n'
        '    "normalized_request": string,\n'
        '    "domain_concepts": string[],\n'
        '    "technical_intents": string[] of human-readable intent explanations,\n'
        '    "technical_intent_labels": ("ui" | "api" | "persistence" | "storage" | "file_upload" | "media_upload" | "retrieval" | "display" | "validation" | "backend_model" | "new_domain" | "unknown")[],\n'
        '    "new_domain_candidates": string[],\n'
        '    "missing_details": string[],\n'
        '    "clarifying_questions": string[],\n'
        '    "confidence": "high" | "medium" | "low",\n'
        '    "evidence": [{"source": "feature_request" | "source_graph" | "source_snippet" | "framework_pack" | "recipe", "claim": string}]\n'
        "  },\n"
        '  "annotations": [{\n'
        '    "target_id": string,\n'
        '    "repo_name": string,\n'
        '    "path": string,\n'
        '    "graph_node_id": string,\n'
        '    "semantic_roles": string[],\n'
        '    "domain_concepts": string[],\n'
        '    "capabilities": string[],\n'
        '    "relevant_feature_intents": string[],\n'
        '    "relevance_score": number between 0.0 and 1.0,\n'
        '    "confidence": "high" | "medium" | "low",\n'
        '    "evidence": [{"source": "source_graph", "claim": string, "repo_name": string, "path": string, "graph_node_id": string}]\n'
        "  }],\n"
        '  "caveats": string[],\n'
        '  "model_info": {"provider": string, "model": string, "reasoning_basis": string | string[]}\n'
        "}\n"
        "relevance_score must be a decimal score from 0.0 to 1.0, not a 0-100 percentage. "
        "model_info must be a JSON object; reasoning_basis may be a string or an array of strings. "
        "technical_intents should be readable explanations; technical_intent_labels must use only the listed normalized labels. "
        "Do not return only feature_spec. Do not wrap the JSON in Markdown."
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
