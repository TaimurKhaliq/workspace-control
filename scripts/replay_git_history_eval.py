#!/usr/bin/env python3
"""Replay a historical git change against workspace-control planning output.

The harness is read-only with respect to the source repository: it identifies the
parent commit, materializes that parent snapshot from `git archive` into a
throwaway temporary workspace, runs workspace-control commands against that
snapshot, and compares proposed files with the real parent-to-target diff.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import subprocess
import sys
import tarfile
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_DIR = REPO_ROOT / "reports" / "replay"
STATIC_ASSET_EXTENSIONS = {
    ".avif",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
}
SURFACE_CATEGORIES = (
    "frontend_entrypoint",
    "app_shell",
    "landing_page",
    "public_html",
    "static_asset",
    "frontend_component",
    "frontend_type",
    "api_contract",
    "api_controller",
    "api_dto",
    "service_layer",
    "domain_model",
    "repository",
    "migration",
    "unknown",
)

CANDIDATE_HELP = """How to find candidate commits for replay evals

Start with commits that represent a focused feature or bug fix:
- git -C /path/to/repo log --oneline --max-count=25
- git -C /path/to/repo log --merges --oneline --max-count=25
- git -C /path/to/repo show --stat <commit>

Then replay from the parent snapshot:
python3 scripts/replay_git_history_eval.py \
  --repo-path /path/to/repo \
  --commit <target-commit-sha> \
  --prompt "Describe the feature or bug fix in product language"
"""


class ReplayError(RuntimeError):
    """Raised when replay setup or execution cannot continue safely."""


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for historical replay evaluation."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-path", type=Path, help="Path to a local git repository.")
    parser.add_argument("--commit", help="Target commit, merge commit, or PR-equivalent commit to replay.")
    parser.add_argument("--prompt", help="Feature prompt to run through planner/proposal commands.")
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help="Directory for latest_replay.json and latest_replay.md.",
    )
    parser.add_argument(
        "--parent-index",
        type=int,
        default=1,
        help="One-based parent number to use for merge commits. Defaults to first parent.",
    )
    parser.add_argument(
        "--python-executable",
        default=None,
        help="Python executable for main.py. Defaults to .venv/bin/python when present.",
    )
    parser.add_argument(
        "--candidate-help",
        action="store_true",
        help="Print helper commands for finding candidate commits and exit.",
    )
    args = parser.parse_args(argv)

    if args.candidate_help:
        print(CANDIDATE_HELP, end="")
        return 0

    missing = [
        name
        for name in ("repo_path", "commit", "prompt")
        if getattr(args, name) in (None, "")
    ]
    if missing:
        parser.error("missing required arguments: " + ", ".join(f"--{name.replace('_', '-')}" for name in missing))

    try:
        report = run_replay_eval(
            repo_path=args.repo_path,
            commit=args.commit,
            prompt=args.prompt,
            report_dir=args.report_dir,
            parent_index=args.parent_index,
            python_executable=args.python_executable,
        )
    except (OSError, ReplayError, subprocess.SubprocessError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print_replay_summary(report)
    return 0 if report["summary"]["commands_succeeded"] else 1


def run_replay_eval(
    *,
    repo_path: Path,
    commit: str,
    prompt: str,
    report_dir: Path = DEFAULT_REPORT_DIR,
    parent_index: int = 1,
    python_executable: str | None = None,
) -> dict[str, Any]:
    """Run a read-only historical replay and write deterministic reports."""

    resolved_python = python_executable or default_python_executable()
    source_repo = resolve_git_root(repo_path)
    repo_name = source_repo.name
    target_commit = git_output(source_repo, ["rev-parse", "--verify", f"{commit}^{{commit}}"])
    parent_commits = parent_commits_for(source_repo, target_commit)
    if not parent_commits:
        raise ReplayError(f"Target commit has no parent: {target_commit}")
    if parent_index < 1 or parent_index > len(parent_commits):
        raise ReplayError(
            f"--parent-index must be between 1 and {len(parent_commits)} for {target_commit}"
        )
    parent_commit = parent_commits[parent_index - 1]
    actual_files = actual_changed_files(
        source_repo,
        repo_name=repo_name,
        parent_commit=parent_commit,
        target_commit=target_commit,
    )

    with tempfile.TemporaryDirectory(prefix="stackpilot-replay-") as tmp_dir:
        workspace_root = Path(tmp_dir) / "workspace"
        snapshot_repo = workspace_root / repo_name
        materialize_commit_snapshot(source_repo, parent_commit, snapshot_repo)
        command_results = run_workspace_commands(
            workspace_root=workspace_root,
            target_id=f"replay-{repo_name}",
            prompt=prompt,
            python_executable=resolved_python,
            source_repo_name=repo_name,
        )
        proposal_payload = parse_json_stdout(command_results["propose_changes"])
        recipe_payload = parse_json_stdout(command_results.get("suggest_from_recipes", {}))
        predicted = predicted_files_from_proposal(proposal_payload, default_repo_name=repo_name)
        recipe_predicted = predicted_files_from_recipe_suggestions(
            recipe_payload,
            default_repo_name=repo_name,
            snapshot_repo=snapshot_repo,
        )
        recipe_diagnostics = recipe_diagnostics_from_suggestions(
            recipe_payload,
            recipe_predicted=recipe_predicted,
            actual_files=actual_files,
            default_repo_name=repo_name,
            snapshot_repo=snapshot_repo,
        )

    comparison = compare_predictions(
        predicted_files=predicted["predicted_files"],
        actual_files=actual_files,
    )
    recipe_comparison = compare_predictions(
        predicted_files=recipe_predicted["predicted_files"],
        actual_files=actual_files,
    )
    combined_predicted = {
        "predicted_files": dedupe_records(
            [*predicted["predicted_files"], *recipe_predicted["predicted_files"]]
        ),
        "predicted_reference_files": dedupe_records(
            [*predicted["predicted_reference_files"], *recipe_predicted["predicted_reference_files"]]
        ),
        "predicted_repos": sorted(
            set(predicted["predicted_repos"]) | set(recipe_predicted["predicted_repos"])
        ),
    }
    combined_comparison = compare_predictions(
        predicted_files=combined_predicted["predicted_files"],
        actual_files=actual_files,
    )
    prediction_mode_metrics = {
        "planner_propose": prediction_mode_summary(comparison),
        "recipe_suggestions": prediction_mode_summary(recipe_comparison),
        "combined": prediction_mode_summary(combined_comparison),
    }
    recipe_help = recipe_help_summary(
        planner_comparison=comparison,
        recipe_comparison=recipe_comparison,
        combined_comparison=combined_comparison,
    )
    commands_succeeded = all(item["exit_code"] == 0 for item in command_results.values())

    report_dir = report_dir.resolve()
    report: dict[str, Any] = {
        "input": {
            "repo_path": display_path(source_repo),
            "commit": commit,
            "prompt": prompt,
            "parent_index": parent_index,
        },
        "git": {
            "repo_name": repo_name,
            "parent_commit": parent_commit,
            "target_commit": target_commit,
            "parent_commits": parent_commits,
            "snapshot_mode": "git archive materialized into temporary workspace",
        },
        "summary": {
            "commands_succeeded": commands_succeeded,
            "predicted_file_count": len(predicted["predicted_files"]),
            "actual_file_count": len(actual_files),
            "matched_file_count": len(comparison["matched_files"]),
            "missed_file_count": len(comparison["missed_files"]),
            "extra_predicted_file_count": len(comparison["extra_predicted_files"]),
            "exact_file_precision": comparison["precision"],
            "exact_file_recall": comparison["recall"],
            "folder_level_matched_file_count": len(
                comparison["folder_level"]["matched_actual_files"]
            ),
            "category_precision": comparison["category_level"]["precision"],
            "category_recall": comparison["category_level"]["recall"],
            "high_signal_precision": comparison["high_signal"]["precision"],
            "high_signal_recall": comparison["high_signal"]["recall"],
            "static_asset_miss_count": len(comparison["static_assets"]["missed_files"]),
            "recipe_suggestion_file_count": len(recipe_predicted["predicted_files"]),
            "recipe_matched_file_count": len(recipe_comparison["matched_files"]),
            "recipe_exact_file_precision": recipe_comparison["precision"],
            "recipe_exact_file_recall": recipe_comparison["recall"],
            "recipe_high_signal_precision": recipe_comparison["high_signal"]["precision"],
            "recipe_high_signal_recall": recipe_comparison["high_signal"]["recall"],
            "recipe_category_precision": recipe_comparison["category_level"]["precision"],
            "recipe_category_recall": recipe_comparison["category_level"]["recall"],
            "combined_file_count": len(combined_predicted["predicted_files"]),
            "combined_matched_file_count": len(combined_comparison["matched_files"]),
            "combined_exact_file_precision": combined_comparison["precision"],
            "combined_exact_file_recall": combined_comparison["recall"],
            "combined_high_signal_precision": combined_comparison["high_signal"]["precision"],
            "combined_high_signal_recall": combined_comparison["high_signal"]["recall"],
            "combined_category_precision": combined_comparison["category_level"]["precision"],
            "combined_category_recall": combined_comparison["category_level"]["recall"],
            "prediction_modes": prediction_mode_metrics,
            **recipe_help,
        },
        "predicted_repos": predicted["predicted_repos"],
        "predicted_files": predicted["predicted_files"],
        "predicted_reference_files": predicted["predicted_reference_files"],
        "recipe_suggestions": recipe_diagnostics,
        "combined_predictions": combined_predicted,
        "actual_files": actual_files,
        "comparison": comparison,
        "comparison_sections": {
            "planner_propose": comparison,
            "recipe_suggestions": recipe_comparison,
            "combined": combined_comparison,
        },
        "recipe_help": recipe_help,
        "commands": command_results,
        "reports": {
            "json": display_path(report_dir / "latest_replay.json"),
            "markdown": display_path(report_dir / "latest_replay.md"),
        },
    }
    write_reports(report, report_dir)
    return report


def prediction_mode_summary(comparison: dict[str, Any]) -> dict[str, Any]:
    """Return compact metrics for one prediction mode."""

    return {
        "predicted_file_count": len(comparison["predicted_files"]),
        "actual_file_count": len(comparison["actual_files"]),
        "matched_file_count": len(comparison["matched_files"]),
        "missed_file_count": len(comparison["missed_files"]),
        "extra_predicted_file_count": len(comparison["extra_predicted_files"]),
        "exact_precision": comparison["exact_file"]["precision"],
        "exact_recall": comparison["exact_file"]["recall"],
        "category_precision": comparison["category_level"]["precision"],
        "category_recall": comparison["category_level"]["recall"],
        "high_signal_precision": comparison["high_signal"]["precision"],
        "high_signal_recall": comparison["high_signal"]["recall"],
    }


def recipe_help_summary(
    *,
    planner_comparison: dict[str, Any],
    recipe_comparison: dict[str, Any],
    combined_comparison: dict[str, Any],
) -> dict[str, Any]:
    """Classify whether recipe suggestions improved replay scoring."""

    planner_exact_recall = float(planner_comparison["exact_file"]["recall"])
    recipe_exact_recall = float(recipe_comparison["exact_file"]["recall"])
    combined_exact_recall = float(combined_comparison["exact_file"]["recall"])
    planner_exact_precision = float(planner_comparison["exact_file"]["precision"])
    recipe_exact_precision = float(recipe_comparison["exact_file"]["precision"])
    combined_exact_precision = float(combined_comparison["exact_file"]["precision"])
    recipe_matched_files = list(recipe_comparison["matched_files"])

    if recipe_exact_recall > planner_exact_recall or combined_exact_recall > planner_exact_recall:
        help_type = "improved_recall"
    elif recipe_exact_precision > planner_exact_precision or combined_exact_precision > planner_exact_precision:
        help_type = "improved_precision"
    elif (
        recipe_exact_recall == planner_exact_recall
        and recipe_exact_precision == planner_exact_precision
        and combined_exact_recall == planner_exact_recall
        and combined_exact_precision == planner_exact_precision
    ):
        help_type = "same"
    else:
        help_type = "worse"

    return {
        "recipe_helped": help_type in {"improved_recall", "improved_precision"},
        "recipe_help_type": help_type,
        "recipe_matched_files": recipe_matched_files,
    }


def resolve_git_root(repo_path: Path) -> Path:
    """Resolve a path inside a git repository to its top-level directory."""

    if not repo_path.exists():
        raise ReplayError(f"Repository path does not exist: {repo_path}")
    completed = git_run(repo_path, ["rev-parse", "--show-toplevel"])
    if completed.returncode != 0:
        raise ReplayError(decode_stream(completed.stderr).strip() or decode_stream(completed.stdout).strip())
    return Path(decode_stream(completed.stdout).strip()).resolve()


def parent_commits_for(repo_path: Path, target_commit: str) -> list[str]:
    """Return parent commits for a target commit in git's deterministic order."""

    line = git_output(repo_path, ["rev-list", "--parents", "-n", "1", target_commit])
    parts = line.split()
    if not parts:
        return []
    return parts[1:]


def actual_changed_files(
    repo_path: Path,
    *,
    repo_name: str,
    parent_commit: str,
    target_commit: str,
) -> list[str]:
    """Return actual changed files from parent to target, prefixed by repo name."""

    output = git_output(
        repo_path,
        ["diff", "--name-only", "--diff-filter=ACMRT", parent_commit, target_commit],
    )
    files = [line.strip() for line in output.splitlines() if line.strip()]
    return [qualify_repo_path(repo_name, path) for path in sorted(files)]


def materialize_commit_snapshot(
    repo_path: Path,
    commit: str,
    destination: Path,
) -> None:
    """Materialize a commit tree into a temporary directory using git archive."""

    destination.mkdir(parents=True, exist_ok=True)
    completed = git_run(repo_path, ["archive", "--format=tar", commit], stdout=subprocess.PIPE)
    if completed.returncode != 0:
        raise ReplayError(decode_stream(completed.stderr).strip() or "git archive failed")
    with tarfile.open(fileobj=io.BytesIO(completed.stdout), mode="r:") as archive:
        try:
            archive.extractall(destination, filter="data")
        except TypeError:
            archive.extractall(destination)


def run_workspace_commands(
    *,
    workspace_root: Path,
    target_id: str = "replay-target",
    prompt: str,
    python_executable: str,
    source_repo_name: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Run discover/analyze/plan/propose through the target registry pipeline."""

    registry_path = workspace_root.parent / "discovery_targets.json"
    learning_root = workspace_root.parent / "learning"
    report_root = workspace_root.parent / "learning_reports"
    write_replay_registry(
        registry_path,
        target_id=target_id,
        workspace_root=workspace_root,
    )
    prepare_replay_learning_catalog(
        learning_root,
        replay_target_id=target_id,
        source_repo_name=source_repo_name,
    )
    target_args = ["--target-id", target_id, "--registry-path", str(registry_path)]
    commands = {
        "discover_architecture": ["discover-architecture", *target_args],
        "analyze_feature": ["analyze-feature", prompt, *target_args],
        "plan_feature": ["plan-feature", prompt, *target_args],
        "propose_changes": ["propose-changes", prompt, *target_args],
        "suggest_from_recipes": [
            "suggest-from-recipes",
            prompt,
            *target_args,
            "--learning-root",
            str(learning_root),
            "--report-root",
            str(report_root),
        ],
    }
    return {
        key: run_cli_command(args, python_executable=python_executable)
        for key, args in commands.items()
    }


def prepare_replay_learning_catalog(
    learning_root: Path,
    *,
    replay_target_id: str,
    source_repo_name: str | None,
) -> None:
    """Copy a matching learned recipe catalog into the temporary replay target id."""

    learning_root.mkdir(parents=True, exist_ok=True)
    destination = learning_root / replay_target_id / "change_recipes.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_catalog = find_learning_catalog_for_repo(source_repo_name)
    if source_catalog is None:
        destination.write_text("[]\n", encoding="utf-8")
        return
    destination.write_text(source_catalog.read_text(encoding="utf-8"), encoding="utf-8")


def find_learning_catalog_for_repo(
    source_repo_name: str | None,
    *,
    learning_root: Path = REPO_ROOT / "data" / "learning",
) -> Path | None:
    """Find a repo-local recipe catalog that matches the replay source repo name."""

    if not learning_root.is_dir():
        return None
    candidates: list[tuple[str, Path]] = []
    for target_dir in sorted(path for path in learning_root.iterdir() if path.is_dir()):
        catalog = target_dir / "change_recipes.json"
        if not catalog.is_file():
            continue
        state_path = target_dir / "repo_learning_state.json"
        state_repo = ""
        if state_path.is_file():
            try:
                state = json.loads(state_path.read_text(encoding="utf-8"))
                state_repo = str(state.get("repo_name") or Path(str(state.get("repo_path") or "")).name)
            except json.JSONDecodeError:
                state_repo = ""
        if source_repo_name and state_repo == source_repo_name:
            return catalog
        candidates.append((target_dir.name, catalog))
    if source_repo_name:
        slug = re.sub(r"[^a-z0-9]+", "-", source_repo_name.lower()).strip("-")
        for target_id, catalog in candidates:
            if target_id == slug or target_id in slug or slug in target_id:
                return catalog
    if len(candidates) == 1:
        return candidates[0][1]
    return None


def write_replay_registry(
    registry_path: Path,
    *,
    target_id: str,
    workspace_root: Path,
) -> None:
    """Write a temporary local_path registry matching normal target-id flow."""

    registry_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "targets": [
            {
                "id": target_id,
                "source_type": "local_path",
                "locator": str(workspace_root.resolve()),
                "ref": None,
                "hints": {
                    "replay_mode": "true",
                    "shadow_mode": "true",
                },
            }
        ]
    }
    registry_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def run_cli_command(args: Sequence[str], *, python_executable: str) -> dict[str, Any]:
    """Run one workspace-control command and capture deterministic metadata."""

    command = [python_executable, str(REPO_ROOT / "main.py"), *args]
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "command": display_command(args),
        "exit_code": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def predicted_files_from_proposal(
    payload: dict[str, Any],
    *,
    default_repo_name: str,
) -> dict[str, list[Any]]:
    """Extract comparable predicted file paths from propose-changes JSON."""

    changes = payload.get("proposed_changes", []) if isinstance(payload, dict) else []
    predicted_repos: set[str] = set()
    predicted_files: list[dict[str, Any]] = []
    reference_files: list[dict[str, Any]] = []

    if not isinstance(changes, list):
        changes = []

    for item in changes:
        if not isinstance(item, dict):
            continue
        repo_name = str(item.get("repo_name") or default_repo_name)
        predicted_repos.add(repo_name)
        file_objects = item.get("files")
        if isinstance(file_objects, list) and file_objects:
            for file_object in file_objects:
                if not isinstance(file_object, dict) or not isinstance(file_object.get("path"), str):
                    continue
                action = str(file_object.get("action") or "inspect")
                record = {
                    "path": qualify_repo_path(repo_name, file_object["path"]),
                    "repo_name": repo_name,
                    "action": action,
                    "confidence": str(file_object.get("confidence") or "medium"),
                    "reason": str(file_object.get("reason") or ""),
                }
                if action == "inspect-only":
                    reference_files.append(record)
                else:
                    predicted_files.append(record)
            continue

        legacy_paths = item.get("likely_files_to_inspect", [])
        if isinstance(legacy_paths, list):
            for path in legacy_paths:
                if isinstance(path, str):
                    predicted_files.append(
                        {
                            "path": qualify_repo_path(repo_name, path),
                            "repo_name": repo_name,
                            "action": "inspect",
                            "confidence": "medium",
                            "reason": "Legacy likely_files_to_inspect suggestion.",
                        }
                    )

    predicted_files = dedupe_records(predicted_files)
    reference_files = dedupe_records(reference_files)
    return {
        "predicted_repos": sorted(predicted_repos),
        "predicted_files": predicted_files,
        "predicted_reference_files": reference_files,
    }


def predicted_files_from_recipe_suggestions(
    payload: dict[str, Any],
    *,
    default_repo_name: str,
    snapshot_repo: Path,
) -> dict[str, list[Any]]:
    """Extract comparable predicted file paths from suggest-from-recipes JSON."""

    suggestions = payload.get("suggestions", []) if isinstance(payload, dict) else []
    predicted_repos = {default_repo_name} if suggestions else set()
    predicted_files: list[dict[str, Any]] = []
    reference_files: list[dict[str, Any]] = []
    if not isinstance(suggestions, list):
        suggestions = []

    for suggestion in suggestions:
        if not isinstance(suggestion, dict):
            continue
        raw_path = suggestion.get("suggested_path") or suggestion.get("suggested_folder")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        repo_relative = raw_path.replace("\\", "/").lstrip("/")
        exists_in_parent = (snapshot_repo / repo_relative).exists()
        action = str(suggestion.get("action") or "inspect")
        if action == "create" and exists_in_parent:
            action = "inspect"
        elif action != "create" and not exists_in_parent and Path(repo_relative).suffix:
            action = "create"
        record = {
            "path": qualify_repo_path(default_repo_name, repo_relative),
            "repo_name": default_repo_name,
            "action": action,
            "confidence": str(suggestion.get("confidence") or "medium"),
            "reason": "; ".join(str(item) for item in suggestion.get("evidence", []) if isinstance(item, str)),
            "matched_recipe_id": str(suggestion.get("matched_recipe_id") or ""),
            "node_type": str(suggestion.get("node_type") or ""),
            "exists_in_parent": exists_in_parent,
            "source": "recipe_suggestion",
        }
        if action == "inspect-only":
            reference_files.append(record)
        else:
            predicted_files.append(record)

    return {
        "predicted_repos": sorted(predicted_repos),
        "predicted_files": dedupe_records(predicted_files),
        "predicted_reference_files": dedupe_records(reference_files),
    }


def recipe_diagnostics_from_suggestions(
    payload: dict[str, Any],
    *,
    recipe_predicted: dict[str, list[Any]],
    actual_files: Sequence[str],
    default_repo_name: str,
    snapshot_repo: Path,
) -> dict[str, Any]:
    """Build recipe-specific diagnostics for replay reports."""

    matched_recipes = payload.get("matched_recipes", []) if isinstance(payload, dict) else []
    suggestions = payload.get("suggestions", []) if isinstance(payload, dict) else []
    actual_set = set(actual_files)
    folder_matches = folder_level_matches(
        [record["path"] for record in recipe_predicted["predicted_files"]],
        actual_files,
    )
    folder_matched = set(folder_matches["matched_actual_files"])
    diagnostics: list[dict[str, Any]] = []
    if not isinstance(suggestions, list):
        suggestions = []
    for suggestion in suggestions:
        if not isinstance(suggestion, dict):
            continue
        raw_path = suggestion.get("suggested_path") or suggestion.get("suggested_folder")
        if not isinstance(raw_path, str) or not raw_path:
            continue
        repo_relative = raw_path.replace("\\", "/").lstrip("/")
        qualified = qualify_repo_path(default_repo_name, repo_relative)
        diagnostics.append(
            {
                **suggestion,
                "qualified_path": qualified,
                "exists_in_parent": (snapshot_repo / repo_relative).exists(),
                "matched_actual_diff": qualified in actual_set,
                "folder_matched_actual_diff": any(
                    actual_path.startswith(qualified.rstrip("/") + "/")
                    for actual_path in folder_matched
                ),
            }
        )
    return {
        "matched_recipes": matched_recipes if isinstance(matched_recipes, list) else [],
        "suggested_actions": diagnostics,
        "predicted_repos": recipe_predicted["predicted_repos"],
        "predicted_files": recipe_predicted["predicted_files"],
        "predicted_reference_files": recipe_predicted["predicted_reference_files"],
        "missing_evidence": payload.get("missing_evidence", []) if isinstance(payload, dict) else [],
        "caveats": payload.get("caveats", []) if isinstance(payload, dict) else [],
    }


def compare_predictions(
    *,
    predicted_files: Sequence[dict[str, Any]],
    actual_files: Sequence[str],
) -> dict[str, Any]:
    """Compare predictions using exact, folder, category, and signal-aware scoring."""

    predicted_paths = sorted({item["path"] for item in predicted_files})
    actual_paths = sorted(set(actual_files))
    predicted_set = set(predicted_paths)
    actual_set = set(actual_paths)
    matched = sorted(predicted_set & actual_set)
    missed = sorted(actual_set - predicted_set)
    extra = sorted(predicted_set - actual_set)
    folder_level = folder_level_matches(predicted_paths, actual_paths)
    category_level = category_level_matches(predicted_paths, actual_paths)
    high_signal = high_signal_exact_matches(predicted_paths, actual_paths)
    static_assets = static_asset_summary(
        predicted_paths,
        actual_paths,
        exact_matched=matched,
        folder_matched=folder_level["matched_actual_files"],
    )
    return {
        "predicted_files": predicted_paths,
        "actual_files": actual_paths,
        "matched_files": matched,
        "missed_files": missed,
        "extra_predicted_files": extra,
        "precision": ratio(len(matched), len(predicted_paths)),
        "recall": ratio(len(matched), len(actual_paths)),
        "exact_file": {
            "precision": ratio(len(matched), len(predicted_paths)),
            "recall": ratio(len(matched), len(actual_paths)),
            "predicted_count": len(predicted_paths),
            "actual_count": len(actual_paths),
            "matched_count": len(matched),
            "missed_count": len(missed),
            "extra_predicted_count": len(extra),
        },
        "folder_level": folder_level,
        "category_level": category_level,
        "high_signal": high_signal,
        "static_assets": static_assets,
    }


def folder_level_matches(
    predicted_paths: Sequence[str],
    actual_paths: Sequence[str],
) -> dict[str, Any]:
    """Match actual files under predicted folder-like paths."""

    matches: list[dict[str, Any]] = []
    matched_actual: set[str] = set()
    matched_predicted: set[str] = set()
    for predicted_path in sorted(set(predicted_paths)):
        if not path_is_folder_like(predicted_path):
            continue
        prefix = predicted_path.rstrip("/") + "/"
        actual_under_folder = [
            actual_path
            for actual_path in sorted(set(actual_paths))
            if actual_path.startswith(prefix)
        ]
        if not actual_under_folder:
            continue
        matches.append(
            {
                "predicted_path": predicted_path,
                "actual_files": actual_under_folder,
            }
        )
        matched_predicted.add(predicted_path)
        matched_actual.update(actual_under_folder)

    matched_actual_files = sorted(matched_actual)
    return {
        "matches": matches,
        "matched_predicted_paths": sorted(matched_predicted),
        "matched_actual_files": matched_actual_files,
        "precision": ratio(len(matched_predicted), len(set(predicted_paths))),
        "recall": ratio(len(matched_actual_files), len(set(actual_paths))),
        "matched_predicted_count": len(matched_predicted),
        "matched_actual_count": len(matched_actual_files),
    }


def category_level_matches(
    predicted_paths: Sequence[str],
    actual_paths: Sequence[str],
) -> dict[str, Any]:
    """Compare predicted and actual surface categories."""

    predicted_by_category = paths_by_category(predicted_paths)
    actual_by_category = paths_by_category(actual_paths)
    predicted_categories = sorted(
        category for category, paths in predicted_by_category.items() if paths
    )
    actual_categories = sorted(
        category for category, paths in actual_by_category.items() if paths
    )
    predicted_set = set(predicted_categories)
    actual_set = set(actual_categories)
    matched = sorted(predicted_set & actual_set)
    missed = sorted(actual_set - predicted_set)
    extra = sorted(predicted_set - actual_set)
    return {
        "predicted_categories": predicted_categories,
        "actual_categories": actual_categories,
        "matched_categories": matched,
        "missed_categories": missed,
        "extra_predicted_categories": extra,
        "precision": ratio(len(matched), len(predicted_categories)),
        "recall": ratio(len(matched), len(actual_categories)),
        "predicted_count": len(predicted_categories),
        "actual_count": len(actual_categories),
        "matched_count": len(matched),
        "missed_count": len(missed),
        "extra_predicted_count": len(extra),
        "predicted_by_category": predicted_by_category,
        "actual_by_category": actual_by_category,
    }


def high_signal_exact_matches(
    predicted_paths: Sequence[str],
    actual_paths: Sequence[str],
) -> dict[str, Any]:
    """Compute exact-file overlap excluding low-level static assets."""

    predicted_high_signal = sorted(
        path for path in set(predicted_paths) if classify_surface(path) != "static_asset"
    )
    actual_high_signal = sorted(
        path for path in set(actual_paths) if classify_surface(path) != "static_asset"
    )
    predicted_set = set(predicted_high_signal)
    actual_set = set(actual_high_signal)
    matched = sorted(predicted_set & actual_set)
    missed = sorted(actual_set - predicted_set)
    extra = sorted(predicted_set - actual_set)
    return {
        "predicted_files": predicted_high_signal,
        "actual_files": actual_high_signal,
        "matched_files": matched,
        "missed_files": missed,
        "extra_predicted_files": extra,
        "precision": ratio(len(matched), len(predicted_high_signal)),
        "recall": ratio(len(matched), len(actual_high_signal)),
        "predicted_count": len(predicted_high_signal),
        "actual_count": len(actual_high_signal),
        "matched_count": len(matched),
        "missed_count": len(missed),
        "extra_predicted_count": len(extra),
    }


def static_asset_summary(
    predicted_paths: Sequence[str],
    actual_paths: Sequence[str],
    *,
    exact_matched: Sequence[str],
    folder_matched: Sequence[str],
) -> dict[str, Any]:
    """Summarize static asset exact/folder matches separately from high-signal files."""

    predicted_static = sorted(
        path for path in set(predicted_paths) if classify_surface(path) == "static_asset"
    )
    actual_static = sorted(
        path for path in set(actual_paths) if classify_surface(path) == "static_asset"
    )
    exact_matched_static = sorted(set(predicted_static) & set(actual_static) & set(exact_matched))
    folder_matched_static = sorted(set(actual_static) & set(folder_matched))
    covered_static = set(exact_matched_static) | set(folder_matched_static)
    return {
        "predicted_files": predicted_static,
        "actual_files": actual_static,
        "exact_matched_files": exact_matched_static,
        "folder_level_matched_files": folder_matched_static,
        "missed_files": sorted(set(actual_static) - covered_static),
        "predicted_count": len(predicted_static),
        "actual_count": len(actual_static),
        "exact_matched_count": len(exact_matched_static),
        "folder_level_matched_count": len(folder_matched_static),
        "missed_count": len(set(actual_static) - covered_static),
    }


def paths_by_category(paths: Sequence[str]) -> dict[str, list[str]]:
    """Group paths by deterministic surface category."""

    grouped = {category: [] for category in SURFACE_CATEGORIES}
    for path in sorted(set(paths)):
        grouped[classify_surface(path)].append(path)
    return grouped


def classify_surface(path: str) -> str:
    """Classify one repo-qualified path into a replay surface category."""

    lowered = path.lower()
    name = Path(path).name.lower()
    stem = Path(path).stem.lower()
    suffix = Path(path).suffix.lower()
    parts = set(re.findall(r"[a-z0-9]+", lowered))

    if is_static_asset_path(path):
        return "static_asset"
    if lowered.endswith("/public/index.html") or lowered.endswith("public/index.html"):
        return "public_html"
    if name in {"main.tsx", "main.jsx", "index.tsx", "index.jsx"} and "/src/" in lowered:
        return "frontend_entrypoint"
    if name in {"app.tsx", "app.jsx"}:
        return "app_shell"
    if stem in {"welcome", "welcomepage", "home", "homepage", "landing", "landingpage"}:
        return "landing_page"
    if "openapi" in lowered or "swagger" in lowered:
        return "api_contract"
    if name.endswith(("request.java", "response.java", "dto.java")) or (name.endswith("resource.java") and "/web/api/" in lowered):
        return "api_dto"
    if name.endswith(("controller.java", "resource.java")) or "controller" in parts:
        return "api_controller"
    if name.endswith("service.java") or "service" in parts or "services" in parts:
        return "service_layer"
    if name.endswith("repository.java") or "repository" in parts or "repositories" in parts:
        return "repository"
    if (
        "migration" in parts
        or "migrations" in parts
        or "changelog" in parts
        or suffix == ".sql"
    ):
        return "migration"
    if name.endswith("entity.java") or "entity" in parts or "entities" in parts or "model" in parts:
        return "domain_model"
    if "types" in parts or name.endswith(".d.ts"):
        return "frontend_type"
    if suffix in {".tsx", ".jsx"} or "components" in parts or "pages" in parts:
        return "frontend_component"
    return "unknown"


def is_static_asset_path(path: str) -> bool:
    """Return whether a path is a public/static asset file or folder."""

    lowered = path.lower()
    suffix = Path(path).suffix.lower()
    if suffix in STATIC_ASSET_EXTENSIONS:
        return True
    return any(
        marker in lowered
        for marker in (
            "/public/images",
            "/public/assets",
            "/public/img",
            "/public/static",
            "/src/assets",
            "/src/images",
        )
    )


def path_is_folder_like(path: str) -> bool:
    """Return whether a predicted path can reasonably stand for a folder."""

    lowered = path.lower().rstrip("/")
    if not Path(lowered).suffix:
        return True
    return any(
        lowered.endswith(marker)
        for marker in (
            "/public/images",
            "/public/assets",
            "/public/static",
            "/src/components",
            "/src/types",
            "/src/pages",
            "/src/services",
            "/src/api",
        )
    )


def write_reports(report: dict[str, Any], report_dir: Path) -> None:
    """Write latest replay JSON and Markdown reports."""

    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "latest_replay.json").write_text(
        json.dumps(report, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    (report_dir / "latest_replay.md").write_text(
        format_markdown_report(report),
        encoding="utf-8",
    )


def format_markdown_report(report: dict[str, Any]) -> str:
    """Format a replay report for quick human review."""

    summary = report["summary"]
    git_info = report["git"]
    input_info = report["input"]
    comparison = report["comparison"]
    prediction_modes = summary.get("prediction_modes", {})
    lines = [
        "# Git History Replay Eval",
        "",
        f"- repo: `{git_info['repo_name']}`",
        f"- repo path: `{input_info['repo_path']}`",
        f"- parent commit: `{git_info['parent_commit']}`",
        f"- target commit: `{git_info['target_commit']}`",
        f"- prompt: {input_info['prompt']}",
        "- source repo mode: read-only; parent snapshot was materialized from `git archive` into a temporary workspace",
        "",
        "## Summary",
        "",
        f"- commands succeeded: {summary['commands_succeeded']}",
        f"- actual files: {summary['actual_file_count']}",
        f"- recipe helped: {summary.get('recipe_helped')} ({summary.get('recipe_help_type')})",
        f"- recipe matched files: {format_inline_values(summary.get('recipe_matched_files', []))}",
        f"- static asset misses: {len(comparison['static_assets']['missed_files'])}",
        "",
        "### Prediction Mode Summary",
        "",
        "| mode | predicted | matched | exact P/R | category P/R | high-signal P/R |",
        "|---|---:|---:|---|---|---|",
    ]
    for label, key in (
        ("planner/propose only", "planner_propose"),
        ("recipe suggestions only", "recipe_suggestions"),
        ("combined", "combined"),
    ):
        metrics = prediction_modes.get(key, {})
        lines.append(
            "| "
            + " | ".join(
                [
                    label,
                    str(metrics.get("predicted_file_count", 0)),
                    str(metrics.get("matched_file_count", 0)),
                    f"{format_metric(metrics.get('exact_precision'))}/{format_metric(metrics.get('exact_recall'))}",
                    f"{format_metric(metrics.get('category_precision'))}/{format_metric(metrics.get('category_recall'))}",
                    f"{format_metric(metrics.get('high_signal_precision'))}/{format_metric(metrics.get('high_signal_recall'))}",
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "The planner/propose, recipe-only, and combined rows are intentionally separate so recipe-assisted success is not hidden by planner-only misses.",
            "",
            "## Command Results",
            "",
            "| command | exit code |",
            "|---|---:|",
        ]
    )
    for key, result in report["commands"].items():
        lines.append(f"| `{key}` | {result['exit_code']} |")

    sections = report.get("comparison_sections", {})
    if sections:
        lines.extend(section_for_prediction_comparison("Planner/Propose Predictions Only", sections["planner_propose"]))
        lines.extend(section_for_prediction_comparison("Recipe Suggestions Only", sections["recipe_suggestions"]))
        lines.extend(section_for_prediction_comparison("Combined Predictions", sections["combined"]))
    lines.extend(section_for_recipe_diagnostics(report.get("recipe_suggestions", {})))

    lines.extend(section_for_paths("Planner/Propose Predicted Files", comparison["predicted_files"]))
    lines.extend(section_for_paths("Actual Files", comparison["actual_files"]))
    lines.extend(section_for_paths("Planner/Propose Matched Files", comparison["matched_files"]))
    lines.extend(section_for_paths("Recipe Suggestions Matched Files", sections.get("recipe_suggestions", {}).get("matched_files", [])))
    lines.extend(section_for_paths("Combined Matched Files", sections.get("combined", {}).get("matched_files", [])))
    lines.extend(section_for_paths("Planner/Propose Missed Files", comparison["missed_files"]))
    lines.extend(section_for_paths("Planner/Propose Extra Predicted Files", comparison["extra_predicted_files"]))
    lines.extend(section_for_folder_matches("Planner/Propose Folder-Level Matches", comparison["folder_level"]["matches"]))
    lines.extend(section_for_category_matches("Planner/Propose Category-Level Matches", comparison["category_level"]))
    lines.extend(section_for_scoring_block("Planner/Propose Exact File Scoring", comparison["exact_file"]))
    lines.extend(section_for_scoring_block("Planner/Propose High-Signal File Scoring", comparison["high_signal"]))
    lines.extend(section_for_paths("Planner/Propose High-Signal Matched Files", comparison["high_signal"]["matched_files"]))
    lines.extend(section_for_paths("Planner/Propose High-Signal Missed Files", comparison["high_signal"]["missed_files"]))
    lines.extend(section_for_paths("Static Asset Misses", comparison["static_assets"]["missed_files"]))
    lines.extend(
        [
            "",
            "## Candidate Commit Helper",
            "",
            "Use `python3 scripts/replay_git_history_eval.py --candidate-help` for commands that help find replay candidates.",
            "",
        ]
    )
    return "\n".join(lines)


def section_for_prediction_comparison(title: str, comparison: dict[str, Any]) -> list[str]:
    """Render one replay prediction comparison section."""

    return [
        "",
        f"## {title}",
        "",
        f"- predicted files: {len(comparison['predicted_files'])}",
        f"- matched files: {len(comparison['matched_files'])}",
        f"- missed files: {len(comparison['missed_files'])}",
        f"- extra predicted files: {len(comparison['extra_predicted_files'])}",
        f"- exact precision: {comparison['precision']:.2f}",
        f"- exact recall: {comparison['recall']:.2f}",
        f"- high-signal precision: {comparison['high_signal']['precision']:.2f}",
        f"- high-signal recall: {comparison['high_signal']['recall']:.2f}",
        f"- category precision: {comparison['category_level']['precision']:.2f}",
        f"- category recall: {comparison['category_level']['recall']:.2f}",
        f"- folder-level matched actual files: {len(comparison['folder_level']['matched_actual_files'])}",
    ]


def section_for_recipe_diagnostics(recipe_suggestions: dict[str, Any]) -> list[str]:
    """Render recipe-specific diagnostics."""

    lines = ["", "## Recipe Suggestions", ""]
    matched_recipes = recipe_suggestions.get("matched_recipes", []) if isinstance(recipe_suggestions, dict) else []
    suggested_actions = recipe_suggestions.get("suggested_actions", []) if isinstance(recipe_suggestions, dict) else []
    if not matched_recipes:
        lines.append("- matched recipes: -")
    else:
        lines.append("- matched recipes:")
        for recipe in matched_recipes:
            lines.append(
                f"  - `{recipe.get('recipe_id')}` ({recipe.get('recipe_type')}, "
                f"structural={float(recipe.get('structural_confidence') or 0):.2f}, "
                f"planner={float(recipe.get('planner_effectiveness') or 0):.2f})"
            )
            reasons = recipe.get("why_matched", [])
            if reasons:
                lines.append(f"    - why: {'; '.join(str(reason) for reason in reasons[:3])}")

    lines.extend(["", "- suggested actions:"])
    if not suggested_actions:
        lines.append("  -")
    else:
        for action in suggested_actions:
            match = "exact" if action.get("matched_actual_diff") else "folder" if action.get("folder_matched_actual_diff") else "no"
            lines.append(
                f"  - `{action.get('qualified_path')}` "
                f"({action.get('action')}, {action.get('confidence')}, node={action.get('node_type')}, "
                f"exists_in_parent={action.get('exists_in_parent')}, matched_actual={match})"
            )
    return lines


def section_for_folder_matches(title: str, matches: Sequence[dict[str, Any]]) -> list[str]:
    """Render folder-level replay matches."""

    lines = ["", f"## {title}", ""]
    if not matches:
        lines.append("-")
        return lines

    for match in matches:
        lines.append(f"- `{match['predicted_path']}`")
        for actual_file in match["actual_files"]:
            lines.append(f"  - `{actual_file}`")
    return lines


def section_for_category_matches(title: str, category: dict[str, Any]) -> list[str]:
    """Render category-level replay overlap."""

    lines = [
        "",
        f"## {title}",
        "",
        f"- precision: {category['precision']:.2f}",
        f"- recall: {category['recall']:.2f}",
        f"- matched: {format_inline_values(category['matched_categories'])}",
        f"- missed: {format_inline_values(category['missed_categories'])}",
        f"- extra predicted: {format_inline_values(category['extra_predicted_categories'])}",
    ]
    return lines


def section_for_scoring_block(title: str, scoring: dict[str, Any]) -> list[str]:
    """Render a compact scoring block for exact or high-signal metrics."""

    return [
        "",
        f"## {title}",
        "",
        f"- precision: {scoring['precision']:.2f}",
        f"- recall: {scoring['recall']:.2f}",
        f"- predicted count: {scoring['predicted_count']}",
        f"- actual count: {scoring['actual_count']}",
        f"- matched count: {scoring['matched_count']}",
        f"- missed count: {scoring['missed_count']}",
        f"- extra predicted count: {scoring['extra_predicted_count']}",
    ]


def section_for_paths(title: str, paths: Sequence[str]) -> list[str]:
    """Render a deterministic Markdown section for file paths."""

    lines = ["", f"## {title}", ""]
    if not paths:
        lines.append("-")
    else:
        lines.extend(f"- `{path}`" for path in paths)
    return lines


def format_inline_values(values: Sequence[str]) -> str:
    """Render short values for Markdown summaries."""

    if not values:
        return "-"
    return ", ".join(f"`{value}`" for value in values)


def format_metric(value: Any) -> str:
    """Render a numeric metric for Markdown tables."""

    if value is None:
        return "-"
    return f"{float(value):.2f}"


def print_replay_summary(report: dict[str, Any]) -> None:
    """Print a compact terminal summary."""

    summary = report["summary"]
    print("Git history replay summary")
    print(f"repo: {report['git']['repo_name']}")
    print(f"parent: {report['git']['parent_commit']}")
    print(f"target: {report['git']['target_commit']}")
    print(f"actual files: {summary['actual_file_count']}")
    print(f"recipe helped: {summary.get('recipe_helped')} ({summary.get('recipe_help_type')})")
    print(f"recipe matched files: {', '.join(summary.get('recipe_matched_files', [])) or '-'}")
    print(f"planner predicted files: {summary['predicted_file_count']}")
    print(f"planner exact precision: {summary['exact_file_precision']:.2f}")
    print(f"planner exact recall: {summary['exact_file_recall']:.2f}")
    print(f"planner category precision: {summary['category_precision']:.2f}")
    print(f"planner category recall: {summary['category_recall']:.2f}")
    print(f"planner high-signal precision: {summary['high_signal_precision']:.2f}")
    print(f"planner high-signal recall: {summary['high_signal_recall']:.2f}")
    print(f"static asset misses: {summary['static_asset_miss_count']}")
    print(f"recipe predicted files: {summary.get('recipe_suggestion_file_count', 0)}")
    print(f"recipe exact precision: {summary.get('recipe_exact_file_precision', 0.0):.2f}")
    print(f"recipe exact recall: {summary.get('recipe_exact_file_recall', 0.0):.2f}")
    print(f"recipe category precision: {summary.get('recipe_category_precision', 0.0):.2f}")
    print(f"recipe category recall: {summary.get('recipe_category_recall', 0.0):.2f}")
    print(f"combined predicted files: {summary.get('combined_file_count', 0)}")
    print(f"combined exact precision: {summary.get('combined_exact_file_precision', 0.0):.2f}")
    print(f"combined exact recall: {summary.get('combined_exact_file_recall', 0.0):.2f}")
    print(f"combined category precision: {summary.get('combined_category_precision', 0.0):.2f}")
    print(f"combined category recall: {summary.get('combined_category_recall', 0.0):.2f}")
    print(f"report json: {report['reports']['json']}")
    print(f"report md: {report['reports']['markdown']}")


def git_run(
    repo_path: Path,
    args: Sequence[str],
    *,
    stdout: int = subprocess.PIPE,
) -> subprocess.CompletedProcess:
    """Run git in a repo path without mutating the working tree."""

    return subprocess.run(
        ["git", "-C", str(repo_path), *args],
        stdout=stdout,
        stderr=subprocess.PIPE,
        check=False,
    )


def git_output(repo_path: Path, args: Sequence[str]) -> str:
    """Return stdout from a git command or raise ReplayError."""

    completed = git_run(repo_path, args)
    if completed.returncode != 0:
        raise ReplayError(decode_stream(completed.stderr).strip() or f"git {' '.join(args)} failed")
    return decode_stream(completed.stdout).strip()


def decode_stream(value: bytes | str | None) -> str:
    """Decode subprocess output that may be bytes or text."""

    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return value


def parse_json_stdout(result: dict[str, Any]) -> dict[str, Any]:
    """Parse command stdout as JSON, returning an empty payload on failure."""

    if result.get("exit_code") != 0:
        return {}
    try:
        payload = json.loads(str(result.get("stdout", "")))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def qualify_repo_path(repo_name: str, path: str) -> str:
    """Prefix a repo-relative path with the repo name for comparison."""

    normalized = path.replace("\\", "/").lstrip("/")
    if normalized.startswith(f"{repo_name}/"):
        return normalized
    return f"{repo_name}/{normalized}"


def dedupe_records(records: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Dedupe file records by path while preserving first occurrence."""

    seen: set[str] = set()
    ordered: list[dict[str, Any]] = []
    for record in records:
        path = str(record.get("path", ""))
        if not path or path in seen:
            continue
        seen.add(path)
        ordered.append(record)
    return ordered


def ratio(numerator: int, denominator: int) -> float:
    """Return a stable ratio, using 0.0 when the denominator is empty."""

    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 4)


def display_command(args: Sequence[str]) -> str:
    """Render a workspace-control command for readable reports."""

    rendered = ["python3", "main.py", *args]
    return " ".join(quote_command_part(str(part)) for part in rendered)


def quote_command_part(value: str) -> str:
    """Quote command parts containing whitespace for display only."""

    if re.search(r"\s", value):
        return json.dumps(value)
    return value


def default_python_executable() -> str:
    """Prefer the project virtualenv while still supporting plain python3."""

    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.is_file():
        return str(venv_python)
    return sys.executable


def display_path(path: Path) -> str:
    """Return a compact path relative to the workspace when possible."""

    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
