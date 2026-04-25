import json
import re
from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import (
    ArchitectureDiscoveryReport,
    DiscoverySnapshot,
    DiscoveryTarget,
    RepoDiscovery,
)
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.models.recipe_suggestion import RecipeSuggestionReport
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService
from app.services.text_normalization import normalize_text as normalize_request_text
from app.services.text_normalization import tokenize_text

from .analyze import analyze_feature
from .models import (
    ChangeProposal,
    ChangeProposalItem,
    CombinedRecommendation,
    FilePlan,
    FeatureImpact,
    FeaturePlan,
    InventoryRow,
)
from .plan import create_feature_plan
from .ui_shell import ui_shell_path_kind, ui_shell_paths, ui_shell_requested

FRONTEND_PATH_MARKERS = ("pages", "components", "forms", "services", "api", "public")
API_PATH_MARKERS = ("controller", "controllers", "api", "rest", "dto", "openapi")
SERVICE_PATH_MARKERS = ("service", "services", "application", "domain")
PERSISTENCE_PATH_MARKERS = (
    "entity",
    "entities",
    "repository",
    "repositories",
    "migration",
    "changelog",
    "resources",
)
EVENT_PATH_MARKERS = ("event", "events", "integration", "integrations")
EVENT_CLASS_SUFFIXES = (
    "Publisher",
    "Producer",
    "Consumer",
    "Listener",
    "Handler",
    "Subscriber",
    "Event",
)
CATEGORY_TOKENS = {
    "frontend": {"api", "client", "component", "form", "page", "service"},
    "api": {"api", "controller", "dto", "openapi", "request", "resource", "response"},
    "service": {"application", "domain", "service"},
    "persistence": {"entity", "migration", "repository"},
    "event": {
        "consumer",
        "event",
        "handler",
        "integration",
        "listener",
        "producer",
        "publisher",
        "subscriber",
    },
}
FILE_PATTERNS = {
    "frontend": ("*.tsx", "*.ts", "*.jsx", "*.js", "*.html", "*.css", "*.svg"),
    "api": (
        "*Controller.java",
        "*Resource.java",
        "*Dto.java",
        "*DTO.java",
        "*Request.java",
        "*Response.java",
        "*.yaml",
        "*.yml",
        "*.json",
    ),
    "service": ("*Service.java",),
    "persistence": ("*Entity.java", "*Repository.java", "*.java", "*.sql", "*.xml"),
    "event": (
        "*Event*.java",
        "*Publisher.java",
        "*Producer.java",
        "*Consumer.java",
        "*Listener.java",
        "*Handler.java",
        "*Subscriber.java",
    ),
}
STRICT_GROUP_LIMITS = {
    "frontend": 3,
    "backend": 5,
    "shared": 2,
}
FRONTEND_FOCUS_TOKENS = {"edit", "editor", "form", "info", "page", "screen", "view"}
EDIT_FLOW_REQUEST_TOKENS = {"change", "edit", "modify", "update"}
CREATE_FLOW_REQUEST_TOKENS = {"add", "create", "new"}
EDIT_FLOW_FILE_TOKENS = {"edit", "editor", "info", "view"}
CREATE_FLOW_FILE_TOKENS = {"create", "new"}
FRONTEND_SUPPORT_FILE_TOKENS = {"type", "types"}
PAGE_ADD_ROUTE_TOKENS = {"config", "configure", "route", "routes", "router"}
BACKEND_FOCUS_TOKENS = {
    "controller": 5,
    "request": 4,
    "response": 4,
    "service": 3,
    "entity": 2,
    "repository": 1,
}
SHARED_SUPPORT_TOKENS = {"contract", "openapi", "schema", "swagger"}

GENERIC_STOPWORDS = {
    "a",
    "allow",
    "and",
    "for",
    "from",
    "in",
    "of",
    "on",
    "the",
    "their",
    "to",
    "update",
    "users",
    "when",
    "whenever",
    "with",
}
TECHNICAL_GROUNDING_TOKENS = {
    "api",
    "class",
    "client",
    "component",
    "components",
    "controller",
    "dto",
    "edit",
    "editor",
    "entity",
    "form",
    "index",
    "java",
    "main",
    "model",
    "openapi",
    "org",
    "page",
    "repository",
    "request",
    "resources",
    "response",
    "rest",
    "service",
    "src",
    "string",
    "ts",
    "tsx",
    "type",
    "types",
    "yaml",
}
UNRELATED_DOMAIN_TOKENS = {
    "pet",
    "pets",
    "root",
    "roots",
    "specialties",
    "specialty",
    "user",
    "users",
    "vet",
    "vets",
    "visit",
    "visits",
}
COMBINED_RECOMMENDATION_LIMIT = 8
STRONG_PLANNER_RECIPE_ADDITION_LIMIT = 3


def create_change_proposal(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
    recipe_report: RecipeSuggestionReport | None = None,
) -> ChangeProposal:
    """Create deterministic read-only change proposals from a feature plan."""

    effective_snapshot = discovery_snapshot
    if effective_snapshot is None and scan_root is not None and scan_root.is_dir():
        effective_snapshot = ArchitectureDiscoveryService().discover(
            DiscoveryTarget.local_path(scan_root)
        )
    effective_scan_root = (
        effective_snapshot.workspace.root_path
        if effective_snapshot is not None
        else scan_root
    )
    effective_rows = RepoProfileBootstrapService().effective_inventory_for_scan(
        rows,
        scan_root=effective_scan_root,
        discovery_snapshot=effective_snapshot,
    )
    resolved_impacts = (
        list(impacts)
        if impacts is not None
        else analyze_feature(
            feature_request,
            effective_rows,
            scan_root=effective_scan_root,
            discovery_snapshot=effective_snapshot,
        )
    )
    plan = create_feature_plan(
        feature_request,
        effective_rows,
        impacts=resolved_impacts,
        scan_root=effective_scan_root,
        discovery_snapshot=effective_snapshot,
        recipe_report=recipe_report,
    )
    by_repo = {row.repo_name: row for row in effective_rows}
    impact_by_repo = {impact.repo_name: impact for impact in resolved_impacts}
    discovery_by_repo = _architecture_by_repo(effective_scan_root, effective_snapshot)
    workspace_root = _workspace_root(effective_scan_root, effective_snapshot)

    proposed_changes: list[ChangeProposalItem] = []
    for repo_name in _ordered_impacted_repos(plan):
        row = by_repo.get(repo_name)
        role = _role_for_repo(plan, repo_name)
        if row is None or role is None:
            continue

        discovery = discovery_by_repo.get(repo_name)
        repo_dir = (
            (workspace_root / repo_name)
            if workspace_root is not None
            else None
        )
        inspect_paths = _likely_files_to_inspect(plan, row, role, discovery, repo_dir)
        possible_new_files = _possible_new_files(
            plan,
            row,
            role,
            inspect_paths,
            discovery,
            repo_dir,
        )
        file_plans = _build_file_plans(
            plan,
            row,
            role,
            inspect_paths,
            possible_new_files,
            discovery,
            repo_dir,
        )
        legacy_inspect_paths = _legacy_inspect_paths_from_file_plans(file_plans)
        proposed_changes.append(
            ChangeProposalItem(
                repo_name=repo_name,
                role=role,
                likely_files_to_inspect=legacy_inspect_paths,
                files=file_plans,
                likely_changes=_likely_changes(plan, row, role),
                possible_new_files=possible_new_files,
                rationale=_rationale(
                    plan,
                    row,
                    role,
                    legacy_inspect_paths,
                    impact_by_repo.get(repo_name),
                    discovery,
                ),
            )
        )

    recipe_suggestions = _recipe_recommendations(
        recipe_report,
        discovery_snapshot=effective_snapshot,
        workspace_root=workspace_root,
    )
    planner_recommendations = _planner_recommendations(proposed_changes)
    combined_recommendations = _combine_recommendations(
        planner_recommendations,
        recipe_suggestions,
        plan=plan,
        recipe_report=recipe_report,
    )
    missing_evidence = list(plan.missing_evidence)
    if not planner_recommendations and recipe_suggestions:
        missing_evidence = _dedupe_preserve_order(
            [
                *missing_evidence,
                "Planner produced no concrete file predictions; recipe evidence provided fallback suggestions.",
            ]
        )

    return ChangeProposal(
        feature_request=plan.feature_request,
        feature_intents=plan.feature_intents,
        confidence=plan.confidence,
        missing_evidence=missing_evidence,
        implementation_owner=plan.implementation_owner,
        domain_owner=plan.domain_owner,
        proposed_changes=proposed_changes,
        recipe_suggestions=recipe_suggestions,
        combined_recommendations=combined_recommendations,
    )


def format_change_proposal(proposal: ChangeProposal) -> str:
    """Render proposed changes as deterministic JSON."""

    return json.dumps(proposal.model_dump(mode="python"), indent=2, sort_keys=False)


def _planner_recommendations(
    proposed_changes: Sequence[ChangeProposalItem],
) -> list[CombinedRecommendation]:
    recommendations: list[CombinedRecommendation] = []
    for item in proposed_changes:
        for file_plan in item.files:
            recommendations.append(
                CombinedRecommendation(
                    repo_name=item.repo_name,
                    path=file_plan.path,
                    action=file_plan.action,
                    confidence=file_plan.confidence,
                    source="planner",
                    evidence=[file_plan.reason],
                )
            )
    return recommendations


def _recipe_recommendations(
    recipe_report: RecipeSuggestionReport | None,
    *,
    discovery_snapshot: DiscoverySnapshot | None,
    workspace_root: Path | None,
) -> list[CombinedRecommendation]:
    if recipe_report is None:
        return []

    recommendations: list[CombinedRecommendation] = []
    for suggestion in recipe_report.suggestions:
        path = suggestion.suggested_path or suggestion.suggested_folder
        if not path:
            continue
        repo_name = _repo_name_for_recipe_suggestion(
            suggestion.evidence,
            path,
            discovery_snapshot=discovery_snapshot,
            workspace_root=workspace_root,
        )
        if repo_name is None:
            continue
        recommendations.append(
            CombinedRecommendation(
                repo_name=repo_name,
                path=path,
                action=suggestion.action,
                confidence=suggestion.confidence,
                source="recipe",
                evidence=list(suggestion.evidence),
                matched_recipe_id=suggestion.matched_recipe_id,
            )
        )
    return _dedupe_recommendations(recommendations)


def _repo_name_for_recipe_suggestion(
    evidence: Sequence[str],
    path: str,
    *,
    discovery_snapshot: DiscoverySnapshot | None,
    workspace_root: Path | None,
) -> str | None:
    for item in evidence:
        if item.startswith("repo: "):
            repo_name = item.removeprefix("repo: ").strip()
            if repo_name:
                return repo_name

    graph = discovery_snapshot.source_graph if discovery_snapshot is not None else None
    if graph is not None:
        for node in graph.nodes:
            if node.path == path:
                return node.repo_name

    if discovery_snapshot is not None and len(discovery_snapshot.report.repos) == 1:
        return discovery_snapshot.report.repos[0].repo_name

    if workspace_root is not None and workspace_root.is_dir():
        matches = [
            child.name
            for child in sorted(workspace_root.iterdir(), key=lambda item: item.name)
            if child.is_dir() and ((child / path).exists() or (child / path).parent.exists())
        ]
        if len(matches) == 1:
            return matches[0]
    return None


def _combine_recommendations(
    planner: Sequence[CombinedRecommendation],
    recipe: Sequence[CombinedRecommendation],
    *,
    plan: FeaturePlan | None = None,
    recipe_report: RecipeSuggestionReport | None = None,
) -> list[CombinedRecommendation]:
    recipe_meta = _recipe_match_metadata(recipe_report)
    primary_recipe_ids = _primary_recipe_ids(recipe_report)
    planner_strong = _planner_recommendations_are_strong(planner, plan)
    by_key: dict[tuple[str, str], CombinedRecommendation] = {}
    ordered_keys: list[tuple[str, str]] = []

    for item in planner:
        key = (item.repo_name, item.path)
        by_key[key] = item
        ordered_keys.append(key)

    recipe_only_additions = 0
    for item in recipe:
        key = (item.repo_name, item.path)
        existing = by_key.get(key)
        if existing is not None:
            by_key[key] = existing.model_copy(
                update={
                    "source": "both",
                    "action": _merge_actions(existing.action, item.action),
                    "confidence": _boost_confidence(existing.confidence, item.confidence),
                    "evidence": _dedupe_preserve_order([*existing.evidence, *item.evidence]),
                    "matched_recipe_id": existing.matched_recipe_id or item.matched_recipe_id,
                }
            )
            continue
        if planner_strong and not _allow_recipe_only_addition(
            item,
            plan=plan,
            recipe_meta=recipe_meta,
            primary_recipe_ids=primary_recipe_ids,
            recipe_only_addition_count=recipe_only_additions,
        ):
            continue
        by_key[key] = item
        ordered_keys.append(key)
        if planner_strong:
            recipe_only_additions += 1

    combined = [by_key[key] for key in ordered_keys]
    return sorted(
        combined,
        key=lambda item: (
            _combined_recommendation_rank(item),
            item.repo_name,
            item.path,
            item.action,
        ),
    )[:COMBINED_RECOMMENDATION_LIMIT]


def _merge_actions(left: str, right: str) -> str:
    order = {"create": 0, "modify": 1, "inspect": 2, "inspect-only": 3}
    return min((left, right), key=lambda item: order.get(item, 3))


def _recipe_match_metadata(
    recipe_report: RecipeSuggestionReport | None,
) -> dict[str, dict[str, float | str]]:
    if recipe_report is None:
        return {}
    return {
        match.recipe_id: {
            "recipe_type": match.recipe_type,
            "structural_confidence": match.structural_confidence,
            "planner_effectiveness": match.planner_effectiveness,
        }
        for match in recipe_report.matched_recipes
    }


def _primary_recipe_ids(recipe_report: RecipeSuggestionReport | None) -> set[str]:
    if recipe_report is None or not recipe_report.matched_recipes:
        return set()
    return {recipe_report.matched_recipes[0].recipe_id}


def _planner_recommendations_are_strong(
    planner: Sequence[CombinedRecommendation],
    plan: FeaturePlan | None,
) -> bool:
    if not planner:
        return False
    concrete = [
        item
        for item in planner
        if item.action != "inspect-only" and item.confidence in {"high", "medium"}
    ]
    if not concrete:
        return False
    if plan is None:
        return True
    return plan.confidence in {"high", "medium"} and plan.implementation_owner is not None


def _allow_recipe_only_addition(
    item: CombinedRecommendation,
    *,
    plan: FeaturePlan | None,
    recipe_meta: dict[str, dict[str, float | str]],
    primary_recipe_ids: set[str],
    recipe_only_addition_count: int,
) -> bool:
    if item.matched_recipe_id and primary_recipe_ids and item.matched_recipe_id not in primary_recipe_ids:
        return False
    meta = recipe_meta.get(item.matched_recipe_id or "", {})
    structural_confidence = float(meta.get("structural_confidence", 0.0) or 0.0)
    if structural_confidence < 0.6:
        return False
    if _direct_requested_recipe_target(item, plan):
        return True
    if recipe_only_addition_count >= STRONG_PLANNER_RECIPE_ADDITION_LIMIT:
        return False
    if item.confidence == "high":
        return True
    return item.confidence == "medium" and _recipe_supporting_recommendation(item)


def _direct_requested_recipe_target(
    item: CombinedRecommendation,
    plan: FeaturePlan | None,
) -> bool:
    evidence_text = " | ".join(item.evidence).lower()
    if (
        "requested page/component already exists" in evidence_text
        or "request explicitly names a page/component identifier" in evidence_text
    ):
        return True
    if plan is None:
        return False
    requested = _requested_component_or_page_name(plan.feature_request)
    if requested is None:
        return False
    return Path(item.path).stem.lower() == requested.lower()


def _requested_component_or_page_name(feature_request: str) -> str | None:
    match = re.search(
        r"\b([A-Z][A-Za-z0-9]*(?:Page|Form|Editor|Details|Detail|List|Table|Component))\b",
        feature_request,
    )
    return match.group(1) if match else None


def _recipe_supporting_recommendation(item: CombinedRecommendation) -> bool:
    evidence_text = " | ".join(item.evidence).lower()
    path_tokens = _path_all_tokens(item.path)
    return (
        "route_config" in evidence_text
        or "frontend_type" in evidence_text
        or "frontend type" in evidence_text
        or bool(path_tokens & FRONTEND_SUPPORT_FILE_TOKENS)
        or "requested page/component already exists" in evidence_text
        or "request explicitly names a page/component identifier" in evidence_text
    )


def _merge_duplicate_recommendations(
    existing: CombinedRecommendation,
    item: CombinedRecommendation,
) -> CombinedRecommendation:
    source = existing.source if existing.source == item.source else "both"
    return existing.model_copy(
        update={
            "source": source,
            "action": _merge_actions(existing.action, item.action),
            "confidence": _boost_confidence(existing.confidence, item.confidence),
            "evidence": _dedupe_preserve_order([*existing.evidence, *item.evidence]),
            "matched_recipe_id": existing.matched_recipe_id or item.matched_recipe_id,
        }
    )


def _dedupe_recommendations(
    recommendations: Sequence[CombinedRecommendation],
) -> list[CombinedRecommendation]:
    by_key: dict[tuple[str, str], CombinedRecommendation] = {}
    ordered_keys: list[tuple[str, str]] = []
    for item in recommendations:
        key = (item.repo_name, item.path)
        if key in by_key:
            by_key[key] = _merge_duplicate_recommendations(by_key[key], item)
            continue
        by_key[key] = item
        ordered_keys.append(key)
    return [by_key[key] for key in ordered_keys]


def _boost_confidence(left: str, right: str) -> str:
    rank = min(_confidence_rank(left), _confidence_rank(right))
    if rank > 0:
        rank -= 1
    return {0: "high", 1: "medium", 2: "low"}[rank]


def _confidence_rank(value: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(value, 2)


def _combined_recommendation_rank(item: CombinedRecommendation) -> tuple[int, int, int, int]:
    evidence_text = " | ".join(item.evidence).lower()
    path_tokens = _path_all_tokens(item.path)
    direct_requested = (
        "requested page/component" in evidence_text
        or "request explicitly names a page/component identifier" in evidence_text
    )
    if item.source == "both":
        source_tier = 0
    elif item.source == "planner" and item.confidence == "high" and item.action in {"create", "modify"}:
        source_tier = 1
    elif item.source == "recipe" and item.confidence == "high" and item.action in {"create", "modify"}:
        source_tier = 2
    elif item.source == "recipe" and direct_requested:
        source_tier = 2
    elif item.source == "planner" and item.confidence == "medium":
        source_tier = 3
    elif item.source == "recipe" and item.confidence == "medium":
        source_tier = 4
    elif item.source == "planner":
        source_tier = 5
    else:
        source_tier = 6

    if direct_requested:
        purpose_tier = 0
    elif "route_config" in evidence_text:
        purpose_tier = 1
    elif (
        "frontend_type" in evidence_text
        or "frontend type" in evidence_text
        or path_tokens & FRONTEND_SUPPORT_FILE_TOKENS
    ):
        purpose_tier = 2
    elif item.action in {"create", "modify"}:
        purpose_tier = 3
    else:
        purpose_tier = 4
    return (
        source_tier,
        purpose_tier,
        _confidence_rank(item.confidence),
        0 if item.action in {"create", "modify"} else 1,
    )


def _workspace_root(
    scan_root: Path | None,
    discovery_snapshot: DiscoverySnapshot | None,
) -> Path | None:
    if discovery_snapshot is not None:
        return discovery_snapshot.workspace.root_path
    return scan_root


def _architecture_by_repo(
    scan_root: Path | None,
    discovery_snapshot: DiscoverySnapshot | None,
) -> dict[str, RepoDiscovery]:
    if discovery_snapshot is not None:
        return {repo.repo_name: repo for repo in discovery_snapshot.report.repos}

    if scan_root is None or not scan_root.is_dir():
        return {}

    report: ArchitectureDiscoveryReport = ArchitectureDiscoveryService().discover_local(
        scan_root
    )
    return {repo.repo_name: repo for repo in report.repos}


def _ordered_impacted_repos(plan: FeaturePlan) -> list[str]:
    ordered: list[str] = []
    if plan.primary_owner is not None:
        ordered.append(plan.primary_owner)
    ordered.extend(plan.direct_dependents)
    ordered.extend(plan.possible_downstreams)
    ordered.extend(sorted(plan.likely_paths_by_repo))
    return _dedupe_preserve_order(ordered)


def _role_for_repo(plan: FeaturePlan, repo_name: str) -> str | None:
    if repo_name == plan.primary_owner:
        return "primary-owner"
    if repo_name in plan.direct_dependents:
        return "direct-dependent"
    if repo_name in plan.possible_downstreams:
        return "possible-downstream"
    return None


def _likely_files_to_inspect(
    plan: FeaturePlan,
    row: InventoryRow,
    role: str,
    discovery: RepoDiscovery | None,
    repo_dir: Path | None,
) -> list[str]:
    files: list[str] = []
    folders: list[str] = []
    planned_paths = plan.likely_paths_by_repo.get(row.repo_name, [])
    backend = _row_is_backend(row)
    frontend = _row_is_frontend(row)
    allow_concrete_files = not _has_ungrounded_concepts(plan)

    if frontend and plan.ui_change_needed:
        ui_shell_change = ui_shell_requested(plan.feature_request)
        shell_paths = ui_shell_paths(repo_dir) if ui_shell_change else []
        if shell_paths:
            files.extend(path for path in shell_paths if _path_looks_like_file(path))
            folders.extend(
                path for path in shell_paths if not _path_looks_like_file(path)
            )

        ui_paths = _merge_paths(
            _discovery_paths(discovery, "ui"),
            _matching_paths(planned_paths, FRONTEND_PATH_MARKERS),
            []
            if (ui_shell_change or _ui_page_add_requested(plan.feature_request))
            else _discovery_paths(discovery, "api"),
        )
        if allow_concrete_files and not shell_paths:
            files.extend(_existing_files_for_category(repo_dir, ui_paths, plan, row, "frontend"))
            if _ui_page_add_requested(plan.feature_request):
                files.extend(_page_add_existing_support_files(repo_dir, plan))
        if not shell_paths:
            folders.extend(ui_paths)

    if backend and plan.api_change_needed:
        api_paths = _merge_paths(
            _discovery_paths(discovery, "api"),
            _matching_paths(planned_paths, API_PATH_MARKERS),
        )
        service_paths = _merge_paths(
            _discovery_paths(discovery, "service"),
            _matching_paths(planned_paths, SERVICE_PATH_MARKERS),
        )
        if allow_concrete_files:
            files.extend(_existing_files_for_category(repo_dir, api_paths, plan, row, "api"))
            files.extend(
                _existing_files_for_category(repo_dir, service_paths, plan, row, "service")
            )
        folders.extend(api_paths)
        folders.extend(service_paths)

    if backend and plan.db_change_needed:
        persistence_paths = _merge_paths(
            _discovery_paths(discovery, "persistence"),
            _matching_paths(planned_paths, PERSISTENCE_PATH_MARKERS),
        )
        if allow_concrete_files:
            files.extend(
                _existing_files_for_category(
                    repo_dir,
                    persistence_paths,
                    plan,
                    row,
                    "persistence",
                )
            )
        folders.extend(persistence_paths)

    if backend and "event_integration" in plan.feature_intents:
        event_paths = _merge_paths(
            _discovery_paths(discovery, "event"),
            _matching_paths(planned_paths, EVENT_PATH_MARKERS),
        )
        event_paths = _backend_event_paths(row, event_paths)
        if allow_concrete_files:
            files.extend(_existing_files_for_category(repo_dir, event_paths, plan, row, "event"))
        folders.extend(event_paths)
        if role == "primary-owner":
            service_paths = _merge_paths(
                _discovery_paths(discovery, "service"),
                _matching_paths(planned_paths, SERVICE_PATH_MARKERS),
            )
            if allow_concrete_files:
                files.extend(
                    _existing_files_for_category(repo_dir, service_paths, plan, row, "service")
                )
            folders.extend(service_paths)

    if not files and not folders:
        folders.extend(planned_paths)

    if allow_concrete_files:
        grounded_files = _grounded_source_files_for_repo(plan, row.repo_name, repo_dir)
        if _ui_only_change(plan) and frontend:
            grounded_files = [
                path for path in grounded_files if _inspect_path_group(path) == "frontend"
            ]
        files.extend(grounded_files)

    return _narrow_inspect_paths_for_grounded_concepts(
        plan,
        row,
        _final_inspect_paths(files, folders, discovery),
    )


def _build_file_plans(
    plan: FeaturePlan,
    row: InventoryRow,
    role: str,
    inspect_paths: Sequence[str],
    possible_new_files: Sequence[str],
    discovery: RepoDiscovery | None,
    repo_dir: Path | None,
) -> list[FilePlan]:
    items: list[FilePlan] = [
        _existing_file_plan(plan, row, path, discovery)
        for path in inspect_paths
    ]
    items.extend(
        _reference_file_plans(
            plan,
            row,
            inspect_paths,
            discovery,
            repo_dir,
        )
    )
    items.extend(
        _new_file_plan(plan, row, role, path)
        for path in possible_new_files
        if _concrete_new_file_path(path)
    )
    return _dedupe_file_plans(items)


def _legacy_inspect_paths_from_file_plans(items: Sequence[FilePlan]) -> list[str]:
    return [
        item.path
        for item in items
        if item.action != "create"
    ]


def _existing_file_plan(
    plan: FeaturePlan,
    row: InventoryRow,
    path: str,
    discovery: RepoDiscovery | None,
) -> FilePlan:
    grounded_tokens = _grounded_target_tokens(plan)
    target_tokens = _grounded_target_tokens(plan)
    tokens = _path_all_tokens(path)
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    direct_grounded = _path_is_grounded_source(plan, row.repo_name, path)
    concept_match = bool(tokens & grounded_tokens) or direct_grounded
    unrelated = _path_has_unrelated_domain(path, target_tokens)
    path_target_match = _path_matches_target_signal(path, target_tokens)
    group = _inspect_path_group(path)
    shell_kind = ui_shell_path_kind(path) if ui_shell_requested(plan.feature_request) else None

    action = "inspect"
    confidence = "medium"

    if shell_kind in {"app_shell", "landing_page"}:
        action = "modify"
        confidence = "high"
    elif shell_kind in {"entrypoint", "public_entry_html"}:
        action = "inspect"
        confidence = "medium"
    elif shell_kind == "static_assets":
        action = "inspect-only"
        confidence = "low"
    elif unrelated:
        action = "inspect-only"
        confidence = "low"
    elif not _path_looks_like_file(path):
        action = "inspect"
        confidence = "medium" if concept_match else "low"
    elif group == "frontend" and _ui_page_add_requested(plan.feature_request):
        if _frontend_route_config_file(path):
            action = "modify"
            confidence = "high"
        elif _requested_page_component_file(path, plan):
            action = "modify"
            confidence = "high"
        elif concept_match or tokens & FRONTEND_SUPPORT_FILE_TOKENS:
            action = "inspect"
            confidence = "medium"
        else:
            action = "inspect-only"
            confidence = "low"
    elif group == "frontend":
        if _same_domain_different_flow(path, plan, target_tokens):
            action = "inspect"
            confidence = "medium"
        elif _same_domain_secondary_frontend(path, plan, target_tokens):
            action = "inspect"
            confidence = "medium"
        elif concept_match and plan.ui_change_needed:
            action = "modify"
            confidence = "high" if _frontend_high_confidence(path, request_tokens) else "medium"
        else:
            action = "inspect-only" if unrelated else "inspect"
            confidence = "low" if unrelated else "medium"
    elif group == "backend":
        if _backend_modify_likely(path, plan, concept_match):
            action = "modify"
            confidence = "high" if direct_grounded or _backend_high_confidence(path) else "medium"
        elif unrelated and not concept_match:
            action = "inspect-only"
            confidence = "low"
        else:
            action = "inspect"
            confidence = "medium"
    else:
        if _shared_path_is_strongly_justified(path, plan):
            action = "modify" if plan.api_change_needed else "inspect"
            confidence = "medium"
        elif unrelated and not concept_match:
            action = "inspect-only"
            confidence = "low"

    if (
        action == "modify"
        and confidence == "high"
        and not path_target_match
        and not direct_grounded
        and not _frontend_route_config_file(path)
    ):
        action = "inspect"
        confidence = "medium"

    return FilePlan(
        path=path,
        action=action,
        confidence=confidence,
        reason=_existing_file_reason(
            plan,
            row,
            path,
            action=action,
            confidence=confidence,
            concept_match=concept_match,
            discovery=discovery,
        ),
    )


def _new_file_plan(
    plan: FeaturePlan,
    row: InventoryRow,
    role: str,
    path: str,
) -> FilePlan:
    lowered = path.lower()
    confidence = "medium"
    if "migration" in lowered and plan.db_change_needed:
        confidence = "high"
    if any(token in lowered for token in ("request dto", "response dto")) and plan.api_change_needed:
        confidence = "high"

    if "request dto" in lowered:
        reason = "API change likely needs a new request DTO to carry the updated field."
    elif "response dto" in lowered:
        reason = "API response shape may need a new DTO for the updated field."
    elif "migration" in lowered:
        reason = "Persistence change likely requires a new migration or changelog file."
    elif "ui form component" in lowered:
        reason = "UI update may need a new form component for the requested input flow."
    elif "client api helper" in lowered:
        reason = "Frontend/API integration may need a new client helper for the updated endpoint."
    elif "event payload" in lowered:
        reason = "Event publishing likely needs a new payload class."
    elif "publisher" in lowered or "producer" in lowered:
        reason = "Event flow likely needs a new publisher or producer implementation."
    elif "consumer" in lowered or "handler" in lowered:
        reason = "Downstream event flow may need a new consumer or handler."
    elif (
        _ui_page_add_requested(plan.feature_request)
        and _inspect_path_group(path) == "frontend"
        and _requested_page_component_file(path, plan)
    ):
        reason = "Feature explicitly names this page component, and nearby frontend paths indicate the folder convention."
        confidence = "high"
    elif _path_looks_like_file(path):
        reason = "Strong naming evidence suggests this new file may be required."
        confidence = "high"
    else:
        reason = "Planner inferred a likely new file, but the exact path remains approximate."

    return FilePlan(
        path=path,
        action="create",
        confidence=confidence,
        reason=reason,
    )


def _concrete_new_file_path(path: str) -> bool:
    """Only promote real path-like new-file suggestions into FilePlan objects."""

    lowered = path.lower()
    if lowered.startswith("new "):
        return False
    return _path_looks_like_file(path) and ("/" in path or "\\" in path)


def _reference_file_plans(
    plan: FeaturePlan,
    row: InventoryRow,
    inspect_paths: Sequence[str],
    discovery: RepoDiscovery | None,
    repo_dir: Path | None,
) -> list[FilePlan]:
    if repo_dir is None or discovery is None or _has_ungrounded_concepts(plan):
        return []

    grounded_tokens = _grounded_target_tokens(plan)
    if not grounded_tokens or not _has_source_grounding_for_repo(plan, row.repo_name):
        return []

    seen = set(inspect_paths)
    categories = [
        ("frontend", _discovery_paths(discovery, "ui")),
        ("api", _discovery_paths(discovery, "api")),
        ("persistence", _discovery_paths(discovery, "persistence")),
    ]
    candidates: list[tuple[int, str]] = []
    for category, paths in categories:
        for path in _existing_files_for_category(repo_dir, paths, plan, row, category):
            if path in seen or not _path_looks_like_file(path):
                continue
            score = _reference_file_score(plan, path, grounded_tokens)
            if score <= 0:
                continue
            candidates.append((score, path))

    candidates.sort(key=lambda item: (-item[0], item[1]))
    ordered_paths = [path for _, path in candidates]
    ordered_paths = _cap_reference_paths(ordered_paths)
    return [
        _existing_file_plan(plan, row, path, discovery)
        for path in ordered_paths
    ]


def _reference_file_score(
    plan: FeaturePlan,
    path: str,
    grounded_tokens: set[str],
) -> int:
    tokens = _path_all_tokens(path)
    if _same_domain_different_flow(path, plan, grounded_tokens):
        return 100
    if _same_domain_model_file(path, grounded_tokens):
        return 90
    if _path_has_unrelated_domain(path, grounded_tokens):
        return 0
    return 0


def _cap_reference_paths(paths: Sequence[str]) -> list[str]:
    limits = {"frontend": 1, "backend": 3, "shared": 0}
    counts = {key: 0 for key in limits}
    kept: list[str] = []
    for path in paths:
        group = _inspect_path_group(path)
        if counts[group] >= limits[group]:
            continue
        counts[group] += 1
        kept.append(path)
    return kept


def _same_domain_different_flow(
    path: str,
    plan: FeaturePlan,
    grounded_tokens: set[str],
) -> bool:
    tokens = _path_all_tokens(path)
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    if not (tokens & grounded_tokens):
        return False
    return _edit_update_flow_requested(request_tokens) and bool(
        tokens & CREATE_FLOW_FILE_TOKENS
    )


def _same_domain_secondary_frontend(
    path: str,
    plan: FeaturePlan,
    grounded_tokens: set[str],
) -> bool:
    if _inspect_path_group(path) != "frontend":
        return False
    tokens = _path_all_tokens(path)
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    if not _edit_update_flow_requested(request_tokens):
        return False
    if not (tokens & grounded_tokens):
        return False
    if tokens & {"edit", "editor", "form"}:
        return False
    return bool(
        tokens
        & {
            "detail",
            "details",
            "display",
            "info",
            "information",
            "summary",
            "view",
        }
    )


def _same_domain_model_file(path: str, grounded_tokens: set[str]) -> bool:
    if _inspect_path_group(path) != "backend":
        return False
    tokens = _path_all_tokens(path)
    if not (tokens & grounded_tokens):
        return False
    if any(
        token in tokens
        for token in (
            "controller",
            "dto",
            "repository",
            "request",
            "response",
            "rest",
            "service",
        )
    ):
        return False
    return Path(path).suffix == ".java"


def _path_matches_target_signal(path: str, grounded_tokens: set[str]) -> bool:
    if not grounded_tokens:
        return True
    return bool(_path_all_tokens(path) & grounded_tokens)


def _frontend_high_confidence(path: str, request_tokens: set[str]) -> bool:
    tokens = _path_all_tokens(path)
    if _edit_update_flow_requested(request_tokens) and tokens & {"edit", "editor", "form"}:
        return True
    if _edit_update_flow_requested(request_tokens) and tokens & CREATE_FLOW_FILE_TOKENS:
        return False
    if tokens & FRONTEND_SUPPORT_FILE_TOKENS:
        return False
    return True


def _backend_modify_likely(path: str, plan: FeaturePlan, concept_match: bool) -> bool:
    if not concept_match:
        return False
    tokens = _path_all_tokens(path)
    if any(token in tokens for token in ("controller", "rest", "request", "response", "dto", "service")):
        return True
    if plan.db_change_needed and any(token in tokens for token in ("entity", "repository", "migration", "changelog")):
        return True
    return False


def _backend_high_confidence(path: str) -> bool:
    tokens = _path_all_tokens(path)
    return any(token in tokens for token in ("controller", "rest", "request", "response", "service"))


def _existing_file_reason(
    plan: FeaturePlan,
    row: InventoryRow,
    path: str,
    *,
    action: str,
    confidence: str,
    concept_match: bool,
    discovery: RepoDiscovery | None,
) -> str:
    tokens = _path_all_tokens(path)
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    target_tokens = _grounded_target_tokens(plan)
    shell_kind = ui_shell_path_kind(path) if ui_shell_requested(plan.feature_request) else None

    if action == "inspect-only":
        if shell_kind == "static_assets":
            return "Static asset folder may support the welcome or layout experience, but exact asset changes are uncertain."
        if any(token in tokens for token in ("controller", "rest")):
            if "type" in tokens and "pet" in tokens:
                return "Different domain REST controller; useful only as a controller pattern reference."
            return "Different domain controller; useful only as a REST update/validation pattern reference."
        if _inspect_path_group(path) == "frontend":
            return "Different domain UI file; useful only as a UI pattern reference."
        return "Useful as nearby reference context, but the requested feature points elsewhere."

    if _same_domain_different_flow(path, plan, target_tokens):
        return "May share owner form behavior with the edit flow, but the feature specifically targets editing existing owners."
    if _same_domain_secondary_frontend(path, plan, target_tokens):
        return "Same owner domain and may display the telephone field after update, but the request specifically targets the edit screen."
    if _ui_page_add_requested(plan.feature_request):
        if _frontend_route_config_file(path):
            return "Route/config file likely needs wiring for the new page."
        if _requested_page_component_file(path, plan):
            return "Requested page component directly matches the UI page-add request."
        if tokens & FRONTEND_SUPPORT_FILE_TOKENS and _inspect_path_group(path) == "frontend":
            return "Shared frontend types may need review for the new page surface."
        if _inspect_path_group(path) == "frontend" and (tokens & target_tokens):
            return "Nearby same-domain frontend file can provide the page and routing pattern."
    if shell_kind == "landing_page":
        return "Welcome or landing page component directly matches the requested page addition."
    if shell_kind == "app_shell":
        return "App shell component likely owns layout, route composition, and welcome page placement."
    if shell_kind == "entrypoint":
        return "Frontend entrypoint may need review for shell bootstrap or route wiring."
    if shell_kind == "public_entry_html":
        return "Public HTML entrypoint may need review for app shell and static asset integration."
    if "welcome" in tokens and _inspect_path_group(path) == "frontend":
        return "Welcome page component matches the requested UI page addition."
    if "layout" in tokens and _inspect_path_group(path) == "frontend":
        return "Layout component matches the requested UI layout addition."
    if (
        "edit" in tokens
        and "owner" in tokens
        and _inspect_path_group(path) == "frontend"
    ):
        return "Feature explicitly mentions the owner edit screen, and this page likely owns the edit flow."
    if "page" in tokens and _inspect_path_group(path) == "frontend":
        return "Frontend page component is related to the requested UI change."
    if any(token in tokens for token in ("editor", "form")) and _inspect_path_group(path) == "frontend":
        return "Likely owner form component where telephone input and validation are handled."
    if tokens & FRONTEND_SUPPORT_FILE_TOKENS and _inspect_path_group(path) == "frontend":
        if not target_tokens:
            return "Shared frontend type definitions may support the requested UI change."
        return "Likely shared owner client types referenced by the edit flow and API payload."
    if any(token in tokens for token in ("controller", "rest")) and concept_match:
        return "Owner-specific REST controller likely handles update requests for owner fields."
    if any(token in tokens for token in ("request", "response", "dto")) and concept_match:
        return "Likely owner API contract model carrying telephone data."
    if "service" in tokens and concept_match:
        return "Likely service-layer update flow for owner telephone changes."
    if _same_domain_model_file(path, target_tokens):
        return "Owner telephone may already exist on the domain model; inspect for validation or serialization behavior."
    if any(token in tokens for token in ("entity", "repository")) and concept_match:
        if plan.db_change_needed:
            return "Likely owner domain or persistence model touched by the requested field update."
        return "Likely owner domain model related to the update flow; inspect before changing."
    if _shared_path_is_strongly_justified(path, plan):
        return "Likely API contract/spec reference for the requested owner update flow."
    if not _path_looks_like_file(path):
        mode = "discovered" if discovery is not None else "planned"
        if not target_tokens:
            return f"Likely {mode} area to inspect before editing concrete files."
        return f"Likely {mode} owner-related area to inspect before editing concrete files."
    if confidence == "high":
        if _inspect_path_group(path) == "frontend":
            if not target_tokens:
                return "Frontend file matches the requested UI flow and is likely to need a targeted change."
            return "Frontend file matches the requested owner update flow and is likely to need a targeted UI change."
        if _inspect_path_group(path) == "backend":
            if not target_tokens:
                return "Backend file may support the requested flow and could need a targeted change."
            return "Backend file matches the requested owner update flow and is likely to need a targeted API change."
        if not target_tokens:
            return "Shared support file matches the requested flow and may need a targeted change."
        return "Shared support file matches the requested owner update flow and may need a targeted change."
    if _inspect_path_group(path) == "frontend":
        if not target_tokens:
            return "Frontend file is related to the requested UI flow, but its exact edit responsibility is uncertain."
        return "Frontend file is related to the owner update flow, but its exact edit responsibility is uncertain."
    if _inspect_path_group(path) == "backend":
        if not target_tokens:
            return "Backend file may support the requested flow, but its exact edit responsibility is uncertain."
        return "Backend file is related to the owner update flow, but its exact edit responsibility is uncertain."
    return "Shared support file is related to the requested flow, but the exact change is uncertain."


def _dedupe_file_plans(items: Sequence[FilePlan]) -> list[FilePlan]:
    seen: set[tuple[str, str]] = set()
    ordered: list[FilePlan] = []
    for item in items:
        key = (item.path, item.action)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def _likely_changes(plan: FeaturePlan, row: InventoryRow, role: str) -> list[str]:
    changes: list[str] = []
    backend = _row_is_backend(row)
    frontend = _row_is_frontend(row)
    event_mode = "event_integration" in plan.feature_intents

    if _has_ungrounded_concepts(plan):
        return [
            "Validate whether the ungrounded requested concept exists in this repo before making implementation changes.",
            "Inspect only the high-level planned folders until the concept is grounded.",
        ]

    if event_mode and role == "primary-owner":
        changes.extend(
            [
                "Add or update event publish logic at the service trigger point.",
                "Define deterministic payload/schema mapping for the emitted event.",
                "Wire the publisher, producer, outbox, or integration path if present.",
            ]
        )
    elif event_mode and role == "possible-downstream":
        changes.extend(
            [
                "Determine whether consumer, handler, or integration code must change.",
                "Map the incoming event payload into downstream sync or notification flow.",
                "Update downstream integration coverage if the repo consumes the event.",
            ]
        )

    if frontend and plan.ui_change_needed and ui_shell_requested(plan.feature_request):
        changes.extend(
            [
                "Update app shell/layout composition and welcome or landing page wiring.",
                "Review frontend entrypoint, public HTML, and static asset references used by the shell.",
            ]
        )
    elif frontend and plan.ui_change_needed:
        if _ui_page_add_requested(plan.feature_request):
            changes.extend(
                [
                    "Scaffold the requested page component in the matching frontend domain folder.",
                    "Wire the page into the existing route/config surface without adding backend actions.",
                ]
            )
        else:
            changes.extend(
                [
                    "Update the relevant page/form UI and validation states.",
                    "Update client API request wiring and submit/error handling.",
                ]
            )

    if backend and plan.api_change_needed:
        changes.extend(
            [
                "Update API request/response contract and DTO mapping.",
                "Update controller/service validation flow.",
            ]
        )

    if backend and plan.db_change_needed:
        changes.extend(
            [
                "Update entity and repository persistence mappings.",
                "Add or update migration/changelog files for schema changes.",
            ]
        )

    if not changes:
        changes.append("Inspect planned paths and update only if the feature evidence applies.")

    return _dedupe_preserve_order(changes)


def _possible_new_files(
    plan: FeaturePlan,
    row: InventoryRow,
    role: str,
    inspect_paths: Sequence[str],
    discovery: RepoDiscovery | None,
    repo_dir: Path | None,
) -> list[str]:
    files: list[str] = []
    backend = _row_is_backend(row)
    frontend = _row_is_frontend(row)
    event_mode = "event_integration" in plan.feature_intents
    metadata_only = (
        discovery is not None and discovery.evidence_mode == "metadata-only"
    )

    if metadata_only:
        return []
    if _has_ungrounded_concepts(plan):
        return []
    if frontend and plan.ui_change_needed and ui_shell_requested(plan.feature_request):
        return []
    if frontend and plan.ui_change_needed and _ui_page_add_requested(plan.feature_request):
        return _page_add_new_files(plan, row, inspect_paths, discovery, repo_dir)

    new_surface_likely = _new_file_surface_likely(plan)

    if frontend and plan.ui_change_needed and new_surface_likely:
        files.append("new UI form component")
        if plan.api_change_needed:
            files.append("new client API helper")

    if (
        backend
        and plan.api_change_needed
        and row.language.lower() == "java"
        and new_surface_likely
    ):
        files.extend(["new request DTO", "new response DTO"])

    if backend and plan.db_change_needed:
        files.append("new migration file")

    if backend and event_mode and row.language.lower() == "java":
        files.extend(_event_possible_new_files(role, inspect_paths))

    return _dedupe_preserve_order(files)


def _new_file_surface_likely(plan: FeaturePlan) -> bool:
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    return plan.db_change_needed or _create_flow_requested(request_tokens)


def _ui_page_add_requested(feature_request: str) -> bool:
    """Return whether the request is a simple UI page/component addition."""

    if ui_shell_requested(feature_request):
        return False
    tokens = _tokenize_with_camel_case(feature_request)
    return bool(tokens & CREATE_FLOW_REQUEST_TOKENS and "page" in tokens)


def _ui_only_change(plan: FeaturePlan) -> bool:
    return plan.ui_change_needed and not (
        plan.api_change_needed
        or plan.db_change_needed
        or "event_integration" in plan.feature_intents
    )


def _page_add_new_files(
    plan: FeaturePlan,
    row: InventoryRow,
    inspect_paths: Sequence[str],
    discovery: RepoDiscovery | None,
    repo_dir: Path | None,
) -> list[str]:
    if repo_dir is None or not repo_dir.is_dir():
        return []

    files: list[str] = []
    existing = set(inspect_paths)
    for stem in _requested_page_component_stems(plan.feature_request):
        base = _page_add_base_folder(plan, row, stem, inspect_paths, discovery, repo_dir)
        if base is None:
            continue
        candidate = f"{base}/{stem}{_frontend_source_suffix(repo_dir, base)}"
        if candidate in existing or (repo_dir / candidate).exists():
            continue
        files.append(candidate)
    return _dedupe_preserve_order(files)


def _page_add_existing_support_files(
    repo_dir: Path | None,
    plan: FeaturePlan,
) -> list[str]:
    if repo_dir is None or not repo_dir.is_dir():
        return []

    frontend_roots = [
        repo_dir / root / "src"
        for root in ("client", "frontend", "web", "ui")
        if (repo_dir / root / "src").is_dir()
    ]
    if (repo_dir / "src").is_dir():
        frontend_roots.append(repo_dir / "src")

    files: list[str] = []
    for src in frontend_roots:
        for child in sorted(src.iterdir(), key=lambda item: item.as_posix()):
            if not child.is_file() or child.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx"}:
                continue
            relative = child.relative_to(repo_dir).as_posix()
            if _page_add_support_file(relative, plan):
                files.append(relative)
    return _dedupe_preserve_order(files)


def _requested_page_component_stems(feature_request: str) -> list[str]:
    stems = [
        match.group(1)
        for match in re.finditer(
            r"\b([A-Z][A-Za-z0-9]*(?:Page|View|Screen))\b",
            feature_request,
        )
    ]
    if stems:
        return _dedupe_preserve_order(stems)

    tokens = list(re.findall(r"[a-z0-9]+", normalize_request_text(feature_request)))
    for index, token in enumerate(tokens):
        if token != "page" or index == 0:
            continue
        previous = tokens[index - 1]
        if previous in GENERIC_STOPWORDS or previous in {"welcome", "landing", "home", "layout"}:
            continue
        stems.append(f"{previous.capitalize()}Page")
    return _dedupe_preserve_order(stems)


def _page_add_base_folder(
    plan: FeaturePlan,
    row: InventoryRow,
    stem: str,
    inspect_paths: Sequence[str],
    discovery: RepoDiscovery | None,
    repo_dir: Path,
) -> str | None:
    target_tokens = _expand_token_variants(
        {
            token
            for token in _tokenize_with_camel_case(stem)
            if token not in {"page", "view", "screen"}
        }
    )
    path_candidates = _dedupe_preserve_order(
        [
            *[
                str(Path(path).parent) if _path_looks_like_file(path) else path
                for path in inspect_paths
                if _inspect_path_group(path) == "frontend"
            ],
            *_discovery_paths(discovery, "ui"),
            *plan.likely_paths_by_repo.get(row.repo_name, []),
        ]
    )

    ranked: list[tuple[int, str]] = []
    for path in path_candidates:
        absolute = repo_dir / path
        if not absolute.is_dir():
            continue
        tokens = _path_all_tokens(path)
        score = len(tokens & target_tokens) * 10
        if any(token in tokens for token in ("components", "pages", "routes", "views")):
            score += 4
        if Path(path).name.lower() in target_tokens:
            score += 8
        if score > 0:
            ranked.append((score, path))

    if ranked:
        ranked.sort(key=lambda item: (-item[0], len(item[1]), item[1]))
        return ranked[0][1]

    for fallback in path_candidates:
        if not (repo_dir / fallback).is_dir():
            continue
        lowered = fallback.lower()
        if any(
            marker in lowered
            for marker in ("/components", "/pages", "/routes", "src/components", "src/pages")
        ):
            return fallback
    return None


def _frontend_source_suffix(repo_dir: Path, base: str) -> str:
    base_path = repo_dir / base
    if any(base_path.glob("*.tsx")) or any((repo_dir / "client").rglob("*.tsx")):
        return ".tsx"
    if any(base_path.glob("*.jsx")):
        return ".jsx"
    return ".tsx"


def _rationale(
    plan: FeaturePlan,
    row: InventoryRow,
    role: str,
    inspect_paths: Sequence[str],
    impact: FeatureImpact | None,
    discovery: RepoDiscovery | None,
) -> str:
    intents = ", ".join(plan.feature_intents) if plan.feature_intents else "none"
    strongest_signals = _strongest_signals(row, impact, discovery)
    concrete_files = [
        path for path in inspect_paths if path != "stackpilot.yml" and _path_looks_like_file(path)
    ]
    metadata_only = (
        discovery is not None and discovery.evidence_mode == "metadata-only"
    )
    if _has_ungrounded_concepts(plan):
        path_note = (
            "One or more requested concepts are ungrounded; concrete file suggestions are intentionally suppressed."
        )
    elif metadata_only:
        path_note = (
            "metadata-only mode; planning is based on manifest hints rather than "
            "discovered source structure."
        )
    elif concrete_files:
        path_note = "Concrete files were inferred from discovered naming conventions."
    else:
        path_note = "No concrete file convention matched; likely folders are listed instead."

    return (
        f"Role: {role}. "
        f"Intents: {intents}. "
        f"Evidence: {', '.join(strongest_signals)}. "
        f"Path confidence: {path_note} "
        f"Overall confidence: {plan.confidence}."
    )


def _has_ungrounded_concepts(plan: FeaturePlan) -> bool:
    return any(
        item.status == "ungrounded"
        for item in getattr(plan, "concept_grounding", [])
    )


def _grounded_source_files_for_repo(
    plan: FeaturePlan,
    repo_name: str,
    repo_dir: Path | None,
) -> list[str]:
    if repo_dir is None or not repo_dir.is_dir():
        return []

    files: list[str] = []
    for grounding in getattr(plan, "concept_grounding", []):
        if grounding.status not in {"direct_match", "alias_match"}:
            continue
        for source in grounding.sources:
            relative = _source_path_for_repo(source, repo_name)
            if relative is None:
                continue
            if (repo_dir / relative).is_file():
                files.append(relative)
    return _dedupe_preserve_order(files)


def _source_path_for_repo(source: str, repo_name: str) -> str | None:
    parts = source.split(":", 2)
    if len(parts) != 3 or parts[0] != "source" or parts[1] != repo_name:
        return None
    return parts[2]


def _discovery_paths(discovery: RepoDiscovery | None, category: str) -> list[str]:
    if discovery is None:
        return []
    if category == "api":
        return _locations_for_mode(
            discovery,
            discovery.likely_api_locations,
            discovery.hinted_api_locations,
        )
    if category == "service":
        return _locations_for_mode(
            discovery,
            discovery.likely_service_locations,
            discovery.hinted_service_locations,
        )
    if category == "persistence":
        return _locations_for_mode(
            discovery,
            discovery.likely_persistence_locations,
            discovery.hinted_persistence_locations,
        )
    if category == "ui":
        return _locations_for_mode(
            discovery,
            discovery.likely_ui_locations,
            discovery.hinted_ui_locations,
        )
    if category == "event":
        return _locations_for_mode(
            discovery,
            discovery.likely_event_locations,
            discovery.hinted_event_locations,
        )
    return []


def _locations_for_mode(
    discovery: RepoDiscovery,
    discovered: Sequence[str],
    hinted: Sequence[str],
) -> list[str]:
    if discovery.evidence_mode == "source-discovered":
        return list(discovered)
    return _merge_paths(discovered, hinted)


def _matching_paths(paths: Sequence[str], markers: Sequence[str]) -> list[str]:
    normalized_markers = {marker.lower() for marker in markers}
    return [
        path
        for path in paths
        if _path_marker_tokens(path) & normalized_markers
    ]


def _path_marker_tokens(path: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", path.lower()))


def _final_inspect_paths(
    files: Sequence[str],
    folders: Sequence[str],
    discovery: RepoDiscovery | None,
) -> list[str]:
    concrete_files = [
        path for path in files if not _path_is_glob(path) and _path_looks_like_file(path)
    ]
    concrete_folders = [
        path
        for path in folders
        if not _path_is_glob(path) and not _path_looks_like_file(path)
    ]
    concrete_folders = _remove_parent_folders_with_files(
        concrete_folders,
        concrete_files,
    )
    concrete_source_paths = [*concrete_files, *concrete_folders]
    include_manifest = not (
        discovery is not None
        and discovery.evidence_mode in {"mixed", "source-discovered"}
        and concrete_source_paths
    )

    paths = [*concrete_files, *concrete_folders]
    if include_manifest:
        paths.insert(0, "stackpilot.yml")

    return _dedupe_preserve_order(paths)


def _narrow_inspect_paths_for_grounded_concepts(
    plan: FeaturePlan,
    row: InventoryRow,
    paths: Sequence[str],
) -> list[str]:
    grounded_tokens = _grounded_target_tokens(plan)
    if not _should_apply_strict_grounded_filter(plan, row.repo_name, paths, grounded_tokens):
        return list(paths)

    grouped_paths: dict[str, list[tuple[int, int, str]]] = {
        "frontend": [],
        "backend": [],
        "shared": [],
    }
    for index, path in enumerate(paths):
        if not _strict_grounded_path_allowed(plan, row.repo_name, path, grounded_tokens):
            continue
        group = _inspect_path_group(path)
        grouped_paths[group].append(
            (_strict_grounded_path_score(plan, row.repo_name, path, grounded_tokens, group), index, path)
        )

    ordered: list[str] = []
    for group in ("frontend", "backend", "shared"):
        ranked = sorted(grouped_paths[group], key=lambda item: (-item[0], item[1], item[2]))
        ordered.extend(path for _, _, path in ranked[:STRICT_GROUP_LIMITS[group]])

    return _dedupe_preserve_order(ordered or list(paths))


def _should_apply_strict_grounded_filter(
    plan: FeaturePlan,
    repo_name: str,
    paths: Sequence[str],
    grounded_tokens: set[str],
) -> bool:
    if not grounded_tokens:
        return False
    if _has_ungrounded_concepts(plan):
        return False
    if not _has_source_grounding_for_repo(plan, repo_name):
        return False
    return any(_path_has_unrelated_domain(path, grounded_tokens) for path in paths)


def _strict_grounded_path_allowed(
    plan: FeaturePlan,
    repo_name: str,
    path: str,
    grounded_tokens: set[str],
) -> bool:
    if _path_has_unrelated_domain(path, grounded_tokens):
        return False
    if _path_is_grounded_source(plan, repo_name, path):
        return True

    tokens = _path_all_tokens(path)
    if tokens & grounded_tokens:
        return True
    if _path_looks_like_file(path):
        parent_tokens = _path_all_tokens(Path(path).parent.as_posix())
        if parent_tokens & grounded_tokens:
            return True

    group = _inspect_path_group(path)
    if group == "shared":
        return _shared_path_is_strongly_justified(path, plan)
    return False


def _inspect_path_group(path: str) -> str:
    lowered = path.lower()
    if lowered.startswith(("client/", "frontend/", "web/", "ui/")) or any(
        marker in lowered for marker in FRONTEND_PATH_MARKERS
    ):
        return "frontend"
    if any(token in lowered for token in SHARED_SUPPORT_TOKENS):
        return "shared"
    return "backend"


def _strict_grounded_path_score(
    plan: FeaturePlan,
    repo_name: str,
    path: str,
    grounded_tokens: set[str],
    group: str,
) -> int:
    tokens = _path_all_tokens(path)
    stem_tokens = _tokenize_with_camel_case(Path(path).stem)
    request_tokens = _tokenize_with_camel_case(plan.feature_request)
    score = len(tokens & grounded_tokens) * 3
    score += len(stem_tokens & grounded_tokens) * 5
    if _path_is_grounded_source(plan, repo_name, path):
        score += 12
    if group == "frontend":
        score += len(tokens & FRONTEND_FOCUS_TOKENS) * 2
        if _edit_update_flow_requested(request_tokens):
            score += len(tokens & EDIT_FLOW_FILE_TOKENS) * 5
            if plan.api_change_needed:
                score += len(tokens & FRONTEND_SUPPORT_FILE_TOKENS) * 4
            if tokens & CREATE_FLOW_FILE_TOKENS:
                score -= 10
        elif _create_flow_requested(request_tokens):
            score += len(tokens & CREATE_FLOW_FILE_TOKENS) * 5
    elif group == "backend":
        score += sum(
            weight for token, weight in BACKEND_FOCUS_TOKENS.items() if token in tokens
        )
    elif group == "shared" and _shared_path_is_strongly_justified(path, plan):
        score += 4
    return score


def _edit_update_flow_requested(request_tokens: set[str]) -> bool:
    return bool(request_tokens & EDIT_FLOW_REQUEST_TOKENS)


def _create_flow_requested(request_tokens: set[str]) -> bool:
    return bool(request_tokens & CREATE_FLOW_REQUEST_TOKENS)


def _has_source_grounding_for_repo(plan: FeaturePlan, repo_name: str) -> bool:
    return any(
        grounding.status in {"direct_match", "alias_match"}
        and any(_source_path_for_repo(source, repo_name) is not None for source in grounding.sources)
        for grounding in getattr(plan, "concept_grounding", [])
    )


def _path_is_grounded_source(plan: FeaturePlan, repo_name: str, path: str) -> bool:
    return any(
        grounding.status in {"direct_match", "alias_match"}
        and any(_source_path_for_repo(source, repo_name) == path for source in grounding.sources)
        for grounding in getattr(plan, "concept_grounding", [])
    )


def _grounded_concept_tokens(plan: FeaturePlan) -> set[str]:
    tokens: set[str] = set()
    for grounding in getattr(plan, "concept_grounding", []):
        if grounding.status not in {"direct_match", "alias_match"}:
            continue
        values = [grounding.concept, *grounding.matched_terms]
        for value in values:
            for token in _tokenize_with_camel_case(value):
                if _useful_grounding_token(token):
                    tokens.add(token)
    return _expand_token_variants(tokens)


def _grounded_target_tokens(plan: FeaturePlan) -> set[str]:
    """Return compact request-target tokens for hard path/domain guards."""

    tokens: set[str] = set()
    for grounding in getattr(plan, "concept_grounding", []):
        if grounding.status not in {"direct_match", "alias_match"}:
            continue

        concept_tokens = {
            token
            for token in _tokenize_with_camel_case(grounding.concept)
            if _useful_grounding_token(token)
        }
        tokens.update(concept_tokens)

        for term in grounding.matched_terms:
            for token in _tokenize_with_camel_case(term):
                if not _useful_grounding_token(token):
                    continue
                if token in UNRELATED_DOMAIN_TOKENS and token not in concept_tokens:
                    continue
                if token in concept_tokens or grounding.status == "alias_match":
                    tokens.add(token)

    return _expand_token_variants(tokens)


def _useful_grounding_token(token: str) -> bool:
    return (
        len(token) > 1
        and token not in GENERIC_STOPWORDS
        and token not in TECHNICAL_GROUNDING_TOKENS
    )


def _expand_token_variants(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for token in tokens:
        if token.endswith("ies") and len(token) > 3:
            expanded.add(f"{token[:-3]}y")
        elif token.endswith("s") and len(token) > 3:
            expanded.add(token[:-1])
        else:
            expanded.add(f"{token}s")
    return expanded


def _path_has_unrelated_domain(path: str, grounded_tokens: set[str]) -> bool:
    tokens = _path_all_tokens(path)
    return bool((tokens & UNRELATED_DOMAIN_TOKENS) and not (tokens & grounded_tokens))


def _shared_path_is_strongly_justified(path: str, plan: FeaturePlan) -> bool:
    lowered = path.lower()
    if not plan.api_change_needed:
        return False
    return any(token in lowered for token in SHARED_SUPPORT_TOKENS)


def _path_all_tokens(path: str) -> set[str]:
    return _tokenize_with_camel_case(path.replace("/", " "))


def _remove_parent_folders_with_files(
    folders: Sequence[str],
    files: Sequence[str],
) -> list[str]:
    if not files:
        return list(folders)
    return [
        folder
        for folder in folders
        if not any(file_path.startswith(f"{folder}/") for file_path in files)
    ]


def _backend_event_paths(row: InventoryRow, paths: Sequence[str]) -> list[str]:
    if row.language.lower() != "java":
        return list(paths)

    java_paths: list[str] = []
    for path in paths:
        if path == "src/events":
            java_paths.append("src/main/java/events")
        elif path == "src/integrations":
            java_paths.append("src/main/java/integrations")
        else:
            java_paths.append(path)
    return _dedupe_preserve_order(java_paths)


def _event_possible_new_files(
    role: str,
    inspect_paths: Sequence[str],
) -> list[str]:
    event_base = _event_base_from_existing(inspect_paths) or _first_java_folder_with_marker(
        inspect_paths,
        EVENT_PATH_MARKERS,
    )
    naming_stem = _event_naming_stem_from_existing(inspect_paths)
    existing_files = {path for path in inspect_paths if _path_looks_like_file(path)}

    if event_base is not None and naming_stem is not None:
        candidates = _event_named_candidates(role, event_base, naming_stem)
        candidates = [path for path in candidates if path not in existing_files]
        if candidates:
            return candidates

    if role == "primary-owner":
        return ["new event payload class", "new publisher/producer class"]
    if role == "possible-downstream":
        return ["new consumer/handler class"]
    return []


def _event_base_from_existing(paths: Sequence[str]) -> str | None:
    for path in paths:
        if not _path_looks_like_file(path):
            continue
        name = Path(path).stem
        if any(name.endswith(suffix) for suffix in EVENT_CLASS_SUFFIXES):
            return str(Path(path).parent)
    return None


def _event_named_candidates(role: str, event_base: str, naming_stem: str) -> list[str]:
    if role == "primary-owner":
        event_name = (
            f"{naming_stem}.java"
            if naming_stem.endswith("Event")
            else f"{naming_stem}Event.java"
        )
        return [
            f"{event_base}/{event_name}",
            f"{event_base}/{naming_stem}Publisher.java",
            f"{event_base}/{naming_stem}Producer.java",
        ]
    if role == "possible-downstream":
        return [
            f"{event_base}/{naming_stem}Consumer.java",
            f"{event_base}/{naming_stem}Handler.java",
        ]
    return []


def _event_naming_stem_from_existing(paths: Sequence[str]) -> str | None:
    for path in paths:
        if not _path_looks_like_file(path):
            continue
        name = Path(path).stem
        for suffix in EVENT_CLASS_SUFFIXES:
            if not name.endswith(suffix) or len(name) <= len(suffix):
                continue
            return name.removesuffix(suffix)
    return None


def _existing_files_for_category(
    repo_dir: Path | None,
    paths: Sequence[str],
    plan: FeaturePlan,
    row: InventoryRow,
    category: str,
) -> list[str]:
    if repo_dir is None or not repo_dir.is_dir():
        return []

    signal_tokens = _signal_tokens(plan.feature_request, row)
    scored: list[tuple[int, str]] = []
    for relative_path in paths:
        absolute_path = repo_dir / relative_path
        if absolute_path.is_file() and _file_matches_category(
            relative_path,
            signal_tokens,
            category,
        ):
            scored.append((_file_score(relative_path, signal_tokens, category), relative_path))
            continue
        if (
            absolute_path.is_file()
            and category == "frontend"
            and _ui_page_add_requested(plan.feature_request)
            and _page_add_support_file(relative_path, plan)
        ):
            scored.append((_page_add_file_score(relative_path, plan), relative_path))
            continue

        if not absolute_path.is_dir():
            continue

        for pattern in FILE_PATTERNS[category]:
            for match in sorted(absolute_path.glob(pattern), key=lambda item: str(item)):
                if not match.is_file():
                    continue
                candidate = match.relative_to(repo_dir).as_posix()
                if (
                    category == "frontend"
                    and _ui_page_add_requested(plan.feature_request)
                    and _page_add_support_file(candidate, plan)
                ):
                    scored.append((_page_add_file_score(candidate, plan), candidate))
                    continue
                if _file_matches_category(candidate, signal_tokens, category):
                    scored.append((_file_score(candidate, signal_tokens, category), candidate))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return _dedupe_preserve_order([path for _, path in scored[:8]])


def _file_matches_category(path: str, signal_tokens: set[str], category: str) -> bool:
    tokens = _path_tokens(path)
    return bool((tokens & signal_tokens) or (tokens & CATEGORY_TOKENS[category]))


def _file_score(path: str, signal_tokens: set[str], category: str) -> int:
    tokens = _path_tokens(path)
    score = len(tokens & signal_tokens) * 3
    score += len(tokens & CATEGORY_TOKENS[category]) * 2
    if _suffix_matches_category(path, category):
        score += 5
    return score


def _page_add_support_file(path: str, plan: FeaturePlan) -> bool:
    if not _path_looks_like_file(path):
        return False
    if _frontend_route_config_file(path):
        return True
    tokens = _path_all_tokens(path)
    target_tokens = _grounded_target_tokens(plan)
    if tokens & FRONTEND_SUPPORT_FILE_TOKENS:
        return True
    return bool(target_tokens and tokens & target_tokens and "page" in tokens)


def _page_add_file_score(path: str, plan: FeaturePlan) -> int:
    tokens = _path_all_tokens(path)
    score = 0
    if _frontend_route_config_file(path):
        score += 25
    if _requested_page_component_file(path, plan):
        score += 30
    target_tokens = _grounded_target_tokens(plan)
    score += len(tokens & target_tokens) * 6
    if "page" in tokens:
        score += 4
    if tokens & FRONTEND_SUPPORT_FILE_TOKENS:
        score += 3
    return score


def _frontend_route_config_file(path: str) -> bool:
    if _inspect_path_group(path) != "frontend":
        return False
    tokens = _path_all_tokens(path)
    return bool(tokens & PAGE_ADD_ROUTE_TOKENS)


def _requested_page_component_file(path: str, plan: FeaturePlan) -> bool:
    if _inspect_path_group(path) != "frontend":
        return False
    stem = Path(path).stem
    return stem in _requested_page_component_stems(plan.feature_request)


def _suffix_matches_category(path: str, category: str) -> bool:
    name = Path(path).name.lower()
    suffixes = {
        "frontend": (".tsx", ".jsx"),
        "api": (
            "controller.java",
            "resource.java",
            "dto.java",
            "request.java",
            "response.java",
            "openapi.yaml",
            "openapi.yml",
        ),
        "service": ("service.java",),
        "persistence": ("entity.java", "repository.java", ".sql", ".xml"),
        "event": (
            "event.java",
            "publisher.java",
            "producer.java",
            "consumer.java",
            "listener.java",
            "handler.java",
            "subscriber.java",
        ),
    }
    return name.endswith(suffixes[category])


def _signal_tokens(feature_request: str, row: InventoryRow) -> set[str]:
    values = [
        feature_request,
        row.domain,
        *row.owns_entities,
        *row.owns_fields,
        *row.owns_tables,
        *row.api_keywords,
    ]
    return {
        token
        for value in values
        for token in _tokenize_with_camel_case(value)
        if token not in GENERIC_STOPWORDS
    }


def _path_tokens(path: str) -> set[str]:
    return _tokenize_with_camel_case(Path(path).stem)


def _tokenize_with_camel_case(text: str) -> set[str]:
    return tokenize_text(text)


def _strongest_signals(
    row: InventoryRow,
    impact: FeatureImpact | None,
    discovery: RepoDiscovery | None,
) -> list[str]:
    signals: list[str] = []
    inferred_metadata = "inferred" in row.metadata_source.lower()

    if impact is not None:
        signals.append("ranked by deterministic feature analysis")

    if inferred_metadata:
        signals.append("inferred ownership from discovered source names")
    elif row.owns_fields:
        fields = ", ".join(row.owns_fields[:3])
        signals.append(f"ownership hints for fields: {fields}")
    if not inferred_metadata and row.owns_entities:
        entities = ", ".join(row.owns_entities[:3])
        signals.append(f"ownership hints for entities: {entities}")

    if impact is not None:
        role_hint = impact.role.replace("-", " ")
        signals.append(f"analysis role: {role_hint}")

    if discovery is not None and discovery.detected_frameworks:
        signals.append(
            f"discovered frameworks: {', '.join(discovery.detected_frameworks[:3])}"
        )
    if discovery is not None and discovery.hinted_frameworks:
        signals.append(
            f"hinted frameworks: {', '.join(discovery.hinted_frameworks[:3])}"
        )
    if discovery is not None:
        mode = discovery.evidence_mode.replace("-", " ")
        signals.append(f"{mode} architecture evidence")

    if not signals:
        signals.append(f"repo type: {row.type}")

    return _dedupe_preserve_order(signals)[:5]


def _strongest_reason_parts(reason: str) -> list[str]:
    patterns = [
        r"backend ownership \([^)]+\)",
        r"deterministic_intent: [^)]+\)",
        r"stackpilot\.yml: domain match \([^)]+\)",
        r"stackpilot\.yml: keyword overlap \([^)]+\)",
    ]
    matches: list[str] = []
    for pattern in patterns:
        matches.extend(match.group(0) for match in re.finditer(pattern, reason))

    if matches:
        return _dedupe_preserve_order(matches)

    return [part.strip() for part in reason.split("; ") if part.strip()]


def _path_looks_like_file(path: str) -> bool:
    return bool(Path(path).suffix)


def _path_is_glob(path: str) -> bool:
    return any(marker in path for marker in ("*", "?", "[", "]"))


def _merge_paths(*groups: Sequence[str]) -> list[str]:
    return _dedupe_preserve_order([path for group in groups for path in group])


def _first_java_folder_with_marker(
    paths: Sequence[str],
    markers: Sequence[str],
) -> str | None:
    for path in _matching_paths(paths, markers):
        if (
            "*" not in path
            and path.startswith("src/main/java/")
            and "." not in Path(path).name
        ):
            return path
    return None


def _row_is_frontend(row: InventoryRow) -> bool:
    return bool({"frontend", "web", "ui", "client"} & _tokenize(row.type))


def _row_is_backend(row: InventoryRow) -> bool:
    return bool({"backend", "service", "api", "server"} & _tokenize(row.type))


def _tokenize(text: str) -> set[str]:
    return tokenize_text(text)


def _dedupe_preserve_order(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered
