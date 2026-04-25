import json
import subprocess
import sys
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.models.repo_learning import ChangeRecipe
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from scripts import replay_git_history_eval as replay
from workspace_control.cli import run


def _git(repo: Path, args: list[str]) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return completed.stdout.strip()


def _seed_git_repo(tmp_path: Path) -> tuple[Path, str, str]:
    repo = tmp_path / "sample-repo"
    repo.mkdir()
    _git(repo, ["init"])
    _git(repo, ["config", "user.email", "test@example.com"])
    _git(repo, ["config", "user.name", "Test User"])

    (repo / "app.py").write_text("print('before')\n", encoding="utf-8")
    _git(repo, ["add", "app.py"])
    _git(repo, ["commit", "-m", "initial"])
    parent = _git(repo, ["rev-parse", "HEAD"])

    (repo / "app.py").write_text("print('after')\n", encoding="utf-8")
    (repo / "README.md").write_text("# sample\n", encoding="utf-8")
    _git(repo, ["add", "app.py", "README.md"])
    _git(repo, ["commit", "-m", "update app"])
    target = _git(repo, ["rev-parse", "HEAD"])
    return repo, parent, target


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _commit_all(repo: Path, message: str) -> str:
    _git(repo, ["add", "."])
    _git(repo, ["commit", "-m", message])
    return _git(repo, ["rev-parse", "HEAD"])


def _seed_page_add_repo(tmp_path: Path) -> tuple[Path, str, str]:
    repo = tmp_path / "spring-petclinic-reactjs"
    repo.mkdir()
    _git(repo, ["init"])
    _git(repo, ["config", "user.email", "test@example.com"])
    _git(repo, ["config", "user.name", "Test User"])
    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}}),
    )
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = [];\n")
    _write(repo / "client/src/components/owners/FindOwnersPage.tsx", "export function FindOwnersPage() { return null; }\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string }\n")
    parent = _commit_all(repo, "Initial owners surfaces")

    _write(repo / "client/src/components/owners/OwnersPage.tsx", "export function OwnersPage() { return null; }\n")
    _write(repo / "client/src/configureRoutes.tsx", "export const routes = ['owners'];\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: string; name?: string }\n")
    target = _commit_all(repo, "Add OwnersPage (no actions yet)")
    return repo, parent, target


def _write_ui_page_add_recipe_catalog(path: Path) -> Path:
    recipe = ChangeRecipe(
        id="petclinic_react_ui_page_add",
        target_id="petclinic-react",
        recipe_type="ui_page_add",
        status="active",
        trigger_terms=["owners", "page"],
        changed_node_types=["page_component", "route_config", "frontend_type"],
        created_node_types=["page_component"],
        modified_node_types=["route_config", "frontend_type"],
        structural_confidence=0.98,
        planner_effectiveness=0.05,
        support_count=7,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([recipe.model_dump(mode="python")], indent=2), encoding="utf-8")
    return path


def test_run_replay_eval_writes_overlap_reports(tmp_path: Path, monkeypatch) -> None:
    repo, parent, target = _seed_git_repo(tmp_path)
    calls: list[list[str]] = []

    def fake_run_cli_command(args, *, python_executable: str):
        calls.append(list(args))
        command = args[0]
        if command == "discover-architecture":
            stdout = "discovery output\n"
        elif command == "analyze-feature":
            stdout = "analysis output\n"
        elif command == "plan-feature":
            stdout = json.dumps({"primary_owner": "sample-repo"}) + "\n"
        else:
            stdout = (
                json.dumps(
                    {
                        "proposed_changes": [
                            {
                                "repo_name": "sample-repo",
                                "files": [
                                    {
                                        "path": "app.py",
                                        "action": "modify",
                                        "confidence": "high",
                                        "reason": "App change predicted.",
                                    },
                                    {
                                        "path": "missing.py",
                                        "action": "modify",
                                        "confidence": "medium",
                                        "reason": "Extra prediction.",
                                    },
                                    {
                                        "path": "README.md",
                                        "action": "inspect-only",
                                        "confidence": "low",
                                        "reason": "Reference only.",
                                    },
                                ],
                            }
                        ]
                    }
                )
                + "\n"
            )
        return {
            "command": replay.display_command(args),
            "exit_code": 0,
            "stdout": stdout,
            "stderr": "",
        }

    monkeypatch.setattr(replay, "run_cli_command", fake_run_cli_command)

    report = replay.run_replay_eval(
        repo_path=repo,
        commit=target,
        prompt="Update app behavior",
        report_dir=tmp_path / "reports",
        python_executable=sys.executable,
    )

    assert report["git"]["parent_commit"] == parent
    assert report["git"]["target_commit"] == target
    assert report["actual_files"] == [
        "sample-repo/README.md",
        "sample-repo/app.py",
    ]
    assert report["comparison"]["matched_files"] == ["sample-repo/app.py"]
    assert report["comparison"]["missed_files"] == ["sample-repo/README.md"]
    assert report["comparison"]["extra_predicted_files"] == [
        "sample-repo/missing.py"
    ]
    assert report["comparison"]["exact_file"]["precision"] == 0.5
    assert report["comparison"]["high_signal"]["matched_files"] == ["sample-repo/app.py"]
    assert report["predicted_reference_files"][0]["path"] == "sample-repo/README.md"
    assert _git(repo, ["rev-parse", "HEAD"]) == target
    assert calls
    assert all("--target-id" in args for args in calls)
    assert all("--scan-root" not in args for args in calls)

    latest_json = tmp_path / "reports" / "latest_replay.json"
    latest_md = tmp_path / "reports" / "latest_replay.md"
    assert latest_json.is_file()
    assert latest_md.is_file()
    persisted = json.loads(latest_json.read_text(encoding="utf-8"))
    assert persisted["comparison"]["matched_files"] == ["sample-repo/app.py"]
    markdown = latest_md.read_text(encoding="utf-8")
    assert "# Git History Replay Eval" in markdown
    assert "sample-repo/app.py" in markdown
    assert "## Planner/Propose Predicted Files" in markdown
    assert "## Planner/Propose Matched Files" in markdown
    assert "## Planner/Propose Missed Files" in markdown
    assert "## Planner/Propose Exact File Scoring" in markdown
    assert "## Planner/Propose Category-Level Matches" in markdown
    assert "## Recipe Suggestions Matched Files" in markdown
    assert "## Combined Matched Files" in markdown
    assert "\n## Predicted Files\n" not in markdown
    assert "\n## Matched Files\n" not in markdown
    assert "\n## Exact File Scoring\n" not in markdown


def test_compare_predictions_is_deterministic() -> None:
    comparison = replay.compare_predictions(
        predicted_files=[
            {"path": "repo/b.py"},
            {"path": "repo/a.py"},
            {"path": "repo/a.py"},
        ],
        actual_files=["repo/a.py", "repo/c.py"],
    )

    assert comparison["predicted_files"] == ["repo/a.py", "repo/b.py"]
    assert comparison["actual_files"] == ["repo/a.py", "repo/c.py"]
    assert comparison["matched_files"] == ["repo/a.py"]
    assert comparison["missed_files"] == ["repo/c.py"]
    assert comparison["extra_predicted_files"] == ["repo/b.py"]
    assert comparison["precision"] == 0.5
    assert comparison["recall"] == 0.5
    assert comparison["exact_file"]["precision"] == 0.5
    assert comparison["category_level"]["predicted_categories"] == ["unknown"]


def test_compare_predictions_counts_folder_level_static_asset_matches() -> None:
    comparison = replay.compare_predictions(
        predicted_files=[
            {"path": "repo/client/public/images"},
            {"path": "repo/client/src/components/App.tsx"},
        ],
        actual_files=[
            "repo/client/public/images/foo.png",
            "repo/client/src/components/App.tsx",
        ],
    )

    assert comparison["matched_files"] == ["repo/client/src/components/App.tsx"]
    assert comparison["missed_files"] == ["repo/client/public/images/foo.png"]
    assert comparison["folder_level"]["matches"] == [
        {
            "predicted_path": "repo/client/public/images",
            "actual_files": ["repo/client/public/images/foo.png"],
        }
    ]
    assert comparison["folder_level"]["matched_actual_files"] == [
        "repo/client/public/images/foo.png"
    ]
    assert comparison["category_level"]["matched_categories"] == [
        "app_shell",
        "static_asset",
    ]
    assert comparison["folder_level"]["matched_actual_count"] == 1
    assert comparison["high_signal"]["recall"] == 1.0
    assert comparison["static_assets"]["folder_level_matched_files"] == [
        "repo/client/public/images/foo.png"
    ]
    assert comparison["static_assets"]["missed_files"] == []


def test_high_signal_recall_excludes_static_asset_misses() -> None:
    comparison = replay.compare_predictions(
        predicted_files=[
            {"path": "repo/client/src/components/WelcomePage.tsx"},
            {"path": "repo/client/src/components/App.tsx"},
        ],
        actual_files=[
            "repo/client/src/components/WelcomePage.tsx",
            "repo/client/src/components/App.tsx",
            "repo/client/public/images/hero.png",
        ],
    )

    assert comparison["exact_file"]["recall"] == 0.6667
    assert comparison["high_signal"]["recall"] == 1.0
    assert comparison["high_signal"]["actual_count"] == 2
    assert comparison["static_assets"]["missed_files"] == [
        "repo/client/public/images/hero.png"
    ]


def test_replay_runs_recipe_suggestions_against_parent_snapshot(
    tmp_path: Path,
    monkeypatch,
) -> None:
    repo, _parent, target = _seed_page_add_repo(tmp_path)
    catalog = _write_ui_page_add_recipe_catalog(tmp_path / "learning/petclinic-react/change_recipes.json")
    monkeypatch.setattr(replay, "find_learning_catalog_for_repo", lambda source_repo_name: catalog)

    report = replay.run_replay_eval(
        repo_path=repo,
        commit=target,
        prompt="Add OwnersPage (no actions yet)",
        report_dir=tmp_path / "reports",
        python_executable=sys.executable,
    )

    assert "suggest_from_recipes" in report["commands"]
    recipe = report["recipe_suggestions"]["matched_recipes"][0]
    assert recipe["recipe_type"] == "ui_page_add"
    reasons = " | ".join(recipe["why_matched"])
    assert "request verb includes add" in reasons
    assert "identifier normalization exposes page-style term" in reasons
    assert "actions" not in reasons

    actions_by_path = {
        action["qualified_path"]: action
        for action in report["recipe_suggestions"]["suggested_actions"]
    }
    owners_page = "spring-petclinic-reactjs/client/src/components/owners/OwnersPage.tsx"
    routes = "spring-petclinic-reactjs/client/src/configureRoutes.tsx"
    types = "spring-petclinic-reactjs/client/src/types/index.ts"
    assert actions_by_path[owners_page]["action"] == "create"
    assert actions_by_path[owners_page]["exists_in_parent"] is False
    assert actions_by_path[owners_page]["matched_actual_diff"] is True
    assert actions_by_path[routes]["action"] == "modify"
    assert actions_by_path[routes]["exists_in_parent"] is True
    assert actions_by_path[types]["action"] == "inspect"
    assert actions_by_path[types]["exists_in_parent"] is True

    recipe_comparison = report["comparison_sections"]["recipe_suggestions"]
    combined_comparison = report["comparison_sections"]["combined"]
    assert owners_page in recipe_comparison["matched_files"]
    assert recipe_comparison["exact_file"]["recall"] >= report["comparison"]["exact_file"]["recall"]
    assert combined_comparison["exact_file"]["matched_count"] >= report["comparison"]["exact_file"]["matched_count"]
    assert report["summary"]["prediction_modes"]["planner_propose"]["exact_recall"] == report["comparison"]["exact_file"]["recall"]
    assert report["summary"]["prediction_modes"]["recipe_suggestions"]["exact_recall"] == recipe_comparison["exact_file"]["recall"]
    assert report["summary"]["prediction_modes"]["combined"]["exact_recall"] == combined_comparison["exact_file"]["recall"]
    assert isinstance(report["summary"]["recipe_helped"], bool)
    assert report["summary"]["recipe_help_type"] in {
        "improved_precision",
        "improved_recall",
        "same",
        "worse",
    }
    assert owners_page in report["summary"]["recipe_matched_files"]


def test_recipe_help_summary_flags_improved_recall() -> None:
    planner = replay.compare_predictions(
        predicted_files=[],
        actual_files=["repo/src/main/resources/db/hsqldb/initDB.sql"],
    )
    recipe = replay.compare_predictions(
        predicted_files=[{"path": "repo/src/main/resources/db/hsqldb/initDB.sql"}],
        actual_files=["repo/src/main/resources/db/hsqldb/initDB.sql"],
    )
    combined = replay.compare_predictions(
        predicted_files=[{"path": "repo/src/main/resources/db/hsqldb/initDB.sql"}],
        actual_files=["repo/src/main/resources/db/hsqldb/initDB.sql"],
    )

    help_summary = replay.recipe_help_summary(
        planner_comparison=planner,
        recipe_comparison=recipe,
        combined_comparison=combined,
    )

    assert help_summary["recipe_helped"] is True
    assert help_summary["recipe_help_type"] == "improved_recall"
    assert help_summary["recipe_matched_files"] == [
        "repo/src/main/resources/db/hsqldb/initDB.sql"
    ]


def test_surface_category_classification_uses_replay_schema_names() -> None:
    assert replay.classify_surface("repo/client/src/main.tsx") == "frontend_entrypoint"
    assert replay.classify_surface("repo/client/src/components/App.tsx") == "app_shell"
    assert replay.classify_surface("repo/client/src/components/WelcomePage.tsx") == "landing_page"
    assert replay.classify_surface("repo/client/public/index.html") == "public_html"
    assert replay.classify_surface("repo/client/public/images/hero.png") == "static_asset"
    assert replay.classify_surface("repo/client/src/types/index.ts") == "frontend_type"


def test_replay_snapshot_scan_root_and_target_id_are_semantically_equivalent(
    tmp_path: Path,
    capsys,
) -> None:
    workspace = tmp_path / "workspace"
    repo = workspace / "spring-petclinic-reactjs"
    (repo / "client/src/components").mkdir(parents=True)
    (repo / "client/src/types").mkdir(parents=True)
    (repo / "src/main/java/org/example/web/api").mkdir(parents=True)
    (repo / "src/main/java/org/example/service").mkdir(parents=True)
    (repo / "client/package.json").write_text(
        json.dumps({"dependencies": {"react": "18.2.0"}}),
        encoding="utf-8",
    )
    (repo / "client/src/components/OwnerInformation.tsx").write_text(
        "export function OwnerInformation() { return null; }\n",
        encoding="utf-8",
    )
    (repo / "client/src/types/index.ts").write_text(
        "export interface Owner {}\n",
        encoding="utf-8",
    )
    (repo / "src/main/java/org/example/web/api/OwnerController.java").write_text(
        "class OwnerController {}\n",
        encoding="utf-8",
    )

    registry_path = tmp_path / "registry.json"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id="replay-snapshot",
            source_type="local_path",
            locator=str(workspace),
        )
    )
    prompt = "Add Layout and Welcome page"

    analyze_scan = _run_cli_json_or_text(
        ["analyze-feature", prompt, "--scan-root", str(workspace)],
        capsys,
    )
    analyze_target = _run_cli_json_or_text(
        [
            "analyze-feature",
            prompt,
            "--target-id",
            "replay-snapshot",
            "--registry-path",
            str(registry_path),
        ],
        capsys,
    )
    assert analyze_target == analyze_scan

    plan_scan = json.loads(
        _run_cli_json_or_text(
            ["plan-feature", prompt, "--scan-root", str(workspace)],
            capsys,
        )
    )
    plan_target = json.loads(
        _run_cli_json_or_text(
            [
                "plan-feature",
                prompt,
                "--target-id",
                "replay-snapshot",
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )
    assert _plan_semantic_projection(plan_target) == _plan_semantic_projection(plan_scan)
    assert plan_target["unsupported_intents"] == []
    assert plan_target["primary_owner"] == "spring-petclinic-reactjs"
    assert "client/src/components" in plan_target["likely_paths_by_repo"]["spring-petclinic-reactjs"]

    proposal_scan = json.loads(
        _run_cli_json_or_text(
            ["propose-changes", prompt, "--scan-root", str(workspace)],
            capsys,
        )
    )
    proposal_target = json.loads(
        _run_cli_json_or_text(
            [
                "propose-changes",
                prompt,
                "--target-id",
                "replay-snapshot",
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )
    assert _proposal_semantic_projection(proposal_target) == _proposal_semantic_projection(
        proposal_scan
    )


def test_recipe_prediction_marks_absent_requested_page_as_create(tmp_path: Path) -> None:
    snapshot_repo = tmp_path / "repo"
    _write(snapshot_repo / "client/src/components/owners/FindOwnersPage.tsx", "")
    payload = {
        "suggestions": [
            {
                "matched_recipe_id": "recipe",
                "node_type": "page_component",
                "action": "inspect",
                "suggested_path": "client/src/components/owners/OwnersPage.tsx",
                "confidence": "medium",
                "evidence": [
                    "requested page/component already exists in the current source graph",
                    "file already exists in current source graph; inspect/modify rather than create",
                ],
            }
        ]
    }

    predicted = replay.predicted_files_from_recipe_suggestions(
        payload,
        default_repo_name="petclinic",
        snapshot_repo=snapshot_repo,
    )

    assert predicted["predicted_files"][0]["action"] == "create"
    assert predicted["predicted_files"][0]["exists_in_parent"] is False


def _run_cli_json_or_text(args: list[str], capsys) -> str:
    exit_code = run(args)
    captured = capsys.readouterr()
    assert exit_code == 0
    assert captured.err == ""
    return captured.out


def _plan_semantic_projection(plan: dict) -> dict:
    return {
        "feature_intents": plan["feature_intents"],
        "unsupported_intents": plan["unsupported_intents"],
        "primary_owner": plan["primary_owner"],
        "implementation_owner": plan["implementation_owner"],
        "ui_change_needed": plan["ui_change_needed"],
        "likely_paths_by_repo": plan["likely_paths_by_repo"],
    }


def _proposal_semantic_projection(proposal: dict) -> dict:
    return {
        "feature_intents": proposal["feature_intents"],
        "implementation_owner": proposal["implementation_owner"],
        "repos": [
            {
                "repo_name": item["repo_name"],
                "role": item["role"],
                "likely_files_to_inspect": item["likely_files_to_inspect"],
            }
            for item in proposal["proposed_changes"]
        ],
    }
