#!/usr/bin/env python3
"""Save a named StackPilot baseline snapshot."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORTS_DIR = REPO_ROOT / "reports"
BASELINE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for saving a named baseline."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--name",
        required=True,
        help="Baseline name, for example: petclinic_recipe_assisted_baseline_2026_04_25",
    )
    parser.add_argument(
        "--target-id",
        default="petclinic-react",
        help="Discovery target id whose learning report should be captured.",
    )
    parser.add_argument(
        "--reports-dir",
        "--report-dir",
        dest="reports_dir",
        type=Path,
        default=DEFAULT_REPORTS_DIR,
        help="Reports directory containing eval, replay, and learning artifacts.",
    )
    parser.add_argument(
        "--include-git-status",
        dest="include_git_status",
        action="store_true",
        default=True,
        help="Write git_status.txt. Enabled by default.",
    )
    parser.add_argument(
        "--no-include-git-status",
        dest="include_git_status",
        action="store_false",
        help="Write a placeholder git_status.txt instead of running git status.",
    )
    args = parser.parse_args(argv)

    try:
        result = save_baseline(
            args.name,
            target_id=args.target_id,
            reports_dir=args.reports_dir,
            include_git_status=args.include_git_status,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved baseline: {result['baseline_dir']}")
    print("Copied files:")
    for item in result["copied_files"]:
        print(f"- {item['destination']}")
    if result["missing_optional_files"]:
        print("Missing optional files:")
        for item in result["missing_optional_files"]:
            print(f"- {item}")
    return 0


def save_baseline(
    name: str,
    *,
    target_id: str = "petclinic-react",
    reports_dir: Path = DEFAULT_REPORTS_DIR,
    report_dir: Path | None = None,
    include_git_status: bool = True,
    timestamp: datetime | None = None,
    git_sha: str | None = None,
) -> dict[str, Any]:
    """Copy current eval/replay/learning artifacts into a named baseline directory."""

    _validate_baseline_name(name)
    if report_dir is not None:
        reports_dir = report_dir
    reports_dir = reports_dir.resolve()
    created_at = _timestamp_text(timestamp)
    git_commit = git_sha if git_sha is not None else _git_output(["rev-parse", "HEAD"])

    eval_report = _read_optional_json(reports_dir / "latest_eval.json")
    if eval_report is not None:
        eval_summary = _eval_summary_from_report(eval_report)
        if int(eval_summary.get("failed", 0)) != 0:
            raise ValueError("Cannot save baseline because latest eval report is not green")
    else:
        eval_summary = None

    matrix_report = _read_optional_json(reports_dir / "replay" / "matrix" / "latest_matrix.json")
    matrix_summary = _matrix_summary_from_report(matrix_report) if matrix_report is not None else None
    learning_report = _read_optional_json(reports_dir / "learning" / target_id / "latest_learning.json")
    learning_summary = _learning_summary_from_report(learning_report) if learning_report is not None else None

    baseline_dir = reports_dir / "baselines" / name
    baseline_dir.mkdir(parents=True, exist_ok=True)

    copied_files, missing_optional_files = _copy_artifacts(
        baseline_dir,
        reports_dir=reports_dir,
        target_id=target_id,
    )

    (baseline_dir / "git_commit.txt").write_text((git_commit or "unknown") + "\n", encoding="utf-8")
    (baseline_dir / "git_status.txt").write_text(
        _git_status_text(include_git_status),
        encoding="utf-8",
    )

    metadata = {
        "baseline_name": name,
        "created_at": created_at,
        "target_id": target_id,
        "git_commit": git_commit,
        "copied_files": copied_files,
        "missing_optional_files": missing_optional_files,
        "eval_summary": eval_summary,
        "replay_matrix_summary": matrix_summary,
        "learning_summary": learning_summary,
    }
    (baseline_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    (baseline_dir / "README.md").write_text(
        _baseline_readme(
            baseline_name=name,
            created_at=created_at,
            target_id=target_id,
            git_commit=git_commit,
            eval_summary=eval_summary,
            matrix_summary=matrix_summary,
            learning_summary=learning_summary,
            copied_files=copied_files,
            missing_optional_files=missing_optional_files,
        ),
        encoding="utf-8",
    )
    return {
        "baseline_dir": baseline_dir,
        "copied_files": copied_files,
        "missing_optional_files": missing_optional_files,
        "metadata": metadata,
    }


def _copy_artifacts(
    baseline_dir: Path,
    *,
    reports_dir: Path,
    target_id: str,
) -> tuple[list[dict[str, str]], list[str]]:
    specs = [
        ("replay_matrix_markdown", reports_dir / "replay" / "matrix" / "latest_matrix.md", baseline_dir / "latest_matrix.md"),
        ("replay_matrix_json", reports_dir / "replay" / "matrix" / "latest_matrix.json", baseline_dir / "latest_matrix.json"),
        ("learning_markdown", reports_dir / "learning" / target_id / "latest_learning.md", baseline_dir / "latest_learning.md"),
        ("learning_json", reports_dir / "learning" / target_id / "latest_learning.json", baseline_dir / "latest_learning.json"),
        ("eval_markdown", reports_dir / "latest_eval.md", baseline_dir / "latest_eval.md"),
        ("eval_json", reports_dir / "latest_eval.json", baseline_dir / "latest_eval.json"),
        (
            "replay_cases",
            REPO_ROOT / "tests" / "replay_cases" / "petclinic_auto_replay_cases.json",
            baseline_dir / "petclinic_auto_replay_cases.json",
        ),
    ]
    copied: list[dict[str, str]] = []
    missing: list[str] = []
    for label, source, destination in specs:
        if source.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            copied.append(
                {
                    "label": label,
                    "source": _display_path(source),
                    "destination": _display_path(destination),
                }
            )
        else:
            missing.append(_display_path(source))
    return copied, missing


def _validate_baseline_name(name: str) -> None:
    if not BASELINE_NAME_PATTERN.fullmatch(name):
        raise ValueError(
            "Baseline name may only contain letters, numbers, dots, underscores, and hyphens"
        )


def _read_optional_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else None


def _eval_summary_from_report(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("latest_eval.json is missing summary")
    required = ("total_cases", "passed", "failed")
    missing = [key for key in required if key not in summary]
    if missing:
        raise ValueError(f"latest_eval.json summary is missing: {', '.join(missing)}")
    return {
        "total_cases": int(summary["total_cases"]),
        "passed": int(summary["passed"]),
        "failed": int(summary["failed"]),
        "failed_case_ids": list(summary.get("failed_case_ids", [])),
    }


def _matrix_summary_from_report(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary") if isinstance(report, dict) else None
    if not isinstance(summary, dict):
        return {}
    keys = [
        "total_cases",
        "succeeded",
        "failed",
        "recipe_helped_cases",
        "combined_worse_than_planner_cases",
        "average_planner_exact_precision",
        "average_planner_exact_recall",
        "average_recipe_exact_precision",
        "average_recipe_exact_recall",
        "average_combined_exact_precision",
        "average_combined_exact_recall",
        "average_planner_category_precision",
        "average_planner_category_recall",
        "average_recipe_category_precision",
        "average_recipe_category_recall",
        "average_combined_category_precision",
        "average_combined_category_recall",
        "average_planner_high_signal_precision",
        "average_planner_high_signal_recall",
        "average_recipe_high_signal_precision",
        "average_recipe_high_signal_recall",
        "average_combined_high_signal_precision",
        "average_combined_high_signal_recall",
    ]
    return {key: summary.get(key) for key in keys if key in summary}


def _learning_summary_from_report(report: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(report, dict):
        return {}
    return {
        "target_id": report.get("target_id"),
        "repo_name": report.get("repo_name"),
        "status": report.get("status"),
        "current_head": report.get("current_head"),
        "last_analyzed_commit": report.get("last_analyzed_commit"),
        "commits_analyzed": report.get("commits_analyzed"),
        "recipes_discovered_or_updated": report.get("recipes_discovered_or_updated"),
        "recipe_counts": report.get("recipe_counts", {}),
    }


def _baseline_readme(
    *,
    baseline_name: str,
    created_at: str,
    target_id: str,
    git_commit: str | None,
    eval_summary: dict[str, Any] | None,
    matrix_summary: dict[str, Any] | None,
    learning_summary: dict[str, Any] | None,
    copied_files: list[dict[str, str]],
    missing_optional_files: list[str],
) -> str:
    repo_name = (learning_summary or {}).get("repo_name") or "unknown"
    eval_status = _format_eval_status(eval_summary)
    replay_status = _format_replay_status(matrix_summary)
    recipe_helped = (matrix_summary or {}).get("recipe_helped_cases", "unknown")
    combined_worse = (matrix_summary or {}).get("combined_worse_than_planner_cases", "unknown")
    high_signal = (matrix_summary or {}).get("average_combined_high_signal_recall", "unknown")
    lines = [
        f"# {baseline_name}",
        "",
        f"- baseline name: `{baseline_name}`",
        f"- created at: `{created_at}`",
        f"- target id: `{target_id}`",
        f"- repo name: `{repo_name}`",
        f"- git commit: `{git_commit or 'unknown'}`",
        f"- eval suite: {eval_status}",
        f"- replay matrix: {replay_status}",
        f"- recipe helped cases: `{recipe_helped}`",
        f"- combined worse than planner cases: `{combined_worse}`",
        f"- combined high-signal recall: `{high_signal}`",
        "",
        "## Key Proof Points",
        "",
        "- UI shell replay predicts high-signal files for `Add Layout and Welcome page`.",
        "- UI page-add replay predicts `OwnersPage`, route config, and frontend types.",
        "- Backend search recipe recovers `initDB.sql` for case-insensitive owner search.",
        "- UI form validation recipe recovers `NewOwnerPage` for invalid-field feedback.",
        "- Combined recommendations improve recall while avoiding cases where combined is worse than planner.",
        "",
        "## Copied Artifacts",
        "",
    ]
    if copied_files:
        lines.extend(f"- `{item['destination']}`" for item in copied_files)
    else:
        lines.append("- none")
    lines.extend(["", "## Missing Optional Artifacts", ""])
    if missing_optional_files:
        lines.extend(f"- `{path}`" for path in missing_optional_files)
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def _format_eval_status(summary: dict[str, Any] | None) -> str:
    if not summary:
        return "not available"
    return f"{summary.get('passed', 0)}/{summary.get('total_cases', 0)} passed, failed={summary.get('failed', 0)}"


def _format_replay_status(summary: dict[str, Any] | None) -> str:
    if not summary:
        return "not available"
    return f"{summary.get('succeeded', 0)}/{summary.get('total_cases', 0)} succeeded, failed={summary.get('failed', 0)}"


def _timestamp_text(timestamp: datetime | None) -> str:
    current = timestamp or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(UTC).isoformat(timespec="seconds")


def _git_output(args: list[str]) -> str | None:
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return completed.stdout.strip() or None


def _git_status_text(include_git_status: bool) -> str:
    if not include_git_status:
        return "git status capture disabled\n"
    status = _git_output(["status", "--short"])
    return (status or "clean") + "\n"


def _display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
