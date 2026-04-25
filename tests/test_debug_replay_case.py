import json
from pathlib import Path

from scripts import debug_replay_case as debug


def _case(**overrides):
    case = {
        "id": "ui_page_add_abc_add_page",
        "archetype": "ui_page_add",
        "commit": "abc1234",
        "prompt": "Add OwnersPage",
        "candidate_quality": "good",
        "prompt_quality": "high",
        "report_dir": "reports/replay/matrix/ui_page_add_abc_add_page",
    }
    case.update(overrides)
    return case


def _replay_report(predicted_count=0, actual_files=None, category_recall=0.0, exact_recall=0.0):
    actual_files = actual_files or ["repo/client/src/components/OwnersPage.tsx"]
    return {
        "summary": {
            "predicted_file_count": predicted_count,
            "actual_file_count": len(actual_files),
        },
        "actual_files": actual_files,
        "predicted_files": [],
        "predicted_reference_files": [],
        "comparison": {
            "predicted_files": [],
            "actual_files": actual_files,
            "exact_file": {"precision": 0.0, "recall": exact_recall},
            "category_level": {"precision": 0.0, "recall": category_recall, "predicted_by_category": {}},
            "high_signal": {"precision": 0.0, "recall": 0.0, "actual_files": actual_files},
            "static_assets": {"missed_files": []},
        },
        "commands": {},
    }


def _actual_diff(new_files=None):
    new_files = new_files or []
    return {
        "new_files": new_files,
        "existing_files": [],
        "separated_files": {"static_asset": [], "config_build": [], "docs": [], "tests": []},
    }


def _planner_outputs(primary_owner=None, proposed_change_count=0, feature_intents=None):
    return {
        "metrics": {
            "exact_recall": 0.0,
            "category_recall": 0.0,
        },
        "plan": {
            "primary_owner": primary_owner,
            "implementation_owner": primary_owner,
            "feature_intents": feature_intents or [],
            "unsupported_intents": [],
        },
        "propose": {"proposed_change_count": proposed_change_count},
    }


def test_load_matrix_case() -> None:
    matrix = {"cases": [_case(id="a"), _case(id="b")]}
    assert debug.load_matrix_case(matrix, "b")["id"] == "b"


def test_classifies_zero_prediction_failure() -> None:
    failure = debug.classify_failure(
        _case(),
        _replay_report(predicted_count=0),
        _actual_diff(),
        _planner_outputs(primary_owner=None, proposed_change_count=0),
        {"relevant_graph_nodes": [], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "planner_underpredicted" in failure["labels"]
    assert "graph_missing_surface" in failure["labels"]
    assert any("null primary" in reason for reason in failure["reasons"])


def test_classifies_category_match_but_exact_miss() -> None:
    planner = _planner_outputs(primary_owner="repo", proposed_change_count=1, feature_intents=["ui"])
    planner["metrics"] = {"exact_recall": 0.0, "category_recall": 1.0}
    failure = debug.classify_failure(
        _case(),
        _replay_report(predicted_count=1, category_recall=1.0, exact_recall=0.0),
        _actual_diff(),
        planner,
        {"relevant_graph_nodes": [{"path": "client/src/components/OwnersPage.tsx"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "exact_match_miss_but_category_match" in failure["labels"]
    assert "planner_underpredicted" in failure["labels"]


def test_classifies_new_file_hard_to_predict() -> None:
    failure = debug.classify_failure(
        _case(),
        _replay_report(predicted_count=1),
        _actual_diff(new_files=["repo/client/src/components/OwnersPage.tsx"]),
        _planner_outputs(primary_owner="repo", proposed_change_count=1, feature_intents=["ui"]),
        {"relevant_graph_nodes": [{"path": "client/src/components"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "new_file_hard_to_predict" in failure["labels"]


def test_visual_feedback_prompt_is_domain_light_not_too_vague() -> None:
    failure = debug.classify_failure(
        _case(
            archetype="ui_form_validation",
            prompt="Add visual feedback for invalid fields",
            prompt_quality="high",
        ),
        _replay_report(predicted_count=0),
        _actual_diff(),
        _planner_outputs(primary_owner=None, proposed_change_count=0, feature_intents=[]),
        {"relevant_graph_nodes": [{"path": "client/src/components/owners/NewOwnerPage.tsx"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "prompt_too_vague" not in failure["labels"]
    assert "domain_light_but_archetype_clear" in failure["labels"]


def test_debug_labels_backend_search_and_validation_gaps() -> None:
    search_failure = debug.classify_failure(
        _case(archetype="persistence_data", prompt="owners search has been case insensitive"),
        _replay_report(predicted_count=0),
        _actual_diff(),
        _planner_outputs(primary_owner=None, proposed_change_count=0, feature_intents=[]),
        {"relevant_graph_nodes": [{"path": "src/main/java/example/OwnerRepository.java"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )
    validation_failure = debug.classify_failure(
        _case(archetype="backend_api", prompt="Add max range and not null validation for adding new pet"),
        _replay_report(predicted_count=1),
        _actual_diff(),
        _planner_outputs(primary_owner="repo", proposed_change_count=1, feature_intents=["api"]),
        {"relevant_graph_nodes": [{"path": "src/main/java/example/PetRequest.java"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "backend_search_archetype_gap" in search_failure["labels"]
    assert "backend_validation_ranking_gap" in validation_failure["labels"]


def test_backend_search_prompt_is_not_too_vague_when_archetype_is_clear() -> None:
    failure = debug.classify_failure(
        _case(
            archetype="backend_search_query",
            prompt="owners search has been case insensitive",
            prompt_quality="high",
        ),
        _replay_report(predicted_count=0),
        _actual_diff(),
        _planner_outputs(primary_owner=None, proposed_change_count=0, feature_intents=[]),
        {"relevant_graph_nodes": [{"path": "src/main/java/example/OwnerRepository.java"}], "detected_frameworks": [{"repo_name": "repo"}]},
    )

    assert "prompt_too_vague" not in failure["labels"]


def test_debug_replay_case_writes_reports_from_existing_matrix(tmp_path: Path, monkeypatch) -> None:
    report_dir = tmp_path / "case-report"
    report_dir.mkdir()
    replay_report = _replay_report(predicted_count=0)
    replay_report.update(
        {
            "input": {"repo_path": "repo", "prompt": "Add page"},
            "git": {"repo_name": "repo", "parent_commit": "parent"},
            "commands": {
                "plan_feature": {"stdout": json.dumps({"primary_owner": None, "implementation_owner": None, "feature_intents": []})},
                "propose_changes": {"stdout": json.dumps({"proposed_changes": []})},
                "analyze_feature": {"stdout": "analysis"},
            },
        }
    )
    (report_dir / "latest_replay.json").write_text(json.dumps(replay_report), encoding="utf-8")
    matrix_path = tmp_path / "matrix.json"
    matrix_path.write_text(json.dumps({"cases": [_case(report_dir=str(report_dir))]}), encoding="utf-8")

    monkeypatch.setattr(
        debug,
        "materialize_parent_context",
        lambda replay_report, tmp_dir: {"workspace_root": tmp_path / "workspace", "snapshot_repo": tmp_path / "workspace" / "repo"},
    )
    monkeypatch.setattr(
        debug,
        "collect_discovery_evidence",
        lambda workspace_root, replay_report, prompt: {
            "detected_frameworks": [{"repo_name": "repo"}],
            "framework_packs": [],
            "frontend_backend_paths": {},
            "graph_node_counts": {},
            "graph_edge_count": 0,
            "relevant_tokens": [],
            "relevant_graph_nodes": [],
            "actual_file_existence": [
                {
                    "path": "repo/client/src/components/OwnersPage.tsx",
                    "exists_in_parent": False,
                    "is_new_file": True,
                    "category": "frontend_component",
                }
            ],
        },
    )

    report = debug.debug_replay_case(matrix_path=matrix_path, case_id="ui_page_add_abc_add_page", output_dir=tmp_path / "debug")

    assert "planner_underpredicted" in report["failure_classification"]["labels"]
    assert (tmp_path / "debug" / "ui_page_add_abc_add_page.json").is_file()
    assert (tmp_path / "debug" / "ui_page_add_abc_add_page.md").is_file()
