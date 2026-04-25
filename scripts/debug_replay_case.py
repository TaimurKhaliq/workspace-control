#!/usr/bin/env python3
"""Debug one historical replay matrix case without changing planner behavior."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
VENV_PYTHON = REPO_ROOT / ".venv" / "bin" / "python"
VENV_ROOT = REPO_ROOT / ".venv"
if VENV_PYTHON.is_file() and Path(sys.prefix).resolve() != VENV_ROOT.resolve():
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.graph.pattern_packs.base import compact_tokens
from app.models.discovery import DiscoveryTarget
from app.services.architecture_discovery import ArchitectureDiscoveryService
from scripts import replay_git_history_eval as replay

DEFAULT_OUTPUT_DIR = REPO_ROOT / "reports" / "replay" / "debug"
SEPARATE_FILE_GROUPS = ("static_asset", "config_build", "docs", "tests")


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", type=Path, required=True, help="Path to latest_matrix.json.")
    parser.add_argument("--case-id", required=True, help="Replay matrix case id to debug.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Output directory for debug reports.")
    args = parser.parse_args(argv)

    try:
        report = debug_replay_case(matrix_path=args.matrix, case_id=args.case_id, output_dir=args.output_dir)
    except (OSError, KeyError, ValueError, RuntimeError) as exc:
        print(f"Error: {exc}")
        return 1

    summary = report["diagnosis_summary"]
    print("Replay case debug summary")
    print(f"case id: {report['case']['id']}")
    print(f"labels: {', '.join(report['failure_classification']['labels']) or '-'}")
    print(f"likely cause: {summary['likely_cause']}")
    print(f"recommended fix area: {summary['recommended_fix_area']}")
    print(f"report json: {report['reports']['json']}")
    print(f"report md: {report['reports']['markdown']}")
    return 0


def debug_replay_case(*, matrix_path: Path, case_id: str, output_dir: Path = DEFAULT_OUTPUT_DIR) -> dict[str, Any]:
    """Build and write a debug report for one matrix case."""

    matrix = load_matrix(matrix_path)
    case = load_matrix_case(matrix, case_id)
    replay_report = load_replay_report_for_case(case)
    plan_output = parse_command_json(replay_report, "plan_feature")
    propose_output = parse_command_json(replay_report, "propose_changes")
    analyze_output = command_stdout(replay_report, "analyze_feature")

    with tempfile.TemporaryDirectory(prefix="stackpilot-debug-replay-") as tmp_dir:
        parent_context = materialize_parent_context(replay_report, Path(tmp_dir))
        discovery_evidence = collect_discovery_evidence(
            parent_context["workspace_root"],
            replay_report=replay_report,
            prompt=str(case.get("prompt") or replay_report.get("input", {}).get("prompt") or ""),
        )

    actual_diff = build_actual_diff(replay_report, discovery_evidence["actual_file_existence"])
    planner_outputs = build_planner_outputs(replay_report, plan_output, propose_output, analyze_output)
    failure = classify_failure(case, replay_report, actual_diff, planner_outputs, discovery_evidence)
    diagnosis = build_diagnosis_summary(failure, replay_report, actual_diff, planner_outputs, discovery_evidence)

    report = {
        "case": case_metadata(case),
        "actual_diff": actual_diff,
        "planner_outputs": planner_outputs,
        "discovery_source_graph_evidence": discovery_evidence,
        "failure_classification": failure,
        "diagnosis_summary": diagnosis,
    }
    write_debug_reports(report, output_dir.resolve(), str(case["id"]))
    return report


def load_matrix(matrix_path: Path) -> dict[str, Any]:
    """Load replay matrix JSON."""

    payload = json.loads(resolve_path(matrix_path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not isinstance(payload.get("cases"), list):
        raise ValueError("Matrix report must contain a cases list")
    return payload


def load_matrix_case(matrix: dict[str, Any], case_id: str) -> dict[str, Any]:
    """Return one case summary from a matrix report."""

    for case in matrix.get("cases", []):
        if isinstance(case, dict) and case.get("id") == case_id:
            return case
    raise ValueError(f"Case id not found in matrix: {case_id}")


def load_replay_report_for_case(case: dict[str, Any]) -> dict[str, Any]:
    """Load the per-case replay report referenced by a matrix case."""

    report_dir = resolve_path(Path(str(case.get("report_dir") or "")))
    report_path = report_dir / "latest_replay.json"
    if not report_path.is_file():
        raise ValueError(f"Replay report not found for case {case.get('id')}: {report_path}")
    return json.loads(report_path.read_text(encoding="utf-8"))


def case_metadata(case: dict[str, Any]) -> dict[str, Any]:
    """Extract case metadata for the debug report."""

    return {
        "id": case.get("id"),
        "archetype": case.get("archetype"),
        "commit": case.get("commit"),
        "prompt": case.get("prompt"),
        "candidate_quality": case.get("candidate_quality"),
        "prompt_quality": case.get("prompt_quality"),
        "report_dir": case.get("report_dir"),
    }


def build_actual_diff(replay_report: dict[str, Any], actual_file_existence: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Build actual diff and surface-category section."""

    actual_files = list(replay_report.get("actual_files", []))
    categories = replay.paths_by_category(actual_files)
    grouped_special = {group: [] for group in SEPARATE_FILE_GROUPS}
    for path in actual_files:
        group = special_file_group(path)
        if group:
            grouped_special[group].append(path)
    high_signal_actual = replay_report.get("comparison", {}).get("high_signal", {}).get("actual_files", [])
    new_files = [item["path"] for item in actual_file_existence if item.get("is_new_file")]
    existing_files = [item["path"] for item in actual_file_existence if item.get("exists_in_parent")]
    return {
        "actual_changed_files": actual_files,
        "actual_file_categories": categories,
        "high_signal_actual_files": high_signal_actual,
        "separated_files": grouped_special,
        "file_existence": list(actual_file_existence),
        "new_files": sorted(new_files),
        "modified_files": sorted(existing_files),
        "existing_files": sorted(existing_files),
    }


def build_planner_outputs(
    replay_report: dict[str, Any],
    plan_output: dict[str, Any],
    propose_output: dict[str, Any],
    analyze_output: str,
) -> dict[str, Any]:
    """Build planner/proposal output diagnostics."""

    comparison = replay_report.get("comparison", {})
    comparison_sections = replay_report.get("comparison_sections", {})
    recipe_section = comparison_sections.get("recipe_suggestions", {}) if isinstance(comparison_sections, dict) else {}
    combined_section = comparison_sections.get("combined", {}) if isinstance(comparison_sections, dict) else {}
    recipe_suggestions = replay_report.get("recipe_suggestions", {})
    predicted_files = replay_report.get("predicted_files", [])
    proposed_files = extract_proposed_files(propose_output)
    return {
        "predicted_files": predicted_files,
        "predicted_file_paths": comparison.get("predicted_files", []),
        "predicted_categories": comparison.get("category_level", {}).get("predicted_by_category", {}),
        "proposed_files": proposed_files,
        "predicted_reference_files": replay_report.get("predicted_reference_files", []),
        "metrics": {
            "exact_precision": comparison.get("exact_file", {}).get("precision"),
            "exact_recall": comparison.get("exact_file", {}).get("recall"),
            "category_precision": comparison.get("category_level", {}).get("precision"),
            "category_recall": comparison.get("category_level", {}).get("recall"),
            "high_signal_precision": comparison.get("high_signal", {}).get("precision"),
            "high_signal_recall": comparison.get("high_signal", {}).get("recall"),
        },
        "recipe_suggestions": {
            "matched_recipes": recipe_suggestions.get("matched_recipes", []) if isinstance(recipe_suggestions, dict) else [],
            "suggested_actions": recipe_suggestions.get("suggested_actions", []) if isinstance(recipe_suggestions, dict) else [],
            "predicted_files": recipe_suggestions.get("predicted_files", []) if isinstance(recipe_suggestions, dict) else [],
            "metrics": {
                "exact_precision": recipe_section.get("exact_file", {}).get("precision"),
                "exact_recall": recipe_section.get("exact_file", {}).get("recall"),
                "category_precision": recipe_section.get("category_level", {}).get("precision"),
                "category_recall": recipe_section.get("category_level", {}).get("recall"),
                "high_signal_precision": recipe_section.get("high_signal", {}).get("precision"),
                "high_signal_recall": recipe_section.get("high_signal", {}).get("recall"),
            },
        },
        "combined_predictions": {
            "predicted_files": replay_report.get("combined_predictions", {}).get("predicted_files", []),
            "metrics": {
                "exact_precision": combined_section.get("exact_file", {}).get("precision"),
                "exact_recall": combined_section.get("exact_file", {}).get("recall"),
                "category_precision": combined_section.get("category_level", {}).get("precision"),
                "category_recall": combined_section.get("category_level", {}).get("recall"),
                "high_signal_precision": combined_section.get("high_signal", {}).get("precision"),
                "high_signal_recall": combined_section.get("high_signal", {}).get("recall"),
            },
        },
        "plan": {
            "primary_owner": plan_output.get("primary_owner"),
            "implementation_owner": plan_output.get("implementation_owner"),
            "domain_owner": plan_output.get("domain_owner"),
            "feature_intents": plan_output.get("feature_intents", []),
            "unsupported_intents": plan_output.get("unsupported_intents", []),
            "missing_evidence": plan_output.get("missing_evidence", []),
            "likely_paths_by_repo": plan_output.get("likely_paths_by_repo", {}),
            "ordered_steps": plan_output.get("ordered_steps", []),
        },
        "propose": {
            "implementation_owner": propose_output.get("implementation_owner"),
            "domain_owner": propose_output.get("domain_owner"),
            "feature_intents": propose_output.get("feature_intents", []),
            "unsupported_intents": propose_output.get("unsupported_intents", []),
            "proposed_change_count": len(propose_output.get("proposed_changes", []) or []),
        },
        "analyze_output_excerpt": analyze_output[:4000],
    }


def collect_discovery_evidence(
    workspace_root: Path,
    *,
    replay_report: dict[str, Any],
    prompt: str,
) -> dict[str, Any]:
    """Run discovery/source graph on the materialized parent snapshot."""

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(workspace_root))
    graph = snapshot.source_graph
    graph_nodes = graph.nodes if graph else []
    graph_edges = graph.edges if graph else []
    prompt_tokens = sorted(set(compact_tokens([prompt, *prompt.split()])))
    actual_files = list(replay_report.get("actual_files", []))
    actual_terms = sorted(set(compact_tokens([path for path in actual_files])))
    relevant_tokens = sorted(set(prompt_tokens + actual_terms))
    relevant_nodes = relevant_graph_nodes(graph_nodes, relevant_tokens)
    repo_name = replay_report.get("git", {}).get("repo_name", "")
    snapshot_repo = workspace_root / str(repo_name)

    return {
        "detected_frameworks": detected_frameworks(snapshot),
        "framework_packs": list(snapshot.loaded_framework_packs),
        "frontend_backend_paths": frontend_backend_paths(snapshot),
        "graph_node_counts": dict(sorted(Counter(node.node_type for node in graph_nodes).items())),
        "graph_edge_count": len(graph_edges),
        "relevant_tokens": relevant_tokens[:40],
        "relevant_graph_nodes": relevant_nodes,
        "query_surface_nodes": query_surface_nodes(graph_nodes, relevant_tokens),
        "actual_file_existence": actual_file_existence(snapshot_repo, repo_name=str(repo_name), actual_files=actual_files),
    }


def materialize_parent_context(replay_report: dict[str, Any], tmp_dir: Path) -> dict[str, Any]:
    """Materialize parent commit into a temporary workspace."""

    repo_path = resolve_path(Path(replay_report["input"]["repo_path"]))
    source_repo = replay.resolve_git_root(repo_path)
    repo_name = replay_report["git"]["repo_name"]
    parent_commit = replay_report["git"]["parent_commit"]
    workspace_root = tmp_dir / "workspace"
    snapshot_repo = workspace_root / repo_name
    replay.materialize_commit_snapshot(source_repo, parent_commit, snapshot_repo)
    return {"workspace_root": workspace_root, "snapshot_repo": snapshot_repo}


def detected_frameworks(snapshot: Any) -> list[dict[str, Any]]:
    """Return compact framework detection details."""

    values: list[dict[str, Any]] = []
    for repo in snapshot.report.repos:
        values.append(
            {
                "repo_name": repo.repo_name,
                "detected_frameworks": repo.detected_frameworks,
                "hinted_frameworks": repo.hinted_frameworks,
                "loaded_framework_packs": repo.loaded_framework_packs,
                "evidence_mode": repo.evidence_mode,
                "confidence": repo.confidence,
            }
        )
    return values


def frontend_backend_paths(snapshot: Any) -> dict[str, Any]:
    """Return discovered frontend/backend path evidence by repo."""

    return {
        repo.repo_name: {
            "ui_locations": repo.likely_ui_locations,
            "api_locations": repo.likely_api_locations,
            "service_locations": repo.likely_service_locations,
            "persistence_locations": repo.likely_persistence_locations,
            "event_locations": repo.likely_event_locations,
        }
        for repo in snapshot.report.repos
    }


def relevant_graph_nodes(nodes: Sequence[Any], tokens: Sequence[str]) -> list[dict[str, Any]]:
    """Return graph nodes relevant to prompt/actual-file terms."""

    token_set = set(tokens)
    matches: list[dict[str, Any]] = []
    for node in nodes:
        path_lower = node.path.lower()
        token_matches = sorted((set(node.domain_tokens) & token_set))
        path_matches = sorted(token for token in token_set if token and token in path_lower)[:8]
        if not token_matches and not path_matches:
            continue
        matches.append(
            {
                "repo_name": node.repo_name,
                "path": node.path,
                "node_type": node.node_type,
                "domain_tokens": node.domain_tokens[:12],
                "matched_terms": sorted(set(token_matches + path_matches))[:12],
                "confidence": node.confidence,
                "evidence_sources": node.evidence_sources,
                "query_metadata": query_metadata(node),
            }
        )
    return sorted(matches, key=lambda item: (-len(item["matched_terms"]), item["node_type"], item["path"]))[:25]


def query_surface_nodes(nodes: Sequence[Any], tokens: Sequence[str]) -> list[dict[str, Any]]:
    """Return compact query/search graph nodes relevant to the case."""

    token_set = set(tokens)
    results: list[dict[str, Any]] = []
    for node in nodes:
        metadata = query_metadata(node)
        if not metadata:
            continue
        node_tokens = set(getattr(node, "domain_tokens", [])) | set(compact_tokens([getattr(node, "path", "")]))
        metadata_tokens = set(compact_tokens([value for values in metadata.values() for value in values]))
        overlap = sorted((node_tokens | metadata_tokens) & token_set)
        if token_set and not overlap and getattr(node, "node_type", "") != "migration":
            continue
        results.append(
            {
                "repo_name": getattr(node, "repo_name", ""),
                "path": getattr(node, "path", ""),
                "node_type": getattr(node, "node_type", ""),
                "matched_terms": overlap[:12],
                "query_metadata": metadata,
            }
        )
    return sorted(
        results,
        key=lambda item: (
            0 if item["node_type"] == "repository" else 1 if item["node_type"] == "migration" else 2,
            -len(item["matched_terms"]),
            item["path"],
        ),
    )[:20]


def query_metadata(node: Any) -> dict[str, list[str]]:
    """Extract compact query/search metadata from a graph node."""

    raw_metadata = getattr(node, "metadata", {}) or {}
    metadata: dict[str, list[str]] = {}
    for key in ("method_names", "query_indicators", "case_insensitive_indicators", "search_terms", "table_names", "column_names"):
        raw_value = raw_metadata.get(key)
        if not isinstance(raw_value, str) or not raw_value:
            continue
        values = [value for value in raw_value.split(",") if value]
        if values:
            metadata[key] = values[:10]
    return metadata


def actual_file_existence(snapshot_repo: Path, *, repo_name: str, actual_files: Sequence[str]) -> list[dict[str, Any]]:
    """Report whether actual files existed in the parent snapshot."""

    records: list[dict[str, Any]] = []
    for qualified_path in actual_files:
        repo_relative = strip_repo_prefix(str(qualified_path), repo_name)
        exists = (snapshot_repo / repo_relative).exists()
        change_kind = "modified" if exists else "created"
        records.append(
            {
                "path": qualified_path,
                "repo_relative_path": repo_relative,
                "exists_in_parent": exists,
                "is_new_file": not exists,
                "change_kind": change_kind,
                "category": replay.classify_surface(str(qualified_path)),
                "parent_folder_exists": (snapshot_repo / repo_relative).parent.exists(),
            }
        )
    return records


def classify_failure(
    case: dict[str, Any],
    replay_report: dict[str, Any],
    actual_diff: dict[str, Any],
    planner_outputs: dict[str, Any],
    discovery_evidence: dict[str, Any],
) -> dict[str, Any]:
    """Assign deterministic replay failure labels."""

    labels: set[str] = set()
    reasons: list[str] = []
    summary = replay_report.get("summary", {})
    metrics = planner_outputs["metrics"]
    recipe_outputs = planner_outputs.get("recipe_suggestions", {})
    recipe_metrics = recipe_outputs.get("metrics", {})
    matched_recipes = recipe_outputs.get("matched_recipes", [])
    recipe_suggested_paths = recipe_action_paths(recipe_outputs.get("suggested_actions", []) or [])
    recipe_predicted_count = len(recipe_outputs.get("predicted_files", []) or [])
    recipe_exact_recall = float(recipe_metrics.get("exact_recall") or 0.0)
    recipe_category_recall = float(recipe_metrics.get("category_recall") or 0.0)
    predicted_count = int(summary.get("predicted_file_count", 0) or 0)
    actual_count = int(summary.get("actual_file_count", 0) or 0)
    exact_recall = float(metrics.get("exact_recall") or 0.0)
    category_recall = float(metrics.get("category_recall") or 0.0)
    plan = planner_outputs["plan"]
    propose = planner_outputs["propose"]

    if case.get("candidate_quality") and case.get("candidate_quality") != "good":
        labels.add("bad_candidate")
        reasons.append("Candidate quality is not good.")
    if case.get("prompt_quality") == "low":
        labels.add("bad_prompt")
        reasons.append("Prompt quality is low.")
    if prompt_too_vague(
        str(case.get("prompt", "")),
        plan,
        prompt_quality=str(case.get("prompt_quality", "")),
    ):
        labels.add("prompt_too_vague")
        reasons.append("Prompt did not produce clear feature intents or ownership.")
    elif domain_light_but_archetype_clear(str(case.get("prompt", "")), str(case.get("archetype", ""))):
        labels.add("domain_light_but_archetype_clear")
        reasons.append("Prompt lacks a strong domain token but has clear archetype terms.")
    if _identifier_page_prompt(str(case.get("prompt", ""))) and not plan.get("feature_intents"):
        labels.add("identifier_normalization_gap")
        reasons.append("Prompt contains an identifier-style page name that did not become UI intent.")
    if case.get("archetype") == "ui_page_add" and "ui" not in plan.get("feature_intents", []):
        labels.add("ui_page_add_archetype_gap")
        reasons.append("UI page-add archetype did not produce UI intent.")
    if case.get("archetype") == "persistence_data" and search_query_prompt(str(case.get("prompt", ""))):
        labels.add("backend_search_archetype_gap")
        reasons.append("Search/query prompt was classified as persistence_data.")
    if case.get("archetype") in {"backend_api", "persistence_data"} and backend_validation_prompt(str(case.get("prompt", ""))):
        labels.add("backend_validation_ranking_gap")
        reasons.append("Backend validation prompt was not classified as backend_validation_change.")
    if case.get("archetype") == "ui_form_validation" and strong_validation_prompt(str(case.get("prompt", ""))):
        if any(is_route_error_surface_path(path) for path in recipe_suggested_paths):
            labels.add("page_error_surface_confusion")
            reasons.append("Recipe suggestions chose route-level error pages for field-validation work.")
        if (
            matched_recipes
            and recipe_exact_recall == 0.0
            and validation_surface_exists(discovery_evidence)
            and not any(is_form_validation_surface_path(path) for path in recipe_suggested_paths)
        ):
            labels.add("validation_surface_ranking_gap")
            reasons.append("Form-field validation surfaces existed, but recipe suggestions did not rank them.")
    if case.get("archetype") in {"config_build", "docs_comments", "refactor_move", "infra_deployment", "reject"}:
        labels.add("unsupported_change_type")
        reasons.append("Archetype is not a product-feature planning case.")
    if predicted_count == 0:
        labels.add("planner_underpredicted")
        reasons.append("No predicted files were emitted.")
        if not plan.get("primary_owner") and not plan.get("implementation_owner"):
            reasons.append("Plan produced null primary and implementation owners.")
        if propose.get("proposed_change_count") == 0:
            reasons.append("propose-changes emitted no proposed changes.")
        if plan.get("unsupported_intents"):
            reasons.append("Plan reported unsupported intents.")
        if not discovery_evidence.get("relevant_graph_nodes"):
            labels.add("graph_missing_surface")
            reasons.append("No relevant source graph nodes matched prompt or actual-file terms.")
    elif exact_recall == 0.0:
        labels.add("planner_underpredicted")
        reasons.append("Predicted files did not exactly match actual changed files.")
    if predicted_count > actual_count and actual_count > 0:
        labels.add("planner_overpredicted")
        reasons.append("Predicted more files than actually changed.")
    if category_recall > 0 and exact_recall == 0:
        labels.add("exact_match_miss_but_category_match")
        reasons.append("Predictions matched at least one surface category but missed exact files.")
    if not matched_recipes and case.get("archetype") in {
        "backend_api",
        "backend_search_query",
        "backend_validation_change",
        "full_stack_ui_api",
        "persistence_data",
        "ui_form_validation",
        "ui_page_add",
        "ui_shell",
    }:
        labels.add("recipe_matching_gap")
        reasons.append("Recipe sidecar did not match a learned recipe for this archetype.")
    elif matched_recipes and recipe_predicted_count == 0:
        labels.add("recipe_application_gap")
        reasons.append("Recipe sidecar matched a recipe but emitted no predicted files.")
    elif matched_recipes and recipe_exact_recall == 0.0 and recipe_category_recall == 0.0:
        labels.add("recipe_application_gap")
        reasons.append("Recipe sidecar emitted suggestions, but they did not match actual files or categories.")
    elif matched_recipes and recipe_exact_recall == 0.0 and recipe_category_recall > 0.0:
        labels.add("exact_match_miss_but_category_match")
        reasons.append("Recipe suggestions matched categories but missed exact files.")
    if actual_diff["new_files"]:
        labels.add("new_file_hard_to_predict")
        reasons.append("At least one actual changed file did not exist in the parent snapshot.")
    if actual_diff["separated_files"].get("static_asset"):
        labels.add("static_asset_heavy")
        reasons.append("Actual diff includes static assets, which are often low-signal exact-file misses.")
    if discovery_evidence.get("relevant_graph_nodes") and predicted_count == 0:
        labels.add("graph_found_surface_but_proposal_missed")
        reasons.append("Source graph found relevant surfaces, but propose-changes emitted no files.")
        if case.get("archetype") == "ui_page_add":
            labels.add("new_file_prediction_gap")
            reasons.append("Relevant page surfaces were found, but no new page file was proposed.")
    if not discovery_evidence.get("detected_frameworks"):
        labels.add("source_discovery_gap")
        reasons.append("Discovery did not report framework evidence.")

    return {"labels": sorted(labels), "reasons": reasons}


def build_diagnosis_summary(
    failure: dict[str, Any],
    replay_report: dict[str, Any],
    actual_diff: dict[str, Any],
    planner_outputs: dict[str, Any],
    discovery_evidence: dict[str, Any],
) -> dict[str, str]:
    """Build a short deterministic diagnosis summary."""

    labels = set(failure["labels"])
    metrics = planner_outputs.get("metrics", {})
    exact_recall = float(metrics.get("exact_recall") or 0.0)
    high_signal_recall = float(metrics.get("high_signal_recall") or 0.0)
    if "bad_candidate" in labels or "unsupported_change_type" in labels:
        fix_area = "candidate classification"
        cause = "The case appears to be outside the default product-feature replay benchmark."
    elif "identifier_normalization_gap" in labels or "ui_page_add_archetype_gap" in labels:
        fix_area = "planner"
        cause = "The prompt names a UI page surface, but intent/ownership did not recognize it."
    elif "new_file_prediction_gap" in labels:
        fix_area = "propose-changes"
        cause = "The planner found relevant UI page surfaces but did not propose the new file."
    elif "bad_prompt" in labels or "prompt_too_vague" in labels:
        fix_area = "prompt generation"
        cause = "The prompt did not provide enough actionable product/surface intent."
    elif "backend_search_archetype_gap" in labels:
        fix_area = "candidate classification"
        cause = "Search/query behavior was classified as persistence instead of backend search/query."
    elif "backend_validation_ranking_gap" in labels:
        fix_area = "candidate classification"
        cause = "Backend validation behavior was not classified or ranked as backend validation."
    elif "page_error_surface_confusion" in labels or "validation_surface_ranking_gap" in labels:
        fix_area = "recipe application"
        cause = "Field-validation recipe ranking confused generic route error pages with form/input validation surfaces."
    elif "domain_light_but_archetype_clear" in labels and "recipe_application_gap" in labels:
        fix_area = "recipe application"
        cause = "The prompt is domain-light but has clear validation intent; recipe application needs better generic validation surfaces."
    elif "source_discovery_gap" in labels or "graph_missing_surface" in labels:
        fix_area = "source graph"
        cause = "Discovery or source graph evidence did not expose the expected surfaces."
    elif "recipe_matching_gap" in labels:
        fix_area = "recipe matching"
        cause = "Learned recipes exist, but the request did not match the right recipe family."
    elif "recipe_application_gap" in labels:
        fix_area = "recipe application"
        cause = "A learned recipe matched, but its node/path pattern application missed the actual changed surfaces."
    elif "graph_found_surface_but_proposal_missed" in labels:
        fix_area = "propose-changes"
        cause = "Relevant graph surfaces were found, but proposal emitted no useful file predictions."
    elif "planner_underpredicted" in labels:
        fix_area = "planner"
        cause = "Planner/proposal underpredicted exact files for an otherwise supported change."
    elif "exact_match_miss_but_category_match" in labels or "static_asset_heavy" in labels:
        fix_area = "replay scoring"
        cause = "Exact-file scoring is harsher than surface/category scoring for this change."
    elif exact_recall >= 1.0 or high_signal_recall >= 1.0:
        fix_area = "none"
        cause = "Planner predicted the actual high-signal changed files; remaining labels reflect conservative references or new-file difficulty."
    else:
        fix_area = "none"
        cause = "No major deterministic failure label was assigned."

    return {
        "likely_cause": cause,
        "recommended_fix_area": fix_area,
        "why": " ".join(failure.get("reasons", [])) or cause,
    }


def prompt_too_vague(
    prompt: str,
    plan: dict[str, Any],
    *,
    prompt_quality: str = "",
) -> bool:
    if prompt_quality == "high" and _identifier_page_prompt(prompt):
        return False
    if strong_validation_prompt(prompt):
        return False
    if search_query_prompt(prompt) and prompt_quality == "high":
        return False
    words = [word for word in prompt.split() if word.strip()]
    return len(words) <= 2 or (not plan.get("feature_intents") and not plan.get("primary_owner") and not plan.get("implementation_owner"))


def _identifier_page_prompt(prompt: str) -> bool:
    return bool(re.search(r"\b[A-Z][A-Za-z0-9]*(?:Page|View|Screen)\b", prompt))


def strong_validation_prompt(prompt: str) -> bool:
    normalized = prompt.lower().replace("-", " ")
    return bool(
        re.search(
            r"\b(visual feedback|invalid fields?|field feedback|error handling|validation|required field|not null|max range|min range|constraint|regex)\b",
            normalized,
        )
    )


def backend_validation_prompt(prompt: str) -> bool:
    normalized = prompt.lower().replace("-", " ")
    return bool(re.search(r"\b(validation|required|not null|max range|min range|constraint|regex)\b", normalized))


def search_query_prompt(prompt: str) -> bool:
    normalized = prompt.lower().replace("-", " ")
    return bool(re.search(r"\b(search|filter|case insensitive|query|find by|lookup)\b", normalized))


def domain_light_but_archetype_clear(prompt: str, archetype: str) -> bool:
    return archetype == "ui_form_validation" and strong_validation_prompt(prompt)


def recipe_action_paths(actions: Sequence[Any]) -> list[str]:
    """Return normalized suggested paths from recipe action records."""

    paths: list[str] = []
    for action in actions:
        if not isinstance(action, dict):
            continue
        path = action.get("qualified_path") or action.get("suggested_path") or action.get("suggested_folder")
        if isinstance(path, str) and path:
            paths.append(path)
    return paths


def is_route_error_surface_path(path: str) -> bool:
    lowered = path.lower()
    return "errorpage" in lowered or "notfoundpage" in lowered or "/404" in lowered


def is_form_validation_surface_path(path: str) -> bool:
    lowered = path.lower()
    return any(term in lowered for term in ("form", "editor", "edit", "newowner", "ownereditor", "/owners/"))


def validation_surface_exists(discovery_evidence: dict[str, Any]) -> bool:
    for node in discovery_evidence.get("relevant_graph_nodes", []) or []:
        if not isinstance(node, dict):
            continue
        path = str(node.get("path", ""))
        node_type = str(node.get("node_type", ""))
        if node_type in {"form_component", "edit_surface"} or is_form_validation_surface_path(path):
            return True
    return False


def extract_proposed_files(propose_output: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract proposed file objects from propose-changes output."""

    files: list[dict[str, Any]] = []
    for change in propose_output.get("proposed_changes", []) or []:
        repo_name = change.get("repo_name")
        for file_item in change.get("files", []) or []:
            if isinstance(file_item, dict):
                files.append({"repo_name": repo_name, **file_item})
    return files


def special_file_group(path: str) -> str | None:
    lowered = path.lower()
    if replay.is_static_asset_path(path):
        return "static_asset"
    if any(marker in lowered for marker in ("pom.xml", "build.gradle", "package.json", "webpack", "config", ".properties")):
        return "config_build"
    if any(marker in lowered for marker in ("readme", "/docs/", ".md", ".adoc", ".rst")):
        return "docs"
    if any(marker in lowered for marker in ("test", "tests", "spec")):
        return "tests"
    return None


def parse_command_json(replay_report: dict[str, Any], command_name: str) -> dict[str, Any]:
    try:
        payload = json.loads(command_stdout(replay_report, command_name))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def command_stdout(replay_report: dict[str, Any], command_name: str) -> str:
    return str(replay_report.get("commands", {}).get(command_name, {}).get("stdout", ""))


def strip_repo_prefix(path: str, repo_name: str) -> str:
    prefix = f"{repo_name}/"
    if path.startswith(prefix):
        return path[len(prefix):]
    return path


def write_debug_reports(report: dict[str, Any], output_dir: Path, case_id: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{case_id}.json"
    md_path = output_dir / f"{case_id}.md"
    report["reports"] = {"json": replay.display_path(json_path), "markdown": replay.display_path(md_path)}
    json_path.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    md_path.write_text(format_markdown(report), encoding="utf-8")


def format_markdown(report: dict[str, Any]) -> str:
    case = report["case"]
    failure = report["failure_classification"]
    diagnosis = report["diagnosis_summary"]
    actual = report["actual_diff"]
    planner = report["planner_outputs"]
    discovery = report["discovery_source_graph_evidence"]
    lines = [
        "# Replay Case Debug",
        "",
        f"- case id: `{case['id']}`",
        f"- archetype: `{case.get('archetype')}`",
        f"- commit: `{case.get('commit')}`",
        f"- prompt: {case.get('prompt')}",
        f"- candidate quality: `{case.get('candidate_quality')}`",
        f"- prompt quality: `{case.get('prompt_quality')}`",
        "",
        "## Diagnosis",
        "",
        f"- labels: {format_inline(failure['labels'])}",
        f"- likely cause: {diagnosis['likely_cause']}",
        f"- recommended fix area: `{diagnosis['recommended_fix_area']}`",
        f"- why: {diagnosis['why']}",
        "",
        "## Metrics",
        "",
    ]
    for key, value in planner["metrics"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Recipe Sidecar", ""])
    recipe = planner.get("recipe_suggestions", {})
    for key, value in recipe.get("metrics", {}).items():
        lines.append(f"- recipe {key}: {value}")
    matched_recipes = recipe.get("matched_recipes", [])
    if matched_recipes:
        lines.append("- matched recipes:")
        for matched in matched_recipes:
            lines.append(
                f"  - `{matched.get('recipe_id')}` ({matched.get('recipe_type')}, "
                f"structural={matched.get('structural_confidence')}, planner={matched.get('planner_effectiveness')})"
            )
    else:
        lines.append("- matched recipes: -")
    suggested_actions = recipe.get("suggested_actions", [])
    lines.append("- suggested actions:")
    if suggested_actions:
        for action in suggested_actions[:12]:
            lines.append(
                f"  - `{action.get('qualified_path')}` action={action.get('action')} "
                f"node={action.get('node_type')} exists_in_parent={action.get('exists_in_parent')} "
                f"matched_actual={action.get('matched_actual_diff')}"
            )
    else:
        lines.append("  -")
    combined = planner.get("combined_predictions", {})
    lines.extend(["", "## Combined Prediction Metrics", ""])
    for key, value in combined.get("metrics", {}).items():
        lines.append(f"- combined {key}: {value}")
    lines.extend(section_for_paths("Predicted Files", planner["predicted_file_paths"]))
    lines.extend(section_for_paths("Actual Files", actual["actual_changed_files"]))
    lines.extend(section_for_paths("High-Signal Actual Files", actual["high_signal_actual_files"]))
    lines.extend(section_for_paths("New Actual Files", actual["new_files"]))
    lines.extend(section_for_paths("Modified Actual Files", actual["modified_files"]))
    lines.extend(["", "## Plan/Proposal", ""])
    for key, value in planner["plan"].items():
        if key in {"ordered_steps", "likely_paths_by_repo"}:
            continue
        lines.append(f"- plan {key}: `{value}`")
    lines.append(f"- proposed change count: {planner['propose']['proposed_change_count']}")
    lines.extend(["", "## Discovery / Source Graph", ""])
    lines.append(f"- graph edge count: {discovery['graph_edge_count']}")
    lines.append(f"- graph node counts: `{discovery['graph_node_counts']}`")
    lines.append(f"- relevant tokens: {format_inline(discovery['relevant_tokens'][:20])}")
    lines.extend(section_for_query_nodes(discovery.get("query_surface_nodes", [])))
    lines.extend(section_for_graph_nodes(discovery["relevant_graph_nodes"]))
    return "\n".join(lines) + "\n"


def section_for_paths(title: str, paths: Sequence[str]) -> list[str]:
    lines = ["", f"## {title}", ""]
    if not paths:
        lines.append("-")
    else:
        lines.extend(f"- `{path}`" for path in paths)
    return lines


def section_for_graph_nodes(nodes: Sequence[dict[str, Any]]) -> list[str]:
    lines = ["", "## Relevant Graph Nodes", ""]
    if not nodes:
        lines.append("-")
    else:
        for node in nodes[:12]:
            lines.append(f"- `{node['path']}` ({node['node_type']}) terms={format_inline(node['matched_terms'])}")
    return lines


def section_for_query_nodes(nodes: Sequence[dict[str, Any]]) -> list[str]:
    lines = ["", "## Query/Search Surface Nodes", ""]
    if not nodes:
        lines.append("-")
    else:
        for node in nodes[:12]:
            metadata = node.get("query_metadata", {})
            indicators = metadata.get("query_indicators", []) + metadata.get("case_insensitive_indicators", [])
            methods = metadata.get("method_names", [])
            lines.append(
                f"- `{node['path']}` ({node['node_type']}) terms={format_inline(node.get('matched_terms', []))} "
                f"methods={format_inline(methods[:4])} indicators={format_inline(indicators[:5])}"
            )
    return lines


def format_inline(values: Sequence[Any]) -> str:
    if not values:
        return "-"
    return ", ".join(f"`{value}`" for value in values)


def resolve_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    return (REPO_ROOT / path).resolve()


if __name__ == "__main__":
    raise SystemExit(main())
