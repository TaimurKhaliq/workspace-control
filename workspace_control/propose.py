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
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService

from .analyze import analyze_feature
from .models import (
    ChangeProposal,
    ChangeProposalItem,
    FeatureImpact,
    FeaturePlan,
    InventoryRow,
)
from .plan import create_feature_plan

FRONTEND_PATH_MARKERS = ("pages", "components", "forms", "services", "api")
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
    "frontend": ("*.tsx", "*.ts", "*.jsx", "*.js"),
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


def create_change_proposal(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
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
        proposed_changes.append(
            ChangeProposalItem(
                repo_name=repo_name,
                role=role,
                likely_files_to_inspect=inspect_paths,
                likely_changes=_likely_changes(plan, row, role),
                possible_new_files=_possible_new_files(
                    plan,
                    row,
                    role,
                    inspect_paths,
                    discovery,
                ),
                rationale=_rationale(
                    plan,
                    row,
                    role,
                    inspect_paths,
                    impact_by_repo.get(repo_name),
                    discovery,
                ),
            )
        )

    return ChangeProposal(
        feature_request=plan.feature_request,
        feature_intents=plan.feature_intents,
        confidence=plan.confidence,
        missing_evidence=plan.missing_evidence,
        implementation_owner=plan.implementation_owner,
        domain_owner=plan.domain_owner,
        proposed_changes=proposed_changes,
    )


def format_change_proposal(proposal: ChangeProposal) -> str:
    """Render proposed changes as deterministic JSON."""

    return json.dumps(proposal.model_dump(mode="python"), indent=2, sort_keys=False)


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
        ui_paths = _merge_paths(
            _discovery_paths(discovery, "ui"),
            _matching_paths(planned_paths, FRONTEND_PATH_MARKERS),
            _discovery_paths(discovery, "api"),
        )
        if allow_concrete_files:
            files.extend(_existing_files_for_category(repo_dir, ui_paths, plan, row, "frontend"))
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
        files.extend(_grounded_source_files_for_repo(plan, row.repo_name, repo_dir))

    return _narrow_inspect_paths_for_grounded_concepts(
        plan,
        row,
        _final_inspect_paths(files, folders, discovery),
    )


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

    if frontend and plan.ui_change_needed:
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

    if frontend and plan.ui_change_needed:
        files.append("new UI form component")
        if plan.api_change_needed:
            files.append("new client API helper")

    if backend and plan.api_change_needed and row.language.lower() == "java":
        files.extend(["new request DTO", "new response DTO"])

    if backend and plan.db_change_needed:
        files.append("new migration file")

    if backend and event_mode and row.language.lower() == "java":
        files.extend(_event_possible_new_files(role, inspect_paths))

    return _dedupe_preserve_order(files)


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
        f"Selected as {role} by plan-feature for intents: {intents}; "
        f"strongest signals: {', '.join(strongest_signals)}; "
        f"{path_note} confidence={plan.confidence}."
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
    grounded_tokens = _grounded_concept_tokens(plan)
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

        if not absolute_path.is_dir():
            continue

        for pattern in FILE_PATTERNS[category]:
            for match in sorted(absolute_path.glob(pattern), key=lambda item: str(item)):
                if not match.is_file():
                    continue
                candidate = match.relative_to(repo_dir).as_posix()
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
    split_camel = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return set(re.findall(r"[a-z0-9]+", split_camel.lower()))


def _strongest_signals(
    row: InventoryRow,
    impact: FeatureImpact | None,
    discovery: RepoDiscovery | None,
) -> list[str]:
    signals: list[str] = []
    if impact is not None:
        signals.append(f"score={impact.score}")
        signals.extend(_strongest_reason_parts(impact.reason)[:2])

    if discovery is not None and discovery.detected_frameworks:
        signals.append(
            f"discovered frameworks={', '.join(discovery.detected_frameworks[:3])}"
        )
    if discovery is not None and discovery.hinted_frameworks:
        signals.append(
            f"hinted frameworks={', '.join(discovery.hinted_frameworks[:3])}"
        )

    if not signals:
        signals.append(f"repo type={row.type}")

    return signals[:5]


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
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _dedupe_preserve_order(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered
