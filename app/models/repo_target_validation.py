"""Models for validating user-selected repository target paths."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DetectedRepoType = Literal[
    "frontend-only",
    "backend-only",
    "full-stack/monorepo",
    "unknown",
]


class RepoTargetValidation(BaseModel):
    """Read-only validation result for a candidate discovery target path."""

    selected_path: str
    suggested_root_path: str | None = None
    detected_frameworks: list[str] = Field(default_factory=list)
    detected_repo_type: DetectedRepoType = "unknown"
    warnings: list[str] = Field(default_factory=list)
