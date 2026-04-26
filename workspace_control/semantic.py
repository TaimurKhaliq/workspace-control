"""Helpers for optional semantic enrichment integration."""

from __future__ import annotations

from collections.abc import Sequence

from app.models.semantic_enrichment import SemanticEnrichmentResult
from app.services.semantic_enrichment import semantic_intent_labels_for_result

from .models import ChangeProposal, CombinedRecommendation, FeaturePlan

ALLOWED_PLAN_INTENTS = (
    "ui",
    "persistence",
    "api",
    "event_integration",
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
SEMANTIC_INTENT_TO_PLAN_INTENT = {
    "storage": "persistence",
    "retrieval": "api",
}
SEMANTIC_DETAIL_SUMMARY = "semantic_enrichment has structured missing details; see semantic_missing_details"
SEMANTIC_QUESTION_SUMMARY = "semantic_enrichment has clarifying questions; see semantic_clarifying_questions"


def apply_semantic_to_plan(
    plan: FeaturePlan,
    semantic_result: SemanticEnrichmentResult | None,
) -> FeaturePlan:
    """Return a plan copy with explicitly labeled semantic supplemental evidence."""

    if semantic_result is None:
        return plan
    semantic_labels = semantic_intent_labels_for_result(semantic_result)
    semantic_intents = list(semantic_result.feature_spec.technical_intents)
    plan_intents = _supplement_plan_intents(plan.feature_intents, semantic_labels)
    missing_evidence = [
        *plan.missing_evidence,
        _semantic_intent_message(semantic_labels),
    ]
    if semantic_result.feature_spec.missing_details:
        missing_evidence.append(SEMANTIC_DETAIL_SUMMARY)
    if semantic_result.feature_spec.clarifying_questions:
        missing_evidence.append(SEMANTIC_QUESTION_SUMMARY)
    summary = dict(plan.recipe_confidence_summary)
    summary["semantic_enrichment"] = {
        "available": True,
        "technical_intents": semantic_intents,
        "technical_intent_labels": semantic_labels,
        "annotation_count": len(semantic_result.annotations),
        "confidence": semantic_result.feature_spec.confidence,
    }
    return plan.model_copy(
        update={
            "feature_intents": plan_intents,
            "ui_change_needed": plan.ui_change_needed or "ui" in semantic_labels or "display" in semantic_labels,
            "api_change_needed": plan.api_change_needed or bool({"api", "retrieval", "file_upload"} & set(semantic_labels)),
            "db_change_needed": plan.db_change_needed or bool({"persistence", "storage"} & set(semantic_labels)),
            "missing_evidence": _dedupe(missing_evidence),
            "recipe_confidence_summary": summary,
            "semantic_missing_details": _dedupe(
                [*plan.semantic_missing_details, *semantic_result.feature_spec.missing_details]
            ),
            "semantic_clarifying_questions": _dedupe(
                [*plan.semantic_clarifying_questions, *semantic_result.feature_spec.clarifying_questions]
            ),
            "semantic_caveats": _dedupe(
                [*plan.semantic_caveats, *semantic_result.caveats]
            ),
        }
    )


def apply_semantic_to_proposal(
    proposal: ChangeProposal,
    semantic_result: SemanticEnrichmentResult | None,
) -> ChangeProposal:
    """Return a proposal copy with semantic recommendations as separate evidence."""

    if semantic_result is None:
        return proposal
    semantic_labels = semantic_intent_labels_for_result(semantic_result)
    semantic_recommendations = semantic_recommendations_from_result(semantic_result)
    combined = _semantic_combined_recommendations(
        proposal.combined_recommendations,
        semantic_recommendations,
        semantic_labels=semantic_labels,
        semantic_result=semantic_result,
    )
    missing_evidence = [
        *proposal.missing_evidence,
        _semantic_intent_message(semantic_labels),
    ]
    if semantic_result.feature_spec.missing_details:
        missing_evidence.append(SEMANTIC_DETAIL_SUMMARY)
    if semantic_result.feature_spec.clarifying_questions:
        missing_evidence.append(SEMANTIC_QUESTION_SUMMARY)
    return proposal.model_copy(
        update={
            "feature_intents": _supplement_plan_intents(
                proposal.feature_intents,
                semantic_labels,
            ),
            "missing_evidence": _dedupe(missing_evidence),
            "semantic_missing_details": _dedupe(
                [*proposal.semantic_missing_details, *semantic_result.feature_spec.missing_details]
            ),
            "semantic_clarifying_questions": _dedupe(
                [*proposal.semantic_clarifying_questions, *semantic_result.feature_spec.clarifying_questions]
            ),
            "semantic_caveats": _dedupe(
                [*proposal.semantic_caveats, *semantic_result.caveats]
            ),
            "combined_recommendations": combined,
        }
    )


def semantic_recommendations_from_result(
    semantic_result: SemanticEnrichmentResult,
) -> list[CombinedRecommendation]:
    """Convert graph annotations into inspect-only recommendations."""

    recommendations: list[CombinedRecommendation] = []
    semantic_labels = semantic_intent_labels_for_result(semantic_result)
    for annotation in sorted(
        semantic_result.annotations,
        key=lambda item: (-item.relevance_score, item.repo_name, item.path),
    ):
        if annotation.relevance_score < 0.35:
            continue
        if _is_launch_or_run_artifact(annotation.path, semantic_labels):
            continue
        confidence = _semantic_recommendation_confidence(annotation.confidence, annotation.relevance_score)
        evidence = [
            f"semantic_enrichment: {', '.join(annotation.semantic_roles) or 'semantic annotation'}",
            f"semantic technical intent labels: {', '.join(semantic_labels) or '-'}",
            f"semantic annotation relevance: {annotation.relevance_score:.2f}",
            f"source graph node: {_node_type_from_annotation_id(annotation.graph_node_id)}",
            *[
                evidence.claim
                for evidence in annotation.evidence
                if evidence.path == annotation.path and evidence.graph_node_id == annotation.graph_node_id
            ],
        ]
        recommendations.append(
            CombinedRecommendation(
                repo_name=annotation.repo_name,
                path=annotation.path,
                action="inspect",
                confidence=confidence,
                source="semantic_enrichment",
                evidence=_dedupe(evidence),
            )
        )
    return recommendations


def semantic_explanation_payload(
    semantic_result: SemanticEnrichmentResult | None,
) -> dict[str, object]:
    """Compact semantic payload for explain-feature output."""

    if semantic_result is None:
        return {
            "available": False,
            "caveats": ["No semantic enrichment artifact was loaded for this target."],
        }
    return {
        "available": True,
        "model_info": dict(semantic_result.model_info),
        "feature_spec": semantic_result.feature_spec.model_dump(mode="python"),
        "technical_intent_labels": semantic_intent_labels_for_result(semantic_result),
        "annotations": [
            {
                "repo_name": annotation.repo_name,
                "path": annotation.path,
                "graph_node_id": annotation.graph_node_id,
                "semantic_roles": annotation.semantic_roles,
                "domain_concepts": annotation.domain_concepts,
                "capabilities": annotation.capabilities,
                "relevant_feature_intents": annotation.relevant_feature_intents,
                "relevance_score": annotation.relevance_score,
                "confidence": annotation.confidence,
                "evidence": [
                    evidence.model_dump(mode="python")
                    for evidence in annotation.evidence[:4]
                ],
            }
            for annotation in semantic_result.annotations[:12]
        ],
        "missing_details": list(semantic_result.feature_spec.missing_details),
        "clarifying_questions": list(semantic_result.feature_spec.clarifying_questions),
        "caveats": list(semantic_result.caveats),
    }


def _supplement_plan_intents(
    current_intents: Sequence[str],
    semantic_intents: Sequence[str],
) -> list[str]:
    candidates = set(current_intents)
    for intent in semantic_intents:
        mapped = SEMANTIC_INTENT_TO_PLAN_INTENT.get(intent, intent)
        if intent in ALLOWED_PLAN_INTENTS:
            candidates.add(intent)
        if mapped in ALLOWED_PLAN_INTENTS:
            candidates.add(mapped)
    return [intent for intent in ALLOWED_PLAN_INTENTS if intent in candidates]


def _semantic_intent_message(semantic_intents: Sequence[str]) -> str:
    if not semantic_intents:
        return "semantic_enrichment technical intent labels: none"
    return "semantic_enrichment technical intent labels: " + ", ".join(semantic_intents)


def _semantic_combined_recommendations(
    current: Sequence[CombinedRecommendation],
    semantic: Sequence[CombinedRecommendation],
    *,
    semantic_labels: Sequence[str],
    semantic_result: SemanticEnrichmentResult,
) -> list[CombinedRecommendation]:
    strong_semantic = _semantic_signal_is_strong(semantic_result, semantic_labels)
    filtered_current = [
        item
        for item in current
        if not _is_launch_or_run_artifact(item.path, semantic_labels)
        and not (strong_semantic and item.source == "recipe" and _recipe_is_noisy_for_semantic_upload(item, semantic_labels))
    ]
    combined = _dedupe_recommendations([*filtered_current, *semantic])
    return sorted(combined, key=_semantic_recommendation_rank)[:14]


def _semantic_signal_is_strong(
    semantic_result: SemanticEnrichmentResult,
    semantic_labels: Sequence[str],
) -> bool:
    return bool(
        {"file_upload", "media_upload", "storage", "api", "ui"} & set(semantic_labels)
    ) and any(
        annotation.confidence == "high" and annotation.relevance_score >= 0.75
        for annotation in semantic_result.annotations
    )


def _recipe_is_noisy_for_semantic_upload(
    item: CombinedRecommendation,
    semantic_labels: Sequence[str],
) -> bool:
    if not ({"file_upload", "media_upload"} & set(semantic_labels)):
        return False
    recipe_text = " ".join(
        [item.matched_recipe_id or "", *item.evidence]
    ).lower()
    if any(token in recipe_text for token in ("upload", "media", "picture", "photo", "image")):
        return False
    return "validation" in recipe_text or "backend_api" in recipe_text


def _semantic_recommendation_rank(item: CombinedRecommendation) -> tuple[int, int, str, str]:
    source_rank = {
        "both": 0,
        "semantic_enrichment": 1,
        "planner": 2,
        "recipe": 4,
    }.get(item.source, 5)
    if item.source == "semantic_enrichment" and item.confidence == "high":
        source_rank = 0
    return (
        source_rank,
        _confidence_rank(item.confidence),
        item.repo_name,
        item.path,
    )


def _semantic_recommendation_confidence(confidence: str, relevance_score: float) -> str:
    if confidence == "high" and relevance_score >= 0.75:
        return "high"
    if relevance_score >= 0.55:
        return "medium" if confidence != "high" else "high"
    return "low"


def _is_launch_or_run_artifact(path: str, semantic_labels: Sequence[str]) -> bool:
    lowered = path.lower()
    startup_requested = bool({"startup", "run_config"} & set(semantic_labels))
    return not startup_requested and (
        lowered.endswith(".launch")
        or "/.run/" in lowered
        or "petclinicapplication.launch" in lowered
    )


def _node_type_from_annotation_id(graph_node_id: str) -> str:
    parts = graph_node_id.rsplit(":", 1)
    return parts[-1] if len(parts) == 2 and parts[-1] else "unknown"


def _confidence_rank(value: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(value, 2)


def _dedupe_recommendations(
    recommendations: Sequence[CombinedRecommendation],
) -> list[CombinedRecommendation]:
    by_key: dict[tuple[str, str], CombinedRecommendation] = {}
    order: list[tuple[str, str]] = []
    for item in recommendations:
        key = (item.repo_name, item.path)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = item
            order.append(key)
            continue
        by_key[key] = existing.model_copy(
            update={
                "source": existing.source if existing.source == item.source else "both",
                "confidence": _boost_confidence(existing.confidence, item.confidence),
                "evidence": _dedupe([*existing.evidence, *item.evidence]),
            }
        )
    return [by_key[key] for key in order]


def _boost_confidence(left: str, right: str) -> str:
    rank = min({"high": 0, "medium": 1, "low": 2}.get(left, 2), {"high": 0, "medium": 1, "low": 2}.get(right, 2))
    return {0: "high", 1: "medium", 2: "low"}[rank]


def _dedupe(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
