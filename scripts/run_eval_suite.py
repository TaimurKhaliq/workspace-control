#!/usr/bin/env python3
"""Run deterministic JSON eval cases against planner/proposal CLI commands."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CASE_FILES = (
    REPO_ROOT / "tests" / "eval_cases" / "mixed_source.json",
    REPO_ROOT / "tests" / "eval_cases" / "metadata_only.json",
)
DEFAULT_REPORT_DIR = REPO_ROOT / "reports"
ALLOWED_COMMANDS = {"plan-feature", "propose-changes"}
EXPECTATION_ALIASES = {
    "exact": "exact",
    "equals": "exact",
    "exact_equality": "exact",
    "exact_equal": "exact",
    "array_contains": "array_contains",
    "contains": "array_contains",
    "array_excludes": "array_excludes",
    "excludes": "array_excludes",
    "field_in": "field_in",
    "field_in_allowed_set": "field_in",
    "nonempty_list": "nonempty_list",
    "non_empty_list": "nonempty_list",
}


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for running planner/proposal eval cases."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "case_files",
        nargs="*",
        type=Path,
        help="Eval case JSON files. Defaults to tests/eval_cases/*.json.",
    )
    parser.add_argument(
        "--report-dir",
        type=Path,
        default=DEFAULT_REPORT_DIR,
        help="Directory for latest_eval.json and latest_eval.md.",
    )
    args = parser.parse_args(argv)

    case_files = tuple(args.case_files) if args.case_files else DEFAULT_CASE_FILES
    result = run_eval_suite(case_files, report_dir=args.report_dir)
    print_summary(result["summary"])
    return 1 if result["summary"]["failed"] else 0


def run_eval_suite(
    case_files: Sequence[Path],
    *,
    report_dir: Path = DEFAULT_REPORT_DIR,
    repo_root: Path = REPO_ROOT,
    python_executable: str = sys.executable,
) -> dict[str, Any]:
    """Load cases, run CLI commands, check expectations, and write reports."""

    cases = load_eval_cases(case_files, repo_root=repo_root)
    case_results = [
        run_case(case, repo_root=repo_root, python_executable=python_executable)
        for case in cases
    ]
    summary = summarize_results(case_results)
    report = {"summary": summary, "cases": case_results}
    write_reports(report, report_dir)
    return report


def load_eval_cases(
    case_files: Sequence[Path],
    *,
    repo_root: Path = REPO_ROOT,
) -> list[dict[str, Any]]:
    """Load and normalize eval case JSON files."""

    cases: list[dict[str, Any]] = []
    for case_file in case_files:
        resolved_file = _resolve_path(case_file, repo_root)
        payload = json.loads(resolved_file.read_text(encoding="utf-8"))
        file_scan_root = payload.get("scan_root")
        for raw_case in payload.get("cases", []):
            case = dict(raw_case)
            case["case_file"] = _display_path(resolved_file, repo_root)
            case["scan_root"] = case.get("scan_root", file_scan_root)
            _validate_case(case)
            cases.append(case)

    return sorted(cases, key=lambda item: item["id"])


def run_case(
    case: dict[str, Any],
    *,
    repo_root: Path = REPO_ROOT,
    python_executable: str = sys.executable,
) -> dict[str, Any]:
    """Run one eval case and return a deterministic result payload."""

    scan_root = _resolve_path(Path(case["scan_root"]), repo_root)
    command = [
        python_executable,
        str(repo_root / "main.py"),
        case["command"],
        case["feature"],
        "--scan-root",
        str(scan_root),
    ]
    completed = subprocess.run(
        command,
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )

    result: dict[str, Any] = {
        "id": case["id"],
        "case_file": case["case_file"],
        "command": case["command"],
        "feature": case["feature"],
        "scan_root": _display_path(scan_root, repo_root),
        "exit_code": completed.returncode,
        "passed": False,
        "expectations": [],
    }

    if completed.returncode != 0:
        result["error"] = completed.stderr.strip() or completed.stdout.strip()
        return result

    try:
        output = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        result["error"] = f"invalid JSON output: {exc}"
        return result

    expectation_results = [
        evaluate_expectation(output, expectation)
        for expectation in case["expectations"]
    ]
    result["expectations"] = expectation_results
    result["passed"] = all(item["passed"] for item in expectation_results)
    return result


def evaluate_expectation(
    output: dict[str, Any],
    expectation: dict[str, Any],
) -> dict[str, Any]:
    """Evaluate one expectation against parsed JSON CLI output."""

    expectation_type = EXPECTATION_ALIASES.get(str(expectation.get("type", "")))
    path = str(expectation.get("path", ""))
    actual = _value_at_path(output, path)
    result = {
        "type": expectation.get("type"),
        "path": path,
        "passed": False,
        "actual": actual,
    }

    if expectation_type is None:
        result["message"] = f"unknown expectation type: {expectation.get('type')}"
        return result

    if expectation_type == "exact":
        expected = expectation.get("value")
        result["expected"] = expected
        result["passed"] = actual == expected
    elif expectation_type == "array_contains":
        expected = expectation.get("value")
        result["expected"] = f"contains {expected!r}"
        result["passed"] = isinstance(actual, list) and expected in actual
    elif expectation_type == "array_excludes":
        expected = expectation.get("value")
        result["expected"] = f"excludes {expected!r}"
        result["passed"] = isinstance(actual, list) and expected not in actual
    elif expectation_type == "field_in":
        allowed = expectation.get("allowed", expectation.get("values", []))
        result["expected"] = f"in {allowed!r}"
        result["passed"] = isinstance(allowed, list) and actual in allowed
    elif expectation_type == "nonempty_list":
        result["expected"] = "nonempty list"
        result["passed"] = isinstance(actual, list) and bool(actual)

    if not result["passed"]:
        result["message"] = "expectation failed"
    return result


def summarize_results(case_results: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Summarize eval case results."""

    failed_case_ids = [case["id"] for case in case_results if not case["passed"]]
    return {
        "total_cases": len(case_results),
        "passed": len(case_results) - len(failed_case_ids),
        "failed": len(failed_case_ids),
        "failed_case_ids": failed_case_ids,
    }


def write_reports(report: dict[str, Any], report_dir: Path) -> None:
    """Write deterministic JSON and Markdown eval reports."""

    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "latest_eval.json").write_text(
        json.dumps(report, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    (report_dir / "latest_eval.md").write_text(
        format_markdown_report(report),
        encoding="utf-8",
    )


def format_markdown_report(report: dict[str, Any]) -> str:
    """Format a deterministic Markdown report."""

    summary = report["summary"]
    failed_ids = summary["failed_case_ids"]
    lines = [
        "# Planner/Proposal Eval Report",
        "",
        f"- total cases: {summary['total_cases']}",
        f"- passed: {summary['passed']}",
        f"- failed: {summary['failed']}",
        f"- failed case ids: {', '.join(failed_ids) if failed_ids else '-'}",
        "",
        "| case id | command | result | failed expectations |",
        "|---|---|---|---|",
    ]

    for case in report["cases"]:
        failed_expectations = [
            f"{item['path']} ({item['type']})"
            for item in case["expectations"]
            if not item["passed"]
        ]
        failed_text = ", ".join(failed_expectations)
        if not failed_text and case.get("error"):
            failed_text = case["error"]
        lines.append(
            "| {id} | {command} | {result} | {failed} |".format(
                id=case["id"],
                command=case["command"],
                result="pass" if case["passed"] else "fail",
                failed=failed_text or "-",
            )
        )

    return "\n".join(lines) + "\n"


def print_summary(summary: dict[str, Any]) -> None:
    """Print the required terminal summary."""

    failed_ids = summary["failed_case_ids"]
    print(f"total cases: {summary['total_cases']}")
    print(f"passed: {summary['passed']}")
    print(f"failed: {summary['failed']}")
    print(f"failed case ids: {', '.join(failed_ids) if failed_ids else '-'}")


def _validate_case(case: dict[str, Any]) -> None:
    missing = [
        key
        for key in ("id", "command", "feature", "scan_root", "expectations")
        if not case.get(key)
    ]
    if missing:
        raise ValueError(f"Eval case is missing required fields: {', '.join(missing)}")
    if case["command"] not in ALLOWED_COMMANDS:
        raise ValueError(f"Unsupported eval command: {case['command']}")
    if not isinstance(case["expectations"], list):
        raise ValueError(f"Eval case expectations must be a list: {case['id']}")


def _value_at_path(data: Any, path: str) -> Any:
    current = data
    for segment in path.split("."):
        current = _resolve_segment(current, segment)
    return current


def _resolve_segment(current: Any, segment: str) -> Any:
    if isinstance(current, list):
        if segment == "[]":
            return current
        if segment.isdigit():
            index = int(segment)
            return current[index] if 0 <= index < len(current) else None
        return [_resolve_segment(item, segment) for item in current]

    if not isinstance(current, dict):
        return None

    if segment.endswith("[]"):
        value = current.get(segment[:-2])
        return value if isinstance(value, list) else None

    if "[" in segment and segment.endswith("]"):
        key, selector = segment[:-1].split("[", 1)
        value = current.get(key)
        return _select_from_list(value, selector)

    return current.get(segment)


def _select_from_list(value: Any, selector: str) -> Any:
    if not isinstance(value, list):
        return None

    selector_key = "repo_name"
    selector_value = selector
    if "=" in selector:
        selector_key, selector_value = selector.split("=", 1)

    for item in value:
        if isinstance(item, dict) and str(item.get(selector_key)) == selector_value:
            return item
    return None


def _resolve_path(path: Path, repo_root: Path) -> Path:
    return path if path.is_absolute() else repo_root / path


def _display_path(path: Path, repo_root: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return path.as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
