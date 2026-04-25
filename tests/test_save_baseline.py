import json
from datetime import UTC, datetime
from pathlib import Path

from scripts.save_baseline import main, save_baseline


def _write_latest_reports(report_dir: Path, *, failed: int = 0) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    passed = 14 - failed
    (report_dir / "latest_eval.json").write_text(
        json.dumps(
            {
                "summary": {
                    "total_cases": 14,
                    "passed": passed,
                    "failed": failed,
                    "failed_case_ids": [] if failed == 0 else ["case-a"],
                },
                "cases": [],
            }
        ),
        encoding="utf-8",
    )
    (report_dir / "latest_eval.md").write_text(
        "# Planner/Proposal Eval Report\n",
        encoding="utf-8",
    )


def _write_matrix_report(report_dir: Path) -> None:
    matrix_dir = report_dir / "replay" / "matrix"
    matrix_dir.mkdir(parents=True, exist_ok=True)
    (matrix_dir / "latest_matrix.json").write_text(
        json.dumps(
            {
                "summary": {
                    "total_cases": 8,
                    "succeeded": 8,
                    "failed": 0,
                    "recipe_helped_cases": 5,
                    "combined_worse_than_planner_cases": 0,
                    "average_combined_high_signal_recall": 0.7216,
                }
            }
        ),
        encoding="utf-8",
    )
    (matrix_dir / "latest_matrix.md").write_text("# Replay Matrix\n", encoding="utf-8")


def _write_learning_report(report_dir: Path, target_id: str = "petclinic-react") -> None:
    learning_dir = report_dir / "learning" / target_id
    learning_dir.mkdir(parents=True, exist_ok=True)
    (learning_dir / "latest_learning.json").write_text(
        json.dumps(
            {
                "target_id": target_id,
                "repo_name": "spring-petclinic-reactjs",
                "status": "fresh",
                "commits_analyzed": 65,
                "recipe_counts": {"active": 7, "weak": 1},
            }
        ),
        encoding="utf-8",
    )
    (learning_dir / "latest_learning.md").write_text("# Learning\n", encoding="utf-8")


def test_save_baseline_copies_reports_and_writes_metadata(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir)
    _write_matrix_report(report_dir)
    _write_learning_report(report_dir)

    result = save_baseline(
        "green_14_case_baseline",
        reports_dir=report_dir,
        timestamp=datetime(2026, 4, 24, 12, 0, tzinfo=UTC),
        git_sha="abc123",
        include_git_status=False,
    )
    baseline_dir = result["baseline_dir"]
    metadata = json.loads((baseline_dir / "metadata.json").read_text(encoding="utf-8"))

    assert baseline_dir == report_dir / "baselines" / "green_14_case_baseline"
    assert (baseline_dir / "latest_eval.json").is_file()
    assert (baseline_dir / "latest_eval.md").is_file()
    assert (baseline_dir / "latest_matrix.json").is_file()
    assert (baseline_dir / "latest_learning.json").is_file()
    assert (baseline_dir / "README.md").is_file()
    assert (baseline_dir / "git_commit.txt").read_text(encoding="utf-8") == "abc123\n"
    assert (baseline_dir / "git_status.txt").read_text(encoding="utf-8") == "git status capture disabled\n"
    assert metadata["baseline_name"] == "green_14_case_baseline"
    assert metadata["created_at"] == "2026-04-24T12:00:00+00:00"
    assert metadata["target_id"] == "petclinic-react"
    assert metadata["git_commit"] == "abc123"
    assert metadata["eval_summary"] == {
        "total_cases": 14,
        "passed": 14,
        "failed": 0,
        "failed_case_ids": [],
    }
    assert metadata["replay_matrix_summary"]["total_cases"] == 8
    assert metadata["replay_matrix_summary"]["recipe_helped_cases"] == 5
    assert metadata["learning_summary"]["repo_name"] == "spring-petclinic-reactjs"
    assert any(item["destination"].endswith("latest_eval.json") for item in metadata["copied_files"])


def test_save_baseline_records_missing_optional_files(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir)

    result = save_baseline(
        "partial_baseline",
        reports_dir=report_dir,
        timestamp=datetime(2026, 4, 24, 12, 0, tzinfo=UTC),
        git_sha="abc123",
        include_git_status=False,
    )
    metadata = json.loads((result["baseline_dir"] / "metadata.json").read_text(encoding="utf-8"))

    assert (result["baseline_dir"] / "README.md").is_file()
    assert metadata["missing_optional_files"]
    assert any("latest_matrix.json" in path for path in metadata["missing_optional_files"])


def test_save_baseline_rejects_red_report(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir, failed=1)

    exit_code = main(
        [
            "--name",
            "red_report",
            "--reports-dir",
            str(report_dir),
        ]
    )

    assert exit_code == 1
    assert not (report_dir / "baselines" / "red_report").exists()


def test_save_baseline_rejects_unsafe_name(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir)

    exit_code = main(
        [
            "--name",
            "../bad",
            "--reports-dir",
            str(report_dir),
        ]
    )

    assert exit_code == 1
    assert not (report_dir / "bad").exists()
