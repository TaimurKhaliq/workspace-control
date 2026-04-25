"""Models for deterministic repo-local change-recipe learning."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


LearningStatus = Literal["fresh", "stale", "missing", "error"]
RecipeStatus = Literal["candidate", "active", "weak", "stale", "quarantined"]
ValidationOutcome = Literal["confirmed", "partial", "missed", "not_applicable"]


class RepoLearningState(BaseModel):
    """Persistent learning state for one discovery target."""

    target_id: str
    repo_name: str
    repo_path: str
    current_head: str | None = None
    last_analyzed_commit: str | None = None
    analyzed_commits: list[str] = Field(default_factory=list)
    recipe_catalog_path: str
    validation_history_path: str
    last_learning_run_at: str | None = None
    status: LearningStatus = "missing"


class ChangeRecipe(BaseModel):
    """Deterministically mined recipe for recurring repo-local change shapes."""

    id: str
    target_id: str
    recipe_type: str
    status: RecipeStatus = "candidate"
    source_commits: list[str] = Field(default_factory=list)
    trigger_terms: list[str] = Field(default_factory=list)
    changed_node_types: list[str] = Field(default_factory=list)
    changed_path_patterns: list[str] = Field(default_factory=list)
    new_file_patterns: list[str] = Field(default_factory=list)
    cochange_patterns: list[str] = Field(default_factory=list)
    required_existing_node_types: list[str] = Field(default_factory=list)
    optional_existing_node_types: list[str] = Field(default_factory=list)
    observed_variants: list[str] = Field(default_factory=list)
    changed_node_type_counts: dict[str, int] = Field(default_factory=dict)
    changed_path_pattern_counts: dict[str, int] = Field(default_factory=dict)
    created_file_pattern_counts: dict[str, int] = Field(default_factory=dict)
    cochange_counts: dict[str, int] = Field(default_factory=dict)
    created_node_types: list[str] = Field(default_factory=list)
    modified_node_types: list[str] = Field(default_factory=list)
    deleted_node_types: list[str] = Field(default_factory=list)
    unknown_changed_file_count: int = 0
    unknown_path_patterns: list[str] = Field(default_factory=list)
    unclassified_examples: list[str] = Field(default_factory=list)
    example_commits: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    structural_confidence: float = 0.0
    planner_effectiveness: float = 0.0
    support_count: int = 0
    validation_count: int = 0
    success_count: int = 0
    partial_count: int = 0
    failure_count: int = 0
    last_seen_commit: str | None = None
    promotion_blocker: str | None = None
    evidence: list[str] = Field(default_factory=list)


class RecipeValidationResult(BaseModel):
    """Validation result for applying one learned recipe to one commit replay."""

    commit: str
    recipe_id: str
    prompt: str
    predicted_categories: list[str] = Field(default_factory=list)
    actual_categories: list[str] = Field(default_factory=list)
    predicted_files: list[str] = Field(default_factory=list)
    actual_files: list[str] = Field(default_factory=list)
    exact_precision: float = 0.0
    exact_recall: float = 0.0
    category_precision: float = 0.0
    category_recall: float = 0.0
    high_signal_precision: float = 0.0
    high_signal_recall: float = 0.0
    outcome: ValidationOutcome = "not_applicable"
    notes: str = ""


class CommitLearningObservation(BaseModel):
    """Normalized observation mined from one historical commit."""

    commit: str
    subject: str
    parent: str
    changed_files: list[str] = Field(default_factory=list)
    created_files: list[str] = Field(default_factory=list)
    modified_files: list[str] = Field(default_factory=list)
    deleted_files: list[str] = Field(default_factory=list)
    changed_categories: list[str] = Field(default_factory=list)
    changed_node_types: list[str] = Field(default_factory=list)
    created_node_types: list[str] = Field(default_factory=list)
    modified_node_types: list[str] = Field(default_factory=list)
    deleted_node_types: list[str] = Field(default_factory=list)
    unknown_changed_file_count: int = 0
    unknown_path_patterns: list[str] = Field(default_factory=list)
    inferred_archetype: str
    candidate_quality: str
    prompt_quality: str


class RepoLearningReport(BaseModel):
    """Summary of one refresh-learning run."""

    target_id: str
    repo_name: str
    repo_path: str
    status: LearningStatus
    current_head: str | None = None
    previous_last_analyzed_commit: str | None = None
    last_analyzed_commit: str | None = None
    commits_considered: int = 0
    commits_analyzed: int = 0
    recipes_discovered_or_updated: int = 0
    validation_results: int = 0
    recipe_counts: dict[str, int] = Field(default_factory=dict)
    analyzed_commit_ids: list[str] = Field(default_factory=list)
    recipes: list[ChangeRecipe] = Field(default_factory=list)
    active_or_candidate_examples: list[ChangeRecipe] = Field(default_factory=list)
    stale_or_quarantined_recipes: list[ChangeRecipe] = Field(default_factory=list)
    reports: dict[str, str] = Field(default_factory=dict)
    error: str | None = None
