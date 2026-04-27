"""Generate structured Plan Bundle artifacts for UI and handoff workflows."""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.discovery import DiscoverySnapshot, RepoDiscovery
from app.models.recipe_suggestion import RecipeSuggestionReport
from app.models.repo_learning import ChangeRecipe
from app.models.semantic_enrichment import SemanticEnrichmentResult
from app.models.source_graph import GraphNode
from app.services.repo_learning import DEFAULT_LEARNING_REPORT_ROOT, DEFAULT_LEARNING_ROOT, RepoLearningService
from app.services.repo_paths import repo_path_for
from app.services.repo_target_validator import RepoTargetValidator
from app.services.semantic_enrichment import semantic_intent_labels_for_result
from workspace_control.semantic import semantic_explanation_payload

from .models import ChangeProposal, CombinedRecommendation, FeatureImpact, FeaturePlan, InventoryRow

SCHEMA_VERSION = "1.0"
MAX_CHANGE_SET_ITEMS = 20
MAX_GRAPH_EVIDENCE = 12


class PlanBundleRepo(BaseModel):
    """Repository summary for rendering target cards."""

    repo_name: str
    metadata_mode: str
    evidence_mode: str
    detected_frameworks: list[str] = Field(default_factory=list)
    framework_packs: list[str] = Field(default_factory=list)


class PlanBundleTarget(BaseModel):
    """Target/workspace metadata for the bundle."""

    target_id: str | None = None
    repo_count: int
    selected_path: str | None = None
    suggested_root_path: str | None = None
    detected_repo_type: str | None = None
    detected_frameworks: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    repos: list[PlanBundleRepo] = Field(default_factory=list)


class PlanBundleSummary(BaseModel):
    """Top-level feature summary for UI display."""

    title: str
    short_description: str
    detected_intents: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"]
    planning_mode: str
    planner_native_available: bool
    recipe_assisted: bool
    new_domain_candidates: list[str] = Field(default_factory=list)
    backend_required: bool = False
    backend_available: bool = True
    missing_backend_required: bool = False


class PlanBundleOwnership(BaseModel):
    """Ownership fields copied from the deterministic feature plan."""

    primary_owner: str | None = None
    implementation_owner: str | None = None
    domain_owner: str | None = None
    direct_dependents: list[str] = Field(default_factory=list)
    possible_downstreams: list[str] = Field(default_factory=list)


class PlanBundleChangeItem(BaseModel):
    """One prioritized file or folder recommendation."""

    repo_name: str
    path: str
    action: Literal["modify", "inspect", "create", "inspect-only"]
    priority: int
    confidence: Literal["high", "medium", "low"]
    source: Literal["planner", "recipe", "semantic_enrichment", "both"]
    node_type: str = "unknown"
    reason: str
    evidence: list[str] = Field(default_factory=list)
    matched_recipe_id: str | None = None
    exists_in_current_source: bool = False
    ui_section: Literal["frontend", "backend", "api", "persistence", "config", "unknown"] = "unknown"


class PlanBundleRecipePattern(BaseModel):
    """Compact learned pattern details for one recipe."""

    created_node_types: list[str] = Field(default_factory=list)
    modified_node_types: list[str] = Field(default_factory=list)
    cochange_patterns: list[str] = Field(default_factory=list)


class PlanBundleRecipe(BaseModel):
    """Matched recipe evidence included in the bundle."""

    recipe_id: str
    recipe_type: str
    structural_confidence: float
    planner_effectiveness: float
    why_matched: list[str] = Field(default_factory=list)
    learned_patterns: PlanBundleRecipePattern = Field(default_factory=PlanBundleRecipePattern)


class PlanBundleGraphEvidence(BaseModel):
    """Compact relevant source graph node evidence."""

    repo_name: str
    path: str
    node_type: str
    domain_tokens: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    reason: str


class PlanBundleConceptGrounding(BaseModel):
    """Compact concept grounding row for UI/debug rendering."""

    concept: str
    status: str
    matched_terms: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


class PlanBundleValidation(BaseModel):
    """Validation commands and supporting notes."""

    commands: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class PlanBundleRisk(BaseModel):
    """Risk, caveat, or missing-evidence row."""

    severity: Literal["info", "warning", "high"] = "info"
    message: str
    source: Literal["planner", "recipe", "discovery", "graph", "semantic_enrichment"] = "planner"


class PlanBundleHandoffPrompt(BaseModel):
    """Repo-specific copy-paste prompt for a coding agent or engineer."""

    repo_name: str
    title: str
    prompt: str
    copy_label: str = "Copy prompt for Claude/Copilot/Codex"
    recommended_files: list[str] = Field(default_factory=list)
    validation_commands: list[str] = Field(default_factory=list)


class PlanBundleDebug(BaseModel):
    """Optional raw-ish pipeline excerpts for debugging."""

    included: bool = False
    pipeline: dict[str, Any] = Field(default_factory=dict)


class PlanBundle(BaseModel):
    """Structured Plan Bundle primary JSON contract."""

    schema_version: str = SCHEMA_VERSION
    feature_request: str
    generated_at: str
    target: PlanBundleTarget
    summary: PlanBundleSummary
    ownership: PlanBundleOwnership
    recommended_change_set: list[PlanBundleChangeItem] = Field(default_factory=list)
    matched_recipes: list[PlanBundleRecipe] = Field(default_factory=list)
    concept_grounding: list[PlanBundleConceptGrounding] = Field(default_factory=list)
    source_graph_evidence: list[PlanBundleGraphEvidence] = Field(default_factory=list)
    semantic_enrichment: dict[str, Any] = Field(default_factory=dict)
    semantic_missing_details: list[str] = Field(default_factory=list)
    semantic_clarifying_questions: list[str] = Field(default_factory=list)
    semantic_caveats: list[str] = Field(default_factory=list)
    validation: PlanBundleValidation = Field(default_factory=PlanBundleValidation)
    risks_and_caveats: list[PlanBundleRisk] = Field(default_factory=list)
    handoff_prompts: list[PlanBundleHandoffPrompt] = Field(default_factory=list)
    debug: PlanBundleDebug = Field(default_factory=PlanBundleDebug)


def create_plan_bundle(
    *,
    feature_request: str,
    target_id: str | None,
    rows: Sequence[InventoryRow],
    impacts: Sequence[FeatureImpact],
    plan: FeaturePlan,
    proposal: ChangeProposal,
    discovery_snapshot: DiscoverySnapshot | None,
    recipe_report: RecipeSuggestionReport | None,
    include_debug: bool = False,
    generated_at: datetime | None = None,
    recipe_catalog: Sequence[ChangeRecipe] | None = None,
    semantic_result: SemanticEnrichmentResult | None = None,
) -> PlanBundle:
    """Create a UI-friendly Plan Bundle from existing pipeline outputs."""

    graph_nodes = _graph_nodes_by_repo_path(discovery_snapshot)
    recipes_by_id = {recipe.id: recipe for recipe in (recipe_catalog or [])}
    change_set = _recommended_change_set(
        proposal.combined_recommendations,
        discovery_snapshot=discovery_snapshot,
        graph_nodes=graph_nodes,
    )
    matched_recipes = _matched_recipes(recipe_report, recipes_by_id, semantic_result=semantic_result)
    risks = _risks_and_caveats(plan, proposal, recipe_report)
    target = _target_summary(target_id, rows, discovery_snapshot)
    summary = _summary(feature_request, plan, proposal, recipe_report)
    validation = PlanBundleValidation(
        commands=list(plan.validation_commands),
        notes=_validation_notes(plan),
    )
    graph_evidence = _source_graph_evidence(change_set, graph_nodes)
    handoffs = _handoff_prompts(
        feature_request=feature_request,
        change_set=change_set,
        plan=plan,
        matched_recipes=matched_recipes,
        validation_commands=validation.commands,
        risks=risks,
    )
    debug = _debug_payload(
        include_debug,
        impacts=impacts,
        plan=plan,
        proposal=proposal,
        recipe_report=recipe_report,
        discovery_snapshot=discovery_snapshot,
    )
    return PlanBundle(
        feature_request=feature_request,
        generated_at=_timestamp_text(generated_at),
        target=target,
        summary=summary,
        ownership=PlanBundleOwnership(
            primary_owner=plan.primary_owner,
            implementation_owner=plan.implementation_owner,
            domain_owner=plan.domain_owner,
            direct_dependents=list(plan.direct_dependents),
            possible_downstreams=list(plan.possible_downstreams),
        ),
        recommended_change_set=change_set,
        matched_recipes=matched_recipes,
        concept_grounding=_concept_grounding(plan),
        source_graph_evidence=graph_evidence,
        semantic_enrichment=semantic_explanation_payload(semantic_result),
        semantic_missing_details=list(plan.semantic_missing_details or proposal.semantic_missing_details),
        semantic_clarifying_questions=list(plan.semantic_clarifying_questions or proposal.semantic_clarifying_questions),
        semantic_caveats=list(plan.semantic_caveats or proposal.semantic_caveats),
        validation=validation,
        risks_and_caveats=risks,
        handoff_prompts=handoffs,
        debug=debug,
    )


def load_recipe_catalog_for_bundle(target_id: str | None, registry) -> list[ChangeRecipe]:
    """Load repo-local recipes for enriching matched recipe pattern details."""

    if not target_id:
        return []
    try:
        service = RepoLearningService(
            registry=registry,
            learning_root=DEFAULT_LEARNING_ROOT,
            report_root=DEFAULT_LEARNING_REPORT_ROOT,
        )
        return service.recipes_for_target(target_id)
    except (OSError, ValueError):
        return []


def format_plan_bundle_json(bundle: PlanBundle) -> str:
    """Render bundle as stable JSON."""

    return json.dumps(bundle.model_dump(mode="python"), indent=2, sort_keys=False)


def format_plan_bundle_markdown(bundle: PlanBundle) -> str:
    """Render Markdown from the same structured Plan Bundle object."""

    lines = [
        "# Plan Bundle",
        "",
        "## Feature Request",
        bundle.feature_request,
        "",
        "## Summary",
        f"- detected intents: {_comma(bundle.summary.detected_intents)}",
        f"- new domain candidates: {_comma(bundle.summary.new_domain_candidates)}",
        f"- implementation owner: `{bundle.ownership.implementation_owner or '-'}`",
        f"- domain owner: `{bundle.ownership.domain_owner or '-'}`",
        f"- confidence: `{bundle.summary.confidence}`",
        f"- planning mode: `{bundle.summary.planning_mode}`",
        f"- planner native available: `{bundle.summary.planner_native_available}`",
        f"- recipe assisted: `{bundle.summary.recipe_assisted}`",
        f"- backend required: `{bundle.summary.backend_required}`",
        f"- backend available: `{bundle.summary.backend_available}`",
        f"- missing backend required: `{bundle.summary.missing_backend_required}`",
        f"- selected path: `{bundle.target.selected_path or '-'}`",
        f"- suggested root path: `{bundle.target.suggested_root_path or '-'}`",
        f"- detected repo type: `{bundle.target.detected_repo_type or '-'}`",
        "",
        "## Ownership",
        f"- primary owner: `{bundle.ownership.primary_owner or '-'}`",
        f"- implementation owner: `{bundle.ownership.implementation_owner or '-'}`",
        f"- domain owner: `{bundle.ownership.domain_owner or '-'}`",
        f"- direct dependents: {_comma(bundle.ownership.direct_dependents)}",
        f"- possible downstreams: {_comma(bundle.ownership.possible_downstreams)}",
        "",
        "## Recommended Change Set",
        "",
        "| priority | repo | path | action | confidence | source | reason |",
        "|---:|---|---|---|---|---|---|",
    ]
    if bundle.recommended_change_set:
        for item in bundle.recommended_change_set:
            lines.append(
                "| "
                + " | ".join(
                    [
                        str(item.priority),
                        _md_code(item.repo_name),
                        _md_code(item.path),
                        item.action,
                        item.confidence,
                        item.source,
                        _escape_table(item.reason),
                    ]
                )
                + " |"
            )
    else:
        lines.append("| - | - | - | - | - | - | No concrete recommendations. |")

    lines.extend(["", "## Recipe Evidence"])
    if bundle.matched_recipes:
        for recipe in bundle.matched_recipes:
            lines.extend(
                [
                    "",
                    f"### `{recipe.recipe_id}`",
                    f"- type: `{recipe.recipe_type}`",
                    f"- structural confidence: `{recipe.structural_confidence}`",
                    f"- planner effectiveness: `{recipe.planner_effectiveness}`",
                    f"- why matched: {_comma(recipe.why_matched)}",
                    f"- created node types: {_comma(recipe.learned_patterns.created_node_types)}",
                    f"- modified node types: {_comma(recipe.learned_patterns.modified_node_types)}",
                    f"- cochange patterns: {_comma(recipe.learned_patterns.cochange_patterns)}",
                ]
            )
    else:
        lines.extend(["", "No matched recipes."])

    lines.extend(["", "## Source Graph Evidence"])
    if bundle.source_graph_evidence:
        for node in bundle.source_graph_evidence:
            lines.append(
                f"- `{node.repo_name}` `{node.path}` ({node.node_type}, {node.confidence}): {node.reason}; tokens={_comma(node.domain_tokens)}"
            )
    else:
        lines.append("No compact source graph evidence available.")

    lines.extend(["", "## Semantic Missing Details"])
    if bundle.semantic_missing_details:
        lines.extend(f"- {detail}" for detail in bundle.semantic_missing_details)
    else:
        lines.append("- none")

    lines.extend(["", "## Semantic Clarifying Questions"])
    if bundle.semantic_clarifying_questions:
        lines.extend(f"- {question}" for question in bundle.semantic_clarifying_questions)
    else:
        lines.append("- none")

    lines.extend(["", "## Validation Commands"])
    if bundle.validation.commands:
        lines.extend(f"- `{command}`" for command in bundle.validation.commands)
    else:
        lines.append("- none discovered")

    lines.extend(["", "## Risks / Missing Evidence"])
    if bundle.risks_and_caveats:
        lines.extend(
            f"- **{risk.severity}** `{risk.source}`: {risk.message}"
            for risk in bundle.risks_and_caveats
        )
    else:
        lines.append("- none")

    lines.extend(["", "## Coding Agent Handoff Prompt"])
    for handoff in bundle.handoff_prompts:
        lines.extend(["", f"### {handoff.repo_name}", "", "```text", handoff.prompt, "```"])
    if not bundle.handoff_prompts:
        lines.append("No handoff prompts generated.")
    lines.append("")
    return "\n".join(lines)


def _target_summary(
    target_id: str | None,
    rows: Sequence[InventoryRow],
    snapshot: DiscoverySnapshot | None,
) -> PlanBundleTarget:
    repos = snapshot.report.repos if snapshot is not None else []
    if repos:
        repo_items = [_repo_summary(repo) for repo in repos]
    else:
        repo_items = [
            PlanBundleRepo(
                repo_name=row.repo_name,
                metadata_mode="metadata-only",
                evidence_mode="metadata-only",
                detected_frameworks=[],
                framework_packs=[],
            )
            for row in rows
        ]
    validation = None
    if snapshot is not None and snapshot.target.source == "local_path":
        validation = RepoTargetValidator().validate_local_path(snapshot.workspace.root_path)
    return PlanBundleTarget(
        target_id=target_id,
        repo_count=len(repo_items),
        selected_path=validation.selected_path if validation is not None else None,
        suggested_root_path=validation.suggested_root_path if validation is not None else None,
        detected_repo_type=validation.detected_repo_type if validation is not None else None,
        detected_frameworks=validation.detected_frameworks if validation is not None else [],
        warnings=validation.warnings if validation is not None else [],
        repos=repo_items,
    )


def _repo_summary(repo: RepoDiscovery) -> PlanBundleRepo:
    frameworks = _dedupe([*repo.detected_frameworks, *repo.hinted_frameworks])
    return PlanBundleRepo(
        repo_name=repo.repo_name,
        metadata_mode=repo.evidence_mode,
        evidence_mode=repo.evidence_mode,
        detected_frameworks=frameworks,
        framework_packs=list(repo.loaded_framework_packs),
    )


def _summary(
    feature_request: str,
    plan: FeaturePlan,
    proposal: ChangeProposal,
    recipe_report: RecipeSuggestionReport | None,
) -> PlanBundleSummary:
    planner_native_available = any(item.files for item in proposal.proposed_changes)
    recipe_assisted = bool(recipe_report and (recipe_report.matched_recipes or recipe_report.suggestions))
    semantic_assisted = bool(plan.recipe_confidence_summary.get("semantic_enrichment"))
    if planner_native_available and recipe_assisted and semantic_assisted:
        planning_mode = "planner+recipe+semantic"
    elif planner_native_available and semantic_assisted:
        planning_mode = "planner+semantic"
    elif recipe_assisted and semantic_assisted:
        planning_mode = "recipe+semantic"
    elif semantic_assisted:
        planning_mode = "semantic-assisted"
    elif planner_native_available and recipe_assisted:
        planning_mode = "planner+recipe"
    elif recipe_assisted:
        planning_mode = "recipe-assisted"
    elif planner_native_available:
        planning_mode = "planner-native"
    else:
        planning_mode = "low-evidence"
    return PlanBundleSummary(
        title=_title_from_feature(feature_request),
        short_description=f"Plan bundle for: {feature_request}",
        detected_intents=list(plan.feature_intents),
        confidence=plan.confidence,
        planning_mode=planning_mode,
        planner_native_available=planner_native_available,
        recipe_assisted=recipe_assisted,
        new_domain_candidates=_new_domain_candidates(plan),
        backend_required=_backend_required(plan),
        backend_available=not _missing_backend_required(plan),
        missing_backend_required=_missing_backend_required(plan),
    )


def _recommended_change_set(
    recommendations: Sequence[CombinedRecommendation],
    *,
    discovery_snapshot: DiscoverySnapshot | None,
    graph_nodes: dict[tuple[str, str], GraphNode],
) -> list[PlanBundleChangeItem]:
    items: list[PlanBundleChangeItem] = []
    for priority, recommendation in enumerate(recommendations[:MAX_CHANGE_SET_ITEMS], start=1):
        node = graph_nodes.get((recommendation.repo_name, recommendation.path))
        node_type = node.node_type if node is not None else _node_type_from_evidence(recommendation.evidence)
        items.append(
            PlanBundleChangeItem(
                repo_name=recommendation.repo_name,
                path=recommendation.path,
                action=recommendation.action,
                priority=priority,
                confidence=recommendation.confidence,
                source=recommendation.source,
                node_type=node_type,
                reason=_reason_for_recommendation(recommendation),
                evidence=list(recommendation.evidence[:6]),
                matched_recipe_id=recommendation.matched_recipe_id,
                exists_in_current_source=_exists_in_current_source(discovery_snapshot, recommendation),
                ui_section=_ui_section(recommendation.path, node_type),
            )
        )
    return items


def _matched_recipes(
    recipe_report: RecipeSuggestionReport | None,
    recipes_by_id: dict[str, ChangeRecipe],
    *,
    semantic_result: SemanticEnrichmentResult | None = None,
) -> list[PlanBundleRecipe]:
    if recipe_report is None:
        return []
    items: list[PlanBundleRecipe] = []
    for match in recipe_report.matched_recipes:
        if _semantic_should_hide_recipe_match(match.recipe_type, match.score, semantic_result):
            continue
        recipe = recipes_by_id.get(match.recipe_id)
        items.append(
            PlanBundleRecipe(
                recipe_id=match.recipe_id,
                recipe_type=match.recipe_type,
                structural_confidence=match.structural_confidence,
                planner_effectiveness=match.planner_effectiveness,
                why_matched=list(match.why_matched[:6]),
                learned_patterns=PlanBundleRecipePattern(
                    created_node_types=list((recipe.created_node_types if recipe else [])[:8]),
                    modified_node_types=list((recipe.modified_node_types if recipe else [])[:8]),
                    cochange_patterns=list((recipe.cochange_patterns or list(recipe.cochange_counts))[:8] if recipe else []),
                ),
            )
        )
    return items


def _semantic_should_hide_recipe_match(
    recipe_type: str,
    score: int,
    semantic_result: SemanticEnrichmentResult | None,
) -> bool:
    if semantic_result is None:
        return False
    labels = set(semantic_intent_labels_for_result(semantic_result))
    if not ({"file_upload", "media_upload"} & labels):
        return False
    if any(token in recipe_type for token in ("upload", "media", "picture", "photo", "image")):
        return False
    return score < 70 or recipe_type in {"backend_validation_change", "backend_api_change"}


def _source_graph_evidence(
    change_set: Sequence[PlanBundleChangeItem],
    graph_nodes: dict[tuple[str, str], GraphNode],
) -> list[PlanBundleGraphEvidence]:
    evidence: list[PlanBundleGraphEvidence] = []
    seen: set[tuple[str, str]] = set()
    for item in change_set:
        key = (item.repo_name, item.path)
        node = graph_nodes.get(key)
        if node is None or key in seen:
            continue
        seen.add(key)
        evidence.append(
            PlanBundleGraphEvidence(
                repo_name=node.repo_name,
                path=node.path,
                node_type=node.node_type,
                domain_tokens=list(node.domain_tokens[:8]),
                confidence=node.confidence,
                reason=f"Recommended change-set item {item.priority} maps to source graph node `{node.node_type}`.",
            )
        )
        if len(evidence) >= MAX_GRAPH_EVIDENCE:
            break
    return evidence


def _concept_grounding(plan: FeaturePlan) -> list[PlanBundleConceptGrounding]:
    return [
        PlanBundleConceptGrounding(
            concept=item.concept,
            status=item.status,
            matched_terms=list(item.matched_terms[:6]),
            sources=list(item.sources[:6]),
        )
        for item in plan.concept_grounding
    ]


def _risks_and_caveats(
    plan: FeaturePlan,
    proposal: ChangeProposal,
    recipe_report: RecipeSuggestionReport | None,
) -> list[PlanBundleRisk]:
    risks: list[PlanBundleRisk] = []
    for message in plan.missing_evidence:
        risks.append(
            PlanBundleRisk(
                severity=_risk_severity(message),
                message=message,
                source="planner",
            )
        )
    for message in proposal.missing_evidence:
        if message not in {risk.message for risk in risks}:
            risks.append(PlanBundleRisk(severity="warning", message=message, source="planner"))
    for detail in plan.semantic_missing_details or proposal.semantic_missing_details:
        risks.append(
            PlanBundleRisk(
                severity="warning",
                message=detail,
                source="semantic_enrichment",
            )
        )
    for caveat in plan.semantic_caveats or proposal.semantic_caveats:
        risks.append(
            PlanBundleRisk(
                severity="info",
                message=caveat,
                source="semantic_enrichment",
            )
        )
    if _new_domain_candidates(plan):
        risks.append(
            PlanBundleRisk(
                severity="warning",
                message=(
                    "Feature intake should confirm fields, route/path, API/retrieval behavior, "
                    "and persistence defaults before precise implementation."
                ),
                source="planner",
            )
        )
    if not any(item.files for item in proposal.proposed_changes) and (
        proposal.recipe_suggestions
        or (recipe_report is not None and bool(recipe_report.matched_recipes))
    ):
        risks.append(
            PlanBundleRisk(
                severity="warning",
                message="Planner-native output was weak; recipe evidence provided fallback suggestions.",
                source="recipe",
            )
        )
    if recipe_report is not None:
        for message in recipe_report.caveats[:4]:
            risks.append(PlanBundleRisk(severity="info", message=message, source="recipe"))
        for message in recipe_report.missing_evidence[:4]:
            risks.append(PlanBundleRisk(severity="warning", message=message, source="recipe"))
    return _dedupe_risks(risks)


def _risk_severity(message: str) -> str:
    if (
        "No backend/API/persistence-capable repo" in message
        or "Backend/API work requested but no backend-capable target is registered" in message
    ):
        return "high"
    return "warning"


def _missing_backend_required(plan: FeaturePlan) -> bool:
    return any(
        "No backend/API/persistence-capable repo" in message
        or "Backend/API work requested but no backend-capable target is registered" in message
        for message in plan.missing_evidence
    )


def _backend_required(plan: FeaturePlan) -> bool:
    return bool(plan.api_change_needed or plan.db_change_needed)


def _new_domain_candidates(plan: FeaturePlan) -> list[str]:
    return [
        item.concept
        for item in plan.concept_grounding
        if item.status == "ungrounded_new_domain_candidate"
    ]


def _handoff_prompts(
    *,
    feature_request: str,
    change_set: Sequence[PlanBundleChangeItem],
    plan: FeaturePlan,
    matched_recipes: Sequence[PlanBundleRecipe],
    validation_commands: Sequence[str],
    risks: Sequence[PlanBundleRisk],
) -> list[PlanBundleHandoffPrompt]:
    by_repo: dict[str, list[PlanBundleChangeItem]] = {}
    for item in change_set:
        by_repo.setdefault(item.repo_name, []).append(item)
    prompts: list[PlanBundleHandoffPrompt] = []
    for repo_name in sorted(by_repo):
        repo_items = sorted(by_repo[repo_name], key=lambda item: item.priority)
        files = [item.path for item in repo_items]
        prompt = _handoff_prompt_text(
            repo_name=repo_name,
            feature_request=feature_request,
            items=repo_items,
            plan=plan,
            matched_recipes=matched_recipes,
            validation_commands=validation_commands,
            risks=risks,
        )
        prompts.append(
            PlanBundleHandoffPrompt(
                repo_name=repo_name,
                title=f"Implement: {_title_from_feature(feature_request)}",
                prompt=prompt,
                recommended_files=files,
                validation_commands=list(validation_commands),
            )
        )
    return prompts


def _handoff_prompt_text(
    *,
    repo_name: str,
    feature_request: str,
    items: Sequence[PlanBundleChangeItem],
    plan: FeaturePlan,
    matched_recipes: Sequence[PlanBundleRecipe],
    validation_commands: Sequence[str],
    risks: Sequence[PlanBundleRisk],
) -> str:
    recipe_lines = [
        f"- {recipe.recipe_id} ({recipe.recipe_type}, structural={recipe.structural_confidence:.2f}, planner={recipe.planner_effectiveness:.2f})"
        for recipe in matched_recipes[:3]
    ]
    expected = _expected_changes(items, plan, matched_recipes)
    caveats = [risk.message for risk in risks if risk.severity in {"warning", "high"}][:4]
    lines = [
        f"You are working in repo: {repo_name}.",
        "",
        "Task:",
        feature_request,
        "",
        "Context:",
    ]
    if recipe_lines:
        lines.append("This repo has matched learned recipe evidence:")
        lines.extend(recipe_lines)
    else:
        lines.append("Use the planner-native recommendations and source graph evidence below.")
    semantic_labels = set(plan.feature_intents)
    if {"file_upload", "media_upload"} & semantic_labels:
        lines.append("This feature likely requires UI + backend API + storage/persistence work.")
    lines.extend(["", "Inspect first:"])
    for index, item in enumerate(items, start=1):
        lines.append(f"{index}. {item.path} ({item.action}, {item.confidence}, source={item.source})")
    lines.extend(["", "Expected change:"])
    lines.extend(f"- {line}" for line in expected)
    lines.extend(
        [
            "",
            "Constraints:",
            "- Keep the change scoped to the requested feature.",
            "- Do not overreach into unrelated domains or broad refactors.",
            "- Treat inspect-only or low-confidence files as reference material unless code evidence says otherwise.",
        ]
    )
    if any(
        "Backend/API work requested but no backend-capable target is registered" in risk.message
        for risk in risks
    ):
        lines.append("- Do not attempt backend implementation in this repo; register the monorepo root or backend repo for complete implementation.")
    if {"file_upload", "media_upload"} & set(plan.feature_intents):
        lines.append("- Decide storage strategy before implementation: DB metadata + filesystem/object storage vs DB blob vs external URL.")
    lines.extend(["", "Validation:"])
    if validation_commands:
        lines.extend(f"- {command}" for command in validation_commands)
    else:
        lines.append("- Run the repo's normal build/test command if available.")
    if caveats:
        lines.extend(["", "Caveats:"])
        lines.extend(f"- {message}" for message in caveats)
    return "\n".join(lines)


def _expected_changes(
    items: Sequence[PlanBundleChangeItem],
    plan: FeaturePlan,
    matched_recipes: Sequence[PlanBundleRecipe],
) -> list[str]:
    lines: list[str] = []
    if _new_domain_candidates(plan):
        frontend_paths = [item.path for item in items if item.ui_section == "frontend" and item.action == "create"][:3]
        backend_paths = [item.path for item in items if item.ui_section in {"api", "backend", "persistence"} and item.action == "create"][:5]
        if frontend_paths:
            lines.append(f"Frontend: add the new domain page/form surface such as {_join_paths(frontend_paths)}.")
        if backend_paths:
            lines.append(f"Backend/API: add the new domain API/object surfaces such as {_join_paths(backend_paths)}.")
    if {"file_upload", "media_upload"} & set(plan.feature_intents):
        lines.extend(_media_upload_expected_changes(items))
    recipe_types = {recipe.recipe_type for recipe in matched_recipes}
    if "ui_page_add" in recipe_types:
        lines.extend(_ui_page_add_expected_changes(items))
    if "ui_form_validation" in recipe_types:
        lines.extend(_ui_form_validation_expected_changes(items))
    if "ui_shell_layout" in recipe_types:
        lines.extend(_ui_shell_expected_changes(items))
    if "backend_search_query" in recipe_types:
        lines.extend(_backend_search_expected_changes(items))
    if "backend_validation_change" in recipe_types:
        lines.extend(_backend_validation_expected_changes(items))
    if "full_stack_ui_api" in recipe_types:
        lines.extend(_full_stack_expected_changes(items))
    if any(item.action == "create" for item in items):
        lines.append("Add the requested new source surface only where evidence supports it.")
    if any(item.action == "modify" for item in items):
        lines.append("Modify the high-confidence files that directly own the requested flow or behavior.")
    if any(item.ui_section == "frontend" for item in items):
        lines.append("Keep frontend/UI work focused on the requested screen, page, route, or component.")
    if any(item.ui_section in {"api", "backend"} for item in items):
        lines.append("Keep backend/API work limited to the relevant controller/service/query surface.")
    if plan.feature_intents == ["ui"]:
        lines.append("Keep this UI-only; do not add backend/API behavior unless new code evidence requires it.")
    if not lines:
        lines.append("Inspect the recommended files first and make the smallest justified change.")
    return _dedupe(lines)


def _media_upload_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    frontend_paths = [item.path for item in items if item.ui_section == "frontend"][:5]
    backend_paths = [item.path for item in items if item.ui_section in {"api", "backend", "persistence"}][:6]
    lines = [
        "Add file input and preview behavior in the pet editor/create/edit surfaces.",
        "Decide storage strategy before implementation: DB metadata + filesystem/object storage vs DB blob vs external URL.",
        "Update backend pet API behavior to accept or reference picture uploads.",
        "Persist image metadata or storage references only if the chosen storage design requires it.",
        "Update display surfaces only where the product requires the pet picture to appear.",
    ]
    if frontend_paths:
        lines.append(f"Frontend candidates include {_join_paths(frontend_paths)}.")
    if backend_paths:
        lines.append(f"Backend/API/persistence candidates include {_join_paths(backend_paths)}.")
    return lines


def _ui_page_add_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    lines = ["Add or update the requested page/component surface."]
    route_paths = _paths_matching(items, ("route", "routes", "router", "configure"))
    type_paths = _paths_matching(items, ("types", "type"))
    nearby_pages = [
        item.path
        for item in items
        if item.ui_section == "frontend"
        and item.action != "create"
        and item.node_type in {"page_component", "edit_surface", "form_component", "route_page"}
        and "page" in item.path.lower()
        and item.priority > 1
    ][:3]
    if route_paths:
        lines.append(f"Wire it into {_join_paths(route_paths[:2])}.")
    else:
        lines.append("Wire it into the existing route configuration if this app uses explicit routes.")
    if type_paths:
        lines.append(f"Inspect/update frontend types only if needed in {_join_paths(type_paths[:2])}.")
    if nearby_pages:
        lines.append(f"Use nearby same-domain pages like {_join_paths(nearby_pages)} as references.")
    return lines


def _ui_form_validation_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    form_paths = _paths_by_node_type(items, {"form_component", "edit_surface", "page_component"})[:3]
    lines = ["Update field-level validation or visual feedback on the relevant form/page surface."]
    if form_paths:
        lines.append(f"Start with form/page files such as {_join_paths(form_paths)}.")
    lines.append("Avoid treating generic error or not-found pages as field-validation owners unless code evidence requires it.")
    return lines


def _ui_shell_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    shell_paths = _paths_by_node_type(items, {"app_shell", "frontend_entrypoint", "landing_page", "public_html", "static_asset"})[:5]
    lines = ["Update the UI shell, entrypoint, landing page, and public assets only where the request calls for them."]
    if shell_paths:
        lines.append(f"Prioritize shell/landing surfaces such as {_join_paths(shell_paths)}.")
    return lines


def _backend_search_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    repo_paths = _paths_by_node_type(items, {"repository", "migration"})[:4]
    service_paths = _paths_by_node_type(items, {"service_layer", "api_controller", "api_contract"})[:4]
    lines = ["Update the search/query behavior at the repository/query surface first."]
    if repo_paths:
        lines.append(f"Inspect query or persistence files such as {_join_paths(repo_paths)}.")
    if service_paths:
        lines.append(f"Then verify service/API callers such as {_join_paths(service_paths)} only as needed.")
    return lines


def _backend_validation_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    validation_paths = _paths_by_node_type(items, {"api_dto", "domain_model", "api_controller", "api_contract"})[:4]
    lines = ["Apply validation constraints at the narrowest request/model/API surface that owns the field."]
    if validation_paths:
        lines.append(f"Prioritize validation-relevant files such as {_join_paths(validation_paths)}.")
    return lines


def _full_stack_expected_changes(items: Sequence[PlanBundleChangeItem]) -> list[str]:
    frontend_paths = [item.path for item in items if item.ui_section == "frontend"][:3]
    backend_paths = [item.path for item in items if item.ui_section in {"api", "backend"}][:3]
    lines = ["Coordinate frontend behavior with the backend/API surface, but keep each change scoped."]
    if frontend_paths:
        lines.append(f"Update frontend surfaces such as {_join_paths(frontend_paths)} only for the requested flow.")
    if backend_paths:
        lines.append(f"Update backend/API surfaces such as {_join_paths(backend_paths)} only if the contract or error handling requires it.")
    return lines


def _paths_matching(items: Sequence[PlanBundleChangeItem], tokens: Sequence[str]) -> list[str]:
    lowered_tokens = tuple(token.lower() for token in tokens)
    return [
        item.path
        for item in items
        if any(token in item.path.lower() or token in item.node_type.lower() for token in lowered_tokens)
    ]


def _paths_by_node_type(items: Sequence[PlanBundleChangeItem], node_types: set[str]) -> list[str]:
    return [item.path for item in items if item.node_type in node_types]


def _join_paths(paths: Sequence[str]) -> str:
    return ", ".join(f"`{path}`" for path in paths)


def _validation_notes(plan: FeaturePlan) -> list[str]:
    notes: list[str] = []
    if not plan.validation_commands:
        notes.append("No validation commands were discovered for this plan.")
    return notes


def _debug_payload(
    include_debug: bool,
    *,
    impacts: Sequence[FeatureImpact],
    plan: FeaturePlan,
    proposal: ChangeProposal,
    recipe_report: RecipeSuggestionReport | None,
    discovery_snapshot: DiscoverySnapshot | None,
) -> PlanBundleDebug:
    if not include_debug:
        return PlanBundleDebug(included=False)
    return PlanBundleDebug(
        included=True,
        pipeline={
            "impacts": [item.model_dump(mode="python") for item in impacts],
            "plan": plan.model_dump(mode="python"),
            "proposal_counts": {
                "proposed_changes": len(proposal.proposed_changes),
                "recipe_suggestions": len(proposal.recipe_suggestions),
                "combined_recommendations": len(proposal.combined_recommendations),
            },
            "recipe_report": recipe_report.model_dump(mode="python") if recipe_report else None,
            "source_graph": {
                "node_count": len(discovery_snapshot.source_graph.nodes) if discovery_snapshot and discovery_snapshot.source_graph else 0,
                "edge_count": len(discovery_snapshot.source_graph.edges) if discovery_snapshot and discovery_snapshot.source_graph else 0,
            },
        },
    )


def _graph_nodes_by_repo_path(snapshot: DiscoverySnapshot | None) -> dict[tuple[str, str], GraphNode]:
    if snapshot is None or snapshot.source_graph is None:
        return {}
    return {(node.repo_name, node.path): node for node in snapshot.source_graph.nodes}


def _exists_in_current_source(snapshot: DiscoverySnapshot | None, item: CombinedRecommendation) -> bool:
    if snapshot is None:
        return False
    candidate = repo_path_for(snapshot.workspace.root_path, item.repo_name) / item.path
    return candidate.exists()


def _node_type_from_evidence(evidence: Sequence[str]) -> str:
    for item in evidence:
        if item.startswith("source graph node: "):
            return item.removeprefix("source graph node: ").strip() or "unknown"
    return "unknown"


def _reason_for_recommendation(item: CombinedRecommendation) -> str:
    for evidence in item.evidence:
        if evidence and not evidence.startswith("repo: ") and not evidence.startswith("source graph node: "):
            return evidence
    if item.source == "both":
        return "Planner and recipe evidence both point to this path."
    if item.source == "recipe":
        return "Recipe evidence points to this path."
    if item.source == "semantic_enrichment":
        return "Semantic enrichment evidence points to this path."
    return "Planner evidence points to this path."


def _ui_section(path: str, node_type: str) -> str:
    lowered = path.lower()
    if node_type in {"frontend_entrypoint", "app_shell", "landing_page", "route_page", "page_component", "edit_surface", "form_component", "detail_component", "list_component", "shared_component", "frontend_type", "static_asset", "public_html"}:
        if "config" in lowered or "route" in lowered:
            return "config"
        return "frontend"
    if node_type in {"api_contract", "api_controller", "api_dto"}:
        return "api"
    if node_type in {"domain_model", "repository", "migration"}:
        return "persistence"
    if node_type in {"service_layer", "event_publisher", "event_consumer", "mapper"}:
        return "backend"
    if any(token in lowered for token in ("package.json", "pom.xml", "build.gradle", "config", "route")):
        return "config"
    if any(token in lowered for token in ("client/", "frontend/", ".tsx", ".jsx")):
        return "frontend"
    if any(token in lowered for token in ("controller", "openapi", "api")):
        return "api"
    if any(token in lowered for token in ("repository", "model", "entity", "migration", ".sql")):
        return "persistence"
    if any(token in lowered for token in ("service", "integration", "event")):
        return "backend"
    return "unknown"


def _dedupe_risks(risks: Sequence[PlanBundleRisk]) -> list[PlanBundleRisk]:
    seen: set[tuple[str, str]] = set()
    ordered: list[PlanBundleRisk] = []
    for risk in risks:
        key = (risk.source, risk.message)
        if key in seen:
            continue
        seen.add(key)
        ordered.append(risk)
    return ordered


def _title_from_feature(feature_request: str) -> str:
    title = " ".join(feature_request.strip().split())
    if len(title) > 80:
        return title[:77].rstrip() + "..."
    return title or "Feature Plan"


def _timestamp_text(timestamp: datetime | None) -> str:
    current = timestamp or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(UTC).isoformat(timespec="seconds")


def _dedupe(items: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _comma(items: Sequence[Any]) -> str:
    values = [str(item) for item in items if item not in (None, "")]
    return ", ".join(values) if values else "-"


def _md_code(value: str) -> str:
    return "`" + value.replace("`", "") + "`"


def _escape_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")
