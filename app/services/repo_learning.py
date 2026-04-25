"""Repo-local deterministic learning loop for mined change recipes."""

from __future__ import annotations

import json
import re
import tempfile
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.models.discovery import DiscoveryTargetRecord
from app.models.repo_learning import (
    ChangeRecipe,
    CommitLearningObservation,
    RecipeValidationResult,
    RepoLearningReport,
    RepoLearningState,
)
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from scripts import find_replay_candidates as candidates
from scripts import replay_git_history_eval as replay

DEFAULT_LEARNING_ROOT = Path("data") / "learning"
DEFAULT_LEARNING_REPORT_ROOT = Path("reports") / "learning"
DEFAULT_PROMOTE_THRESHOLD = 2
DEFAULT_QUARANTINE_THRESHOLD = 3
SKIP_WORDS = {
    "a",
    "add",
    "an",
    "and",
    "change",
    "create",
    "edit",
    "for",
    "in",
    "new",
    "no",
    "of",
    "on",
    "the",
    "to",
    "update",
    "with",
    "yet",
}
RECIPE_TYPE_BY_ARCHETYPE = {
    "ui_shell": "ui_shell_layout",
    "ui_page_add": "ui_page_add",
    "ui_form_validation": "ui_form_validation",
    "backend_api": "backend_api_change",
    "persistence_data": "persistence_data_change",
    "full_stack_ui_api": "full_stack_ui_api",
    "config_build": "config_build_change",
}


class RepoLearningService:
    """Refresh and report repo-local deterministic change recipe learning state."""

    def __init__(
        self,
        *,
        registry: DiscoveryTargetRegistry,
        learning_root: Path = DEFAULT_LEARNING_ROOT,
        report_root: Path = DEFAULT_LEARNING_REPORT_ROOT,
        python_executable: str | None = None,
    ) -> None:
        self.registry = registry
        self.learning_root = learning_root
        self.report_root = report_root
        self.python_executable = python_executable or replay.default_python_executable()

    def refresh_target(
        self,
        target_id: str,
        *,
        limit: int = 300,
        max_files: int = 30,
        since_last: bool = True,
        force_full_rescan: bool = False,
        promote_threshold: int = DEFAULT_PROMOTE_THRESHOLD,
        quarantine_threshold: int = DEFAULT_QUARANTINE_THRESHOLD,
    ) -> RepoLearningReport:
        """Refresh learning state for one registered discovery target."""

        record = self.registry.get(target_id)
        try:
            repo_path = self._repo_path_for_record(record)
            previous_state = self.load_state(target_id)
            previous_last = previous_state.last_analyzed_commit if previous_state else None
            current_head = git_output(repo_path, ["rev-parse", "HEAD"])
            commit_meta = self._commits_to_analyze(
                repo_path,
                limit=limit,
                last_analyzed_commit=previous_last,
                since_last=since_last,
                force_full_rescan=force_full_rescan,
            )
            selected = self._usable_candidates(
                repo_path,
                commit_meta,
                max_files=max_files,
            )
            recipes = self.load_recipes(target_id)
            validations = self.load_validation_history(target_id)
            analyzed_ids: list[str] = []
            updated_recipe_ids: set[str] = set()

            for candidate in selected:
                analyzed_ids.append(candidate["sha"])
                observation = build_observation(repo_path, candidate)
                replay_report = self._run_replay(repo_path, candidate, target_id)
                for recipe in _matching_recipes(recipes, observation):
                    result = validation_result_from_replay(
                        recipe,
                        observation,
                        candidate,
                        replay_report,
                    )
                    validations.append(result)
                    update_recipe_from_validation(
                        recipe,
                        result,
                        promote_threshold=promote_threshold,
                        quarantine_threshold=quarantine_threshold,
                    )
                    updated_recipe_ids.add(recipe.id)

                recipe = upsert_recipe_from_observation(
                    recipes,
                    target_id=target_id,
                    observation=observation,
                    promote_threshold=promote_threshold,
                )
                updated_recipe_ids.add(recipe.id)

            analyzed_commits = _dedupe(
                [
                    *(previous_state.analyzed_commits if previous_state else []),
                    *analyzed_ids,
                ]
            )
            last_analyzed = current_head if commit_meta else previous_last
            now = datetime.now(UTC).replace(microsecond=0).isoformat()
            state = RepoLearningState(
                target_id=target_id,
                repo_name=repo_path.name,
                repo_path=_display_path(repo_path),
                current_head=current_head,
                last_analyzed_commit=last_analyzed,
                analyzed_commits=analyzed_commits,
                recipe_catalog_path=_display_path(self.recipe_catalog_path(target_id)),
                validation_history_path=_display_path(self.validation_history_path(target_id)),
                last_learning_run_at=now,
                status="fresh" if current_head == last_analyzed else "stale",
            )
            recipes = sorted(recipes, key=lambda item: (item.recipe_type, item.id))
            validations = sorted(validations, key=lambda item: (item.commit, item.recipe_id))
            self.save_state(state)
            self.save_recipes(target_id, recipes)
            self.save_validation_history(target_id, validations)
            report = self._build_report(
                state,
                previous_last=previous_last,
                commits_considered=len(commit_meta),
                commits_analyzed=len(analyzed_ids),
                recipes=recipes,
                validations=validations,
                updated_recipe_ids=updated_recipe_ids,
            )
            self.write_report(report)
            return report
        except Exception as exc:
            state = self._error_state(target_id, record, exc)
            self.save_state(state)
            report = RepoLearningReport(
                target_id=target_id,
                repo_name=state.repo_name,
                repo_path=state.repo_path,
                status="error",
                current_head=state.current_head,
                last_analyzed_commit=state.last_analyzed_commit,
                error=str(exc),
                reports=_report_paths(target_id, self.report_root),
            )
            self.write_report(report)
            return report

    def refresh_all_targets(self, **kwargs: Any) -> list[RepoLearningReport]:
        """Refresh learning for every registered target."""

        return [
            self.refresh_target(target.id, **kwargs)
            for target in self.registry.list_targets()
        ]

    def status(self, target_id: str | None = None) -> list[RepoLearningState]:
        """Return learning status for one target or all known targets."""

        target_ids = [target_id] if target_id else [target.id for target in self.registry.list_targets()]
        states: list[RepoLearningState] = []
        for current_id in target_ids:
            if current_id is None:
                continue
            try:
                record = self.registry.get(current_id)
                state = self.load_state(current_id)
                repo_path = self._repo_path_for_record(record)
                head = git_output(repo_path, ["rev-parse", "HEAD"])
                if state is None:
                    state = self._missing_state(current_id, record, repo_path, head)
                elif state.current_head != head:
                    state = state.model_copy(update={"current_head": head, "status": "stale"})
                else:
                    state = state.model_copy(update={"status": "fresh"})
            except Exception as exc:
                record = self.registry.get(current_id)
                state = self._error_state(current_id, record, exc)
            states.append(state)
        return sorted(states, key=lambda item: item.target_id)

    def recipes_for_target(self, target_id: str) -> list[ChangeRecipe]:
        """Return learned recipes for one target."""

        return sorted(
            self.load_recipes(target_id),
            key=lambda item: (item.status, -item.confidence, item.recipe_type, item.id),
        )

    def state_path(self, target_id: str) -> Path:
        return self.learning_root / target_id / "repo_learning_state.json"

    def recipe_catalog_path(self, target_id: str) -> Path:
        return self.learning_root / target_id / "change_recipes.json"

    def validation_history_path(self, target_id: str) -> Path:
        return self.learning_root / target_id / "validation_history.json"

    def load_state(self, target_id: str) -> RepoLearningState | None:
        path = self.state_path(target_id)
        if not path.is_file():
            return None
        return RepoLearningState.model_validate(json.loads(path.read_text(encoding="utf-8")))

    def load_recipes(self, target_id: str) -> list[ChangeRecipe]:
        path = self.recipe_catalog_path(target_id)
        if not path.is_file():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        return [ChangeRecipe.model_validate(item) for item in data]

    def load_validation_history(self, target_id: str) -> list[RecipeValidationResult]:
        path = self.validation_history_path(target_id)
        if not path.is_file():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        return [RecipeValidationResult.model_validate(item) for item in data]

    def save_state(self, state: RepoLearningState) -> None:
        _write_json(self.state_path(state.target_id), state.model_dump(mode="python"))

    def save_recipes(self, target_id: str, recipes: Sequence[ChangeRecipe]) -> None:
        _write_json(
            self.recipe_catalog_path(target_id),
            [recipe.model_dump(mode="python") for recipe in recipes],
        )

    def save_validation_history(
        self,
        target_id: str,
        validations: Sequence[RecipeValidationResult],
    ) -> None:
        _write_json(
            self.validation_history_path(target_id),
            [item.model_dump(mode="python") for item in validations],
        )

    def write_report(self, report: RepoLearningReport) -> None:
        paths = _report_paths(report.target_id, self.report_root)
        json_path = Path(paths["json"])
        md_path = Path(paths["markdown"])
        _write_json(json_path, report.model_dump(mode="python"))
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(format_learning_report(report), encoding="utf-8")

    def _repo_path_for_record(self, record: DiscoveryTargetRecord) -> Path:
        snapshot = ArchitectureDiscoveryService().discover(record.to_target())
        root = snapshot.workspace.root_path
        git_repos = _git_repos_under(root)
        if git_repos:
            return git_repos[0]
        if (root / ".git").exists():
            return root
        raise ValueError(f"No git repository found for target: {record.id}")

    def _commits_to_analyze(
        self,
        repo_path: Path,
        *,
        limit: int,
        last_analyzed_commit: str | None,
        since_last: bool,
        force_full_rescan: bool,
    ) -> list[dict[str, str]]:
        if (
            since_last
            and not force_full_rescan
            and last_analyzed_commit
            and _commit_exists(repo_path, last_analyzed_commit)
        ):
            return recent_non_merge_commits_since(
                repo_path,
                last_analyzed_commit,
                limit=limit,
            )
        return list(reversed(candidates.recent_non_merge_commits(repo_path, limit=limit)))

    def _usable_candidates(
        self,
        repo_path: Path,
        commit_meta: Sequence[dict[str, str]],
        *,
        max_files: int,
    ) -> list[dict[str, Any]]:
        usable: list[dict[str, Any]] = []
        for commit in commit_meta:
            candidate = candidates.build_candidate(repo_path, commit, max_files=max_files)
            if candidate.get("candidate_quality") == "reject":
                continue
            if candidate.get("prompt_quality") == "low":
                continue
            usable.append(candidate)
        return usable

    def _run_replay(
        self,
        repo_path: Path,
        candidate: dict[str, Any],
        target_id: str,
    ) -> dict[str, Any]:
        with tempfile.TemporaryDirectory(prefix="stackpilot-learning-replay-") as tmp_dir:
            return replay.run_replay_eval(
                repo_path=repo_path,
                commit=str(candidate["short_sha"]),
                prompt=str(candidate["prompt"]),
                report_dir=Path(tmp_dir),
                python_executable=self.python_executable,
            )

    def _build_report(
        self,
        state: RepoLearningState,
        *,
        previous_last: str | None,
        commits_considered: int,
        commits_analyzed: int,
        recipes: Sequence[ChangeRecipe],
        validations: Sequence[RecipeValidationResult],
        updated_recipe_ids: set[str],
    ) -> RepoLearningReport:
        counts = Counter(recipe.status for recipe in recipes)
        examples = [
            recipe
            for recipe in recipes
            if recipe.status in {"active", "candidate"}
        ][:5]
        stale = [
            recipe
            for recipe in recipes
            if recipe.status in {"stale", "quarantined"}
        ][:5]
        return RepoLearningReport(
            target_id=state.target_id,
            repo_name=state.repo_name,
            repo_path=state.repo_path,
            status=state.status,
            current_head=state.current_head,
            previous_last_analyzed_commit=previous_last,
            last_analyzed_commit=state.last_analyzed_commit,
            commits_considered=commits_considered,
            commits_analyzed=commits_analyzed,
            recipes_discovered_or_updated=len(updated_recipe_ids),
            validation_results=len(validations),
            recipe_counts=dict(sorted(counts.items())),
            analyzed_commit_ids=state.analyzed_commits[-commits_analyzed:] if commits_analyzed else [],
            active_or_candidate_examples=examples,
            stale_or_quarantined_recipes=stale,
            reports=_report_paths(state.target_id, self.report_root),
        )

    def _missing_state(
        self,
        target_id: str,
        record: DiscoveryTargetRecord,
        repo_path: Path,
        head: str,
    ) -> RepoLearningState:
        return RepoLearningState(
            target_id=target_id,
            repo_name=repo_path.name,
            repo_path=_display_path(repo_path),
            current_head=head,
            last_analyzed_commit=None,
            analyzed_commits=[],
            recipe_catalog_path=_display_path(self.recipe_catalog_path(target_id)),
            validation_history_path=_display_path(self.validation_history_path(target_id)),
            last_learning_run_at=None,
            status="missing",
        )

    def _error_state(
        self,
        target_id: str,
        record: DiscoveryTargetRecord,
        exc: Exception,
    ) -> RepoLearningState:
        existing = self.load_state(target_id)
        repo_path = Path(record.locator)
        return RepoLearningState(
            target_id=target_id,
            repo_name=existing.repo_name if existing else repo_path.name,
            repo_path=existing.repo_path if existing else str(repo_path),
            current_head=existing.current_head if existing else None,
            last_analyzed_commit=existing.last_analyzed_commit if existing else None,
            analyzed_commits=existing.analyzed_commits if existing else [],
            recipe_catalog_path=_display_path(self.recipe_catalog_path(target_id)),
            validation_history_path=_display_path(self.validation_history_path(target_id)),
            last_learning_run_at=existing.last_learning_run_at if existing else None,
            status="error",
        )


def build_observation(repo_path: Path, candidate: dict[str, Any]) -> CommitLearningObservation:
    """Build a normalized learning observation from one candidate commit."""

    status = changed_files_by_status(repo_path, candidate["parent_sha"], candidate["sha"])
    changed_files = sorted(set(candidate["changed_files"]) | set(status["deleted_files"]))
    categories = sorted(
        {
            category
            for path in changed_files
            for category in candidates.classify_file_categories(path)
        }
    )
    node_types = sorted({replay.classify_surface(path) for path in changed_files})
    return CommitLearningObservation(
        commit=candidate["sha"],
        subject=candidate["subject"],
        parent=candidate["parent_sha"],
        changed_files=changed_files,
        created_files=status["created_files"],
        modified_files=status["modified_files"],
        deleted_files=status["deleted_files"],
        changed_categories=categories,
        changed_node_types=node_types,
        inferred_archetype=candidate["archetype"],
        candidate_quality=candidate["candidate_quality"],
        prompt_quality=candidate["prompt_quality"],
    )


def upsert_recipe_from_observation(
    recipes: list[ChangeRecipe],
    *,
    target_id: str,
    observation: CommitLearningObservation,
    promote_threshold: int,
) -> ChangeRecipe:
    """Create or update a recipe using mined commit evidence."""

    recipe_type = recipe_type_for_archetype(observation.inferred_archetype)
    recipe_id = recipe_id_for(
        target_id,
        recipe_type,
        observation.changed_node_types,
    )
    recipe = next((item for item in recipes if item.id == recipe_id), None)
    if recipe is None:
        recipe = ChangeRecipe(id=recipe_id, target_id=target_id, recipe_type=recipe_type)
        recipes.append(recipe)

    recipe.source_commits = _dedupe([*recipe.source_commits, observation.commit])
    recipe.trigger_terms = _dedupe([*recipe.trigger_terms, *trigger_terms(observation.subject)])[:20]
    recipe.changed_node_types = _dedupe([*recipe.changed_node_types, *observation.changed_node_types])[:20]
    recipe.changed_path_patterns = _dedupe([*recipe.changed_path_patterns, *path_patterns(observation.changed_files)])[:24]
    recipe.new_file_patterns = _dedupe([*recipe.new_file_patterns, *path_patterns(observation.created_files)])[:20]
    recipe.cochange_patterns = _dedupe([*recipe.cochange_patterns, *cochange_patterns(observation.changed_node_types)])[:20]
    recipe.required_existing_node_types = recipe.changed_node_types[:3]
    recipe.optional_existing_node_types = recipe.changed_node_types[3:8]
    recipe.support_count = len(recipe.source_commits)
    recipe.last_seen_commit = observation.commit
    if recipe.status != "quarantined":
        recipe.confidence = min(1.0, round(recipe.confidence + 0.15, 4))
    recipe.evidence = _dedupe(
        [
            *recipe.evidence,
            f"{observation.commit[:7]}: {observation.subject}",
        ]
    )[:12]
    if (
        recipe.support_count >= promote_threshold
        and recipe.status == "candidate"
        and recipe.failure_count == 0
        and recipe.confidence >= 0.3
    ):
        recipe.status = "active"
    return recipe


def validation_result_from_replay(
    recipe: ChangeRecipe,
    observation: CommitLearningObservation,
    candidate: dict[str, Any],
    report: dict[str, Any],
) -> RecipeValidationResult:
    """Convert one replay report into a recipe validation result."""

    summary = report.get("summary", {})
    comparison = report.get("comparison", {})
    predicted_files = [item["path"] for item in report.get("predicted_files", [])]
    actual_files = list(report.get("actual_files", []))
    predicted_categories = sorted(
        comparison.get("category_level", {})
        .get("predicted_by_category", {})
        .keys()
    )
    actual_categories = sorted(replay.paths_by_category(actual_files).keys())
    exact_recall = float(summary.get("exact_file_recall") or 0.0)
    category_recall = float(summary.get("category_recall") or 0.0)
    high_signal_recall = float(summary.get("high_signal_recall") or 0.0)
    if high_signal_recall >= 0.8 or exact_recall >= 0.8:
        outcome = "confirmed"
    elif category_recall > 0.0 or high_signal_recall > 0.0 or exact_recall > 0.0:
        outcome = "partial"
    else:
        outcome = "missed"

    return RecipeValidationResult(
        commit=observation.commit,
        recipe_id=recipe.id,
        prompt=str(candidate["prompt"]),
        predicted_categories=predicted_categories,
        actual_categories=actual_categories,
        predicted_files=predicted_files,
        actual_files=actual_files,
        exact_precision=float(summary.get("exact_file_precision") or 0.0),
        exact_recall=exact_recall,
        category_precision=float(summary.get("category_precision") or 0.0),
        category_recall=category_recall,
        high_signal_precision=float(summary.get("high_signal_precision") or 0.0),
        high_signal_recall=high_signal_recall,
        outcome=outcome,
        notes=f"{outcome} against {observation.inferred_archetype} commit",
    )


def update_recipe_from_validation(
    recipe: ChangeRecipe,
    result: RecipeValidationResult,
    *,
    promote_threshold: int,
    quarantine_threshold: int,
) -> None:
    """Update confidence and status from one validation result."""

    recipe.validation_count += 1
    if result.outcome == "confirmed":
        recipe.success_count += 1
        recipe.confidence = min(1.0, round(recipe.confidence + 0.2, 4))
    elif result.outcome == "partial":
        recipe.confidence = min(1.0, round(recipe.confidence + 0.05, 4))
    elif result.outcome == "missed":
        recipe.failure_count += 1
        recipe.confidence = max(0.0, round(recipe.confidence - 0.2, 4))

    if recipe.failure_count >= quarantine_threshold:
        recipe.status = "quarantined"
        recipe.confidence = min(recipe.confidence, 0.2)
    elif recipe.failure_count > recipe.success_count and recipe.validation_count >= quarantine_threshold:
        recipe.status = "stale"
    elif (
        recipe.failure_count == 0
        and recipe.confidence >= 0.3
        and (recipe.support_count >= promote_threshold or recipe.success_count >= promote_threshold)
    ):
        recipe.status = "active"


def recipe_type_for_archetype(archetype: str) -> str:
    return RECIPE_TYPE_BY_ARCHETYPE.get(archetype, "unknown")


def recipe_id_for(target_id: str, recipe_type: str, node_types: Sequence[str]) -> str:
    key = "_".join(sorted(node_types)[:3]) or "unknown"
    return f"{_slug(target_id)}_{recipe_type}_{_slug(key)}"


def recent_non_merge_commits_since(
    repo_path: Path,
    last_commit: str,
    *,
    limit: int,
) -> list[dict[str, str]]:
    """Return chronological non-merge commit metadata after last_commit."""

    output = candidates.git_output(
        repo_path,
        [
            "log",
            "--no-merges",
            "--reverse",
            f"--max-count={limit}",
            "--pretty=format:%H%x01%P%x01%s",
            f"{last_commit}..HEAD",
        ],
    )
    commits: list[dict[str, str]] = []
    for line in output.splitlines():
        parts = line.split("\x01")
        if len(parts) != 3:
            continue
        sha, parents, subject = parts
        parent_sha = parents.split()[0] if parents.split() else ""
        if not parent_sha:
            continue
        commits.append(
            {
                "sha": sha,
                "short_sha": sha[:7],
                "parent_sha": parent_sha,
                "subject": subject.strip(),
            }
        )
    return commits


def changed_files_by_status(repo_path: Path, parent_sha: str, sha: str) -> dict[str, list[str]]:
    """Return changed files grouped by git status."""

    output = candidates.git_output(repo_path, ["diff", "--name-status", parent_sha, sha])
    created: list[str] = []
    modified: list[str] = []
    deleted: list[str] = []
    for line in output.splitlines():
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        status = parts[0]
        path = parts[-1].strip()
        if status.startswith("A"):
            created.append(path)
        elif status.startswith("D"):
            deleted.append(path)
        else:
            modified.append(path)
    return {
        "created_files": sorted(created),
        "modified_files": sorted(modified),
        "deleted_files": sorted(deleted),
    }


def format_learning_report(report: RepoLearningReport) -> str:
    """Render a learning refresh report as Markdown."""

    lines = [
        f"# Learning Report: {report.target_id}",
        "",
        f"- repo: `{report.repo_name}`",
        f"- status: {report.status}",
        f"- current head: `{report.current_head or '-'}`",
        f"- previous last analyzed: `{report.previous_last_analyzed_commit or '-'}`",
        f"- last analyzed: `{report.last_analyzed_commit or '-'}`",
        f"- commits considered: {report.commits_considered}",
        f"- commits analyzed: {report.commits_analyzed}",
        f"- recipes discovered/updated: {report.recipes_discovered_or_updated}",
        f"- validation results: {report.validation_results}",
        "",
        "## Recipe Counts",
        "",
    ]
    if report.recipe_counts:
        lines.extend(f"- {key}: {value}" for key, value in sorted(report.recipe_counts.items()))
    else:
        lines.append("- none")

    lines.extend(["", "## Active/Candidate Examples", ""])
    if report.active_or_candidate_examples:
        for recipe in report.active_or_candidate_examples:
            lines.append(
                f"- `{recipe.id}` ({recipe.recipe_type}, {recipe.status}, confidence={recipe.confidence:.2f}, support={recipe.support_count})"
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Stale/Quarantined", ""])
    if report.stale_or_quarantined_recipes:
        for recipe in report.stale_or_quarantined_recipes:
            lines.append(
                f"- `{recipe.id}` ({recipe.status}, failures={recipe.failure_count}, confidence={recipe.confidence:.2f})"
            )
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def format_learning_status(states: Sequence[RepoLearningState], recipes_by_target: dict[str, Sequence[ChangeRecipe]]) -> str:
    """Render learning statuses as a deterministic table."""

    if not states:
        return "No learning state found."

    headers = [
        "target_id",
        "repo",
        "status",
        "current_head",
        "last_analyzed",
        "recipes",
        "active",
        "candidate",
        "stale",
        "quarantined",
        "commits",
        "last_run",
    ]
    rows: list[list[str]] = []
    for state in states:
        recipes = list(recipes_by_target.get(state.target_id, []))
        counts = Counter(recipe.status for recipe in recipes)
        rows.append(
            [
                state.target_id,
                state.repo_name,
                state.status,
                (state.current_head or "-")[:7],
                (state.last_analyzed_commit or "-")[:7],
                str(len(recipes)),
                str(counts.get("active", 0)),
                str(counts.get("candidate", 0)),
                str(counts.get("stale", 0)),
                str(counts.get("quarantined", 0)),
                str(len(state.analyzed_commits)),
                state.last_learning_run_at or "-",
            ]
        )
    return _format_table(headers, rows)


def format_recipe_list(recipes: Sequence[ChangeRecipe]) -> str:
    """Render learned recipes as a deterministic table."""

    if not recipes:
        return "No change recipes learned for this target."

    headers = [
        "recipe_id",
        "type",
        "status",
        "confidence",
        "support",
        "validations",
        "success",
        "failure",
        "examples",
        "node_types",
        "cochanges",
    ]
    rows = [
        [
            recipe.id,
            recipe.recipe_type,
            recipe.status,
            f"{recipe.confidence:.2f}",
            str(recipe.support_count),
            str(recipe.validation_count),
            str(recipe.success_count),
            str(recipe.failure_count),
            ", ".join(commit[:7] for commit in recipe.source_commits[:3]) or "-",
            ", ".join(recipe.changed_node_types[:4]) or "-",
            ", ".join(recipe.cochange_patterns[:3]) or "-",
        ]
        for recipe in recipes
    ]
    return _format_table(headers, rows)


def print_refresh_summary(reports: Sequence[RepoLearningReport]) -> str:
    """Render a compact terminal refresh summary."""

    total_analyzed = sum(report.commits_analyzed for report in reports)
    total_updated = sum(report.recipes_discovered_or_updated for report in reports)
    lines = [
        "Learning refresh summary",
        f"targets: {len(reports)}",
        f"commits analyzed: {total_analyzed}",
        f"recipes discovered/updated: {total_updated}",
    ]
    for report in reports:
        counts = ", ".join(f"{key}={value}" for key, value in sorted(report.recipe_counts.items())) or "none"
        lines.extend(
            [
                f"- {report.target_id}: status={report.status}, repo={report.repo_name}, commits={report.commits_analyzed}, recipes={counts}",
                f"  report json: {report.reports.get('json', '-')}",
                f"  report md: {report.reports.get('markdown', '-')}",
            ]
        )
        if report.error:
            lines.append(f"  error: {report.error}")
    return "\n".join(lines)


def git_output(repo_path: Path, args: Sequence[str]) -> str:
    return replay.git_output(repo_path, args)


def trigger_terms(subject: str) -> list[str]:
    normalized = candidates.normalize_subject(subject)
    return _dedupe(
        token
        for token in re.findall(r"[a-z0-9]+", normalized.lower())
        if token not in SKIP_WORDS and len(token) > 1
    )[:12]


def path_patterns(paths: Sequence[str]) -> list[str]:
    patterns: list[str] = []
    for path in paths:
        parent = Path(path).parent.as_posix()
        suffix = Path(path).suffix
        if parent and parent != ".":
            patterns.append(parent)
        if suffix:
            patterns.append(f"*{suffix}")
    return _dedupe(patterns)


def cochange_patterns(node_types: Sequence[str]) -> list[str]:
    values = sorted(set(node_types))
    patterns: list[str] = []
    for left_index, left in enumerate(values):
        for right in values[left_index + 1 :]:
            patterns.append(f"{left} + {right}")
    return patterns[:20]


def _matching_recipes(
    recipes: Sequence[ChangeRecipe],
    observation: CommitLearningObservation,
) -> list[ChangeRecipe]:
    observation_terms = set(trigger_terms(observation.subject))
    observation_type = recipe_type_for_archetype(observation.inferred_archetype)
    observation_nodes = set(observation.changed_node_types)
    matches = [
        recipe
        for recipe in recipes
        if recipe.status != "quarantined"
        and (
            recipe.recipe_type == observation_type
            or (
                len(observation_terms & set(recipe.trigger_terms)) >= 2
                and bool(observation_nodes & set(recipe.changed_node_types))
            )
        )
    ]
    return sorted(matches, key=lambda item: item.id)


def _git_repos_under(root: Path) -> list[Path]:
    if (root / ".git").exists():
        return [root.resolve()]
    if not root.is_dir():
        return []
    return sorted(
        [child.resolve() for child in root.iterdir() if child.is_dir() and (child / ".git").exists()],
        key=lambda item: item.name,
    )


def _commit_exists(repo_path: Path, commit: str) -> bool:
    try:
        git_output(repo_path, ["rev-parse", "--verify", f"{commit}^{{commit}}"])
        return True
    except Exception:
        return False


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def _report_paths(target_id: str, report_root: Path) -> dict[str, str]:
    report_dir = report_root / target_id
    return {
        "json": _display_path(report_dir / "latest_learning.json"),
        "markdown": _display_path(report_dir / "latest_learning.md"),
    }


def _display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path)


def _format_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    widths = [len(header) for header in headers]
    for row in rows:
        for index, value in enumerate(row):
            widths[index] = max(widths[index], len(value))
    header_line = " | ".join(header.ljust(widths[index]) for index, header in enumerate(headers))
    separator = "-+-".join("-" * width for width in widths)
    body = [
        " | ".join(value.ljust(widths[index]) for index, value in enumerate(row))
        for row in rows
    ]
    return "\n".join([header_line, separator, *body])


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "recipe"
