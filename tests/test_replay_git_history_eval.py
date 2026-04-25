import json
import subprocess
import sys
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
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
        "static_assets",
    ]
    assert comparison["high_signal"]["recall"] == 1.0
    assert comparison["static_assets"]["folder_level_matched_files"] == [
        "repo/client/public/images/foo.png"
    ]
    assert comparison["static_assets"]["missed_files"] == []


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
