"""Debug explanation output for deterministic feature planning pipeline."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.models.discovery import DiscoverySnapshot, DiscoveryTarget, RepoDiscovery
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService

from .analyze import analyze_feature
from .manifests import build_inventory
from .models import ChangeProposal, ConceptGrounding, FeatureImpact, FeaturePlan, InventoryRow
from .plan import create_feature_plan
from .propose import create_change_proposal

MAX_MATCHED_TERMS = 6
MAX_SOURCES = 6
MAX_PROPOSED_FILES = 20


def create_feature_explanation(
    feature_request: str,
    rows: Sequence[InventoryRow],
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
) -> dict[str, Any]:
    """Create a deterministic debug explanation from existing pipeline outputs."""

    snapshot = discovery_snapshot
    if snapshot is None and scan_root is not None and scan_root.is_dir():
        snapshot = ArchitectureDiscoveryService().discover(
            DiscoveryTarget.local_path(scan_root)
        )

    effective_scan_root = snapshot.workspace.root_path if snapshot is not None else scan_root
    explicit_rows = list(rows)
    if not explicit_rows and effective_scan_root is not None:
        explicit_rows = build_inventory(effective_scan_root)

    bootstrap_report = (
        RepoProfileBootstrapService().bootstrap(snapshot)
        if snapshot is not None
        else None
    )
    effective_rows = RepoProfileBootstrapService().effective_inventory_for_scan(
        explicit_rows,
        scan_root=effective_scan_root,
        discovery_snapshot=snapshot,
    )
    impacts = analyze_feature(
        feature_request,
        effective_rows,
        scan_root=effective_scan_root,
        discovery_snapshot=snapshot,
    )
    plan = create_feature_plan(
        feature_request,
        effective_rows,
        impacts=impacts,
        scan_root=effective_scan_root,
        discovery_snapshot=snapshot,
    )
    proposal = create_change_proposal(
        feature_request,
        effective_rows,
        impacts=impacts,
        scan_root=effective_scan_root,
        discovery_snapshot=snapshot,
    )

    profiles_by_repo = {
        profile.repo_name: profile
        for profile in (bootstrap_report.profiles if bootstrap_report is not None else [])
    }
    rows_by_repo = {row.repo_name: row for row in effective_rows}
    repos = snapshot.report.repos if snapshot is not None else []

    return {
        "feature_request": feature_request,
        "repositories": [
            _repo_explanation(repo, rows_by_repo.get(repo.repo_name), profiles_by_repo.get(repo.repo_name))
            for repo in repos
        ],
        "feature_understanding": {
            "feature_intents": list(plan.feature_intents),
            "concept_grounding": _compact_grounding(plan.concept_grounding),
            "unsupported_intents": list(plan.unsupported_intents),
        },
        "owner_decisions": {
            "primary_owner": plan.primary_owner,
            "implementation_owner": plan.implementation_owner,
            "domain_owner": plan.domain_owner,
        },
        "analysis": _compact_impacts(impacts),
        "top_proposed_files": _top_proposed_files(proposal),
        "missing_evidence": list(plan.missing_evidence),
        "evidence_sources": _evidence_sources(
            repos,
            profiles_by_repo,
            plan,
        ),
    }


def format_feature_explanation(explanation: dict[str, Any]) -> str:
    """Render explanation output as deterministic JSON."""

    return json.dumps(explanation, indent=2, sort_keys=False)


def _repo_explanation(repo: RepoDiscovery, row: InventoryRow | None, profile) -> dict[str, Any]:
    framework_detections = [
        {
            "name": descriptor.name,
            "version": descriptor.version,
            "source": descriptor.source,
            "confidence": descriptor.confidence,
            "origin": descriptor.origin,
        }
        for descriptor in repo.framework_detections
    ]
    return {
        "repo_name": repo.repo_name,
        "metadata_source": row.metadata_source if row is not None else "none",
        "metadata_mode": profile.metadata_mode if profile is not None else "none",
        "evidence_mode": repo.evidence_mode,
        "confidence": repo.confidence,
        "detected_frameworks": list(repo.detected_frameworks),
        "framework_detections": framework_detections,
        "framework_packs": list(repo.loaded_framework_packs),
        "framework_hints": list(repo.framework_hints),
        "discovered_paths": {
            "frontend": list(repo.likely_ui_locations),
            "api": list(repo.likely_api_locations),
            "service": list(repo.likely_service_locations),
            "persistence": list(repo.likely_persistence_locations),
            "event_integration": list(repo.likely_event_locations),
        },
        "hinted_paths": {
            "frontend": list(repo.hinted_ui_locations),
            "api": list(repo.hinted_api_locations),
            "service": list(repo.hinted_service_locations),
            "persistence": list(repo.hinted_persistence_locations),
            "event_integration": list(repo.hinted_event_locations),
        },
    }


def _compact_grounding(grounding: Sequence[ConceptGrounding]) -> list[dict[str, Any]]:
    return [
        {
            "concept": item.concept,
            "status": item.status,
            "matched_terms": _compact_values(item.matched_terms, MAX_MATCHED_TERMS),
            "sources": _compact_values(item.sources, MAX_SOURCES),
        }
        for item in grounding
    ]


def _compact_impacts(impacts: Sequence[FeatureImpact]) -> list[dict[str, Any]]:
    return [
        {
            "repo_name": impact.repo_name,
            "role": impact.role,
            "score": impact.score,
            "reason": impact.reason,
        }
        for impact in impacts[:8]
    ]


def _top_proposed_files(proposal: ChangeProposal) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for item in proposal.proposed_changes:
        for file_plan in item.files:
            files.append(
                {
                    "repo_name": item.repo_name,
                    "path": file_plan.path,
                    "action": file_plan.action,
                    "confidence": file_plan.confidence,
                    "reason": file_plan.reason,
                }
            )
            if len(files) >= MAX_PROPOSED_FILES:
                return files
    return files


def _evidence_sources(
    repos: Sequence[RepoDiscovery],
    profiles_by_repo: dict[str, Any],
    plan: FeaturePlan,
) -> dict[str, Any]:
    explicit_metadata = sorted(
        repo_name
        for repo_name, profile in profiles_by_repo.items()
        if getattr(profile, "explicit_metadata_present", False)
    )
    inferred_metadata = sorted(
        repo_name
        for repo_name, profile in profiles_by_repo.items()
        if "inferred" in getattr(profile, "metadata_mode", "")
    )
    source_discovery = sorted(
        repo.repo_name
        for repo in repos
        if repo.evidence_mode in {"mixed", "source-discovered"}
    )
    framework_pack = {
        repo.repo_name: list(repo.loaded_framework_packs)
        for repo in repos
        if repo.loaded_framework_packs
    }
    concept_grounding = [
        {
            "concept": item.concept,
            "status": item.status,
        }
        for item in plan.concept_grounding
    ]

    return {
        "explicit_metadata": explicit_metadata,
        "inferred_metadata": inferred_metadata,
        "source_discovery": source_discovery,
        "framework_pack": framework_pack,
        "concept_grounding": concept_grounding,
    }


def _compact_values(values: Sequence[str], limit: int) -> list[str]:
    compact: list[str] = []
    for value in values:
        cleaned = " ".join(str(value).split())
        if len(cleaned) > 120:
            cleaned = f"{cleaned[:117]}..."
        compact.append(cleaned)
        if len(compact) >= limit:
            break
    return compact
