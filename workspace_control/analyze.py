from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import DiscoverySnapshot
from app.models.evidence import Evidence
from app.services.evidence_aggregator import (
    CATEGORY_HINTS,
    REPO_TYPE_WEIGHT,
    EvidenceAggregator,
    normalize_text,
    phrase_matches,
    tokenize,
)

from .models import FeatureImpact, InventoryRow


def analyze_feature(
    feature_description: str,
    rows: Sequence[InventoryRow],
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
) -> list[FeatureImpact]:
    """Score likely impacted repos using deterministic evidence objects."""

    feature_tokens = tokenize(feature_description)
    if not feature_tokens:
        return []

    evidence = EvidenceAggregator().aggregate(
        feature_description,
        rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    feature_signal_matches = {
        category: {
            "keywords": sorted(feature_tokens & config["keywords"]),
            "phrases": phrase_matches(normalize_text(feature_description), config["phrases"]),
        }
        for category, config in CATEGORY_HINTS.items()
    }
    feature_ui_intent = bool(
        feature_signal_matches["frontend"]["keywords"]
        or feature_signal_matches["frontend"]["phrases"]
    )
    feature_backend_intent = bool(
        feature_signal_matches["backend"]["keywords"]
        or feature_signal_matches["backend"]["phrases"]
    )

    scored_rows = _score_rows_from_evidence(evidence)
    max_primary_ownership_score = max(
        (
            int(scored_row["primary_ownership_score"])
            for scored_row in scored_rows
        ),
        default=0,
    )

    impacts: list[FeatureImpact] = []
    for scored_row in scored_rows:
        primary_ownership_score = int(scored_row["primary_ownership_score"])
        if primary_ownership_score > 0 and primary_ownership_score == max_primary_ownership_score:
            role = "primary-owner"
        elif bool(scored_row["only_domain"]):
            role = "weak-match"
        elif int(scored_row["downstream_score"]) > 0:
            role = "possible-downstream"
        elif (
            feature_ui_intent and int(scored_row["frontend_score"]) >= REPO_TYPE_WEIGHT
        ) or (
            feature_backend_intent and int(scored_row["backend_score"]) >= REPO_TYPE_WEIGHT
        ):
            role = "direct-dependent"
        elif int(scored_row["non_domain_score"]) > 0:
            role = "possible-downstream"
        else:
            role = "weak-match"

        impacts.append(
            FeatureImpact(
                repo_name=str(scored_row["repo_name"]),
                role=role,
                score=int(scored_row["score"]),
                reason=str(scored_row["reason"]),
            )
        )

    impacts.sort(key=lambda impact: (-impact.score, impact.repo_name))
    return impacts


def _score_rows_from_evidence(evidence: Sequence[Evidence]) -> list[dict[str, object]]:
    by_repo: dict[str, list[Evidence]] = {}
    for item in evidence:
        by_repo.setdefault(item.repo_name, []).append(item)

    scored_rows: list[dict[str, object]] = []
    for repo_name, repo_evidence in by_repo.items():
        score = sum(item.weight for item in repo_evidence)
        if score <= 0:
            continue

        domain_score = _category_score(repo_evidence, "domain")
        frontend_score = _category_score(repo_evidence, "frontend")
        backend_score = _category_score(repo_evidence, "backend")
        downstream_score = _category_score(repo_evidence, "downstream")
        primary_ownership_score = sum(
            item.weight
            for item in repo_evidence
            if item.category == "ownership"
            and item.details.get("primary_ownership") == "true"
        )
        non_domain_score = score - domain_score

        scored_rows.append(
            {
                "repo_name": repo_name,
                "score": score,
                "reason": _reason_from_evidence(repo_evidence),
                "domain_score": domain_score,
                "non_domain_score": non_domain_score,
                "only_domain": bool(domain_score > 0 and non_domain_score == 0),
                "frontend_score": frontend_score,
                "backend_score": backend_score,
                "downstream_score": downstream_score,
                "primary_ownership_score": primary_ownership_score,
            }
        )

    return scored_rows


def _category_score(evidence: Sequence[Evidence], category: str) -> int:
    return sum(item.weight for item in evidence if item.category == category)


def _reason_from_evidence(evidence: Sequence[Evidence]) -> str:
    reason_parts: list[str] = []

    for category in ("domain", "frontend", "backend", "data"):
        reason_parts.extend(_reasons_for_category(evidence, category))

    ownership_reasons = _reasons_for_category(evidence, "ownership")
    if ownership_reasons:
        reason_parts.append(f"backend ownership ({' | '.join(ownership_reasons)})")

    reason_parts.extend(_reasons_for_category(evidence, "downstream"))
    reason_parts.extend(_reasons_for_category(evidence, "keyword_overlap"))

    return "; ".join(reason_parts)


def _reasons_for_category(evidence: Sequence[Evidence], category: str) -> list[str]:
    reasons: list[str] = []
    seen: set[str] = set()
    for item in evidence:
        if item.category != category:
            continue
        reason = item.details.get("reason")
        if not reason:
            continue
        source_reason = f"{item.source}: {reason}"
        if source_reason in seen:
            continue
        reasons.append(source_reason)
        seen.add(source_reason)
    return reasons


def format_feature_analysis(
    feature_description: str, impacts: Sequence[FeatureImpact]
) -> str:
    """Render impacted repos with short reasons."""

    if not impacts:
        return (
            f'Feature: "{feature_description}"\n'
            "No likely impacted repos found from current stackpilot.yml metadata."
        )

    headers = ["repo", "role", "score", "reason"]
    rows = [
        [impact.repo_name, impact.role, str(impact.score), impact.reason]
        for impact in impacts
    ]

    widths = [len(headers[0]), len(headers[1]), len(headers[2]), len(headers[3])]
    for repo, role, score, reason in rows:
        widths[0] = max(widths[0], len(repo))
        widths[1] = max(widths[1], len(role))
        widths[2] = max(widths[2], len(score))
        widths[3] = max(widths[3], len(reason))

    header_line = " | ".join(
        header.ljust(widths[idx]) for idx, header in enumerate(headers)
    )
    separator_line = "-+-".join("-" * width for width in widths)
    data_lines = [
        " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(values))
        for values in rows
    ]

    return "\n".join(
        [
            f'Feature: "{feature_description}"',
            header_line,
            separator_line,
            *data_lines,
        ]
    )
