"""Recipe-informed sidecar suggestions built from repo-local learning state."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import DiscoverySnapshot
from app.models.recipe_suggestion import (
    MatchedRecipe,
    RecipeLikelyAction,
    RecipeSuggestionReport,
)
from app.models.repo_learning import ChangeRecipe
from app.models.source_graph import GraphNode, SourceGraph
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.feature_intent_classifier import FeatureIntentClassifier
from app.services.repo_learning import DEFAULT_LEARNING_REPORT_ROOT, DEFAULT_LEARNING_ROOT, RepoLearningService
from app.services.text_normalization import normalize_text, split_identifiers, tokenize_text

ACTIVE_RECIPE_STATUSES = {"active", "candidate", "weak"}
REQUEST_STOPWORDS = {
    "a",
    "action",
    "actions",
    "add",
    "allow",
    "and",
    "been",
    "build",
    "create",
    "for",
    "from",
    "has",
    "in",
    "field",
    "fields",
    "list",
    "new",
    "no",
    "of",
    "on",
    "persist",
    "query",
    "read",
    "retrieve",
    "save",
    "the",
    "to",
    "yet",
}
NOISY_TRIGGER_TERMS = {"action", "actions", "been", "has", "yet"}
PAGE_SUFFIXES = ("Page", "Form", "Editor", "Details", "Detail", "List", "Table")
UI_PAGE_TERMS = {"page", "screen", "view"}
UI_CREATE_TERMS = {"add", "create", "new"}
# "field"/"fields" alone is too broad for validation recipes; new-domain
# form creation prompts often mention fields without implying validation work.
UI_FORM_VALIDATION_TERMS = {"error", "errors", "feedback", "invalid", "required", "validation", "validate"}
UI_SHELL_TERMS = {"app", "assets", "home", "landing", "layout", "shell", "welcome"}
BACKEND_API_TERMS = {"api", "controller", "endpoint", "rest", "search"}
BACKEND_VALIDATION_TERMS = {
    "constraint",
    "constraints",
    "max",
    "min",
    "notnull",
    "null",
    "range",
    "regex",
    "required",
    "validation",
}
SEARCH_QUERY_TERMS = {"case", "caseinsensitive", "filter", "find", "insensitive", "lookup", "query", "search"}
CASE_INSENSITIVE_TERMS = {"caseinsensitive", "ignorecase", "insensitive", "lower", "upper"}
PERSISTENCE_TERMS = {"database", "entity", "field", "migration", "model", "persist", "repository", "store"}
PERSISTENCE_STRONG_TERMS = {"database", "entity", "migration", "model", "persist", "repository", "store"}
FULL_STACK_TERMS = {"error", "handling", "missing", "page", "validation"}
ROUTE_PATH_TERMS = {"configureroutes", "route", "routes", "router"}
DOMAIN_SUFFIX_TOKENS = {
    "component",
    "details",
    "detail",
    "editor",
    "field",
    "fields",
    "form",
    "layout",
    "page",
    "screen",
    "table",
    "view",
}
DOMAIN_ENTITY_TOKENS = {"customer", "owner", "pet", "specialty", "user", "vet", "visit"}
RECIPE_SPECIFICITY = {
    "backend_search_query": 90,
    "backend_validation_change": 85,
    "ui_form_validation": 85,
    "ui_shell_layout": 80,
    "ui_page_add": 75,
    "full_stack_ui_api": 70,
    "persistence_data_change": 60,
    "backend_api_change": 40,
}


class RecipeSuggestionService:
    """Suggest likely change patterns from learned recipes without changing planning."""

    def __init__(
        self,
        *,
        registry: DiscoveryTargetRegistry,
        learning_root: Path = DEFAULT_LEARNING_ROOT,
        report_root: Path = DEFAULT_LEARNING_REPORT_ROOT,
    ) -> None:
        self.registry = registry
        self.learning_root = learning_root
        self.report_root = report_root

    def suggest(
        self,
        target_id: str,
        feature_request: str,
        *,
        allowed_statuses: set[str] | None = None,
        min_structural_confidence: float = 0.0,
    ) -> RecipeSuggestionReport:
        """Return deterministic recipe-informed suggestions for one target."""

        statuses = allowed_statuses or ACTIVE_RECIPE_STATUSES
        learning = RepoLearningService(
            registry=self.registry,
            learning_root=self.learning_root,
            report_root=self.report_root,
        )
        recipes = [
            recipe
            for recipe in learning.recipes_for_target(target_id)
            if recipe.status in statuses
            and recipe.structural_confidence >= min_structural_confidence
        ]
        record = self.registry.get(target_id)
        snapshot = ArchitectureDiscoveryService().discover(record.to_target())
        graph = snapshot.source_graph
        missing_evidence: list[str] = []
        caveats: list[str] = [
            "Recipe suggestions are deterministic repo-local guidance; planner-native output remains visible separately.",
        ]
        if not recipes:
            missing_evidence.append(f"no active or candidate recipes found for target {target_id}")
        if graph is None or not graph.nodes:
            missing_evidence.append("no source graph nodes available for current target")

        matched = match_recipes(feature_request, recipes, graph)
        if recipes and not matched:
            caveats.append("No learned recipe crossed the deterministic match threshold for this request.")

        suggestions: list[RecipeLikelyAction] = []
        if graph is not None:
            actionable_matches: list[MatchedRecipe] = []
            for match in matched:
                recipe = next(recipe for recipe in recipes if recipe.id == match.recipe_id)
                recipe_actions = actions_for_recipe(feature_request, recipe, match, snapshot, graph)
                if recipe_actions:
                    actionable_matches.append(match)
                    suggestions.extend(recipe_actions)
            if matched and not actionable_matches:
                missing_evidence.append("matched recipes did not map to concrete current source graph surfaces")
            matched = actionable_matches
        suggestions = _dedupe_actions(suggestions)

        return RecipeSuggestionReport(
            feature_request=feature_request,
            target_id=target_id,
            matched_recipes=matched,
            suggestions=suggestions,
            missing_evidence=missing_evidence,
            caveats=caveats,
        )


def match_recipes(
    feature_request: str,
    recipes: Sequence[ChangeRecipe],
    graph: SourceGraph | None,
    *,
    threshold: int = 25,
) -> list[MatchedRecipe]:
    """Match feature request terms and graph concepts to learned recipe types."""

    request_tokens = request_token_set(feature_request)
    intents = set(FeatureIntentClassifier().classify(feature_request))
    graph_tokens = {
        token
        for node in (graph.nodes if graph is not None else [])
        for token in node.domain_tokens
    }
    domain_overlap = sorted(
        token
        for token in (request_tokens | singular_tokens(request_tokens)) & graph_tokens
        if token not in REQUEST_STOPWORDS and token not in DOMAIN_SUFFIX_TOKENS
    )
    matches: list[MatchedRecipe] = []
    for recipe in recipes:
        score, reasons = recipe_match_score(
            recipe,
            request_tokens=request_tokens,
            intents=intents,
            domain_overlap=domain_overlap,
        )
        if score < threshold:
            continue
        reasons.append(f"structural confidence {recipe.structural_confidence:.2f}")
        if recipe.planner_effectiveness < 0.5:
            reasons.append("planner effectiveness is low, so this recipe is useful as future-improvement evidence")
        matches.append(
            MatchedRecipe(
                recipe_id=recipe.id,
                recipe_type=recipe.recipe_type,
                structural_confidence=recipe.structural_confidence,
                planner_effectiveness=recipe.planner_effectiveness,
                score=score,
                why_matched=reasons,
            )
        )
    matches = _prefer_specific_matches(matches)
    matches = sorted(
        matches,
        key=lambda item: (
            -RECIPE_SPECIFICITY.get(item.recipe_type, 0),
            -item.score,
            -item.structural_confidence,
            item.recipe_type,
            item.recipe_id,
        ),
    )
    return matches[:3]


def _prefer_specific_matches(matches: Sequence[MatchedRecipe]) -> list[MatchedRecipe]:
    """Drop generic recipe matches when a more specific archetype matched."""

    recipe_types = {match.recipe_type for match in matches}
    suppressed: set[str] = set()
    if "backend_search_query" in recipe_types:
        suppressed.update({"backend_api_change", "persistence_data_change"})
    if "backend_validation_change" in recipe_types:
        suppressed.add("backend_api_change")
    if "ui_form_validation" in recipe_types:
        suppressed.update({"ui_page_add"})
    if "ui_shell_layout" in recipe_types:
        suppressed.update({"ui_page_add"})
    return [match for match in matches if match.recipe_type not in suppressed]


def recipe_match_score(
    recipe: ChangeRecipe,
    *,
    request_tokens: set[str],
    intents: set[str],
    domain_overlap: Sequence[str],
) -> tuple[int, list[str]]:
    """Return deterministic score and human-readable reasons for one recipe."""

    score = int(recipe.structural_confidence * 20)
    reasons: list[str] = []
    type_specific = False
    trigger_overlap = sorted((request_tokens & set(recipe.trigger_terms)) - NOISY_TRIGGER_TERMS)
    if trigger_overlap:
        score += min(25, len(trigger_overlap) * 5)
        reasons.append(f"matched recipe trigger terms: {', '.join(trigger_overlap[:5])}")
    if domain_overlap:
        score += min(10, len(domain_overlap) * 3)
        reasons.append(f"source graph contains related domain token(s): {', '.join(domain_overlap[:5])}")

    if recipe.recipe_type == "ui_page_add" and is_ui_page_add_request(request_tokens):
        score += 50
        type_specific = True
        if "add" in request_tokens:
            reasons.append("request verb includes add")
        page_terms = sorted((request_tokens & {"page"}) | (set(domain_overlap) & request_tokens))
        if page_terms:
            reasons.append(f"identifier normalization exposes page-style term(s): {', '.join(page_terms[:5])}")
        reasons.append("request looks like UI page creation")
    elif recipe.recipe_type == "ui_form_validation" and request_tokens & UI_FORM_VALIDATION_TERMS:
        score += 45
        type_specific = True
        reasons.append("request mentions form validation or invalid-field feedback")
    elif recipe.recipe_type == "ui_shell_layout" and request_tokens & UI_SHELL_TERMS:
        score += 50
        type_specific = True
        reasons.append("request mentions UI shell, layout, welcome, or landing-page work")
    elif recipe.recipe_type == "backend_api_change" and request_tokens & BACKEND_API_TERMS:
        score += 45
        type_specific = True
        reasons.append("request mentions backend API surface terms")
    elif recipe.recipe_type == "backend_validation_change" and request_tokens & BACKEND_VALIDATION_TERMS:
        score += 48
        type_specific = True
        reasons.append("request mentions backend validation or constraint terms")
    elif recipe.recipe_type == "backend_search_query" and request_tokens & SEARCH_QUERY_TERMS:
        score += 48
        type_specific = True
        reasons.append("request mentions search/query behavior")
    elif recipe.recipe_type == "persistence_data_change" and request_tokens & PERSISTENCE_STRONG_TERMS:
        score += 40
        type_specific = True
        reasons.append("request mentions persisted data or model/repository terms")
    elif recipe.recipe_type == "full_stack_ui_api" and is_full_stack_hint(request_tokens):
        score += 40
        type_specific = True
        reasons.append("request combines UI surface terms with error/API-style change hints")

    if "ui" in intents and recipe.recipe_type.startswith("ui_"):
        score += 10
        reasons.append("feature intent includes ui")
    if "api" in intents and recipe.recipe_type in {"backend_api_change", "backend_validation_change", "backend_search_query", "full_stack_ui_api"}:
        score += 10
        reasons.append("feature intent includes api")
    if "persistence" in intents and recipe.recipe_type == "persistence_data_change":
        score += 10
        reasons.append("feature intent includes persistence")
    if not type_specific and len(trigger_overlap) < 2:
        score = min(score, 24)
    return score, reasons


def actions_for_recipe(
    feature_request: str,
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    snapshot: DiscoverySnapshot,
    graph: SourceGraph,
) -> list[RecipeLikelyAction]:
    """Apply one matched recipe to the current source graph."""

    request_tokens = request_token_set(feature_request)
    domain_tokens = domain_tokens_for_request(feature_request, graph)
    component_identifier = component_identifier_from_request(feature_request)
    actions: list[RecipeLikelyAction] = []

    if recipe.recipe_type == "ui_page_add":
        actions.extend(_ui_page_add_actions(recipe, match, graph, component_identifier, domain_tokens))
    elif recipe.recipe_type == "ui_form_validation":
        actions.extend(_ui_form_validation_actions(recipe, match, graph, domain_tokens, request_tokens, feature_request))
    elif recipe.recipe_type == "ui_shell_layout":
        actions.extend(_ui_shell_actions(recipe, match, graph, request_tokens))
    elif recipe.recipe_type == "backend_api_change":
        actions.extend(_backend_api_actions(recipe, match, graph, domain_tokens))
    elif recipe.recipe_type == "backend_validation_change":
        actions.extend(_backend_validation_actions(recipe, match, graph, domain_tokens, request_tokens))
    elif recipe.recipe_type == "backend_search_query":
        actions.extend(_backend_search_actions(recipe, match, graph, domain_tokens, request_tokens))
    elif recipe.recipe_type == "full_stack_ui_api":
        actions.extend(_ui_form_validation_actions(recipe, match, graph, domain_tokens, request_tokens, feature_request))
        actions.extend(_backend_api_actions(recipe, match, graph, domain_tokens))
    elif recipe.recipe_type == "persistence_data_change":
        actions.extend(_node_actions(match, graph, ("domain_model", "repository", "migration"), domain_tokens, action="modify"))

    return actions


def _ui_page_add_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    component_identifier: str | None,
    domain_tokens: set[str],
) -> list[RecipeLikelyAction]:
    actions: list[RecipeLikelyAction] = []
    if component_identifier:
        existing = _find_node_by_filename(graph, component_identifier)
        if existing is None:
            folder = infer_component_folder(graph, component_identifier, domain_tokens)
            if folder:
                actions.append(
                    RecipeLikelyAction(
                        matched_recipe_id=match.recipe_id,
                        node_type="page_component",
                        action="create",
                        suggested_path=f"{folder.rstrip('/')}/{component_identifier}.tsx",
                        confidence="high",
                        evidence=[
                            "request explicitly names a page/component identifier",
                            "recipe learned page creation patterns",
                            "suggested path is inferred from current graph sibling folders",
                        ],
                    )
                )
        else:
            actions.append(
                _action_for_node(
                    match,
                    existing,
                    "inspect",
                    "medium",
                    [
                        "requested page/component already exists in the current source graph",
                        "file already exists in current source graph; inspect/modify rather than create",
                    ],
                )
            )

    route_nodes = route_config_nodes(graph)
    for node in route_nodes[:1]:
        actions.append(
            _action_for_node(
                match,
                node,
                "modify",
                "high",
                ["recipe commonly modifies routing/configuration when adding pages"],
                node_type="route_config",
            )
        )
    if "frontend_type" in recipe.modified_node_types or "frontend_type" in recipe.changed_node_types:
        for node in _ranked_nodes(graph, ("frontend_type",), domain_tokens)[:1]:
            actions.append(
                _action_for_node(
                    match,
                    node,
                    "inspect",
                    "medium",
                    ["recipe often updates frontend types for page additions"],
                )
            )
    for node in _ranked_nodes(graph, ("page_component", "route_page"), domain_tokens)[:1]:
        actions.append(
            _action_for_node(
                match,
                node,
                "inspect",
                "medium",
                ["nearby page is useful as a pattern for the new page"],
            )
        )
    return actions


def _ui_form_validation_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    domain_tokens: set[str],
    request_tokens: set[str],
    feature_request: str,
) -> list[RecipeLikelyAction]:
    actions: list[RecipeLikelyAction] = []
    for node in _ranked_validation_nodes(
        graph,
        ("form_component", "edit_surface", "page_component"),
        domain_tokens,
        request_tokens,
        feature_request,
        recipe,
    )[:3]:
        action = "modify" if _has_validation_surface_signal(node) else "inspect"
        confidence = "high" if action == "modify" and node.node_type in {"form_component", "edit_surface"} else "medium"
        actions.append(
            _action_for_node(
                match,
                node,
                action,
                confidence,
                [
                    "field-validation recipe prefers components with form/input/field feedback evidence",
                    *_validation_metadata_evidence(node),
                ],
            )
        )
    if "frontend_type" in recipe.modified_node_types or "frontend_type" in recipe.changed_node_types:
        actions.extend(_node_actions(match, graph, ("frontend_type",), domain_tokens, action="inspect", confidence="medium", limit=1))
    return actions


def _ui_shell_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    request_tokens: set[str],
) -> list[RecipeLikelyAction]:
    actions: list[RecipeLikelyAction] = []
    for node_type, action, confidence, evidence in (
        ("app_shell", "modify", "high", "UI shell recipes usually change the app composition root"),
        ("frontend_entrypoint", "inspect", "medium", "entrypoint often needs review for shell/layout changes"),
        ("landing_page", "modify", "high", "request or recipe points to welcome/landing page work"),
        ("public_html", "inspect", "medium", "public HTML entry can be involved in shell changes"),
    ):
        actions.extend(
            _node_actions(
                match,
                graph,
                (node_type,),
                set(),
                action=action,
                confidence=confidence,
                limit=1,
                evidence=evidence,
            )
        )
    if request_tokens & {"asset", "assets", "image", "images", "static", "welcome", "layout"}:
        actions.extend(
            _node_actions(
                match,
                graph,
                ("static_asset",),
                set(),
                action="inspect",
                confidence="low",
                limit=1,
                evidence="static assets may support layout or welcome-page presentation",
            )
        )
    return actions


def _backend_api_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    domain_tokens: set[str],
) -> list[RecipeLikelyAction]:
    actions: list[RecipeLikelyAction] = []
    actions.extend(_node_actions(match, graph, ("api_controller",), domain_tokens, action="modify", confidence="high", limit=2))
    actions.extend(_node_actions(match, graph, ("service_layer",), domain_tokens, action="modify", confidence="medium", limit=2))
    actions.extend(_node_actions(match, graph, ("api_contract",), domain_tokens, action="inspect", confidence="medium", limit=1))
    return actions


def _backend_validation_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    domain_tokens: set[str],
    request_tokens: set[str],
) -> list[RecipeLikelyAction]:
    focus_tokens = domain_tokens | (request_tokens & BACKEND_VALIDATION_TERMS)
    actions: list[RecipeLikelyAction] = []
    actions.extend(
        _node_actions(
            match,
            graph,
            ("api_dto",),
            focus_tokens,
            action="modify",
            confidence="high",
            limit=2,
            evidence="backend validation recipes often update request/response DTO validation surfaces",
        )
    )
    actions.extend(
        _node_actions(
            match,
            graph,
            ("domain_model",),
            focus_tokens,
            action="modify",
            confidence="medium",
            limit=2,
            evidence="domain model may hold validation annotations or field constraints",
        )
    )
    actions.extend(
        _node_actions(
            match,
            graph,
            ("api_controller",),
            focus_tokens,
            action="inspect",
            confidence="medium",
            limit=1,
            evidence="controller may expose validation flow or binding-error handling",
        )
    )
    actions.extend(
        _node_actions(
            match,
            graph,
            ("api_contract",),
            focus_tokens,
            action="inspect",
            confidence="medium",
            limit=1,
            evidence="API contract may document validation constraints",
        )
    )
    return actions


def _backend_search_actions(
    recipe: ChangeRecipe,
    match: MatchedRecipe,
    graph: SourceGraph,
    domain_tokens: set[str],
    request_tokens: set[str],
) -> list[RecipeLikelyAction]:
    focus_tokens = domain_tokens | (request_tokens & SEARCH_QUERY_TERMS)
    actions: list[RecipeLikelyAction] = []
    case_sensitive_change = bool(request_tokens & CASE_INSENSITIVE_TERMS) or {"case", "insensitive"} <= request_tokens
    actions.extend(
        _search_node_actions(
            match,
            graph,
            ("repository",),
            focus_tokens,
            request_tokens,
            action="modify",
            confidence="high",
            limit=3,
            evidence="repository query/search metadata is the strongest match for backend search behavior",
        )
    )
    if case_sensitive_change or "migration" in recipe.modified_node_types or "migration" in recipe.changed_node_types:
        actions.extend(
            _search_node_actions(
                match,
                graph,
                ("migration",),
                focus_tokens,
                request_tokens,
                action="modify",
                confidence="high" if case_sensitive_change else "medium",
                limit=2,
                evidence="case-insensitive search can be backed by schema, seed, or DB collation changes",
            )
        )
    actions.extend(
        _search_node_actions(
            match,
            graph,
            ("service_layer",),
            focus_tokens,
            request_tokens,
            action="modify",
            confidence="medium",
            limit=2,
            evidence="service layer may coordinate search/query behavior",
        )
    )
    actions.extend(
        _search_node_actions(
            match,
            graph,
            ("api_controller", "api_dto"),
            focus_tokens,
            request_tokens,
            action="inspect",
            confidence="medium",
            limit=2,
            evidence="API surface may expose search/filter inputs",
        )
    )
    actions.extend(
        _search_node_actions(
            match,
            graph,
            ("api_contract",),
            focus_tokens,
            request_tokens,
            action="inspect",
            confidence="low",
            limit=1,
            evidence="API contract may document query parameters",
        )
    )
    return actions


def _search_node_actions(
    match: MatchedRecipe,
    graph: SourceGraph,
    node_types: Sequence[str],
    domain_tokens: set[str],
    request_tokens: set[str],
    *,
    action: str,
    confidence: str,
    limit: int,
    evidence: str,
) -> list[RecipeLikelyAction]:
    actions: list[RecipeLikelyAction] = []
    for node in _ranked_search_nodes(graph, node_types, domain_tokens, request_tokens)[:limit]:
        actions.append(
            _action_for_node(
                match,
                node,
                action,
                confidence,
                [evidence, *_query_metadata_evidence(node)],
            )
        )
    return actions


def _node_actions(
    match: MatchedRecipe,
    graph: SourceGraph,
    node_types: Sequence[str],
    domain_tokens: set[str],
    *,
    action: str,
    confidence: str = "medium",
    limit: int = 2,
    evidence: str | None = None,
) -> list[RecipeLikelyAction]:
    nodes = _ranked_nodes(graph, node_types, domain_tokens)[:limit]
    result: list[RecipeLikelyAction] = []
    for node in nodes:
        result.append(
            _action_for_node(
                match,
                node,
                action,
                confidence,
                [
                    evidence
                    or f"current source graph has a {node.node_type} surface matching the learned recipe"
                ],
            )
        )
    return result


def _action_for_node(
    match: MatchedRecipe,
    node: GraphNode,
    action: str,
    confidence: str,
    evidence: list[str],
    *,
    node_type: str | None = None,
) -> RecipeLikelyAction:
    return RecipeLikelyAction(
        matched_recipe_id=match.recipe_id,
        node_type=node_type or node.node_type,
        action=action,
        suggested_path=node.path,
        confidence=confidence,
        evidence=[*evidence, f"source graph node: {node.node_type}", f"repo: {node.repo_name}"],
    )


def _ranked_nodes(
    graph: SourceGraph,
    node_types: Sequence[str],
    domain_tokens: set[str],
) -> list[GraphNode]:
    candidates = [node for node in graph.nodes if node.node_type in node_types]
    return sorted(
        candidates,
        key=lambda node: (
            -node_relevance(node, domain_tokens),
            node.repo_name,
            node.path,
            node.node_type,
        ),
    )


def _ranked_search_nodes(
    graph: SourceGraph,
    node_types: Sequence[str],
    domain_tokens: set[str],
    request_tokens: set[str],
) -> list[GraphNode]:
    candidates = [node for node in graph.nodes if node.node_type in node_types]
    scored = [
        (search_node_relevance(node, domain_tokens, request_tokens), node)
        for node in candidates
    ]
    scored = [(score, node) for score, node in scored if score > 0]
    return [
        node
        for _score, node in sorted(
            scored,
            key=lambda item: (
                -item[0],
                item[1].repo_name,
                item[1].path,
                item[1].node_type,
            ),
        )
    ]


def _ranked_validation_nodes(
    graph: SourceGraph,
    node_types: Sequence[str],
    domain_tokens: set[str],
    request_tokens: set[str],
    feature_request: str,
    recipe: ChangeRecipe,
) -> list[GraphNode]:
    candidates = [node for node in graph.nodes if node.node_type in node_types]
    scored = [
        (validation_node_relevance(node, domain_tokens, request_tokens, feature_request, recipe), node)
        for node in candidates
    ]
    scored = [(score, node) for score, node in scored if score > 0]
    return [
        node
        for _score, node in sorted(
            scored,
            key=lambda item: (
                -item[0],
                item[1].repo_name,
                item[1].path,
                item[1].node_type,
            ),
        )
    ]


def validation_node_relevance(
    node: GraphNode,
    domain_tokens: set[str],
    request_tokens: set[str],
    feature_request: str,
    recipe: ChangeRecipe,
) -> int:
    path_tokens = path_token_set(node.path)
    node_tokens = set(node.domain_tokens) | path_tokens
    requested_entities = domain_tokens & DOMAIN_ENTITY_TOKENS
    path_entities = path_tokens & DOMAIN_ENTITY_TOKENS
    if requested_entities and path_entities and not (requested_entities & path_entities):
        return 0
    if _is_route_error_page(node) and not _explicit_error_route_request(feature_request):
        return 0

    score = 0
    if requested_entities and node_tokens & requested_entities:
        score += 45
    elif requested_entities:
        score -= 20

    if node.node_type == "form_component":
        score += 40
    elif node.node_type == "edit_surface":
        score += 35
    elif node.node_type == "page_component":
        score += 15

    if _metadata_true(node, "has_form_inputs"):
        score += 60
    if _metadata_true(node, "has_validation_terms"):
        score += 45
    if _metadata_true(node, "has_field_terms"):
        score += 35
    if _metadata_true(node, "has_error_feedback_terms") and request_tokens & UI_FORM_VALIDATION_TERMS:
        score += 30

    surface_tokens = path_tokens | set(node.domain_tokens)
    if surface_tokens & {"form", "editor", "edit", "new"}:
        score += 20
    if surface_tokens & {"find", "list", "search"} and not (request_tokens & SEARCH_QUERY_TERMS):
        score -= 50
    compact_path = re.sub(r"[^a-z0-9]+", "", node.path.lower())
    trigger_terms = {term for term in recipe.trigger_terms if len(term) > 4}
    if any(term in compact_path for term in trigger_terms):
        score += 55
    if surface_tokens & {"error", "notfound", "404"} and not _explicit_error_route_request(feature_request):
        score -= 30
    if not _has_validation_surface_signal(node) and node.node_type == "page_component":
        score -= 20
    return score


def search_node_relevance(node: GraphNode, domain_tokens: set[str], request_tokens: set[str]) -> int:
    path_tokens = path_token_set(node.path)
    metadata_tokens = _metadata_token_set(node, "search_terms") | _metadata_token_set(node, "method_names")
    node_tokens = set(node.domain_tokens) | path_tokens | metadata_tokens
    requested_entities = domain_tokens & DOMAIN_ENTITY_TOKENS
    path_entities = path_tokens & DOMAIN_ENTITY_TOKENS
    if requested_entities and path_entities and not (requested_entities & path_entities):
        return 0
    domain_overlap = node_tokens & domain_tokens
    score = node_relevance(node, domain_tokens)
    if domain_overlap:
        score += len(domain_overlap) * 25
    elif domain_tokens:
        score -= 30
    query_indicators = _metadata_values(node, "query_indicators")
    method_names = _metadata_values(node, "method_names")
    case_indicators = _metadata_values(node, "case_insensitive_indicators")
    if method_names:
        score += 20
    if query_indicators:
        score += 20
    if _metadata_token_set(node, "search_terms") & (domain_tokens | request_tokens):
        score += 20
    if case_indicators and (request_tokens & CASE_INSENSITIVE_TERMS or {"case", "insensitive"} <= request_tokens):
        score += 35
    if node.node_type == "repository":
        score += 15
    elif node.node_type == "migration" and case_indicators:
        score += 25
    elif node.node_type == "migration" and not case_indicators:
        score -= 20
    if node.node_type in {"api_controller", "api_dto", "service_layer"} and not (method_names or query_indicators or domain_overlap):
        score -= 20
    return score


def node_relevance(node: GraphNode, domain_tokens: set[str]) -> int:
    path_tokens = path_token_set(node.path)
    node_tokens = set(node.domain_tokens) | path_tokens
    overlap = node_tokens & domain_tokens
    score = len(overlap) * 20
    if node.confidence == "high":
        score += 5
    if not domain_tokens:
        return score
    if not overlap:
        score -= 10
    return score


def route_config_nodes(graph: SourceGraph) -> list[GraphNode]:
    return sorted(
        [
            node
            for node in graph.nodes
            if path_token_set(node.path) & ROUTE_PATH_TERMS
        ],
        key=lambda node: (node.repo_name, node.path),
    )


def infer_component_folder(
    graph: SourceGraph,
    component_identifier: str,
    domain_tokens: set[str],
) -> str | None:
    existing = _find_node_by_filename(graph, component_identifier)
    if existing is not None:
        return str(Path(existing.path).parent)
    sibling_nodes = _ranked_nodes(
        graph,
        ("page_component", "route_page", "form_component", "edit_surface", "shared_component"),
        domain_tokens,
    )
    if sibling_nodes:
        return str(Path(sibling_nodes[0].path).parent)
    frontend_nodes = [
        node
        for node in graph.nodes
        if node.node_type in {"page_component", "route_page", "shared_component", "app_shell"}
    ]
    if frontend_nodes:
        return str(Path(sorted(frontend_nodes, key=lambda item: (item.repo_name, item.path))[0].path).parent)
    return None


def _find_node_by_filename(graph: SourceGraph, filename_stem: str) -> GraphNode | None:
    expected_names = {f"{filename_stem}{suffix}" for suffix in (".tsx", ".jsx", ".ts", ".js")}
    matches = [node for node in graph.nodes if Path(node.path).name in expected_names or Path(node.path).stem == filename_stem]
    if not matches:
        return None
    return sorted(matches, key=lambda node: (node.repo_name, node.path))[0]


def component_identifier_from_request(feature_request: str) -> str | None:
    for match in re.finditer(r"\b[A-Z][A-Za-z0-9]*(?:Page|Form|Editor|Details|Detail|List|Table)\b", feature_request):
        return match.group(0)
    return None


def request_token_set(feature_request: str) -> set[str]:
    tokens = tokenize_text(feature_request)
    lowered = normalize_text(feature_request)
    if "case insensitive" in lowered:
        tokens.update({"caseinsensitive", "ignorecase", "query"})
    if "has been case insensitive" in lowered:
        tokens.update({"query", "search"})
    return tokens | singular_tokens(tokens)


def singular_tokens(tokens: set[str]) -> set[str]:
    normalized: set[str] = set()
    for token in tokens:
        if len(token) > 4 and token.endswith("ies"):
            normalized.add(f"{token[:-3]}y")
        elif len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
            normalized.add(token[:-1])
    return normalized


def domain_tokens_for_request(feature_request: str, graph: SourceGraph) -> set[str]:
    tokens = request_token_set(feature_request)
    graph_tokens = {
        token
        for node in graph.nodes
        for token in [*node.domain_tokens, *path_token_set(node.path)]
    }
    domain_tokens = {
        token
        for token in tokens
        if token not in REQUEST_STOPWORDS
        and token not in DOMAIN_SUFFIX_TOKENS
        and (token in graph_tokens or len(token) > 4)
    }
    return domain_tokens


def is_ui_page_add_request(tokens: set[str]) -> bool:
    if tokens & (UI_SHELL_TERMS - {"app"}):
        return False
    return bool(tokens & UI_CREATE_TERMS) and (
        bool(tokens & UI_PAGE_TERMS)
        or any(token.endswith("page") for token in tokens)
    )


def is_full_stack_hint(tokens: set[str]) -> bool:
    ui_surface = is_ui_page_add_request(tokens) or bool(tokens & UI_FORM_VALIDATION_TERMS)
    backend_or_error = bool(tokens & BACKEND_API_TERMS) or bool(tokens & {"error", "handling", "missing", "validation"})
    return ui_surface and backend_or_error


def path_token_set(path: str) -> set[str]:
    return tokenize_text(path.replace("/", " ").replace("-", " ").replace("_", " ").replace(".", " "))


def _dedupe_actions(actions: Sequence[RecipeLikelyAction]) -> list[RecipeLikelyAction]:
    by_key: dict[tuple[str, str, str | None, str | None], RecipeLikelyAction] = {}
    ordered_keys: list[tuple[str, str, str | None, str | None]] = []
    for action in actions:
        key = (action.matched_recipe_id, action.node_type, action.suggested_path, action.suggested_folder)
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = action
            ordered_keys.append(key)
            continue
        by_key[key] = existing.model_copy(
            update={
                "confidence": _max_confidence(existing.confidence, action.confidence),
                "evidence": _dedupe([*existing.evidence, *action.evidence]),
            }
        )
    return [by_key[key] for key in ordered_keys]


def _metadata_values(node: GraphNode, key: str) -> set[str]:
    return {
        value.strip().lower()
        for value in node.metadata.get(key, "").split(",")
        if value.strip()
    }


def _metadata_true(node: GraphNode, key: str) -> bool:
    return node.metadata.get(key) == "true"


def _metadata_token_set(node: GraphNode, key: str) -> set[str]:
    values = _metadata_values(node, key)
    tokens: set[str] = set()
    for value in values:
        tokens.update(path_token_set(value))
    return tokens | values


def _query_metadata_evidence(node: GraphNode) -> list[str]:
    evidence: list[str] = []
    for label, key in (
        ("method(s)", "method_names"),
        ("query indicator(s)", "query_indicators"),
        ("case-insensitive indicator(s)", "case_insensitive_indicators"),
        ("search term(s)", "search_terms"),
    ):
        values = sorted(_metadata_values(node, key))
        if values:
            evidence.append(f"{label}: {', '.join(values[:5])}")
    return evidence


def _has_validation_surface_signal(node: GraphNode) -> bool:
    return any(
        _metadata_true(node, key)
        for key in (
            "has_form_inputs",
            "has_validation_terms",
            "has_field_terms",
            "has_error_feedback_terms",
        )
    ) or bool(path_token_set(node.path) & {"form", "editor", "edit", "new"})


def _validation_metadata_evidence(node: GraphNode) -> list[str]:
    labels = {
        "has_form_inputs": "form/input evidence",
        "has_validation_terms": "validation terms",
        "has_error_feedback_terms": "error/feedback terms",
        "has_field_terms": "field terms",
    }
    evidence = [label for key, label in labels.items() if _metadata_true(node, key)]
    if _is_route_error_page(node):
        evidence.append("route-level error page; use only when prompt targets error routing")
    return evidence


def _is_route_error_page(node: GraphNode) -> bool:
    return _metadata_true(node, "is_error_route_page") or _metadata_true(node, "is_not_found_page")


def _explicit_error_route_request(feature_request: str) -> bool:
    normalized = normalize_text(feature_request)
    compact = normalized.replace(" ", "")
    return (
        "error page" in normalized
        or "not found" in normalized
        or "notfound" in compact
        or "404" in compact
    )


def _max_confidence(left: str, right: str) -> str:
    return min((left, right), key=_confidence_rank)


def _confidence_rank(value: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(value, 9)


def _dedupe(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def format_recipe_suggestion_report(report: RecipeSuggestionReport) -> str:
    """Render suggestion report as deterministic JSON."""

    return json.dumps(report.model_dump(mode="python"), indent=2, sort_keys=False)
