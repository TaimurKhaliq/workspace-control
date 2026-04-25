import json
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.models.repo_learning import ChangeRecipe
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.recipe_suggester import RecipeSuggestionService
from workspace_control.cli import run


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
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")
    _write(repo / "client/src/components/owners/FindOwnersPage.tsx", "export function FindOwnersPage() { return null; }\n")
    _write(repo / "client/src/components/owners/OwnerEditor.tsx", "export function OwnerEditor() { return null; }\n")
    _write(repo / "client/src/components/pets/PetsPage.tsx", "export function PetsPage() { return null; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = [];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string }\n")
    if include_owners_page:
        _write(repo / "client/src/components/owners/OwnersPage.tsx", "export function OwnersPage() { return null; }\n")
    _write(repo / "src/main/java/example/rest/OwnerRestController.java", "class OwnerRestController {}\n")
    _write(repo / "src/main/java/example/service/ClinicService.java", "class ClinicService {}\n")
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
            id="petclinic_test_ui_shell_layout",
            target_id="petclinic-test",
            recipe_type="ui_shell_layout",
            status="active",
            trigger_terms=["layout", "welcome", "page"],
            changed_node_types=["app_shell", "frontend_entrypoint", "landing_page", "public_html"],
            modified_node_types=["app_shell", "frontend_entrypoint", "landing_page"],
            structural_confidence=0.98,
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
    ]
    path = learning_root / "petclinic-test/change_recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([recipe.model_dump(mode="python") for recipe in recipes], indent=2), encoding="utf-8")


def _service(tmp_path: Path, *, include_owners_page: bool = False) -> RecipeSuggestionService:
    workspace, _repo = _seed_workspace(tmp_path, include_owners_page=include_owners_page)
    registry = _registry(tmp_path / "registry.json", workspace)
    learning_root = tmp_path / "learning"
    _write_recipes(learning_root)
    return RecipeSuggestionService(
        registry=registry,
        learning_root=learning_root,
        report_root=tmp_path / "reports",
    )


def test_recipe_matching_for_ui_page_add_and_new_file_suggestion(tmp_path: Path) -> None:
    report = _service(tmp_path).suggest("petclinic-test", "Add OwnersPage (no actions yet)")

    assert report.matched_recipes[0].recipe_type == "ui_page_add"
    reasons = " | ".join(report.matched_recipes[0].why_matched)
    assert "request verb includes add" in reasons
    assert "identifier normalization exposes page-style term" in reasons
    assert "actions" not in reasons
    actions = report.suggestions
    assert any(
        action.action == "create"
        and action.node_type == "page_component"
        and action.suggested_path == "client/src/components/owners/OwnersPage.tsx"
        for action in actions
    )
    assert any(
        action.action == "modify"
        and action.node_type == "route_config"
        and action.suggested_path == "client/src/configureRoutes.tsx"
        for action in actions
    )


def test_recipe_matching_for_ui_form_validation(tmp_path: Path) -> None:
    report = _service(tmp_path).suggest("petclinic-test", "Add visual feedback for invalid fields")

    assert report.matched_recipes[0].recipe_type == "ui_form_validation"
    assert any(action.node_type in {"form_component", "page_component"} for action in report.suggestions)


def test_recipe_matching_for_ui_shell_layout(tmp_path: Path) -> None:
    report = _service(tmp_path).suggest("petclinic-test", "Add Layout and Welcome page")

    recipe_types = [recipe.recipe_type for recipe in report.matched_recipes]
    assert "ui_shell_layout" in recipe_types
    suggested_paths = {action.suggested_path for action in report.suggestions}
    assert "client/src/components/App.tsx" in suggested_paths
    assert "client/src/main.tsx" in suggested_paths
    assert "client/src/components/WelcomePage.tsx" in suggested_paths


def test_no_recipe_match_returns_caveat(tmp_path: Path) -> None:
    report = _service(tmp_path).suggest("petclinic-test", "Banana rocket llama")

    assert report.matched_recipes == []
    assert report.suggestions == []
    assert any("No learned recipe" in caveat for caveat in report.caveats)


def test_suggest_from_recipes_cli_outputs_json(tmp_path: Path, capsys) -> None:
    workspace, _repo = _seed_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    _registry(registry_path, workspace)
    learning_root = tmp_path / "learning"
    _write_recipes(learning_root)

    code = run(
        [
            "suggest-from-recipes",
            "--target-id",
            "petclinic-test",
            "--registry-path",
            str(registry_path),
            "--learning-root",
            str(learning_root),
            "--report-root",
            str(tmp_path / "reports"),
            "Add OwnersPage (no actions yet)",
        ]
    )
    output = json.loads(capsys.readouterr().out)

    assert code == 0
    assert output["target_id"] == "petclinic-test"
    assert output["matched_recipes"][0]["recipe_type"] == "ui_page_add"
