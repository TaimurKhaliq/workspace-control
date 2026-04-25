"""Models for recipe-informed sidecar change suggestions."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class MatchedRecipe(BaseModel):
    """One learned recipe matched to a feature request."""

    recipe_id: str
    recipe_type: str
    structural_confidence: float
    planner_effectiveness: float
    score: int
    why_matched: list[str] = Field(default_factory=list)


class RecipeLikelyAction(BaseModel):
    """Recipe-informed action hint against the current source graph."""

    matched_recipe_id: str
    node_type: str
    action: Literal["create", "modify", "inspect"]
    suggested_path: str | None = None
    suggested_folder: str | None = None
    confidence: Literal["high", "medium", "low"]
    evidence: list[str] = Field(default_factory=list)


class RecipeSuggestionReport(BaseModel):
    """Deterministic sidecar report derived from repo-local recipes."""

    feature_request: str
    target_id: str
    matched_recipes: list[MatchedRecipe] = Field(default_factory=list)
    suggestions: list[RecipeLikelyAction] = Field(default_factory=list)
    missing_evidence: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)
