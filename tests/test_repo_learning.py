import json
import os
import subprocess
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.models.repo_learning import ChangeRecipe, RecipeValidationResult
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.repo_learning import (
    RepoLearningService,
    format_learning_status,
    format_recipe_list,
    update_recipe_from_validation,
)
from workspace_control.cli import run


def _git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout
    return completed.stdout.strip()


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _commit(repo: Path, message: str) -> str:
    _git(repo, "add", ".")
    env = {
        **os.environ,
        "GIT_AUTHOR_DATE": "2024-01-01T00:00:00Z",
        "GIT_COMMITTER_DATE": "2024-01-01T00:00:00Z",
    }
    completed = subprocess.run(
        ["git", "-C", str(repo), "commit", "-m", message],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    assert completed.returncode == 0, completed.stderr or completed.stdout
    return _git(repo, "rev-parse", "HEAD")


def _seed_learning_workspace(tmp_path: Path) -> tuple[Path, Path]:
    workspace = tmp_path / "workspace"
    repo = workspace / "petclinic"
    repo.mkdir(parents=True)
    _git(repo, "init")
    _git(repo, "config", "user.email", "test@example.com")
    _git(repo, "config", "user.name", "Test User")

    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}, "scripts": {"test": "vitest"}}),
    )
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = [];\n")
    _write(repo / "client/src/components/owners/FindOwnersPage.tsx", "export function FindOwnersPage() { return null; }\n")
    _write(repo / "client/src/components/pets/FindPetsPage.tsx", "export function FindPetsPage() { return null; }\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string }\n")
    _commit(repo, "Initial app shell")

    _write(repo / "client/src/components/owners/OwnersPage.tsx", "export function OwnersPage() { return null; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = ['owners'];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string; name?: string }\n")
    _commit(repo, "Add OwnersPage (no actions yet)")

    _write(repo / "client/src/components/pets/PetsPage.tsx", "export function PetsPage() { return null; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = ['owners', 'pets'];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string; name?: string }\nexport interface Pet { id: string }\n")
    _commit(repo, "Add PetsPage (no actions yet)")
    return workspace, repo


def _register_target(registry_path: Path, workspace: Path) -> DiscoveryTargetRegistry:
    registry = DiscoveryTargetRegistry(registry_path)
    registry.register(
        DiscoveryTargetRecord(
            id="petclinic-test",
            source_type="local_path",
            locator=str(workspace),
        )
    )
    return registry


def _fake_replay_report(commit: str) -> dict:
    return {
        "summary": {
            "exact_file_precision": 1.0,
            "exact_file_recall": 1.0,
            "category_precision": 1.0,
            "category_recall": 1.0,
            "high_signal_precision": 1.0,
            "high_signal_recall": 1.0,
        },
        "comparison": {
            "category_level": {
                "predicted_by_category": {"frontend_component": ["x"]}
            }
        },
        "predicted_files": [{"path": "petclinic/client/src/components/owners/OwnersPage.tsx"}],
        "actual_files": ["petclinic/client/src/components/owners/OwnersPage.tsx"],
    }


def test_refresh_learning_creates_state_and_recipes(tmp_path: Path, monkeypatch) -> None:
    workspace, _repo = _seed_learning_workspace(tmp_path)
    registry = _register_target(tmp_path / "registry.json", workspace)
    service = RepoLearningService(
        registry=registry,
        learning_root=tmp_path / "learning",
        report_root=tmp_path / "reports",
        python_executable="python",
    )
    monkeypatch.setattr(service, "_run_replay", lambda repo_path, candidate, target_id: _fake_replay_report(candidate["sha"]))

    report = service.refresh_target("petclinic-test", limit=20, max_files=10)

    assert report.commits_analyzed == 2
    assert report.recipes_discovered_or_updated >= 1
    assert (tmp_path / "learning/petclinic-test/repo_learning_state.json").is_file()
    assert (tmp_path / "learning/petclinic-test/change_recipes.json").is_file()
    assert (tmp_path / "learning/petclinic-test/validation_history.json").is_file()
    recipes = service.recipes_for_target("petclinic-test")
    assert recipes
    assert any(recipe.status == "active" for recipe in recipes)


def test_detects_new_commits_and_stale_status(tmp_path: Path, monkeypatch) -> None:
    workspace, repo = _seed_learning_workspace(tmp_path)
    registry = _register_target(tmp_path / "registry.json", workspace)
    service = RepoLearningService(
        registry=registry,
        learning_root=tmp_path / "learning",
        report_root=tmp_path / "reports",
        python_executable="python",
    )
    monkeypatch.setattr(service, "_run_replay", lambda repo_path, candidate, target_id: _fake_replay_report(candidate["sha"]))
    service.refresh_target("petclinic-test", limit=20, max_files=10)

    _write(repo / "client/src/components/vets/VetsPage.tsx", "export function VetsPage() { return null; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = ['owners', 'pets', 'vets'];\n")
    new_head = _commit(repo, "Add VetsPage (no actions yet)")

    stale_state = service.status("petclinic-test")[0]
    assert stale_state.status == "stale"
    assert stale_state.current_head == new_head

    report = service.refresh_target("petclinic-test", limit=20, max_files=10)
    assert report.commits_analyzed == 1
    assert report.current_head == new_head


def test_recipe_confidence_update_confirmed_partial_and_missed() -> None:
    recipe = ChangeRecipe(id="r", target_id="t", recipe_type="ui_page_add", confidence=0.5, support_count=1)

    update_recipe_from_validation(
        recipe,
        RecipeValidationResult(commit="a", recipe_id="r", prompt="Add page", outcome="confirmed"),
        promote_threshold=2,
        quarantine_threshold=3,
    )
    assert recipe.confidence > 0.5
    assert recipe.success_count == 1

    before_partial = recipe.confidence
    update_recipe_from_validation(
        recipe,
        RecipeValidationResult(commit="b", recipe_id="r", prompt="Add page", outcome="partial"),
        promote_threshold=2,
        quarantine_threshold=3,
    )
    assert recipe.confidence >= before_partial

    for idx in range(3):
        update_recipe_from_validation(
            recipe,
            RecipeValidationResult(commit=f"m{idx}", recipe_id="r", prompt="Add page", outcome="missed"),
            promote_threshold=2,
            quarantine_threshold=3,
        )
    assert recipe.status == "quarantined"


def test_learning_status_and_recipe_list_formatters(tmp_path: Path, monkeypatch) -> None:
    workspace, _repo = _seed_learning_workspace(tmp_path)
    registry = _register_target(tmp_path / "registry.json", workspace)
    service = RepoLearningService(
        registry=registry,
        learning_root=tmp_path / "learning",
        report_root=tmp_path / "reports",
        python_executable="python",
    )
    monkeypatch.setattr(service, "_run_replay", lambda repo_path, candidate, target_id: _fake_replay_report(candidate["sha"]))
    service.refresh_target("petclinic-test", limit=20, max_files=10)

    states = service.status("petclinic-test")
    recipes = service.recipes_for_target("petclinic-test")
    status_text = format_learning_status(states, {"petclinic-test": recipes})
    recipe_text = format_recipe_list(recipes)

    assert "petclinic-test" in status_text
    assert "recipe_id" in recipe_text
    assert "ui_page_add" in recipe_text


def test_learning_cli_commands(tmp_path: Path, monkeypatch, capsys) -> None:
    workspace, _repo = _seed_learning_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    _register_target(registry_path, workspace)
    monkeypatch.setattr(
        RepoLearningService,
        "_run_replay",
        lambda self, repo_path, candidate, target_id: _fake_replay_report(candidate["sha"]),
    )

    refresh_code = run(
        [
            "refresh-learning",
            "--target-id",
            "petclinic-test",
            "--registry-path",
            str(registry_path),
            "--learning-root",
            str(tmp_path / "learning"),
            "--report-root",
            str(tmp_path / "reports"),
            "--limit",
            "20",
            "--max-files",
            "10",
        ]
    )
    refresh_output = capsys.readouterr().out
    assert refresh_code == 0
    assert "Learning refresh summary" in refresh_output

    status_code = run(
        [
            "learning-status",
            "--target-id",
            "petclinic-test",
            "--registry-path",
            str(registry_path),
            "--learning-root",
            str(tmp_path / "learning"),
            "--report-root",
            str(tmp_path / "reports"),
        ]
    )
    status_output = capsys.readouterr().out
    assert status_code == 0
    assert "petclinic-test" in status_output

    recipes_code = run(
        [
            "list-change-recipes",
            "--target-id",
            "petclinic-test",
            "--registry-path",
            str(registry_path),
            "--learning-root",
            str(tmp_path / "learning"),
            "--report-root",
            str(tmp_path / "reports"),
        ]
    )
    recipes_output = capsys.readouterr().out
    assert recipes_code == 0
    assert "ui_page_add" in recipes_output
