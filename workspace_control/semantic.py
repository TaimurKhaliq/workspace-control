"""Helpers for optional semantic enrichment integration."""

from __future__ import annotations

from collections.abc import Sequence

from app.models.semantic_enrichment import SemanticEnrichmentResult

from .models import ChangeProposal, CombinedRecommendation, FeaturePlan

ALLOWED_PLAN_INTENTS = ("ui", "persistence", "api", "event_integration")
SEMANTIC_INTENT_TO_PLAN_INTENT = {
    "storage": "persistence",
    "retrieval": "api",
}


def apply_semantic_to_plan(
    plan: FeaturePlan,
    semantic_result: SemanticEnrichmentResult | None,
) -> FeaturePlan:
    """Return a plan copy with explicitly labeled semantic supplemental evidence."""

    if semantic_result is None:
        return plan
    semantic_intents = list(semantic_result.feature_spec.technical_intents)
    plan_intents = _supplement_plan_intents(plan.feature_intents, semantic_intents)
    missing_evidence = [
        *plan.missing_evidence,
        _semantic_intent_message(semantic_intents),
        *[
            f"semantic_enrichment missing detail: {detail}"
            for detail in semantic_result.feature_spec.missing_details
        ],
    ]
    summary = dict(plan.recipe_confidence_summary)
    summary["semantic_enrichment"] = {
        "available": True,
        "technical_intents": semantic_intents,
        "annotation_count": len(semantic_result.annotations),
        "confidence": semantic_result.feature_spec.confidence,
    }
    return plan.model_copy(
        update={
            "feature_intents": plan_intents,
            "missing_evidence": _dedupe(missing_evidence),
            "recipe_confidence_summary": summary,
        }
    )


def apply_semantic_to_proposal(
    proposal: ChangeProposal,
    semantic_result: SemanticEnrichmentResult | None,
) -> ChangeProposal:
    """Return a proposal copy with semantic recommendations as separate evidence."""

    if semantic_result is None:
        return proposal
    semantic_recommendations = semantic_recommendations_from_result(semantic_result)
    combined = _dedupe_recommendations(
        [
            *proposal.combined_recommendations,
            *semantic_recommendations,
        ]
    )[:12]
    return proposal.model_copy(
        update={
            "feature_intents": _supplement_plan_intents(
                proposal.feature_intents,
                semantic_result.feature_spec.technical_intents,
            ),
            "missing_evidence": _dedupe(
                [
                    *proposal.missing_evidence,
                    _semantic_intent_message(semantic_result.feature_spec.technical_intents),
                    *[
                        f"semantic_enrichment missing detail: {detail}"
                        for detail in semantic_result.feature_spec.missing_details
                    ],
                ]
            ),
            "combined_recommendations": combined,
        }
    )


def semantic_recommendations_from_result(
    semantic_result: SemanticEnrichmentResult,
) -> list[CombinedRecommendation]:
    """Convert graph annotations into inspect-only recommendations."""

    recommendations: list[CombinedRecommendation] = []
    for annotation in sorted(
        semantic_result.annotations,
        key=lambda item: (-item.relevance_score, item.repo_name, item.path),
    ):
        if annotation.relevance_score < 35:
            continue
        evidence = [
            f"semantic_enrichment: {', '.join(annotation.semantic_roles) or 'semantic annotation'}",
            f"semantic technical intents: {', '.join(annotation.relevant_feature_intents) or '-'}",
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
                confidence=annotation.confidence,
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
        "caveats": list(semantic_result.caveats),
    }


def _supplement_plan_intents(
    current_intents: Sequence[str],
    semantic_intents: Sequence[str],
) -> list[str]:
    candidates = set(current_intents)
    for intent in semantic_intents:
        mapped = SEMANTIC_INTENT_TO_PLAN_INTENT.get(intent, intent)
        if mapped in ALLOWED_PLAN_INTENTS:
            candidates.add(mapped)
    return [intent for intent in ALLOWED_PLAN_INTENTS if intent in candidates]


def _semantic_intent_message(semantic_intents: Sequence[str]) -> str:
    if not semantic_intents:
        return "semantic_enrichment technical intents: none"
    return "semantic_enrichment technical intents: " + ", ".join(semantic_intents)


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
