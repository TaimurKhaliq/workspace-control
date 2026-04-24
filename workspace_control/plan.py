import json
import re
from collections.abc import Sequence

from .analyze import analyze_feature
from .models import FeatureImpact, FeaturePlan, InventoryRow

FRONTEND_HINTS = {"screen", "page", "button", "form", "modal", "settings", "ui", "frontend"}
BACKEND_HINTS = {
    "api",
    "endpoint",
    "controller",
    "service",
    "validation",
    "response",
    "request",
}
DATA_HINTS = {"database", "persist", "store", "table", "column", "migration", "schema", "sql"}


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


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


def _infer_likely_paths(
    row: InventoryRow, role: str, *, db_change_needed: bool, ui_change_needed: bool
) -> list[str]:
    paths: list[str] = ["stackpilot.yml"]

    if _row_is_frontend(row):
        paths.extend(["src/pages/profile", "src/components/profile", "src/services"])
    elif _row_is_backend(row):
        if row.language.lower() == "java":
            paths.extend(["src/main/java", "src/test/java"])
        elif row.language.lower() == "python":
            paths.extend(["app", "tests"])
        else:
            paths.extend(["src", "tests"])

    if db_change_needed and (role == "primary-owner" or "data" in row.type.lower()):
        paths.extend(["migrations", "db/schema"])

    if role == "possible-downstream":
        paths.extend(["src/events", "src/integrations"])

    if ui_change_needed and _row_is_frontend(row):
        paths.append("src/api")

    return _dedupe_preserve_order(paths)


def create_feature_plan(
    feature_request: str,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact] | None = None,
) -> FeaturePlan:
    """Build a deterministic feature plan from impact analysis."""

    resolved_impacts = list(impacts) if impacts is not None else analyze_feature(feature_request, rows)
    by_repo = {row.repo_name: row for row in rows}
    feature_tokens = _tokenize(feature_request)

    primary_owner = next(
        (impact.repo_name for impact in resolved_impacts if impact.role == "primary-owner"),
        None,
    )
    direct_dependents = [
        impact.repo_name for impact in resolved_impacts if impact.role == "direct-dependent"
    ]
    possible_downstreams = [
        impact.repo_name for impact in resolved_impacts if impact.role == "possible-downstream"
    ]

    ui_change_needed = bool(feature_tokens & FRONTEND_HINTS) or any(
        _row_is_frontend(by_repo[repo]) for repo in direct_dependents if repo in by_repo
    )
    api_change_needed = bool(feature_tokens & BACKEND_HINTS) or any(
        _row_is_backend(by_repo[impact.repo_name]) for impact in resolved_impacts if impact.repo_name in by_repo
    )
    db_change_needed = bool(feature_tokens & DATA_HINTS)

    likely_paths_by_repo: dict[str, list[str]] = {}
    validation_commands: list[str] = []

    for impact in resolved_impacts:
        row = by_repo.get(impact.repo_name)
        if row is None:
            continue

        likely_paths_by_repo[impact.repo_name] = _infer_likely_paths(
            row,
            impact.role,
            db_change_needed=db_change_needed,
            ui_change_needed=ui_change_needed,
        )

        if impact.role != "weak-match":
            validation_commands.extend(row.build_commands)
            validation_commands.extend(row.test_commands)

    validation_commands = _dedupe_preserve_order(validation_commands)

    ordered_steps: list[str] = []
    if primary_owner is not None:
        owner_impact = next(
            (impact for impact in resolved_impacts if impact.repo_name == primary_owner),
            None,
        )
        owner_score = owner_impact.score if owner_impact is not None else 0
        ordered_steps.append(
            f"Implement primary-owner changes in {primary_owner} (role=primary-owner, score={owner_score})."
        )

    if api_change_needed:
        ordered_steps.append("Update API request/response contracts and validation.")
    if ui_change_needed:
        ordered_steps.append("Update UI flow and client-side profile interactions.")
    if db_change_needed:
        ordered_steps.append("Apply database/schema updates and verify compatibility.")

    for repo_name in direct_dependents:
        impact = next(
            (candidate for candidate in resolved_impacts if candidate.repo_name == repo_name),
            None,
        )
        if impact is None:
            continue
        ordered_steps.append(
            f"Apply direct-dependent updates in {repo_name} (role={impact.role}, score={impact.score})."
        )

    for repo_name in possible_downstreams:
        impact = next(
            (candidate for candidate in resolved_impacts if candidate.repo_name == repo_name),
            None,
        )
        if impact is None:
            continue
        ordered_steps.append(
            f"Apply possible-downstream sync/integration updates in {repo_name} "
            f"(role={impact.role}, score={impact.score})."
        )

    if validation_commands:
        ordered_steps.append("Run validation commands in impacted repos.")

    requires_human_approval = db_change_needed or bool(possible_downstreams)

    return FeaturePlan(
        feature_request=feature_request,
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
