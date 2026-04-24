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


def test_save_baseline_copies_reports_and_writes_metadata(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir)

    baseline_dir = save_baseline(
        "green_14_case_baseline",
        report_dir=report_dir,
        timestamp=datetime(2026, 4, 24, 12, 0, tzinfo=UTC),
        git_sha="abc123",
    )

    metadata = json.loads((baseline_dir / "metadata.json").read_text(encoding="utf-8"))

    assert baseline_dir == report_dir / "baselines" / "green_14_case_baseline"
    assert (baseline_dir / "latest_eval.json").read_text(encoding="utf-8") == (
        report_dir / "latest_eval.json"
    ).read_text(encoding="utf-8")
    assert (baseline_dir / "latest_eval.md").read_text(encoding="utf-8") == (
        report_dir / "latest_eval.md"
    ).read_text(encoding="utf-8")
    assert metadata == {
        "baseline_name": "green_14_case_baseline",
        "timestamp": "2026-04-24T12:00:00+00:00",
        "total_cases": 14,
        "passed": 14,
        "failed": 0,
        "git_commit_sha": "abc123",
    }


def test_save_baseline_rejects_red_report(tmp_path: Path) -> None:
    report_dir = tmp_path / "reports"
    _write_latest_reports(report_dir, failed=1)

    exit_code = main(
        [
            "--name",
            "red_report",
            "--report-dir",
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
            "--report-dir",
            str(report_dir),
        ]
    )

    assert exit_code == 1
    assert not (report_dir / "bad").exists()
