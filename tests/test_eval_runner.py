import json
import sys
from pathlib import Path

from scripts.run_eval_suite import evaluate_expectation, main, run_eval_suite

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_evaluate_expectation_supports_expected_types_and_paths() -> None:
    output = {
        "confidence": "high",
        "owners": ["service-a"],
        "proposed_changes": [
            {
                "repo_name": "service-a",
                "likely_files_to_inspect": ["src/service/ProfileService.java"],
                "possible_new_files": ["new event payload class"],
            }
        ],
    }

    expectations = [
        {"type": "exact", "path": "confidence", "value": "high"},
        {"type": "array_contains", "path": "owners", "value": "service-a"},
        {"type": "array_excludes", "path": "owners", "value": "web-ui"},
        {"type": "field_in", "path": "confidence", "allowed": ["medium", "high"]},
        {"type": "nonempty_list", "path": "proposed_changes"},
        {
            "type": "array_contains",
            "path": "proposed_changes[service-a].likely_files_to_inspect",
            "value": "src/service/ProfileService.java",
        },
        {
            "type": "array_contains",
            "path": "proposed_changes[].repo_name",
            "value": "service-a",
        },
        {
            "type": "array_contains",
            "path": "proposed_changes[].likely_files_to_inspect",
            "value": "src/service/ProfileService.java",
        },
        {
            "type": "array_excludes_substring",
            "path": "proposed_changes[].likely_files_to_inspect",
            "value": "*",
        },
    ]

    results = [evaluate_expectation(output, expectation) for expectation in expectations]

    assert all(result["passed"] for result in results)


def test_run_eval_suite_writes_reports(tmp_path: Path) -> None:
    case_file = tmp_path / "eval.json"
    case_file.write_text(
        json.dumps(
            {
                "scan_root": "tests/fixtures/mixed_source_stack",
                "cases": [
                    {
                        "id": "runner-plan-smoke",
                        "command": "plan-feature",
                        "feature": "Allow users to update their phone number from the profile screen",
                        "expectations": [
                            {
                                "type": "exact",
                                "path": "primary_owner",
                                "value": "service-a",
                            },
                            {
                                "type": "array_contains",
                                "path": "direct_dependents",
                                "value": "web-ui",
                            },
                            {
                                "type": "field_in",
                                "path": "confidence",
                                "allowed": ["medium", "high"],
                            },
                            {"type": "nonempty_list", "path": "ordered_steps"},
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    report = run_eval_suite(
        [case_file],
        report_dir=tmp_path / "reports",
        repo_root=REPO_ROOT,
        python_executable=sys.executable,
    )

    assert report["summary"] == {
        "total_cases": 1,
        "passed": 1,
        "failed": 0,
        "failed_case_ids": [],
    }
    assert (tmp_path / "reports" / "latest_eval.json").is_file()
    assert (tmp_path / "reports" / "latest_eval.md").is_file()
    assert "runner-plan-smoke" in (
        tmp_path / "reports" / "latest_eval.md"
    ).read_text(encoding="utf-8")


def test_eval_runner_main_returns_nonzero_for_failed_case(tmp_path: Path) -> None:
    case_file = tmp_path / "eval.json"
    report_dir = tmp_path / "reports"
    case_file.write_text(
        json.dumps(
            {
                "scan_root": "tests/fixtures/mixed_source_stack",
                "cases": [
                    {
                        "id": "runner-failure-smoke",
                        "command": "plan-feature",
                        "feature": "Allow users to update their phone number from the profile screen",
                        "expectations": [
                            {
                                "type": "exact",
                                "path": "primary_owner",
                                "value": "not-service-a",
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    assert main([str(case_file), "--report-dir", str(report_dir)]) == 1
    report = json.loads((report_dir / "latest_eval.json").read_text(encoding="utf-8"))
    assert report["summary"]["failed_case_ids"] == ["runner-failure-smoke"]
