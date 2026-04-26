"""Deterministic feature intake and clarification draft generation."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import DiscoverySnapshot, RepoDiscovery
from app.models.feature_intake import (
    FeatureIntake,
    IntakeApiEndpointDefault,
    IntakeBackendObjectDefault,
    IntakeFieldDefault,
    ProposedFeatureDefaults,
    RepoCapabilitySummary,
)
from app.services.concept_grounding import ConceptGroundingService
from app.services.feature_intent_classifier import FeatureIntentClassifier
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService
from app.services.text_normalization import normalize_text, tokenize_text
from workspace_control.models import ConceptGrounding, InventoryRow

RETRIEVAL_TERMS = {"list", "query", "read", "retrieve", "view"}


def create_feature_intake(
    feature_request: str,
    rows: Sequence[InventoryRow],
    *,
    scan_root: Path | None = None,
    discovery_snapshot: DiscoverySnapshot | None = None,
) -> FeatureIntake:
    """Create a structured, deterministic intake draft before planning."""

    effective_rows = RepoProfileBootstrapService().effective_inventory_for_scan(
        rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    intents = FeatureIntentClassifier().classify(feature_request)
    concepts = ConceptGroundingService().ground(
        feature_request,
        effective_rows,
        scan_root=scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    capability_summary = _repo_capability_summary(effective_rows, discovery_snapshot)
    new_domain_candidates = _new_domain_candidates(concepts)
    proposed_defaults = _proposed_defaults(
        feature_request,
        intents,
        new_domain_candidates,
    )
    missing_details = _missing_details(
        feature_request,
        intents,
        new_domain_candidates,
        capability_summary,
        proposed_defaults,
    )
    questions = _clarifying_questions(
        intents,
        new_domain_candidates,
        capability_summary,
        proposed_defaults,
    )
    caveats = _caveats(new_domain_candidates, capability_summary, missing_details)

    return FeatureIntake(
        feature_request=feature_request,
        detected_intents=intents,
        confidence=_confidence(new_domain_candidates, missing_details, capability_summary),
        new_domain_candidates=new_domain_candidates,
        grounded_concepts=[
            item
            for item in concepts
            if item.status in {"direct_match", "alias_match", "weak_match"}
        ],
        ungrounded_concepts=[
            item
            for item in concepts
            if item.status in {"ungrounded", "ungrounded_new_domain_candidate"}
        ],
        repo_capability_summary=capability_summary,
        proposed_defaults=proposed_defaults,
        missing_details=missing_details,
        clarifying_questions=questions,
        can_generate_plan=not missing_details,
        caveats=caveats,
    )


def format_feature_intake_json(intake: FeatureIntake) -> str:
    """Render intake output as stable JSON for CLI and UI use."""

    return json.dumps(intake.model_dump(mode="python"), indent=2, sort_keys=False)


def _repo_capability_summary(
    rows: Sequence[InventoryRow],
    discovery_snapshot: DiscoverySnapshot | None,
) -> RepoCapabilitySummary:
    frontend_available = False
    backend_available = False
    persistence_available = False
    frameworks: list[str] = []

    for row in rows:
        row_type = row.type.lower()
        row_language = row.language.lower()
        if any(token in row_type for token in ("frontend", "ui", "web", "client")):
            frontend_available = True
        if any(token in row_type for token in ("backend", "service", "api", "server")):
            backend_available = True
        if row.owns_tables or any(token in row.domain.lower() for token in ("data", "database")):
            persistence_available = True
        if row_language in {"java", "typescript", "javascript"}:
            frameworks.append(row_language)

    for repo in discovery_snapshot.report.repos if discovery_snapshot is not None else []:
        frameworks.extend(repo.detected_frameworks)
        frameworks.extend(repo.loaded_framework_packs)
        if _repo_has_frontend(repo):
            frontend_available = True
        if _repo_has_backend(repo):
            backend_available = True
        if _repo_has_persistence(repo):
            persistence_available = True

    return RepoCapabilitySummary(
        frontend_available=frontend_available,
        backend_available=backend_available,
        persistence_available=persistence_available,
        detected_frameworks=_dedupe(frameworks),
    )


def _repo_has_frontend(repo: RepoDiscovery) -> bool:
    repo_type = repo.repo_type.lower()
    frameworks = set(repo.detected_frameworks) | set(repo.loaded_framework_packs)
    return bool(
        repo.likely_ui_locations
        or repo.hinted_ui_locations
        or {"react", "angular"} & frameworks
        or any(token in repo_type for token in ("frontend", "ui", "web", "client"))
    )


def _repo_has_backend(repo: RepoDiscovery) -> bool:
    repo_type = repo.repo_type.lower()
    frameworks = set(repo.detected_frameworks) | set(repo.loaded_framework_packs)
    backend_framework = bool({"spring_boot", "openapi"} & frameworks)
    backend_type = any(token in repo_type for token in ("backend", "service", "api", "server"))
    frontend_only = (
        any(token in repo_type for token in ("frontend", "ui", "web", "client"))
        or bool({"react", "angular"} & frameworks)
    ) and not backend_framework and not backend_type
    if frontend_only:
        return False
    return bool(
        repo.likely_service_locations
        or repo.hinted_service_locations
        or backend_framework
        or backend_type
        or ((repo.likely_api_locations or repo.hinted_api_locations) and (backend_framework or backend_type))
    )


def _repo_has_persistence(repo: RepoDiscovery) -> bool:
    return bool(
        repo.likely_persistence_locations
        or repo.hinted_persistence_locations
        or "repository" in " ".join(repo.framework_hints).lower()
    )


def _new_domain_candidates(concepts: Sequence[ConceptGrounding]) -> list[str]:
    return _dedupe(
        [
            item.concept
            for item in concepts
            if item.status == "ungrounded_new_domain_candidate"
        ]
    )


def _proposed_defaults(
    feature_request: str,
    intents: Sequence[str],
    new_domain_candidates: Sequence[str],
) -> ProposedFeatureDefaults:
    if not new_domain_candidates:
        return ProposedFeatureDefaults()

    concept = new_domain_candidates[0]
    if concept == "contact":
        return _contact_defaults(feature_request, intents)

    class_name = _class_name(concept)
    route = f"/{concept.replace(' ', '-')}"
    return ProposedFeatureDefaults(
        route_path=route,
        page_name=f"{class_name}Page" if "ui" in intents else None,
        form_name=f"{class_name}Form" if "ui" in intents else None,
        domain_model_name=class_name,
        api_endpoints=[
            IntakeApiEndpointDefault(
                method="POST",
                path=f"/api/{concept.replace(' ', '-')}",
                purpose=f"Create {concept} records",
            )
        ]
        if "api" in intents
        else [],
        backend_objects=_backend_objects(class_name, include_repository="persistence" in intents),
    )


def _contact_defaults(feature_request: str, intents: Sequence[str]) -> ProposedFeatureDefaults:
    tokens = tokenize_text(feature_request)
    include_repository = "persistence" in intents
    route_path = "/contact-us"
    endpoints = [
        IntakeApiEndpointDefault(
            method="POST",
            path="/api/contact-submissions",
            purpose="Submit contact form data",
        )
    ]
    if tokens & RETRIEVAL_TERMS:
        endpoints.append(
            IntakeApiEndpointDefault(
                method="GET",
                path="/api/contact-submissions",
                purpose="Retrieve/list contact submissions",
            )
        )

    return ProposedFeatureDefaults(
        route_path=route_path,
        page_name="ContactUsPage",
        form_name="ContactForm",
        domain_model_name="Contact",
        fields=[
            IntakeFieldDefault(name="name", type="string", required=True),
            IntakeFieldDefault(name="email", type="string", required=True),
            IntakeFieldDefault(name="message", type="string", required=True),
            IntakeFieldDefault(name="createdAt", type="datetime", required=False),
        ],
        api_endpoints=endpoints if "api" in intents else [],
        backend_objects=_backend_objects("Contact", include_repository=include_repository)
        if "api" in intents or include_repository
        else [],
    )


def _backend_objects(
    class_name: str,
    *,
    include_repository: bool,
) -> list[IntakeBackendObjectDefault]:
    objects = [
        IntakeBackendObjectDefault(name=f"{class_name}Controller", kind="api_controller"),
        IntakeBackendObjectDefault(name=f"{class_name}Request", kind="request_dto"),
        IntakeBackendObjectDefault(name=f"{class_name}Response", kind="response_dto"),
        IntakeBackendObjectDefault(name=f"{class_name}Service", kind="service_layer"),
        IntakeBackendObjectDefault(name=class_name, kind="domain_model"),
    ]
    if include_repository:
        objects.append(
            IntakeBackendObjectDefault(
                name=f"{class_name}Repository",
                kind="repository",
            )
        )
    return objects


def _missing_details(
    feature_request: str,
    intents: Sequence[str],
    new_domain_candidates: Sequence[str],
    capability_summary: RepoCapabilitySummary,
    defaults: ProposedFeatureDefaults,
) -> list[str]:
    if not new_domain_candidates:
        return []

    missing = [
        "Fields to collect/persist are not confirmed.",
        "Route/path is only a suggested default.",
        "Backend object/request/response shape is not confirmed.",
    ]
    tokens = tokenize_text(feature_request)
    if "persistence" in intents:
        missing.append("Database table, migration, and retention behavior are not confirmed.")
    elif "api" in intents:
        missing.append("Storage requirement is not confirmed; backend objects may be API-only unless persistence is requested.")
    if tokens & RETRIEVAL_TERMS:
        missing.append("Retrieval/list behavior, filters, and access controls are not confirmed.")
    else:
        missing.append("Whether an admin retrieval/list API or UI is needed is not confirmed.")
    if "ui" in intents and defaults.form_name:
        missing.append("Form validation and success/error behavior are not confirmed.")
    if ("api" in intents or "persistence" in intents) and not capability_summary.backend_available:
        missing.append(
            "Backend/API work requested but no backend-capable target is registered."
        )
    if "persistence" in intents and not capability_summary.persistence_available:
        missing.append("Persistence was requested, but no migration/repository capability was detected.")
    return _dedupe(missing)


def _clarifying_questions(
    intents: Sequence[str],
    new_domain_candidates: Sequence[str],
    capability_summary: RepoCapabilitySummary,
    defaults: ProposedFeatureDefaults,
) -> list[str]:
    if not new_domain_candidates:
        return []

    questions = [
        "What fields should be collected?",
        "Should submissions be stored in the database?",
        "Should there be a retrieval/list API?",
        "Should there be an admin UI for viewing submissions?",
        "What route should the page use?",
    ]
    if "api" in intents:
        questions.append("What request and response shape should the API expose?")
    if "persistence" in intents:
        questions.append("What database table name, migration style, and retention rules should be used?")
    if not capability_summary.backend_available:
        questions.append("Which backend or monorepo target should handle the API/persistence work?")
    if defaults.fields:
        questions.append(
            "Can we use the suggested default fields: "
            + ", ".join(field.name for field in defaults.fields)
            + "?"
        )
    return _dedupe(questions)


def _caveats(
    new_domain_candidates: Sequence[str],
    capability_summary: RepoCapabilitySummary,
    missing_details: Sequence[str],
) -> list[str]:
    caveats: list[str] = []
    if new_domain_candidates:
        caveats.append(
            "New-domain defaults are suggested intake assumptions, not confirmed implementation requirements."
        )
        caveats.append(
            "Generate a precise code plan after confirming the missing details or explicitly accepting defaults."
        )
    if any("no backend-capable target" in detail for detail in missing_details):
        caveats.append(
            "Register the monorepo root or backend repo before planning backend/API/persistence implementation."
        )
    if new_domain_candidates and capability_summary.backend_available:
        caveats.append(
            "Backend-capable source was detected, but the new domain concept is not grounded in existing source."
        )
    return _dedupe(caveats)


def _confidence(
    new_domain_candidates: Sequence[str],
    missing_details: Sequence[str],
    capability_summary: RepoCapabilitySummary,
) -> str:
    if any("no backend-capable target" in detail for detail in missing_details):
        return "low"
    if new_domain_candidates:
        return "medium" if capability_summary.backend_available else "low"
    if missing_details:
        return "medium"
    return "high"


def _class_name(value: str) -> str:
    return "".join(part.capitalize() for part in normalize_text(value).split())


def _dedupe(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
