import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.models.repo_learning import ChangeRecipe
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.recipe_suggester import RecipeSuggestionService
from workspace_control.analyze import analyze_feature
from workspace_control.cli import run
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan
from workspace_control.plan_bundle import (
    create_plan_bundle,
    format_plan_bundle_json,
    format_plan_bundle_markdown,
)
from workspace_control.propose import create_change_proposal


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_bundle_workspace(tmp_path: Path, *, include_owners_page: bool = True) -> tuple[Path, Path, DiscoveryTargetRegistry, Path]:
    workspace = tmp_path / "workspace"
    repo = workspace / "petclinic"
    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}, "scripts": {"test": "vitest"}}),
    )
    _write(repo / "client/src/main.tsx", "import './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export function App() { return null; }\n")
    _write(repo / "client/src/components/owners/FindOwnersPage.tsx", "export function FindOwnersPage() { return null; }\n")
    _write(
        repo / "client/src/components/owners/NewOwnerPage.tsx",
        "export function NewOwnerPage() { return <form><input aria-invalid=\"true\" required /></form>; }\n",
    )
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = [];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string }\n")
    if include_owners_page:
        _write(repo / "client/src/components/owners/OwnersPage.tsx", "export function OwnersPage() { return null; }\n")
    _write(repo / "src/main/java/example/repository/OwnerRepository.java", "interface OwnerRepository {}\n")
    _write(repo / "src/main/resources/db/hsqldb/initDB.sql", "CREATE TABLE owners (id INTEGER);\n")

    registry_path = tmp_path / "registry.json"
    registry = DiscoveryTargetRegistry(registry_path)
    registry.register(
        DiscoveryTargetRecord(
            id="petclinic-test",
            source_type="local_path",
            locator=str(workspace),
        )
    )
    learning_root = tmp_path / "learning"
    _write_recipes(learning_root)
    return workspace, repo, registry, learning_root


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
            cochange_patterns=["page_component + route_config", "frontend_type + page_component"],
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
            changed_node_types=["page_component"],
            modified_node_types=["page_component"],
            structural_confidence=0.96,
            planner_effectiveness=0.0,
            support_count=2,
        ),
    ]
    path = learning_root / "petclinic-test" / "change_recipes.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([recipe.model_dump(mode="python") for recipe in recipes]), encoding="utf-8")


def _bundle_for(tmp_path: Path, prompt: str):
    workspace, _repo, registry, learning_root = _seed_bundle_workspace(tmp_path)
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(workspace))
    rows = build_inventory(workspace)
    impacts = analyze_feature(prompt, rows, scan_root=workspace, discovery_snapshot=snapshot)
    recipe_report = RecipeSuggestionService(
        registry=registry,
        learning_root=learning_root,
        report_root=tmp_path / "reports",
    ).suggest("petclinic-test", prompt)
    plan = create_feature_plan(prompt, rows, impacts=impacts, scan_root=workspace, discovery_snapshot=snapshot, recipe_report=recipe_report)
    proposal = create_change_proposal(prompt, rows, impacts=impacts, scan_root=workspace, discovery_snapshot=snapshot, recipe_report=recipe_report)
    recipes = [ChangeRecipe.model_validate(item) for item in json.loads((learning_root / "petclinic-test" / "change_recipes.json").read_text())]
    return create_plan_bundle(
        feature_request=prompt,
        target_id="petclinic-test",
        rows=rows,
        impacts=impacts,
        plan=plan,
        proposal=proposal,
        discovery_snapshot=snapshot,
        recipe_report=recipe_report,
        recipe_catalog=recipes,
    )


def test_json_plan_bundle_contains_stable_ui_friendly_contract(tmp_path: Path) -> None:
    bundle = _bundle_for(tmp_path, "Add OwnersPage (no actions yet)")
    payload = json.loads(format_plan_bundle_json(bundle))

    assert payload["schema_version"] == "1.0"
    assert payload["feature_request"] == "Add OwnersPage (no actions yet)"
    assert payload["target"]["target_id"] == "petclinic-test"
    assert payload["target"]["repo_count"] == 1
    assert isinstance(payload["target"]["repos"], list)
    assert payload["summary"]["planning_mode"] == "planner+recipe"
    assert payload["ownership"]
    assert payload["recommended_change_set"]
    assert payload["matched_recipes"]
    assert payload["source_graph_evidence"]
    assert payload["validation"]
    assert payload["handoff_prompts"]
    assert payload["debug"] == {"included": False, "pipeline": {}}
    first = payload["recommended_change_set"][0]
    assert {"repo_name", "path", "priority", "source", "confidence", "reason"} <= set(first)
    assert isinstance(first["priority"], int)


def test_markdown_plan_bundle_renders_from_same_data(tmp_path: Path) -> None:
    bundle = _bundle_for(tmp_path, "Add OwnersPage (no actions yet)")
    markdown = format_plan_bundle_markdown(bundle)

    assert "# Plan Bundle" in markdown
    assert "## Recommended Change Set" in markdown
    assert "client/src/components/owners/OwnersPage.tsx" in markdown
    assert "## Coding Agent Handoff Prompt" in markdown


def test_handoff_prompt_includes_combined_recommendation_files(tmp_path: Path) -> None:
    bundle = _bundle_for(tmp_path, "Add OwnersPage (no actions yet)")
    handoff = bundle.handoff_prompts[0]

    assert "client/src/components/owners/OwnersPage.tsx" in handoff.recommended_files
    assert "client/src/configureRoutes.tsx" in handoff.recommended_files
    assert "You are working in repo: petclinic." in handoff.prompt
    assert "Keep this UI-only" in handoff.prompt


def test_ui_page_add_handoff_prompt_uses_recipe_specific_expected_changes(tmp_path: Path) -> None:
    bundle = _bundle_for(tmp_path, "Add OwnersPage (no actions yet)")
    prompt = bundle.handoff_prompts[0].prompt

    assert "Add or update the requested page/component surface." in prompt
    assert "Wire it into `client/src/configureRoutes.tsx`." in prompt
    assert "Inspect/update frontend types only if needed in `client/src/types/index.ts`." in prompt
    assert "Use nearby same-domain pages like" in prompt
    assert "FindOwnersPage" in prompt
    assert "Do not overreach into unrelated domains or broad refactors." in prompt
    assert "Keep this UI-only; do not add backend/API behavior" in prompt


def test_recipe_fallback_caveat_appears_when_planner_native_is_empty(tmp_path: Path) -> None:
    bundle = _bundle_for(tmp_path, "Add visual feedback for invalid fields")
    messages = [risk.message for risk in bundle.risks_and_caveats]

    assert any("recipe evidence provided fallback" in message for message in messages)
    assert bundle.summary.recipe_assisted is True


def test_generate_plan_bundle_cli_writes_json_and_markdown(tmp_path: Path, capsys) -> None:
    workspace, _repo, _registry, _learning_root = _seed_bundle_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    json_output = tmp_path / "bundle.json"
    markdown_output = tmp_path / "bundle.md"

    exit_code = run([
        "generate-plan-bundle",
        "Add OwnersPage (no actions yet)",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--format",
        "json",
        "--output",
        str(json_output),
    ])
    assert exit_code == 0
    assert capsys.readouterr().out == ""
    payload = json.loads(json_output.read_text(encoding="utf-8"))
    assert payload["target"]["repos"][0]["repo_name"] == "petclinic"

    exit_code = run([
        "generate-plan-bundle",
        "Add OwnersPage (no actions yet)",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--format",
        "markdown",
        "--output",
        str(markdown_output),
    ])
    assert exit_code == 0
    assert "# Plan Bundle" in markdown_output.read_text(encoding="utf-8")
    assert workspace.is_dir()
