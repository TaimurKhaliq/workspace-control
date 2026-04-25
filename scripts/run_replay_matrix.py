#!/usr/bin/env python3
"""Run a matrix of generated historical replay cases."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "reports" / "replay" / "matrix"


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True, help="Replay cases JSON file.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Aggregate matrix output directory.")
    parser.add_argument("--python-executable", default=None, help="Python executable for replay_git_history_eval.py.")
    args = parser.parse_args(argv)

    cases = load_cases(args.cases)
    report = run_replay_matrix(
        cases,
        output_dir=args.output_dir.resolve(),
        python_executable=args.python_executable or default_python_executable(),
    )
    print_matrix_summary(report)
    return 0 if report["summary"]["failed"] == 0 else 1


def load_cases(cases_path: Path) -> list[dict[str, Any]]:
    """Load replay cases from JSON."""

    payload = json.loads(cases_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Replay cases JSON must contain a list")
    cases: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        for field in ("id", "repo_path", "commit", "prompt"):
            if not item.get(field):
                raise ValueError(f"Replay case is missing required field: {field}")
        cases.append(item)
    return cases


def run_replay_matrix(
    cases: Sequence[dict[str, Any]],
    *,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    python_executable: str | None = None,
) -> dict[str, Any]:
    """Run replay eval for each case and write aggregate reports."""

    resolved_python = python_executable or default_python_executable()
    reset_output_dir(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    case_results: list[dict[str, Any]] = []
    for case in cases:
        case_id = str(case["id"])
        case_dir = output_dir / case_id
        case_dir.mkdir(parents=True, exist_ok=True)
        result = run_case(case, case_dir=case_dir, python_executable=resolved_python)
        case_results.append(result)

    report = build_matrix_report(case_results, output_dir=output_dir)
    write_matrix_reports(report, output_dir)
    return report


def reset_output_dir(output_dir: Path) -> None:
    """Clear stale matrix report artifacts before a fresh deterministic run."""

    if not output_dir.exists():
        return
    for child in output_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        elif child.name.startswith("latest_matrix."):
            child.unlink()


def run_case(case: dict[str, Any], *, case_dir: Path, python_executable: str) -> dict[str, Any]:
    """Run one replay case through replay_git_history_eval.py."""

    command = [
        python_executable,
        str(REPO_ROOT / "scripts" / "replay_git_history_eval.py"),
        "--repo-path",
        str(resolve_repo_path(str(case["repo_path"]))),
        "--commit",
        str(case["commit"]),
        "--prompt",
        str(case["prompt"]),
        "--report-dir",
        str(case_dir),
    ]
    completed = subprocess.run(command, cwd=REPO_ROOT, capture_output=True, text=True, check=False)
    report_path = case_dir / "latest_replay.json"
    replay_report: dict[str, Any] | None = None
    if report_path.is_file():
        replay_report = json.loads(report_path.read_text(encoding="utf-8"))
    return {
        "case": case,
        "id": case["id"],
        "archetype": case.get("archetype", "unknown"),
        "commit": case["commit"],
        "prompt": case["prompt"],
        "exit_code": completed.returncode,
        "succeeded": completed.returncode == 0 and replay_report is not None,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "report_dir": display_path(case_dir),
        "replay_report": replay_report,
    }


def build_matrix_report(case_results: Sequence[dict[str, Any]], *, output_dir: Path) -> dict[str, Any]:
    """Build aggregate replay matrix report."""

    summaries = [case_summary(result) for result in case_results]
    succeeded = [summary for summary in summaries if summary["succeeded"]]
    summary = {
        "total_cases": len(case_results),
        "succeeded": len(succeeded),
        "failed": len(case_results) - len(succeeded),
        "average_exact_precision": average_metric(succeeded, "exact_precision"),
        "average_exact_recall": average_metric(succeeded, "exact_recall"),
        "average_category_precision": average_metric(succeeded, "category_precision"),
        "average_category_recall": average_metric(succeeded, "category_recall"),
        "average_high_signal_precision": average_metric(succeeded, "high_signal_precision"),
        "average_high_signal_recall": average_metric(succeeded, "high_signal_recall"),
    }
    return {
        "summary": summary,
        "archetype_summary": archetype_summary(summaries),
        "candidate_quality_summary": dict(sorted(Counter(summary.get("candidate_quality", "unknown") for summary in summaries).items())),
        "cases": summaries,
        "reports": {
            "json": display_path(output_dir / "latest_matrix.json"),
            "markdown": display_path(output_dir / "latest_matrix.md"),
        },
    }


def case_summary(result: dict[str, Any]) -> dict[str, Any]:
    """Extract compact per-case metrics."""

    report = result.get("replay_report") or {}
    summary = report.get("summary", {}) if isinstance(report, dict) else {}
    return {
        "id": result["id"],
        "archetype": result.get("archetype", "unknown"),
        "commit": result["commit"],
        "prompt": result["prompt"],
        "candidate_quality": result.get("case", {}).get("candidate_quality", "unknown"),
        "prompt_quality": result.get("case", {}).get("prompt_quality", "unknown"),
        "succeeded": bool(result["succeeded"]),
        "exit_code": result["exit_code"],
        "predicted_file_count": summary.get("predicted_file_count", 0),
        "actual_file_count": summary.get("actual_file_count", 0),
        "matched_file_count": summary.get("matched_file_count", 0),
        "exact_precision": summary.get("exact_file_precision"),
        "exact_recall": summary.get("exact_file_recall"),
        "high_signal_precision": summary.get("high_signal_precision"),
        "high_signal_recall": summary.get("high_signal_recall"),
        "category_precision": summary.get("category_precision"),
        "category_recall": summary.get("category_recall"),
        "report_dir": result["report_dir"],
    }


def average_metric(summaries: Sequence[dict[str, Any]], key: str) -> float | None:
    """Average a numeric metric from successful summaries."""

    values = [float(summary[key]) for summary in summaries if isinstance(summary.get(key), int | float)]
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def archetype_summary(summaries: Sequence[dict[str, Any]]) -> dict[str, dict[str, int]]:
    """Return per-archetype case totals and success/failure counts."""

    grouped: dict[str, dict[str, int]] = {}
    for summary in summaries:
        archetype = str(summary.get("archetype", "unknown"))
        grouped.setdefault(archetype, {"total": 0, "succeeded": 0, "failed": 0})
        grouped[archetype]["total"] += 1
        if summary.get("succeeded"):
            grouped[archetype]["succeeded"] += 1
        else:
            grouped[archetype]["failed"] += 1
    return dict(sorted(grouped.items()))


def write_matrix_reports(report: dict[str, Any], output_dir: Path) -> None:
    """Write latest matrix JSON and Markdown reports."""

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "latest_matrix.json").write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    (output_dir / "latest_matrix.md").write_text(format_matrix_markdown(report), encoding="utf-8")


def format_matrix_markdown(report: dict[str, Any]) -> str:
    """Render replay matrix aggregate report."""

    summary = report["summary"]
    lines = [
        "# Replay Matrix",
        "",
        f"- total cases: {summary['total_cases']}",
        f"- succeeded: {summary['succeeded']}",
        f"- failed: {summary['failed']}",
        f"- average exact precision: {format_metric(summary['average_exact_precision'])}",
        f"- average exact recall: {format_metric(summary['average_exact_recall'])}",
        f"- average category precision: {format_metric(summary['average_category_precision'])}",
        f"- average category recall: {format_metric(summary['average_category_recall'])}",
        f"- average high-signal precision: {format_metric(summary['average_high_signal_precision'])}",
        f"- average high-signal recall: {format_metric(summary['average_high_signal_recall'])}",
        "",
        "## Archetype Summary",
        "",
    ]
    for archetype, counts in report["archetype_summary"].items():
        lines.append(f"- {archetype}: total={counts['total']}, succeeded={counts['succeeded']}, failed={counts['failed']}")

    lines.extend([
        "",
        "## Cases",
        "",
        "| id | archetype | quality | commit | succeeded | predicted | actual | matched | exact P/R | high-signal P/R | category P/R |",
        "|---|---|---|---|---:|---:|---:|---:|---|---|---|",
    ])
    for case in report["cases"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{case['id']}`",
                    str(case["archetype"]),
                    str(case["candidate_quality"]),
                    f"`{case['commit']}`",
                    str(case["succeeded"]),
                    str(case["predicted_file_count"]),
                    str(case["actual_file_count"]),
                    str(case["matched_file_count"]),
                    f"{format_metric(case['exact_precision'])}/{format_metric(case['exact_recall'])}",
                    f"{format_metric(case['high_signal_precision'])}/{format_metric(case['high_signal_recall'])}",
                    f"{format_metric(case['category_precision'])}/{format_metric(case['category_recall'])}",
                ]
            )
            + " |"
        )
    lines.append("")
    return "\n".join(lines)


def print_matrix_summary(report: dict[str, Any]) -> None:
    """Print compact terminal summary."""

    summary = report["summary"]
    print("Replay matrix summary")
    print(f"total cases: {summary['total_cases']}")
    print(f"succeeded: {summary['succeeded']}")
    print(f"failed: {summary['failed']}")
    print(f"average exact precision: {format_metric(summary['average_exact_precision'])}")
    print(f"average exact recall: {format_metric(summary['average_exact_recall'])}")
    print(f"average category precision: {format_metric(summary['average_category_precision'])}")
    print(f"average category recall: {format_metric(summary['average_category_recall'])}")
    print(f"average high-signal precision: {format_metric(summary['average_high_signal_precision'])}")
    print(f"average high-signal recall: {format_metric(summary['average_high_signal_recall'])}")
    print("archetypes: " + ", ".join(f"{key}={value['total']}" for key, value in report["archetype_summary"].items()))
    print(f"report json: {report['reports']['json']}")
    print(f"report md: {report['reports']['markdown']}")


def format_metric(value: Any) -> str:
    if value is None:
        return "-"
    return f"{float(value):.2f}"


def resolve_repo_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


def default_python_executable() -> str:
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.is_file():
        return str(venv_python)
    return sys.executable


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
