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
from app.services.concept_grounding import ConceptGroundingService
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService

from .analyze import analyze_feature
from .models import ConceptGrounding, FeatureImpact, FeaturePlan, InventoryRow
from .ui_shell import ui_shell_paths, ui_shell_requested

INTENT_ORDER = ("ui", "persistence", "api", "event_integration")
INTENT_PHRASES = {
    "ui": (
        "screen",
        "page",
        "form",
        "button",
        "modal",
        "settings",
        "ui",
        "frontend",
        "layout",
        "welcome page",
        "landing page",
        "home page",
        "app shell",
        "entrypoint",
        "entry point",
        "public assets",
        "static assets",
    ),
    "persistence": (
        "persist",
        "store",
        "field",
        "column",
        "table",
        "migration",
        "database",
    ),
    "api": (
        "api",
        "endpoint",
        "request",
        "response",
        "controller",
        "validation",
    ),
    "event_integration": (
        "publish event",
        "emit event",
        "event",
        "downstream",
        "notify",
        "sync",
        "integration",
        "whenever changes",
    ),
}

API_CONTRACT_CHANGE_PHRASES = (
    "api",
    "endpoint",
    "request",
    "response",
    "api contract",
    "request payload",
    "response payload",
    "contract",
)

MUTABLE_DOMAIN_FIELD_PHRASES = (
    "phone number",
    "telephone",
    "email",
    "email address",
    "preferred language",
    "language preference",
    "marketing opt in",
    "marketing opt-in",
    "marketing opt_in",
)
MUTABLE_DOMAIN_UPDATE_ACTIONS = {"change", "edit", "modify", "set", "update"}
UI_COPY_ONLY_TOKENS = {"copy", "label", "rename", "text"}

MIN_RELEVANT_SCORE = 5
MIN_SECONDARY_SCORE = 8

VAGUE_REQUEST_TOKENS = {
    "fix",
    "general",
    "improve",
    "manage",
    "management",
    "misc",
    "stuff",
    "things",
    "update",
}
REQUEST_ACTION_TOKENS = {
    "add",
    "allow",
    "change",
    "create",
    "edit",
    "emit",
    "enable",
    "fix",
    "improve",
    "manage",
    "persist",
    "publish",
    "remove",
    "rename",
    "search",
    "set",
    "store",
    "sync",
    "update",
}
SPECIFIC_FEATURE_TOKENS = {
    "address",
    "email",
    "label",
    "marketing",
    "name",
    "number",
    "opt",
    "password",
    "phone",
}
SPECIFIC_UI_TOKENS = {
    "screen",
    "page",
    "form",
    "button",
    "modal",
    "layout",
    "welcome",
    "landing",
    "home",
    "entrypoint",
}
DOWNSTREAM_REASON_MARKERS = (
    "downstream",
    "event",
    "integration",
    "notification",
    "notify",
    "subscriber",
    "sync",
)

FRONTEND_HINTS = {
    "screen",
    "page",
    "button",
    "form",
    "modal",
    "settings",
    "ui",
    "frontend",
}

BACKEND_PATH_CANDIDATES = [
    "src/main/java/controller",
    "src/main/java/controllers",
    "src/main/java/service",
    "src/main/java/services",
    "src/main/java/dto",
    "src/main/java/entity",
    "src/main/java/entities",
    "src/main/java/repository",
    "src/main/java/repositories",
    "src/controller",
    "src/controllers",
    "src/service",
    "src/services",
    "src/dto",
    "src/entity",
    "src/entities",
    "src/repository",
    "src/repositories",
    "controller",
    "controllers",
    "service",
    "services",
    "dto",
    "entity",
    "entities",
    "repository",
    "repositories",
]
BACKEND_PATH_FALLBACKS_JAVA = [
    "src/main/java/controller",
    "src/main/java/service",
    "src/main/java/dto",
    "src/main/java/entity",
    "src/main/java/repository",
]
BACKEND_PATH_FALLBACKS_GENERIC = [
    "src/controller",
    "src/service",
    "src/dto",
    "src/entity",
    "src/repository",
]

BACKEND_DB_PATH_PREFERRED = [
    "src/main/resources/db/migration",
    "src/main/resources/db/changelog",
    "src/main/resources",
]
BACKEND_DB_PATH_LEGACY_ALLOWED_IF_EXISTS = [
    "src/main/java/db/migration",
    "db/migration",
    "src/db/migration",
    "migrations",
]

FRONTEND_PATH_CANDIDATES = [
    "src/pages",
    "src/components",
    "src/forms",
    "src/services",
    "src/api",
    "pages",
    "components",
    "forms",
    "services",
    "api",
]
FRONTEND_PATH_FALLBACKS = [
    "src/pages",
    "src/components",
    "src/forms",
    "src/services",
    "src/api",
]
FRONTEND_UI_PATH_CANDIDATES = [
    "src/pages",
    "src/components",
    "src/forms",
    "pages",
    "components",
    "forms",
]
FRONTEND_UI_PATH_FALLBACKS = [
    "src/pages",
    "src/components",
    "src/forms",
]

DOWNSTREAM_PATH_CANDIDATES = [
    "src/events",
    "src/integrations",
    "events",
    "integrations",
]


def _normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _phrase_matches(normalized_text: str, phrases: Sequence[str]) -> list[str]:
    wrapped = f" {normalized_text} "
    return sorted(
        phrase for phrase in phrases if phrase and f" {phrase.lower()} " in wrapped
    )


def _classify_feature_intents(feature_request: str) -> list[str]:
    normalized_feature = _normalize_text(feature_request)
    intents: list[str] = []
    for intent in INTENT_ORDER:
        if _phrase_matches(normalized_feature, INTENT_PHRASES[intent]):
            intents.append(intent)
    return intents


def _api_contract_change_requested(feature_request: str) -> bool:
    normalized_feature = _normalize_text(feature_request)
    return bool(_phrase_matches(normalized_feature, API_CONTRACT_CHANGE_PHRASES))


def _with_feature_intent(feature_intents: Sequence[str], intent: str) -> list[str]:
    intent_set = set(feature_intents)
    intent_set.add(intent)
    return [current for current in INTENT_ORDER if current in intent_set]


def _mutable_domain_field_update_requested(feature_request: str) -> bool:
    normalized_feature = _normalize_text(feature_request)
    tokens = _tokenize(feature_request)
    field_matches = _phrase_matches(normalized_feature, MUTABLE_DOMAIN_FIELD_PHRASES)
    if not field_matches:
        return False
    if not tokens & MUTABLE_DOMAIN_UPDATE_ACTIONS:
        return False
    if tokens & UI_COPY_ONLY_TOKENS and not tokens & {"field", "value"}:
        return False
    return True


def _new_field_requested(feature_request: str) -> bool:
    tokens = _tokenize(feature_request)
    return bool("field" in tokens and tokens & {"add", "new"})


def _pure_ui_copy_change_requested(
    feature_request: str,
    feature_intents: Sequence[str],
) -> bool:
    if "ui" not in feature_intents:
        return False
    if any(
        intent in feature_intents
        for intent in ("persistence", "api", "event_integration")
    ):
        return False
    tokens = _tokenize(feature_request)
    if not tokens & UI_COPY_ONLY_TOKENS:
        return False
    return not _mutable_domain_field_update_requested(feature_request)


def _row_is_frontend(row: InventoryRow) -> bool:
    row_tokens = _tokenize(row.type)
    return bool({"frontend", "web", "ui", "client"} & row_tokens)


def _row_is_backend(row: InventoryRow) -> bool:
    row_tokens = _tokenize(row.type)
    return bool({"backend", "service", "api", "server"} & row_tokens)


def _dedupe_preserve_order(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _existing_candidate_paths(repo_dir: Path | None, candidates: Sequence[str]) -> list[str]:
    if repo_dir is None or not repo_dir.is_dir():
        return []

    existing: list[str] = []
    for candidate in candidates:
        candidate_path = repo_dir / candidate
        if candidate_path.is_dir():
            existing.append(candidate)
    return _dedupe_preserve_order(existing)


def _repo_explicitly_referenced(normalized_feature: str, repo_name: str) -> bool:
    normalized_repo = _normalize_text(repo_name)
    if not normalized_repo:
        return False
    return f" {normalized_repo} " in f" {normalized_feature} "


def _weakly_specified_request(
    feature_request: str,
    feature_intents: Sequence[str],
) -> bool:
    tokens = _tokenize(feature_request)
    if not tokens & VAGUE_REQUEST_TOKENS:
        return False
    if tokens & SPECIFIC_FEATURE_TOKENS:
        return False
    if tokens & SPECIFIC_UI_TOKENS:
        return False
    return not any(
        intent in feature_intents for intent in ("persistence", "api", "event_integration")
    )


def _low_signal_request(
    feature_request: str,
    feature_intents: Sequence[str],
) -> bool:
    if feature_intents:
        return False
    tokens = _tokenize(feature_request)
    if tokens & REQUEST_ACTION_TOKENS:
        return False
    if tokens & SPECIFIC_FEATURE_TOKENS:
        return False
    if tokens & SPECIFIC_UI_TOKENS:
        return False
    return True


def _api_surface_expansion_requested(
    feature_request: str,
    feature_intents: Sequence[str],
) -> bool:
    if "api" not in feature_intents:
        return False
    if not _api_contract_change_requested(feature_request):
        return False
    return bool(_tokenize(feature_request) & {"add", "create", "new"})


def _has_specific_ownership_evidence(reason: str) -> bool:
    return "owns_fields" in reason


def _strong_backend_domain_owner(
    impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
) -> FeatureImpact | None:
    candidates = [
        impact
        for impact in impacts
        if (row := by_repo.get(impact.repo_name)) is not None
        and _row_is_backend(row)
        and "backend ownership" in impact.reason
        and any(
            marker in impact.reason
            for marker in ("owns_entities", "owns_fields", "owns_tables")
        )
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda impact: (-impact.score, impact.repo_name))
    return candidates[0]


def _frontend_implementation_owner(
    impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
) -> FeatureImpact | None:
    candidates = [
        impact
        for impact in impacts
        if (row := by_repo.get(impact.repo_name)) is not None
        and _row_is_frontend(row)
        and impact.role != "weak-match"
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda impact: (-impact.score, impact.repo_name))
    return candidates[0]


def _has_discovered_contract_paths(discovery: RepoDiscovery | None) -> bool:
    if discovery is None:
        return False
    return bool(discovery.likely_api_locations)


def _has_ui_paths(discovery: RepoDiscovery | None) -> bool:
    if discovery is None:
        return False
    return bool(discovery.likely_ui_locations)


def _has_source_discovered_paths(discovery: RepoDiscovery | None) -> bool:
    if discovery is None:
        return False
    return bool(
        discovery.likely_api_locations
        or discovery.likely_service_locations
        or discovery.likely_persistence_locations
        or discovery.likely_ui_locations
        or discovery.likely_event_locations
    )


def _has_real_downstream_evidence(
    impact: FeatureImpact,
    discovery: RepoDiscovery | None,
) -> bool:
    if discovery is not None and discovery.likely_event_locations:
        return True
    reason = impact.reason.lower()
    return any(marker in reason for marker in DOWNSTREAM_REASON_MARKERS)


def _filter_impacts_for_plan(
    feature_request: str,
    impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
    feature_intents: Sequence[str],
    architecture_by_repo: dict[str, RepoDiscovery],
    weakly_specified_request: bool,
) -> list[FeatureImpact]:
    normalized_feature = _normalize_text(feature_request)
    has_event_intent = "event_integration" in feature_intents
    has_ui_intent = "ui" in feature_intents
    ui_only_intent = has_ui_intent and not any(
        intent in feature_intents for intent in ("persistence", "api", "event_integration")
    )

    filtered: list[FeatureImpact] = []
    for impact in impacts:
        row = by_repo.get(impact.repo_name)
        if row is None:
            continue

        role = impact.role
        score = impact.score
        reason = impact.reason
        explicit_reference = _repo_explicitly_referenced(
            normalized_feature, impact.repo_name
        )

        if (
            has_event_intent
            and not has_ui_intent
            and _row_is_frontend(row)
            and not explicit_reference
        ):
            role = "weak-match"
            score = min(score, MIN_RELEVANT_SCORE - 1)
            reason = (
                f"{reason}; downgraded for event_integration intent without UI signals"
            )

        discovery = architecture_by_repo.get(impact.repo_name)
        if (
            ui_only_intent
            and _row_is_backend(row)
            and not _row_is_frontend(row)
            and not _has_ui_paths(discovery)
            and not explicit_reference
        ):
            role = "weak-match"
            score = min(score, MIN_RELEVANT_SCORE - 1)
            reason = f"{reason}; downgraded for UI-only intent"

        if (
            role == "possible-downstream"
            and not has_event_intent
            and not explicit_reference
        ):
            continue

        if role == "possible-downstream" and not _has_real_downstream_evidence(
            impact, architecture_by_repo.get(impact.repo_name)
        ):
            continue

        if weakly_specified_request:
            if role != "primary-owner":
                continue
            if not _has_specific_ownership_evidence(reason):
                continue

        if role == "weak-match":
            continue

        minimum_score = (
            MIN_RELEVANT_SCORE if role == "primary-owner" else MIN_SECONDARY_SCORE
        )
        if score < minimum_score:
            continue

        filtered.append(
            FeatureImpact(
                repo_name=impact.repo_name,
                role=role,
                score=score,
                reason=reason,
            )
        )

    filtered.sort(key=lambda current: (-current.score, current.repo_name))
    return filtered


def _promote_primary_owner_if_missing(
    impacts: list[FeatureImpact],
    *,
    allow_promotion: bool,
) -> list[FeatureImpact]:
    if not impacts:
        return impacts
    if any(impact.role == "primary-owner" for impact in impacts):
        return impacts
    if not allow_promotion:
        return impacts

    top = impacts[0]
    impacts[0] = FeatureImpact(
        repo_name=top.repo_name,
        role="primary-owner",
        score=top.score,
        reason=f"{top.reason}; promoted to primary-owner for intent alignment",
    )
    return impacts


def _single_repo_inferred_domain_owner(
    domain_owner_impact: FeatureImpact | None,
    implementation_owner_impact: FeatureImpact | None,
    filtered_impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
    feature_intents: Sequence[str],
    pure_ui_copy_change: bool,
) -> bool:
    if domain_owner_impact is None or implementation_owner_impact is not None:
        return False
    if pure_ui_copy_change or len(filtered_impacts) != 1:
        return False
    if filtered_impacts[0].repo_name != domain_owner_impact.repo_name:
        return False

    row = by_repo.get(domain_owner_impact.repo_name)
    if row is None or not _row_is_backend(row):
        return False
    if getattr(row, "metadata_source", "stackpilot.yml") != "inferred_metadata":
        return False

    return any(
        intent in feature_intents
        for intent in ("persistence", "api", "event_integration")
    )


def _single_repo_inferred_primary_backend_owner(
    filtered_impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
    feature_intents: Sequence[str],
    pure_ui_copy_change: bool,
) -> str | None:
    if pure_ui_copy_change or len(filtered_impacts) != 1:
        return None

    impact = filtered_impacts[0]
    if impact.role != "primary-owner":
        return None

    row = by_repo.get(impact.repo_name)
    if row is None or not _row_is_backend(row):
        return None
    if getattr(row, "metadata_source", "stackpilot.yml") != "inferred_metadata":
        return None
    if not any(
        intent in feature_intents
        for intent in ("persistence", "api", "event_integration")
    ):
        return None

    return impact.repo_name


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


def _ownership_tie_missing_evidence(
    impacts: Sequence[FeatureImpact],
    primary_owner: str | None,
) -> str | None:
    primary_impact = next(
        (impact for impact in impacts if impact.repo_name == primary_owner),
        None,
    )
    if primary_impact is None:
        return None

    ownership_candidates = [
        impact
        for impact in impacts
        if "backend ownership" in impact.reason
        and impact.repo_name != primary_impact.repo_name
        and abs(primary_impact.score - impact.score) <= 3
    ]
    if not ownership_candidates:
        return None

    tied_repos = ", ".join(
        sorted(
            [
                primary_impact.repo_name,
                *[impact.repo_name for impact in ownership_candidates],
            ]
        )
    )
    return f"multiple repos tied on ownership without strong differentiators ({tied_repos})"


def _missing_evidence_for_plan(
    *,
    primary_owner: str | None,
    possible_downstreams: Sequence[str],
    ui_change_needed: bool,
    api_change_needed: bool,
    db_change_needed: bool,
    event_integration_mode: bool,
    architecture_by_repo: dict[str, RepoDiscovery],
    impacts: Sequence[FeatureImpact],
    weakly_specified_request: bool,
    concept_grounding: Sequence[ConceptGrounding] = (),
) -> list[str]:
    missing: list[str] = []
    owner_discovery = (
        architecture_by_repo.get(primary_owner) if primary_owner is not None else None
    )
    owner_impact = next(
        (impact for impact in impacts if impact.repo_name == primary_owner),
        None,
    )

    if primary_owner is not None and api_change_needed and (
        owner_discovery is None or not owner_discovery.likely_api_locations
    ):
        missing.append("no API contract file found")

    if primary_owner is not None and db_change_needed and (
        owner_discovery is None or not owner_discovery.likely_persistence_locations
    ):
        missing.append("no migration system detected")

    if ui_change_needed and not (
        _impacted_ui_paths_found(impacts, architecture_by_repo)
        or _frontend_grounding_supports_ui(concept_grounding)
    ):
        missing.append(
            "UI intent came from request text, but no UI/component paths were discovered"
        )

    if event_integration_mode:
        event_repos = [repo for repo in [primary_owner, *possible_downstreams] if repo]
        if event_repos and not any(
            architecture_by_repo.get(repo) is not None
            and architecture_by_repo[repo].likely_event_locations
            for repo in event_repos
        ):
            missing.append("no event folder or publisher pattern found")

    ui_only_plan = ui_change_needed and not (
        api_change_needed or db_change_needed or event_integration_mode
    )
    if (
        owner_impact is not None
        and "promoted to primary-owner" in owner_impact.reason
        and not ui_only_plan
    ):
        missing.append("primary owner inferred from generic intent alignment")

    if weakly_specified_request:
        missing.append("weak evidence for concrete repo ownership or implementation steps")

    if primary_owner is None:
        missing.append("no primary owner identified from strong evidence")

    ownership_tie = _ownership_tie_missing_evidence(impacts, primary_owner)
    if ownership_tie is not None:
        missing.append(ownership_tie)

    return _dedupe_preserve_order(missing)


def _concept_missing_evidence(grounding: Sequence[ConceptGrounding]) -> list[str]:
    missing: list[str] = []
    for item in grounding:
        if item.status == "ungrounded":
            missing.append(
                f"requested concept '{item.concept}' was not grounded in discovered source or metadata"
            )
    return missing


def _ungrounded_concepts(grounding: Sequence[ConceptGrounding]) -> list[str]:
    return [item.concept for item in grounding if item.status == "ungrounded"]


def _unsupported_intents_for_plan(
    feature_intents: Sequence[str],
    impacts: Sequence[FeatureImpact],
    architecture_by_repo: dict[str, RepoDiscovery],
    concept_grounding: Sequence[ConceptGrounding] = (),
) -> list[str]:
    unsupported: list[str] = []
    if "ui" in feature_intents and not (
        _impacted_ui_paths_found(impacts, architecture_by_repo)
        or _frontend_grounding_supports_ui(concept_grounding)
    ):
        unsupported.append("ui")
    return _dedupe_preserve_order(unsupported)


def _impacted_ui_paths_found(
    impacts: Sequence[FeatureImpact],
    architecture_by_repo: dict[str, RepoDiscovery],
) -> bool:
    return any(
        _has_ui_paths(architecture_by_repo.get(impact.repo_name))
        for impact in impacts
    )


def _frontend_grounding_supports_ui(
    concept_grounding: Sequence[ConceptGrounding],
) -> bool:
    return any(
        grounding.status in {"direct_match", "alias_match"}
        and any(_source_is_frontend_source(source) for source in grounding.sources)
        for grounding in concept_grounding
    )


def _source_is_frontend_source(source: str) -> bool:
    lowered = source.lower()
    if not lowered.startswith("source:"):
        return False
    frontend_markers = (
        ":client/",
        ":frontend/",
        ":web/",
        ":ui/",
        "/src/components/",
        "/src/pages/",
        "/src/forms/",
        "/src/features/",
        "/src/containers/",
        "/src/routes/",
        "/src/views/",
        ".tsx",
        ".jsx",
    )
    return any(marker in lowered for marker in frontend_markers)


def _source_path_for_repo(source: str, repo_name: str) -> str | None:
    parts = source.split(":", 2)
    if len(parts) != 3 or parts[0] != "source" or parts[1] != repo_name:
        return None
    return parts[2]


def _frontend_grounded_paths_for_repo(
    repo_name: str,
    concept_grounding: Sequence[ConceptGrounding],
) -> list[str]:
    paths: list[str] = []
    for relative in _frontend_grounded_source_paths_for_repo(repo_name, concept_grounding):
        parent = Path(relative).parent.as_posix()
        paths.append(relative if parent == "." else parent)
    return _dedupe_preserve_order(paths)


def _frontend_grounded_source_paths_for_repo(
    repo_name: str,
    concept_grounding: Sequence[ConceptGrounding],
) -> list[str]:
    paths: list[str] = []
    for grounding in concept_grounding:
        if grounding.status not in {"direct_match", "alias_match"}:
            continue
        for source in grounding.sources:
            relative = _source_path_for_repo(source, repo_name)
            if relative is None or not _source_is_frontend_source(source):
                continue
            paths.append(relative)
    return _dedupe_preserve_order(paths)


def _frontend_support_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    support_paths = [
        *discovery.likely_api_locations,
        *discovery.likely_service_locations,
    ]
    return [
        path
        for path in _dedupe_preserve_order(support_paths)
        if _looks_like_frontend_path(path)
    ]


def _looks_like_frontend_path(path: str) -> bool:
    lowered = path.lower()
    return (
        lowered.startswith(("client/", "frontend/", "web/", "ui/"))
        or "/src/api" in lowered
        or "/src/services" in lowered
        or lowered.startswith(("src/api", "src/services"))
    )


def _has_strong_frontend_evidence(
    repo_name: str | None,
    discovery: RepoDiscovery | None,
    concept_grounding: Sequence[ConceptGrounding],
) -> bool:
    if repo_name is None:
        return False
    return bool(
        _frontend_grounded_paths_for_repo(repo_name, concept_grounding)
        or _has_ui_paths(discovery)
    )


def _confidence_for_plan(
    *,
    primary_owner: str | None,
    filtered_impacts: Sequence[FeatureImpact],
    missing_evidence: Sequence[str],
    unsupported_intents: Sequence[str] = (),
    concept_grounding: Sequence[ConceptGrounding] = (),
) -> str:
    if primary_owner is None or not filtered_impacts:
        return "low"

    owner_impact = next(
        (impact for impact in filtered_impacts if impact.repo_name == primary_owner),
        None,
    )
    if owner_impact is None:
        return "low"

    competing_scores = [
        impact.score
        for impact in filtered_impacts
        if impact.repo_name != primary_owner
    ]
    score_gap = owner_impact.score - max(competing_scores, default=0)
    has_ambiguity = any(
        "multiple repos tied on ownership" in item for item in missing_evidence
    )
    weak_concrete_evidence = any(
        "weak evidence for concrete repo ownership" in item
        for item in missing_evidence
    )
    uncertain_ui_evidence = any(
        "no UI/component paths were discovered" in item
        for item in missing_evidence
    )
    has_ungrounded_concept = bool(_ungrounded_concepts(concept_grounding))

    if (
        weak_concrete_evidence
        or has_ungrounded_concept
        or "ui" in unsupported_intents
        or has_ambiguity
        or len(missing_evidence) >= 2
        or score_gap <= 2
    ):
        return "low"
    if uncertain_ui_evidence or missing_evidence or score_gap < 8:
        return "medium"
    return "high"


def _conservative_steps_for_ungrounded_concepts(
    ordered_steps: Sequence[str],
    *,
    primary_owner: str | None,
    concept_grounding: Sequence[ConceptGrounding],
) -> list[str]:
    concepts = _ungrounded_concepts(concept_grounding)
    if not concepts or not ordered_steps:
        return list(ordered_steps)

    validation_steps = [
        step for step in ordered_steps if step.startswith("Run validation commands")
    ]
    concept_text = ", ".join(concepts)
    steps = [
        (
            "Validate whether the requested concept(s) are represented in the selected "
            f"repo before implementation: {concept_text}."
        )
    ]
    if primary_owner is not None:
        steps.append(
            f"In {primary_owner}, inspect discovered high-level API/service/data paths for those concept(s) "
            "before planning specific edits."
        )
    steps.extend(validation_steps)
    return steps


def _infer_likely_paths(
    row: InventoryRow,
    role: str,
    *,
    repo_name: str,
    repo_dir: Path | None,
    discovery: RepoDiscovery | None,
    concept_grounding: Sequence[ConceptGrounding],
    db_change_needed: bool,
    api_change_needed: bool,
    ui_change_needed: bool,
    ui_copy_only: bool,
    event_integration_mode: bool,
    ui_shell_change: bool,
) -> list[str]:
    paths: list[str] = []
    ui_only_change = ui_change_needed and not (
        api_change_needed or db_change_needed or event_integration_mode
    )
    if not _has_source_discovered_paths(discovery):
        paths.append("stackpilot.yml")

    if _row_is_backend(row) and not (_row_is_frontend(row) and ui_only_change):
        discovered_backend_paths = _backend_discovered_paths(
            discovery,
            db_change_needed=db_change_needed,
            api_change_needed=api_change_needed,
            event_integration_mode=event_integration_mode,
        )
        if discovered_backend_paths:
            paths.extend(discovered_backend_paths)
        elif row.language.lower() == "java":
            paths.extend(BACKEND_PATH_FALLBACKS_JAVA)
        else:
            paths.extend(BACKEND_PATH_FALLBACKS_GENERIC)

        if db_change_needed:
            db_existing_preferred = _existing_candidate_paths(
                repo_dir, BACKEND_DB_PATH_PREFERRED
            )
            if db_existing_preferred:
                paths.extend(db_existing_preferred)
            else:
                db_existing_legacy = _existing_candidate_paths(
                    repo_dir, BACKEND_DB_PATH_LEGACY_ALLOWED_IF_EXISTS
                )
                if db_existing_legacy:
                    paths.extend(db_existing_legacy)
                else:
                    paths.extend(BACKEND_DB_PATH_PREFERRED)

        if (
            role == "possible-downstream"
            and event_integration_mode
            and not discovered_backend_paths
        ):
            downstream_existing = _existing_candidate_paths(
                repo_dir, DOWNSTREAM_PATH_CANDIDATES
            )
            if downstream_existing:
                paths.extend(downstream_existing)
            else:
                paths.extend(["src/events", "src/integrations"])

        if ui_change_needed and _row_is_frontend(row):
            frontend_discovered = _frontend_discovered_paths(
                discovery,
                repo_name,
                concept_grounding,
                include_support=not ui_copy_only,
            )
            if frontend_discovered:
                paths.extend(frontend_discovered)

    if _row_is_frontend(row) and (
        not _row_is_backend(row) or ui_only_change
    ):
        if ui_shell_change:
            paths.extend(ui_shell_paths(repo_dir))

        frontend_discovered = _frontend_discovered_paths(
            discovery,
            repo_name,
            concept_grounding,
            include_support=not (ui_copy_only or ui_only_change),
        )
        if frontend_discovered:
            paths.extend(frontend_discovered)
        elif frontend_existing := _existing_candidate_paths(
            repo_dir,
            FRONTEND_UI_PATH_CANDIDATES if ui_copy_only else FRONTEND_PATH_CANDIDATES,
        ):
            paths.extend(frontend_existing)
        else:
            paths.extend(
                FRONTEND_UI_PATH_FALLBACKS if ui_copy_only else FRONTEND_PATH_FALLBACKS
            )

        if (
            ui_change_needed
            and not ui_only_change
            and "src/forms" not in paths
            and "forms" not in paths
        ):
            paths.append("src/forms")

    return _dedupe_preserve_order(paths)


def _backend_discovered_paths(
    discovery: RepoDiscovery | None,
    *,
    db_change_needed: bool,
    api_change_needed: bool,
    event_integration_mode: bool,
) -> list[str]:
    if discovery is None:
        return []

    if event_integration_mode and not api_change_needed:
        paths = [
            *discovery.likely_event_locations,
            *discovery.likely_service_locations,
        ]
        if db_change_needed:
            paths.extend(discovery.likely_persistence_locations)
        else:
            paths.extend(
                path
                for path in discovery.likely_persistence_locations
                if _non_migration_persistence_path(path)
            )
        return _dedupe_preserve_order(paths)

    paths = [
        *discovery.likely_api_locations,
        *discovery.likely_service_locations,
    ]
    if db_change_needed:
        paths.extend(discovery.likely_persistence_locations)
    else:
        paths.extend(
            path
            for path in discovery.likely_persistence_locations
            if _non_migration_persistence_path(path)
        )
    if event_integration_mode:
        paths.extend(discovery.likely_event_locations)
    return _dedupe_preserve_order(paths)


def _frontend_discovered_paths(
    discovery: RepoDiscovery | None,
    repo_name: str,
    concept_grounding: Sequence[ConceptGrounding],
    *,
    include_support: bool = True,
) -> list[str]:
    if discovery is None:
        return []
    grounded_paths = _frontend_grounded_paths_for_repo(repo_name, concept_grounding)
    if grounded_paths:
        support_paths = _frontend_support_paths(discovery) if include_support else []
        return _dedupe_preserve_order(
            [*grounded_paths, *support_paths]
        )
    paths = list(discovery.likely_ui_locations)
    if include_support:
        paths.extend(discovery.likely_api_locations)
        paths.extend(discovery.likely_service_locations)
    return _dedupe_preserve_order(paths)


def _non_migration_persistence_path(path: str) -> bool:
    lowered = path.lower()
    return any(
        marker in lowered
        for marker in ("entity", "entities", "repository", "repositories")
    )


def _primary_owner_step(
    repo_name: str,
    row: InventoryRow,
    *,
    score: int,
    db_change_needed: bool,
    api_change_needed: bool,
    ui_copy_only: bool,
    feature_intents: set[str],
    discovery: RepoDiscovery | None,
    ui_shell_change: bool = False,
) -> str:
    ui_only_change = "ui" in feature_intents and not any(
        intent in feature_intents
        for intent in ("api", "persistence", "event_integration")
    )
    if _row_is_frontend(row) and ui_only_change:
        if ui_shell_change:
            return (
                f"In {repo_name} (primary-owner, score={score}), update the UI shell, "
                "layout composition, welcome/landing page wiring, frontend entrypoint, "
                "and public/static asset references"
                f"{_path_note(' using discovered UI paths', _ui_paths(discovery))}."
            )
        if ui_copy_only:
            return (
                f"In {repo_name} (primary-owner, score={score}), update the relevant "
                "UI copy, label text, and presentation on the profile screen"
                f"{_path_note(' using discovered UI paths', _ui_paths(discovery))}."
            )
        return (
            f"In {repo_name} (primary-owner, score={score}), update the requested UI page, "
            "layout, route, and component composition"
            f"{_path_note(' using discovered UI paths', _ui_paths(discovery))}."
        )

    if _row_is_backend(row):
        if "event_integration" in feature_intents:
            trigger_note = _path_note(
                " using discovered event/service trigger paths",
                _event_trigger_paths(discovery, api_change_needed=api_change_needed),
            )
            api_note = ""
            if api_change_needed:
                api_note = _path_note(
                    " and API contract paths",
                    _api_paths(discovery),
                )
            step = (
                f"In {repo_name} (primary-owner, score={score}), implement event emission/publish logic, "
                "define payload/schema mapping, add the trigger point in service flow, and determine whether "
                f"an outbox/producer/integration path is needed{trigger_note}{api_note}."
            )
            if db_change_needed:
                return (
                    f"{step[:-1]} Also update entity/repository persistence handling and migration files"
                    f"{_path_note(' at', _persistence_paths(discovery))}."
                )
            return step

        if api_change_needed and db_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update API request/response contracts, "
                "implement service/controller validation logic, and adjust entity/repository + migration handling"
                f"{_path_note(' using discovered API/service paths', _api_and_service_paths(discovery))}"
                f"{_path_note(' and persistence/schema paths', _persistence_paths(discovery))}."
            )
        if api_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update API request/response contracts, "
                "implement controller/service validation flow, and verify DTO mapping compatibility"
                f"{_path_note(' using discovered controller/dto/service paths', _api_and_service_paths(discovery))}."
            )
        if db_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update service logic, entity/repository "
                "persistence mappings, and add migration/changelog updates"
                f"{_path_note(' using discovered persistence/schema paths', _persistence_paths(discovery))}."
            )
        return (
            f"In {repo_name} (primary-owner, score={score}), implement service-level feature logic and "
            "review entity/repository mappings for impact"
            f"{_path_note(' using discovered service/data paths', _service_and_data_paths(discovery))}."
        )

    if _row_is_frontend(row):
        if ui_shell_change:
            return (
                f"In {repo_name} (primary-owner, score={score}), update the UI shell, "
                "layout composition, welcome/landing page wiring, frontend entrypoint, "
                "and public/static asset references"
                f"{_path_note(' using discovered UI paths', _ui_paths(discovery))}."
            )
        if ui_copy_only:
            return (
                f"In {repo_name} (primary-owner, score={score}), update the relevant "
                "UI copy, label text, and presentation on the profile screen"
                f"{_path_note(' using discovered UI paths', _ui_paths(discovery))}."
            )
        return (
            f"In {repo_name} (primary-owner, score={score}), update profile page/form state handling, "
            "UI copy, validation messaging, and client service wiring"
            f"{_path_note(' using discovered UI/client paths', _ui_and_client_paths(discovery))}."
        )

    return (
        f"In {repo_name} (primary-owner, score={score}), implement core feature logic and "
        "update internal module contracts."
    )


def _frontend_ui_step(
    repo_name: str,
    *,
    score: int,
    discovery: RepoDiscovery | None,
    concept_grounding: Sequence[ConceptGrounding],
    api_change_needed: bool,
) -> str:
    paths = _frontend_discovered_paths(discovery, repo_name, concept_grounding)
    surfaces = _frontend_surface_names(
        repo_name,
        paths,
        concept_grounding,
        api_change_needed=api_change_needed,
    )
    return (
        f"In {repo_name} (frontend/UI, score={score}), update "
        f"{', '.join(surfaces)}"
        f"{_path_note(' using grounded frontend paths', paths)}."
    )


def _frontend_surface_names(
    repo_name: str,
    paths: Sequence[str],
    concept_grounding: Sequence[ConceptGrounding],
    *,
    api_change_needed: bool,
) -> list[str]:
    source_paths = _frontend_grounded_source_paths_for_repo(repo_name, concept_grounding)
    evidence_text = _normalize_text(" ".join([*paths, *source_paths]))
    surfaces: list[str] = []
    if "edit" in evidence_text and "page" in evidence_text:
        surfaces.append("edit page")
    if "editor" in evidence_text:
        surfaces.append("editor component")
    if "form" in evidence_text:
        surfaces.append("form component")
    if "type" in evidence_text or "types" in evidence_text:
        surfaces.append("client types")
    if api_change_needed and any(
        marker in evidence_text
        for marker in ("api", "service", "services")
    ):
        surfaces.append("client request wiring")
    if not surfaces:
        surfaces.append("UI page/component surfaces")
    return _dedupe_preserve_order(surfaces)


def _direct_dependent_step(
    repo_name: str,
    row: InventoryRow,
    *,
    score: int,
    feature_intents: set[str],
    api_change_needed: bool,
    discovery: RepoDiscovery | None,
) -> str:
    if _row_is_frontend(row):
        if "ui" in feature_intents:
            return (
                f"In {repo_name} (direct-dependent, score={score}), update pages/components/forms, "
                "client request payload handling, and submission/error states"
                f"{_path_note(' using discovered UI/client paths', _ui_and_client_paths(discovery))}."
            )
        return (
            f"In {repo_name} (direct-dependent, score={score}), verify client service wiring and "
            "compatibility with owner repo changes"
            f"{_path_note(' using discovered client paths', _ui_and_client_paths(discovery))}."
        )

    if "event_integration" in feature_intents:
        return (
            f"In {repo_name} (direct-dependent, score={score}), update integration service hooks, "
            "request adapters, and compatibility checks with owner event payloads"
            f"{_path_note(' using discovered event/integration paths', _event_paths(discovery))}."
        )

    if api_change_needed:
        return (
            f"In {repo_name} (direct-dependent, score={score}), update request/response handling and "
            "compatibility checks with owner APIs"
            f"{_path_note(' using discovered API/service paths', _api_and_service_paths(discovery))}."
        )

    return (
        f"In {repo_name} (direct-dependent, score={score}), update dependent service logic and "
        "verify compatibility with owner repo changes."
    )


def _possible_downstream_step(
    repo_name: str,
    *,
    score: int,
    event_integration_mode: bool,
    discovery: RepoDiscovery | None,
) -> str:
    if event_integration_mode:
        return (
            f"In {repo_name} (possible-downstream, score={score}), determine whether "
            "consumer/subscriber/integration changes are needed; if impacted, update event handlers, "
            "payload mapping, and downstream integration coverage"
            f"{_path_note(' using discovered consumer/integration paths', _event_paths(discovery))}."
        )

    return (
        f"In {repo_name} (possible-downstream, score={score}), determine whether sync/integration updates "
        "are needed; if impacted, update publish/consume payload mappings and integration coverage."
    )


def _path_note(prefix: str, paths: Sequence[str]) -> str:
    if not paths:
        return ""
    return f"{prefix}: {', '.join(paths[:3])}"


def _api_and_service_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return _dedupe_preserve_order(
        [*discovery.likely_api_locations, *discovery.likely_service_locations]
    )


def _api_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return list(discovery.likely_api_locations)


def _persistence_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return list(discovery.likely_persistence_locations)


def _service_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return list(discovery.likely_service_locations)


def _service_and_data_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return _dedupe_preserve_order(
        [*discovery.likely_service_locations, *discovery.likely_persistence_locations]
    )


def _event_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return list(discovery.likely_event_locations)


def _event_trigger_paths(
    discovery: RepoDiscovery | None,
    *,
    api_change_needed: bool,
) -> list[str]:
    event_paths = _event_paths(discovery)
    if event_paths:
        return event_paths

    service_paths = _service_paths(discovery)
    if service_paths:
        return service_paths

    if api_change_needed:
        return _api_paths(discovery)

    return []


def _ui_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return list(discovery.likely_ui_locations)


def _ui_and_client_paths(discovery: RepoDiscovery | None) -> list[str]:
    if discovery is None:
        return []
    return _dedupe_preserve_order(
        [
            *discovery.likely_ui_locations,
            *discovery.likely_api_locations,
            *discovery.likely_service_locations,
        ]
    )


def create_feature_plan(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
) -> FeaturePlan:
    """Build a deterministic feature plan from impact analysis."""

    effective_rows = RepoProfileBootstrapService().effective_inventory_for_scan(
        rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    resolved_impacts = (
        list(impacts)
        if impacts is not None
        else analyze_feature(
            feature_request,
            effective_rows,
            scan_root=scan_root,
            discovery_snapshot=discovery_snapshot,
        )
    )
    by_repo = {row.repo_name: row for row in effective_rows}
    feature_intents = _classify_feature_intents(feature_request)
    ui_shell_change = ui_shell_requested(feature_request)
    if ui_shell_change:
        feature_intents = _with_feature_intent(feature_intents, "ui")
    pure_ui_copy_change = _pure_ui_copy_change_requested(feature_request, feature_intents)
    discovery_by_repo = _architecture_by_repo(scan_root, discovery_snapshot)
    workspace_root = _workspace_root(scan_root, discovery_snapshot)
    concept_grounding = ConceptGroundingService().ground(
        feature_request,
        effective_rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    mutable_domain_update = _mutable_domain_field_update_requested(feature_request)
    domain_owner_impact = _strong_backend_domain_owner(resolved_impacts, by_repo)
    implementation_owner_impact = (
        _frontend_implementation_owner(resolved_impacts, by_repo)
        if "ui" in feature_intents
        else None
    )
    domain_owner_discovery = (
        discovery_by_repo.get(domain_owner_impact.repo_name)
        if domain_owner_impact is not None
        else None
    )
    inferred_api_for_mutable_field = bool(
        "ui" in feature_intents
        and mutable_domain_update
        and domain_owner_impact is not None
        and implementation_owner_impact is not None
    )
    inferred_api_for_ui_persistence = bool(
        "ui" in feature_intents
        and "persistence" in feature_intents
        and domain_owner_impact is not None
        and implementation_owner_impact is not None
    )
    inferred_api_for_new_field_with_contract = bool(
        "ui" in feature_intents
        and _new_field_requested(feature_request)
        and domain_owner_impact is not None
        and implementation_owner_impact is not None
        and _has_discovered_contract_paths(domain_owner_discovery)
    )
    inferred_api_for_new_persisted_field_with_contract = bool(
        "persistence" in feature_intents
        and _new_field_requested(feature_request)
        and domain_owner_impact is not None
        and _has_discovered_contract_paths(domain_owner_discovery)
    )
    if (
        inferred_api_for_mutable_field
        or inferred_api_for_ui_persistence
        or inferred_api_for_new_field_with_contract
        or inferred_api_for_new_persisted_field_with_contract
    ):
        feature_intents = _with_feature_intent(feature_intents, "api")

    event_integration_mode = "event_integration" in feature_intents
    weak_request = _weakly_specified_request(feature_request, feature_intents)
    low_signal_request = _low_signal_request(feature_request, feature_intents)
    weak_evidence_request = weak_request or low_signal_request
    api_surface_expansion = _api_surface_expansion_requested(
        feature_request,
        feature_intents,
    )

    filtered_impacts = _filter_impacts_for_plan(
        feature_request,
        resolved_impacts,
        by_repo,
        feature_intents,
        discovery_by_repo,
        weak_evidence_request,
    )
    filtered_impacts = _promote_primary_owner_if_missing(
        filtered_impacts,
        allow_promotion=not weak_evidence_request,
    )

    primary_owner = next(
        (impact.repo_name for impact in filtered_impacts if impact.role == "primary-owner"),
        None,
    )
    direct_dependents = [
        impact.repo_name for impact in filtered_impacts if impact.role == "direct-dependent"
    ]
    possible_downstreams = [
        impact.repo_name
        for impact in filtered_impacts
        if impact.role == "possible-downstream"
    ]
    implementation_owner = (
        implementation_owner_impact.repo_name
        if (
            domain_owner_impact is not None
            and implementation_owner_impact is not None
            and "ui" in feature_intents
        )
        else primary_owner
    )
    domain_owner = (
        domain_owner_impact.repo_name
        if (
            domain_owner_impact is not None
            and (
                (
                    implementation_owner_impact is not None
                    and "ui" in feature_intents
                    and not pure_ui_copy_change
                )
                or event_integration_mode
            )
        )
        else None
    )
    if domain_owner is None and _single_repo_inferred_domain_owner(
        domain_owner_impact,
        implementation_owner_impact,
        filtered_impacts,
        by_repo,
        feature_intents,
        pure_ui_copy_change,
    ):
        domain_owner = domain_owner_impact.repo_name
    if domain_owner is None:
        domain_owner = _single_repo_inferred_primary_backend_owner(
            filtered_impacts,
            by_repo,
            feature_intents,
            pure_ui_copy_change,
        )

    ui_change_needed = "ui" in feature_intents
    db_change_needed = "persistence" in feature_intents
    api_change_needed = (
        _api_contract_change_requested(feature_request)
        or inferred_api_for_mutable_field
        or inferred_api_for_ui_persistence
        or inferred_api_for_new_field_with_contract
        or inferred_api_for_new_persisted_field_with_contract
    )

    likely_paths_by_repo: dict[str, list[str]] = {}
    validation_commands: list[str] = []

    for impact in filtered_impacts:
        row = by_repo.get(impact.repo_name)
        if row is None:
            continue

        repo_dir = (
            (workspace_root / impact.repo_name)
            if workspace_root is not None
            else None
        )
        likely_paths_by_repo[impact.repo_name] = _infer_likely_paths(
            row,
            impact.role,
            repo_name=impact.repo_name,
            repo_dir=repo_dir,
            discovery=discovery_by_repo.get(impact.repo_name),
            concept_grounding=concept_grounding,
            db_change_needed=db_change_needed,
            api_change_needed=api_change_needed,
            ui_change_needed=ui_change_needed,
            ui_copy_only=pure_ui_copy_change,
            event_integration_mode=event_integration_mode,
            ui_shell_change=ui_shell_change,
        )

        validation_commands.extend(row.build_commands)
        validation_commands.extend(row.test_commands)

    validation_commands = _dedupe_preserve_order(validation_commands)
    impact_by_repo = {impact.repo_name: impact for impact in filtered_impacts}

    ordered_steps: list[str] = []
    feature_intents_set = set(feature_intents)
    if primary_owner is not None and primary_owner in by_repo:
        owner_impact = impact_by_repo.get(primary_owner)
        owner_score = owner_impact.score if owner_impact is not None else 0
        ordered_steps.append(
            _primary_owner_step(
                primary_owner,
                by_repo[primary_owner],
                score=owner_score,
                db_change_needed=db_change_needed,
                api_change_needed=api_change_needed,
                ui_copy_only=pure_ui_copy_change,
                feature_intents=feature_intents_set,
                discovery=discovery_by_repo.get(primary_owner),
                ui_shell_change=ui_shell_change,
            )
        )
        if (
            ui_change_needed
            and implementation_owner == primary_owner
            and _has_strong_frontend_evidence(
                primary_owner,
                discovery_by_repo.get(primary_owner),
                concept_grounding,
            )
            and _row_is_backend(by_repo[primary_owner])
            and not (
                ui_change_needed
                and not (api_change_needed or db_change_needed or event_integration_mode)
            )
        ):
            ordered_steps.append(
                _frontend_ui_step(
                    primary_owner,
                    score=owner_score,
                    discovery=discovery_by_repo.get(primary_owner),
                    concept_grounding=concept_grounding,
                    api_change_needed=api_change_needed,
                )
            )

    for repo_name in direct_dependents:
        impact = impact_by_repo.get(repo_name)
        row = by_repo.get(repo_name)
        if impact is None or row is None:
            continue
        ordered_steps.append(
            _direct_dependent_step(
                repo_name,
                row,
                score=impact.score,
                feature_intents=feature_intents_set,
                api_change_needed=api_change_needed,
                discovery=discovery_by_repo.get(repo_name),
            )
        )

    for repo_name in possible_downstreams:
        impact = impact_by_repo.get(repo_name)
        if impact is None:
            continue
        ordered_steps.append(
            _possible_downstream_step(
                repo_name,
                score=impact.score,
                event_integration_mode=event_integration_mode,
                discovery=discovery_by_repo.get(repo_name),
            )
        )

    if validation_commands:
        ordered_steps.append(
            "Run validation commands in impacted repos: "
            + " ; ".join(validation_commands)
            + "."
        )

    requires_human_approval = (
        db_change_needed
        or bool(possible_downstreams)
        or inferred_api_for_mutable_field
        or inferred_api_for_new_field_with_contract
        or inferred_api_for_new_persisted_field_with_contract
        or api_surface_expansion
        or weak_evidence_request
    )
    missing_evidence = _missing_evidence_for_plan(
        primary_owner=primary_owner,
        possible_downstreams=possible_downstreams,
        ui_change_needed=ui_change_needed,
        api_change_needed=api_change_needed,
        db_change_needed=db_change_needed,
        event_integration_mode=event_integration_mode,
        architecture_by_repo=discovery_by_repo,
        impacts=filtered_impacts,
        weakly_specified_request=weak_evidence_request,
        concept_grounding=concept_grounding,
    )
    missing_evidence = _dedupe_preserve_order(
        [*missing_evidence, *_concept_missing_evidence(concept_grounding)]
    )
    unsupported_intents = _unsupported_intents_for_plan(
        feature_intents,
        filtered_impacts,
        discovery_by_repo,
        concept_grounding,
    )
    ordered_steps = _conservative_steps_for_ungrounded_concepts(
        ordered_steps,
        primary_owner=primary_owner,
        concept_grounding=concept_grounding,
    )
    confidence = _confidence_for_plan(
        primary_owner=primary_owner,
        filtered_impacts=filtered_impacts,
        missing_evidence=missing_evidence,
        unsupported_intents=unsupported_intents,
        concept_grounding=concept_grounding,
    )

    return FeaturePlan(
        feature_request=feature_request,
        feature_intents=feature_intents,
        unsupported_intents=unsupported_intents,
        concept_grounding=concept_grounding,
        confidence=confidence,
        missing_evidence=missing_evidence,
        primary_owner=primary_owner,
        implementation_owner=implementation_owner,
        domain_owner=domain_owner,
        direct_dependents=direct_dependents,
        possible_downstreams=possible_downstreams,
        db_change_needed=db_change_needed,
        api_change_needed=api_change_needed,
        ui_change_needed=ui_change_needed,
        likely_paths_by_repo=likely_paths_by_repo,
        validation_commands=validation_commands,
        ordered_steps=ordered_steps,
        requires_human_approval=requires_human_approval,
    )


def format_feature_plan(plan: FeaturePlan) -> str:
    """Render plan output as deterministic JSON."""

    return json.dumps(plan.model_dump(mode="python"), indent=2, sort_keys=False)
