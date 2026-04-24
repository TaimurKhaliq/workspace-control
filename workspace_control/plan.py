import json
import re
from collections.abc import Sequence
from pathlib import Path

from .analyze import analyze_feature
from .models import FeatureImpact, FeaturePlan, InventoryRow

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

MIN_RELEVANT_SCORE = 5

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


def _filter_impacts_for_plan(
    feature_request: str,
    impacts: Sequence[FeatureImpact],
    by_repo: dict[str, InventoryRow],
    feature_intents: Sequence[str],
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

        if ui_only_intent and _row_is_backend(row) and not explicit_reference:
            role = "weak-match"
            score = min(score, MIN_RELEVANT_SCORE - 1)
            reason = f"{reason}; downgraded for UI-only intent"

        if role == "possible-downstream" and not has_event_intent and not explicit_reference:
            continue

        if role == "weak-match":
            continue

        if score < MIN_RELEVANT_SCORE and role != "primary-owner":
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


def _promote_primary_owner_if_missing(impacts: list[FeatureImpact]) -> list[FeatureImpact]:
    if not impacts:
        return impacts
    if any(impact.role == "primary-owner" for impact in impacts):
        return impacts

    top = impacts[0]
    impacts[0] = FeatureImpact(
        repo_name=top.repo_name,
        role="primary-owner",
        score=top.score,
        reason=f"{top.reason}; promoted to primary-owner for intent alignment",
    )
    return impacts


def _infer_likely_paths(
    row: InventoryRow,
    role: str,
    *,
    repo_dir: Path | None,
    db_change_needed: bool,
    ui_change_needed: bool,
    event_integration_mode: bool,
) -> list[str]:
    paths: list[str] = ["stackpilot.yml"]

    if _row_is_backend(row):
        backend_existing = _existing_candidate_paths(repo_dir, BACKEND_PATH_CANDIDATES)
        if backend_existing:
            paths.extend(backend_existing)
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

        if role == "possible-downstream" and event_integration_mode:
            downstream_existing = _existing_candidate_paths(
                repo_dir, DOWNSTREAM_PATH_CANDIDATES
            )
            if downstream_existing:
                paths.extend(downstream_existing)
            else:
                paths.extend(["src/events", "src/integrations"])

    elif _row_is_frontend(row):
        frontend_existing = _existing_candidate_paths(repo_dir, FRONTEND_PATH_CANDIDATES)
        if frontend_existing:
            paths.extend(frontend_existing)
        else:
            paths.extend(FRONTEND_PATH_FALLBACKS)

        if ui_change_needed and "src/forms" not in paths and "forms" not in paths:
            paths.append("src/forms")

    return _dedupe_preserve_order(paths)


def _primary_owner_step(
    repo_name: str,
    row: InventoryRow,
    *,
    score: int,
    db_change_needed: bool,
    api_change_needed: bool,
    feature_intents: set[str],
) -> str:
    if _row_is_backend(row):
        if "event_integration" in feature_intents:
            step = (
                f"In {repo_name} (primary-owner, score={score}), implement event emission/publish logic, "
                "define payload/schema mapping, add the trigger point in service flow, and determine whether "
                "an outbox/producer/integration path is needed."
            )
            if db_change_needed:
                return (
                    f"{step[:-1]} Also update entity/repository persistence handling and migration files."
                )
            return step

        if api_change_needed and db_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update API request/response contracts, "
                "implement service/controller validation logic, and adjust entity/repository + migration handling."
            )
        if api_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update API request/response contracts, "
                "implement controller/service validation flow, and verify DTO mapping compatibility."
            )
        if db_change_needed:
            return (
                f"In {repo_name} (primary-owner, score={score}), update service logic, entity/repository "
                "persistence mappings, and add migration/changelog updates."
            )
        return (
            f"In {repo_name} (primary-owner, score={score}), implement service-level feature logic and "
            "review entity/repository mappings for impact."
        )

    if _row_is_frontend(row):
        return (
            f"In {repo_name} (primary-owner, score={score}), update profile page/form state handling, "
            "UI copy, validation messaging, and client service wiring."
        )

    return (
        f"In {repo_name} (primary-owner, score={score}), implement core feature logic and "
        "update internal module contracts."
    )


def _direct_dependent_step(
    repo_name: str,
    row: InventoryRow,
    *,
    score: int,
    feature_intents: set[str],
    api_change_needed: bool,
) -> str:
    if _row_is_frontend(row):
        if "ui" in feature_intents:
            return (
                f"In {repo_name} (direct-dependent, score={score}), update pages/components/forms, "
                "client request payload handling, and submission/error states."
            )
        return (
            f"In {repo_name} (direct-dependent, score={score}), verify client service wiring and "
            "compatibility with owner repo changes."
        )

    if "event_integration" in feature_intents:
        return (
            f"In {repo_name} (direct-dependent, score={score}), update integration service hooks, "
            "request adapters, and compatibility checks with owner event payloads."
        )

    if api_change_needed:
        return (
            f"In {repo_name} (direct-dependent, score={score}), update request/response handling and "
            "compatibility checks with owner APIs."
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
) -> str:
    if event_integration_mode:
        return (
            f"In {repo_name} (possible-downstream, score={score}), determine whether "
            "consumer/subscriber/integration changes are needed; if impacted, update event handlers, "
            "payload mapping, and downstream integration coverage."
        )

    return (
        f"In {repo_name} (possible-downstream, score={score}), determine whether sync/integration updates "
        "are needed; if impacted, update publish/consume payload mappings and integration coverage."
    )


def create_feature_plan(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
    *,
    scan_root: Path | None = None,
) -> FeaturePlan:
    """Build a deterministic feature plan from impact analysis."""

    resolved_impacts = (
        list(impacts) if impacts is not None else analyze_feature(feature_request, rows)
    )
    by_repo = {row.repo_name: row for row in rows}
    feature_intents = _classify_feature_intents(feature_request)
    event_integration_mode = "event_integration" in feature_intents

    filtered_impacts = _filter_impacts_for_plan(
        feature_request, resolved_impacts, by_repo, feature_intents
    )
    filtered_impacts = _promote_primary_owner_if_missing(filtered_impacts)

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

    ui_change_needed = "ui" in feature_intents
    db_change_needed = "persistence" in feature_intents
    api_change_needed = _api_contract_change_requested(feature_request)

    likely_paths_by_repo: dict[str, list[str]] = {}
    validation_commands: list[str] = []

    for impact in filtered_impacts:
        row = by_repo.get(impact.repo_name)
        if row is None:
            continue

        repo_dir = (scan_root / impact.repo_name) if scan_root is not None else None
        likely_paths_by_repo[impact.repo_name] = _infer_likely_paths(
            row,
            impact.role,
            repo_dir=repo_dir,
            db_change_needed=db_change_needed,
            ui_change_needed=ui_change_needed,
            event_integration_mode=event_integration_mode,
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
                feature_intents=feature_intents_set,
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
            )
        )

    if validation_commands:
        ordered_steps.append(
            "Run validation commands in impacted repos: "
            + " ; ".join(validation_commands)
            + "."
        )

    requires_human_approval = db_change_needed or bool(possible_downstreams)

    return FeaturePlan(
        feature_request=feature_request,
        feature_intents=feature_intents,
        primary_owner=primary_owner,
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
