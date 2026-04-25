import json
from pathlib import Path

from scripts import find_replay_candidates as finder
from scripts import run_replay_matrix as matrix


def _candidate(**overrides):
    candidate = {
        "sha": "f710ba8915af96ffcdd96aac88205f6a15eff5d3",
        "short_sha": "f710ba8",
        "subject": "feat: Add Layout and Welcome page",
        "parent_sha": "parent",
        "changed_files": [
            "client/src/components/App.tsx",
            "client/src/main.tsx",
            "client/public/index.html",
        ],
        "changed_file_count": 3,
        "categories": ["frontend_public", "frontend_ui"],
        "archetype": "ui_shell",
        "too_large": False,
        "dependency_only": False,
        "docs_only": False,
        "test_only": False,
        "asset_only": False,
        "needs_manual_prompt": False,
        "prompt": "Add Layout and Welcome page",
        "score": 80,
    }
    candidate.update(overrides)
    candidate["case_id"] = finder.stable_case_id(candidate)
    return candidate


def test_candidate_archetype_classification() -> None:
    ui_shell_files = [
        "client/src/components/App.tsx",
        "client/src/main.tsx",
        "client/public/index.html",
        "client/public/images/logo.png",
    ]
    ui_shell_categories = sorted({category for path in ui_shell_files for category in finder.classify_file_categories(path)})
    ui_shell_flags = finder.candidate_flags(ui_shell_files, ui_shell_categories, max_files=25)
    assert finder.classify_archetype(ui_shell_files, ui_shell_categories, ui_shell_flags) == "ui_shell"

    backend_files = ["src/main/java/example/rest/OwnerRestController.java", "src/main/java/example/service/OwnerService.java"]
    backend_categories = sorted({category for path in backend_files for category in finder.classify_file_categories(path)})
    backend_flags = finder.candidate_flags(backend_files, backend_categories, max_files=25)
    assert finder.classify_archetype(backend_files, backend_categories, backend_flags) == "backend_api_only"

    full_stack_files = ["client/src/components/OwnerEditor.tsx", "src/main/java/example/rest/OwnerRestController.java"]
    full_stack_categories = sorted({category for path in full_stack_files for category in finder.classify_file_categories(path)})
    full_stack_flags = finder.candidate_flags(full_stack_files, full_stack_categories, max_files=25)
    assert finder.classify_archetype(full_stack_files, full_stack_categories, full_stack_flags) == "full_stack"


def test_candidate_scoring_prefers_feature_like_clear_changes() -> None:
    useful = _candidate()
    vague = _candidate(
        subject="cleanup",
        prompt="cleanup",
        archetype="mixed_other",
        categories=["other"],
        changed_file_count=1,
        needs_manual_prompt=True,
    )
    useful["score"] = finder.score_candidate(useful)
    vague["score"] = finder.score_candidate(vague)

    assert useful["score"] > vague["score"]


def test_prompt_generation_from_commit_subject() -> None:
    prompt, needs_manual = finder.generate_prompt("feat(ui): Add Layout and Welcome page")
    assert prompt == "Add Layout and Welcome page"
    assert needs_manual is False

    prompt, needs_manual = finder.generate_prompt("fix")
    assert prompt == "fix"
    assert needs_manual is True


def test_select_and_write_replay_case_json(tmp_path: Path) -> None:
    repo_path = tmp_path / "repo"
    repo_path.mkdir()
    cases_output = tmp_path / "cases" / "auto.json"
    candidates = [_candidate(), _candidate(short_sha="abc1234", subject="docs: update README", archetype="docs_only", categories=["docs"], score=-10)]

    cases = finder.select_replay_cases(candidates, repo_path=repo_path, per_archetype=2)
    finder.write_cases(cases, cases_output)
    payload = json.loads(cases_output.read_text(encoding="utf-8"))

    assert len(payload) == 1
    assert payload[0]["id"] == "ui_shell_f710ba8_add_layout_and_welcome_page"
    assert payload[0]["commit"] == "f710ba8"
    assert payload[0]["prompt"] == "Add Layout and Welcome page"
    assert payload[0]["source"] == "auto_candidate_finder"


def test_run_replay_matrix_aggregates_mocked_replay_outputs(tmp_path: Path, monkeypatch) -> None:
    cases = [
        {
            "id": "ui_shell_f710ba8_add_layout_and_welcome_page",
            "repo_path": "repo",
            "commit": "f710ba8",
            "prompt": "Add Layout and Welcome page",
            "archetype": "ui_shell",
        },
        {
            "id": "backend_api_abcd123_add_owner_api",
            "repo_path": "repo",
            "commit": "abcd123",
            "prompt": "Add owner API",
            "archetype": "backend_api_only",
        },
    ]

    def fake_run_case(case, *, case_dir: Path, python_executable: str):
        case_dir.mkdir(parents=True, exist_ok=True)
        return {
            "case": case,
            "id": case["id"],
            "archetype": case["archetype"],
            "commit": case["commit"],
            "prompt": case["prompt"],
            "exit_code": 0,
            "succeeded": True,
            "stdout": "",
            "stderr": "",
            "report_dir": str(case_dir),
            "replay_report": {
                "summary": {
                    "predicted_file_count": 2,
                    "actual_file_count": 3,
                    "matched_file_count": 2,
                    "exact_file_precision": 1.0,
                    "exact_file_recall": 0.6667,
                    "high_signal_precision": 1.0,
                    "high_signal_recall": 1.0,
                    "category_precision": 1.0,
                    "category_recall": 0.75,
                }
            },
        }

    monkeypatch.setattr(matrix, "run_case", fake_run_case)

    report = matrix.run_replay_matrix(cases, output_dir=tmp_path / "matrix", python_executable="python")

    assert report["summary"]["total_cases"] == 2
    assert report["summary"]["succeeded"] == 2
    assert report["summary"]["failed"] == 0
    assert report["summary"]["average_exact_precision"] == 1.0
    assert report["summary"]["average_exact_recall"] == 0.6667
    assert (tmp_path / "matrix" / "latest_matrix.json").is_file()
    assert (tmp_path / "matrix" / "latest_matrix.md").is_file()
