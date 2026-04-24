import json
import re
from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import (
    ArchitectureDiscoveryReport,
    DiscoverySnapshot,
    RepoDiscovery,
)
from app.services.architecture_discovery import ArchitectureDiscoveryService

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


def create_change_proposal(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
) -> ChangeProposal:
    """Create deterministic read-only change proposals from a feature plan."""

    resolved_impacts = (
        list(impacts)
        if impacts is not None
        else analyze_feature(
            feature_request,
            rows,
            scan_root=scan_root,
            discovery_snapshot=discovery_snapshot,
        )
    )
    plan = create_feature_plan(
        feature_request,
        rows,
        impacts=resolved_impacts,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    by_repo = {row.repo_name: row for row in rows}
    impact_by_repo = {impact.repo_name: impact for impact in resolved_impacts}
    discovery_by_repo = _architecture_by_repo(scan_root, discovery_snapshot)
    workspace_root = _workspace_root(scan_root, discovery_snapshot)

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

    if frontend and plan.ui_change_needed:
        ui_paths = _merge_paths(
            _discovery_paths(discovery, "ui"),
            _matching_paths(planned_paths, FRONTEND_PATH_MARKERS),
            _discovery_paths(discovery, "api"),
        )
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
        files.extend(_existing_files_for_category(repo_dir, event_paths, plan, row, "event"))
        folders.extend(event_paths)
        if role == "primary-owner":
            service_paths = _merge_paths(
                _discovery_paths(discovery, "service"),
                _matching_paths(planned_paths, SERVICE_PATH_MARKERS),
            )
            files.extend(
                _existing_files_for_category(repo_dir, service_paths, plan, row, "service")
            )
            folders.extend(service_paths)

    if not files and not folders:
        folders.extend(planned_paths)

    return _dedupe_preserve_order([*files, "stackpilot.yml", *folders])


def _likely_changes(plan: FeaturePlan, row: InventoryRow, role: str) -> list[str]:
    changes: list[str] = []
    backend = _row_is_backend(row)
    frontend = _row_is_frontend(row)
    event_mode = "event_integration" in plan.feature_intents

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
    slug = _feature_slug(plan.feature_request)
    class_name = _pascal_case(slug)
    backend = _row_is_backend(row)
    frontend = _row_is_frontend(row)
    event_mode = "event_integration" in plan.feature_intents
    metadata_only = (
        discovery is not None and discovery.evidence_mode == "metadata-only"
    )

    if metadata_only:
        return []

    if frontend and plan.ui_change_needed:
        page_base = _first_path_with_marker(inspect_paths, ("pages",)) or "src/pages"
        form_base = _first_path_with_marker(inspect_paths, ("forms",)) or "src/forms"
        api_base = (
            _first_folder_with_marker(inspect_paths, ("api",))
            or _first_folder_with_marker(inspect_paths, ("services",))
            or "src/api"
        )
        files.extend(
            [
                f"{page_base}/{slug}.tsx",
                f"{form_base}/{slug}-form.tsx",
                f"{api_base}/{slug}.ts",
            ]
        )

    if backend and plan.api_change_needed and row.language.lower() == "java":
        api_base = (
            _first_folder_with_marker(inspect_paths, ("dto",))
            or _first_folder_with_marker(inspect_paths, ("api", "controller"))
            or "src/main/java/dto"
        )
        files.extend(
            [
                f"{api_base}/{class_name}Request.java",
                f"{api_base}/{class_name}Response.java",
            ]
        )
        if discovery is None or not discovery.likely_api_locations:
            files.append("src/main/resources/openapi.yaml")

    if backend and plan.db_change_needed:
        migration_base = (
            _first_folder_with_marker(inspect_paths, ("migration", "changelog"))
            or "src/main/resources/db/migration"
        )
        files.append(f"{migration_base}/V000__{slug}.sql")

    if backend and event_mode and row.language.lower() == "java":
        event_base = (
            _first_java_folder_with_marker(inspect_paths, EVENT_PATH_MARKERS)
            or "src/main/java/events"
        )
        if role == "primary-owner":
            files.extend(
                [
                    f"{event_base}/{class_name}Event.java",
                    f"{event_base}/{class_name}Publisher.java",
                ]
            )
        elif role == "possible-downstream":
            files.extend(
                [
                    f"{event_base}/{class_name}Consumer.java",
                    f"{event_base}/{class_name}Handler.java",
                ]
            )

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
    if metadata_only:
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
    normalized_markers = tuple(marker.lower() for marker in markers)
    return [
        path
        for path in paths
        if any(marker in path.lower() for marker in normalized_markers)
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


def _merge_paths(*groups: Sequence[str]) -> list[str]:
    return _dedupe_preserve_order([path for group in groups for path in group])


def _first_path_with_marker(paths: Sequence[str], markers: Sequence[str]) -> str | None:
    matches = _matching_paths(paths, markers)
    return matches[0] if matches else None


def _first_folder_with_marker(paths: Sequence[str], markers: Sequence[str]) -> str | None:
    for path in _matching_paths(paths, markers):
        if "*" not in path and "." not in Path(path).name:
            return path
    return None


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


def _feature_slug(feature_request: str) -> str:
    tokens = [
        token
        for token in re.findall(r"[a-z0-9]+", feature_request.lower())
        if token not in GENERIC_STOPWORDS
    ]
    meaningful = tokens[:5] or ["feature"]
    return "-".join(meaningful)


def _pascal_case(slug: str) -> str:
    return "".join(part.capitalize() for part in slug.split("-") if part) or "Feature"


def _dedupe_preserve_order(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered
