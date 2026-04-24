#!/usr/bin/env python3
"""Save a named green eval report baseline."""

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
DEFAULT_REPORT_DIR = REPO_ROOT / "reports"
BASELINE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]+$")


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for saving a named baseline."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--name",
        required=True,
        help="Baseline name, for example: green_14_case_baseline",
    )
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help="Directory containing latest_eval.json and latest_eval.md.",
    )
    args = parser.parse_args(argv)

    try:
        baseline_dir = save_baseline(args.name, report_dir=args.report_dir)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Saved baseline: {baseline_dir}")
    return 0


def save_baseline(
    name: str,
    *,
    report_dir: Path = DEFAULT_REPORT_DIR,
    timestamp: datetime | None = None,
    git_sha: str | None = None,
) -> Path:
    """Copy latest eval reports into a named baseline directory."""

    _validate_baseline_name(name)
    latest_json = report_dir / "latest_eval.json"
    latest_md = report_dir / "latest_eval.md"
    if not latest_json.is_file():
        raise ValueError(f"Missing report file: {latest_json}")
    if not latest_md.is_file():
        raise ValueError(f"Missing report file: {latest_md}")

    report = json.loads(latest_json.read_text(encoding="utf-8"))
    summary = _summary_from_report(report)
    if int(summary["failed"]) != 0:
        raise ValueError("Cannot save baseline because latest eval report is not green")

    baseline_dir = report_dir / "baselines" / name
    baseline_dir.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(latest_json, baseline_dir / "latest_eval.json")
    shutil.copyfile(latest_md, baseline_dir / "latest_eval.md")

    metadata = {
        "baseline_name": name,
        "timestamp": _timestamp_text(timestamp),
        "total_cases": int(summary["total_cases"]),
        "passed": int(summary["passed"]),
        "failed": int(summary["failed"]),
        "git_commit_sha": git_sha if git_sha is not None else _git_commit_sha(),
    }
    (baseline_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    return baseline_dir


def _validate_baseline_name(name: str) -> None:
    if not BASELINE_NAME_PATTERN.fullmatch(name):
        raise ValueError(
            "Baseline name may only contain letters, numbers, dots, underscores, and hyphens"
        )


def _summary_from_report(report: dict[str, Any]) -> dict[str, int]:
    summary = report.get("summary")
    if not isinstance(summary, dict):
        raise ValueError("latest_eval.json is missing summary")

    required = ("total_cases", "passed", "failed")
    missing = [key for key in required if key not in summary]
    if missing:
        raise ValueError(f"latest_eval.json summary is missing: {', '.join(missing)}")

    return {key: int(summary[key]) for key in required}


def _timestamp_text(timestamp: datetime | None) -> str:
    current = timestamp or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    return current.astimezone(UTC).isoformat(timespec="seconds")


def _git_commit_sha() -> str | None:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        return None
    return completed.stdout.strip() or None


if __name__ == "__main__":
    raise SystemExit(main())
