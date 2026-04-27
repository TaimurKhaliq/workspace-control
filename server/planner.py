"""Backend wrapper around the existing deterministic Plan Bundle pipeline."""

from __future__ import annotations

from pathlib import Path

from pydantic import ValidationError

from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.recipe_suggester import RecipeSuggestionService
from app.services.semantic_enrichment import DEFAULT_SEMANTIC_ROOT, load_latest_semantic_enrichment
from workspace_control.analyze import analyze_feature
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan
from workspace_control.plan_bundle import (
    PlanBundle,
    create_plan_bundle,
    load_recipe_catalog_for_bundle,
)
from workspace_control.propose import create_change_proposal
from workspace_control.semantic import apply_semantic_to_plan


def generate_plan_bundle_for_target(
    *,
    target_id: str,
    feature_request: str,
    registry_path: Path,
    include_debug: bool = False,
    use_semantic: bool = False,
) -> PlanBundle:
    """Generate the same Plan Bundle JSON used by the CLI for one target."""

    registry = DiscoveryTargetRegistry(registry_path)
    record = registry.get(target_id)
    discovery_snapshot = ArchitectureDiscoveryService().discover(record.to_target())
    scan_root = discovery_snapshot.workspace.root_path
    rows = build_inventory(scan_root)
    impacts = analyze_feature(
        feature_request,
        rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    recipe_report = _recipe_report(target_id, feature_request, registry_path)
    semantic_result = _semantic_result(target_id) if use_semantic else None
    plan = create_feature_plan(
        feature_request,
        rows,
        impacts=impacts,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
        recipe_report=recipe_report,
    )
    plan = apply_semantic_to_plan(plan, semantic_result)
    proposal = create_change_proposal(
        feature_request,
        rows,
        impacts=impacts,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
        recipe_report=recipe_report,
        semantic_result=semantic_result,
    )
    recipe_catalog = load_recipe_catalog_for_bundle(target_id, registry)
    return create_plan_bundle(
        feature_request=feature_request,
        target_id=target_id,
        rows=rows,
        impacts=impacts,
        plan=plan,
        proposal=proposal,
        discovery_snapshot=discovery_snapshot,
        recipe_report=recipe_report,
        include_debug=include_debug,
        recipe_catalog=recipe_catalog,
        semantic_result=semantic_result,
    )


def _recipe_report(target_id: str, feature_request: str, registry_path: Path):
    try:
        report = RecipeSuggestionService(
            registry=DiscoveryTargetRegistry(registry_path),
        ).suggest(target_id, feature_request)
    except Exception:
        return None
    if not report.matched_recipes and not report.suggestions:
        return None
    return report


def _semantic_result(target_id: str):
    """Load latest semantic enrichment as optional supplemental evidence."""

    try:
        return load_latest_semantic_enrichment(target_id, semantic_root=DEFAULT_SEMANTIC_ROOT)
    except (OSError, ValidationError, ValueError):
        return None
