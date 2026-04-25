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
        )

    proposal_payload = parse_json_stdout(command_results["propose_changes"])
    predicted = predicted_files_from_proposal(proposal_payload, default_repo_name=repo_name)
    comparison = compare_predictions(
        predicted_files=predicted["predicted_files"],
        actual_files=actual_files,
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
        },
        "predicted_repos": predicted["predicted_repos"],
        "predicted_files": predicted["predicted_files"],
        "predicted_reference_files": predicted["predicted_reference_files"],
        "actual_files": actual_files,
        "comparison": comparison,
        "commands": command_results,
        "reports": {
            "json": display_path(report_dir / "latest_replay.json"),
            "markdown": display_path(report_dir / "latest_replay.md"),
        },
    }
    write_reports(report, report_dir)
    return report


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
) -> dict[str, dict[str, Any]]:
    """Run discover/analyze/plan/propose through the target registry pipeline."""

    registry_path = workspace_root.parent / "discovery_targets.json"
    write_replay_registry(
        registry_path,
        target_id=target_id,
        workspace_root=workspace_root,
    )
    target_args = ["--target-id", target_id, "--registry-path", str(registry_path)]
    commands = {
        "discover_architecture": ["discover-architecture", *target_args],
        "analyze_feature": ["analyze-feature", prompt, *target_args],
        "plan_feature": ["plan-feature", prompt, *target_args],
        "propose_changes": ["propose-changes", prompt, *target_args],
    }
    return {
        key: run_cli_command(args, python_executable=python_executable)
        for key, args in commands.items()
    }


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


def compare_predictions(
    *,
    predicted_files: Sequence[dict[str, Any]],
    actual_files: Sequence[str],
) -> dict[str, Any]:
    """Compare predicted files against actual changed files with exact path matching."""

    predicted_paths = sorted({item["path"] for item in predicted_files})
    actual_paths = sorted(set(actual_files))
    predicted_set = set(predicted_paths)
    actual_set = set(actual_paths)
    matched = sorted(predicted_set & actual_set)
    missed = sorted(actual_set - predicted_set)
    extra = sorted(predicted_set - actual_set)
    return {
        "predicted_files": predicted_paths,
        "actual_files": actual_paths,
        "matched_files": matched,
        "missed_files": missed,
        "extra_predicted_files": extra,
        "precision": ratio(len(matched), len(predicted_paths)),
        "recall": ratio(len(matched), len(actual_paths)),
    }


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
        f"- predicted files: {summary['predicted_file_count']}",
        f"- actual files: {summary['actual_file_count']}",
        f"- matched files: {summary['matched_file_count']}",
        f"- missed files: {summary['missed_file_count']}",
        f"- extra predicted files: {summary['extra_predicted_file_count']}",
        f"- precision: {comparison['precision']:.2f}",
        f"- recall: {comparison['recall']:.2f}",
        "",
        "## Command Results",
        "",
        "| command | exit code |",
        "|---|---:|",
    ]
    for key, result in report["commands"].items():
        lines.append(f"| `{key}` | {result['exit_code']} |")

    lines.extend(section_for_paths("Predicted Files", comparison["predicted_files"]))
    lines.extend(section_for_paths("Actual Files", comparison["actual_files"]))
    lines.extend(section_for_paths("Matched Files", comparison["matched_files"]))
    lines.extend(section_for_paths("Missed Files", comparison["missed_files"]))
    lines.extend(section_for_paths("Extra Predicted Files", comparison["extra_predicted_files"]))
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


def section_for_paths(title: str, paths: Sequence[str]) -> list[str]:
    """Render a deterministic Markdown section for file paths."""

    lines = ["", f"## {title}", ""]
    if not paths:
        lines.append("-")
    else:
        lines.extend(f"- `{path}`" for path in paths)
    return lines


def print_replay_summary(report: dict[str, Any]) -> None:
    """Print a compact terminal summary."""

    summary = report["summary"]
    print("Git history replay summary")
    print(f"repo: {report['git']['repo_name']}")
    print(f"parent: {report['git']['parent_commit']}")
    print(f"target: {report['git']['target_commit']}")
    print(f"predicted files: {summary['predicted_file_count']}")
    print(f"actual files: {summary['actual_file_count']}")
    print(f"matched files: {summary['matched_file_count']}")
    print(f"missed files: {summary['missed_file_count']}")
    print(f"extra predicted files: {summary['extra_predicted_file_count']}")
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
