"""Persistence models for the local workspace-control API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

WORKSPACE_TABLE = "workspaces"
REPO_TARGET_TABLE = "repo_targets"
PLAN_RUN_TABLE = "plan_runs"


class Workspace(BaseModel):
    """Local workspace grouping repo targets and plan runs."""

    id: str
    name: str
    created_at: str
    updated_at: str


class RepoTarget(BaseModel):
    """Registered repo or source target within a workspace."""

    id: str
    workspace_id: str
    target_id: str
    repo_name: str
    source_type: Literal["local_path", "git_url"]
    locator: str
    ref: str | None = None
    status: str
    last_discovered_at: str | None = None
    last_learned_at: str | None = None


class PlanRun(BaseModel):
    """Persisted Plan Bundle generation run."""

    id: str
    workspace_id: str
    feature_request: str
    target_ids: list[str] = Field(default_factory=list)
    status: str
    plan_bundle_json: dict | None = None
    created_at: str
