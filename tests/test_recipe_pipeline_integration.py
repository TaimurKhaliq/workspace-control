import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.models.repo_learning import ChangeRecipe
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.recipe_suggester import RecipeSuggestionService
from workspace_control.plan import create_feature_plan
from workspace_control.propose import create_change_proposal


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_workspace(tmp_path: Path, *, include_owners_page: bool = False) -> tuple[Path, Path]:
    workspace = tmp_path / "workspace"
    repo = workspace / "petclinic"
    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}, "scripts": {"test": "vitest"}}),
    )
    _write(repo / "client/src/main.tsx", "import './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export function App() { return null; }\n")
    _write(repo / "client/src/components/owners/FindOwnersPage.tsx", "export function FindOwnersPage() { return <form><input name=\"lastName\" /></form>; }\n")
    _write(
        repo / "client/src/components/owners/NewOwnerPage.tsx",
        "export function NewOwnerPage() { return <form><label>Owner</label><input name=\"lastName\" required aria-invalid=\"true\" /></form>; }\n",
    )
    _write(repo / "client/src/components/owners/OwnerEditor.tsx", "export function OwnerEditor() { return <input name=\"telephone\" />; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = [];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string }\n")
    if include_owners_page:
        _write(repo / "client/src/components/owners/OwnersPage.tsx", "export function OwnersPage() { return null; }\n")
    _write(repo / "src/main/java/example/rest/OwnerRestController.java", "class OwnerRestController { void searchOwners(String lastName) {} }\n")
    _write(
        repo / "src/main/java/example/service/ClinicService.java",
        "class ClinicService { java.util.Collection<Owner> findOwnersByLastName(String lastName) { return null; } }\n",
    )
    _write(
        repo / "src/main/java/example/repository/OwnerRepository.java",
        "interface OwnerRepository { @Query(\"select owner from Owner owner where lower(owner.lastName) like lower(:lastName)\") java.util.Collection<Owner> findByLastName(String lastName); }\n",
    )
    _write(repo / "src/main/java/example/model/Owner.java", "class Owner {}\n")
    _write(repo / "src/main/java/example/web/api/OwnerRequest.java", "class OwnerRequest {}\n")
    _write(
        repo / "src/main/resources/db/hsqldb/initDB.sql",
        "CREATE TABLE owners (id INTEGER, last_name VARCHAR_IGNORECASE(30));\n",
    )
    return workspace, repo


def _registry(path: Path, workspace: Path) -> DiscoveryTargetRegistry:
    registry = DiscoveryTargetRegistry(path)
    registry.register(
        DiscoveryTargetRecord(
            id="petclinic-test",
            source_type="local_path",
            locator=str(workspace),
        )
    )
    return registry


def _write_recipes(learning_root: Path) -> None:
    recipes = [
        ChangeRecipe(
            id="petclinic_test_ui_page_add",
            target_id="petclinic-test",
            recipe_type="ui_page_add",
            status="active",
            trigger_terms=["owners", "page"],
            changed_node_types=["page_component", "route_config", "frontend_type"],
            created_node_types=["page_component"],
            modified_node_types=["route_config", "frontend_type"],
            structural_confidence=0.98,
            planner_effectiveness=0.05,
            support_count=3,
        ),
        ChangeRecipe(
            id="petclinic_test_ui_form_validation",
            target_id="petclinic-test",
            recipe_type="ui_form_validation",
            status="active",
            trigger_terms=["invalid", "fields", "feedback"],
            changed_node_types=["form_component", "page_component", "frontend_type"],
            modified_node_types=["form_component", "page_component", "frontend_type"],
            structural_confidence=0.96,
            planner_effectiveness=0.0,
            support_count=2,
        ),
        ChangeRecipe(
            id="petclinic_test_backend_api_change",
            target_id="petclinic-test",
            recipe_type="backend_api_change",
            status="active",
            trigger_terms=["api", "search"],
            changed_node_types=["api_controller", "service_layer"],
            modified_node_types=["api_controller", "service_layer"],
            structural_confidence=0.83,
            planner_effectiveness=0.2,
            support_count=2,
        ),
        ChangeRecipe(
            id="petclinic_test_backend_search_query",
            target_id="petclinic-test",
            recipe_type="backend_search_query",
            status="weak",
            trigger_terms=["search", "query", "lookup"],
            changed_node_types=["repository", "service_layer", "api_controller"],
            modified_node_types=["repository", "service_layer"],
            structural_confidence=0.48,
            planner_effectiveness=0.0,
            support_count=1,
        ),
        ChangeRecipe(
            id="petclinic_test_backend_validation_change",
            target_id="petclinic-test",
            recipe_type="backend_validation_change",
            status="active",
            trigger_terms=["validation", "range", "null"],
            changed_node_types=["api_dto", "domain_model", "api_controller"],
            modified_node_types=["api_dto", "domain_model"],
            structural_confidence=0.9,
            planner_effectiveness=0.1,
            support_count=2,
        ),
        ChangeRecipe(
            id="petclinic_test_full_stack_ui_api",
            target_id="petclinic-test",
            recipe_type="full_stack_ui_api",
            status="active",
            trigger_terms=["error", "handling", "missing"],
            changed_node_types=["page_component", "frontend_type", "api_controller", "service_layer"],
            modified_node_types=["page_component", "frontend_type", "api_controller", "service_layer"],
            structural_confidence=0.92,
            planner_effectiveness=0.31,
            support_count=2,
        ),
    ]
    path = learning_root / "petclinic-test/change_recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([recipe.model_dump(mode="python") for recipe in recipes], indent=2), encoding="utf-8")


def _recipe_report(tmp_path: Path, prompt: str, *, include_owners_page: bool = False):
    workspace, _repo = _seed_workspace(tmp_path, include_owners_page=include_owners_page)
    registry = _registry(tmp_path / "registry.json", workspace)
    learning_root = tmp_path / "learning"
    _write_recipes(learning_root)
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(workspace))
    report = RecipeSuggestionService(
        registry=registry,
        learning_root=learning_root,
        report_root=tmp_path / "reports",
    ).suggest("petclinic-test", prompt)
    return workspace, snapshot, report


def test_plan_strong_native_owner_keeps_fields_and_includes_recipe_evidence(tmp_path: Path) -> None:
    prompt = "Add OwnersPage (no actions yet)"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt, include_owners_page=True)
    native_plan = create_feature_plan(prompt, [], scan_root=workspace, discovery_snapshot=snapshot)
    recipe_plan = create_feature_plan(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert recipe_plan.primary_owner == native_plan.primary_owner
    assert recipe_plan.implementation_owner == native_plan.implementation_owner
    assert recipe_plan.recipe_confidence_summary["influenced_plan"] == []
    assert recipe_plan.matched_recipes[0].recipe_type == "ui_page_add"


def test_plan_weak_native_uses_recipe_supported_intent_and_implementation_owner(tmp_path: Path) -> None:
    prompt = "Add visual feedback for invalid fields"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    native_plan = create_feature_plan(prompt, [], scan_root=workspace, discovery_snapshot=snapshot)
    recipe_plan = create_feature_plan(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert native_plan.feature_intents == []
    assert recipe_plan.feature_intents == ["ui"]
    assert recipe_plan.implementation_owner == "petclinic"
    assert "implementation_owner" in recipe_plan.recipe_confidence_summary["influenced_plan"]


def test_propose_ui_page_add_includes_recipe_and_combined_recommendations(tmp_path: Path) -> None:
    prompt = "Add OwnersPage (no actions yet)"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    recipe_paths = {item.path for item in proposal.recipe_suggestions}
    assert "client/src/components/owners/OwnersPage.tsx" in recipe_paths
    assert "client/src/configureRoutes.tsx" in recipe_paths
    assert "client/src/types/index.ts" in recipe_paths
    assert proposal.combined_recommendations


def test_combined_recommendations_rank_requested_page_and_cochanges_first(tmp_path: Path) -> None:
    prompt = "Add OwnersPage (no actions yet)"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt, include_owners_page=True)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    ranked_paths = [item.path for item in proposal.combined_recommendations]
    assert ranked_paths[0] == "client/src/components/owners/OwnersPage.tsx"
    assert ranked_paths.index("client/src/configureRoutes.tsx") < ranked_paths.index(
        "client/src/components/owners/FindOwnersPage.tsx"
    )
    assert ranked_paths.index("client/src/types/index.ts") < ranked_paths.index(
        "client/src/components/owners/FindOwnersPage.tsx"
    )
    assert ranked_paths.index("client/src/components/owners/OwnersPage.tsx") < ranked_paths.index(
        "client/src/components/owners/NewOwnerPage.tsx"
    )


def test_existing_requested_page_semantics_are_explicit(tmp_path: Path) -> None:
    prompt = "Add OwnersPage (no actions yet)"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt, include_owners_page=True)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    owners_page = next(
        item
        for item in proposal.recipe_suggestions
        if item.path == "client/src/components/owners/OwnersPage.tsx"
    )
    assert owners_page.action == "inspect"
    evidence = " | ".join(owners_page.evidence)
    assert "file already exists in current source graph; inspect/modify rather than create" in evidence


def test_overlapping_planner_and_recipe_file_is_marked_both(tmp_path: Path) -> None:
    prompt = "Add OwnersPage (no actions yet)"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt, include_owners_page=True)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    owners_page = next(
        item
        for item in proposal.combined_recommendations
        if item.path == "client/src/components/owners/OwnersPage.tsx"
    )
    assert owners_page.source == "both"
    assert owners_page.confidence == "high"


def test_strong_planner_limits_broad_secondary_recipe_additions(tmp_path: Path) -> None:
    prompt = "Add NewOwnerPage missing error handling"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt, include_owners_page=True)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert {recipe.recipe_type for recipe in report.matched_recipes} >= {
        "ui_form_validation",
        "full_stack_ui_api",
    }
    combined_paths = [item.path for item in proposal.combined_recommendations]
    assert len(combined_paths) <= 8
    assert "src/main/java/example/service/ClinicService.java" not in combined_paths
    assert "client/src/components/owners/NewOwnerPage.tsx" in combined_paths


def test_propose_ui_form_validation_uses_recipe_fallback_surfaces(tmp_path: Path) -> None:
    prompt = "Add visual feedback for invalid fields"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    recipe_paths = {item.path for item in proposal.recipe_suggestions}
    assert "client/src/components/owners/NewOwnerPage.tsx" in recipe_paths
    assert any(item.source == "recipe" for item in proposal.combined_recommendations)
    assert any("recipe evidence provided fallback" in item for item in proposal.missing_evidence)


def test_no_recipe_match_keeps_native_proposal_behavior(tmp_path: Path) -> None:
    prompt = "Banana rocket llama"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    native = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot)
    with_recipe = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert report.matched_recipes == []
    assert with_recipe.recipe_suggestions == []
    assert with_recipe.combined_recommendations == []
    assert with_recipe.proposed_changes == native.proposed_changes


def test_propose_backend_search_prefers_specific_recipe_over_generic_api(tmp_path: Path) -> None:
    prompt = "Owners search has been case insensitive"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert report.matched_recipes[0].recipe_type == "backend_search_query"
    recipe_ids = {item.matched_recipe_id for item in proposal.recipe_suggestions}
    assert "petclinic_test_backend_search_query" in recipe_ids
    assert "petclinic_test_backend_api_change" not in recipe_ids
    paths = {item.path for item in proposal.recipe_suggestions}
    assert "src/main/java/example/repository/OwnerRepository.java" in paths
    assert "src/main/resources/db/hsqldb/initDB.sql" in paths


def test_validation_recipe_precedes_generic_backend_api(tmp_path: Path) -> None:
    prompt = "Add max range and not null validation for adding new owner"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    assert report.matched_recipes[0].recipe_type == "backend_validation_change"
    recipe_ids = {item.matched_recipe_id for item in proposal.recipe_suggestions}
    assert "petclinic_test_backend_validation_change" in recipe_ids
    assert "petclinic_test_backend_api_change" not in recipe_ids


def test_suggest_and_propose_use_consistent_recipe_matches(tmp_path: Path) -> None:
    prompt = "Owners search has been case insensitive"
    workspace, snapshot, report = _recipe_report(tmp_path, prompt)
    proposal = create_change_proposal(prompt, [], scan_root=workspace, discovery_snapshot=snapshot, recipe_report=report)

    suggest_recipe_ids = [item.recipe_id for item in report.matched_recipes]
    propose_recipe_ids = sorted({item.matched_recipe_id for item in proposal.recipe_suggestions if item.matched_recipe_id})
    assert suggest_recipe_ids == ["petclinic_test_backend_search_query"]
    assert propose_recipe_ids == ["petclinic_test_backend_search_query"]
