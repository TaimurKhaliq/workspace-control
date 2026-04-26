"""Pydantic request and response schemas for the local API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


SourceType = Literal["local_path", "git_url"]


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class WorkspaceOut(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str


class RepoTargetCreate(BaseModel):
    target_id: str = Field(min_length=1, max_length=120)
    source_type: SourceType
    locator: str = Field(min_length=1)
    ref: str | None = None


class RepoTargetValidate(BaseModel):
    source_type: SourceType
    locator: str = Field(min_length=1)


class RepoTargetValidationOut(BaseModel):
    selected_path: str
    suggested_root_path: str | None = None
    detected_frameworks: list[str] = Field(default_factory=list)
    detected_repo_type: str
    warnings: list[str] = Field(default_factory=list)


class RepoTargetOut(BaseModel):
    id: str
    workspace_id: str
    target_id: str
    repo_name: str
    source_type: SourceType
    locator: str
    ref: str | None = None
    status: str
    last_discovered_at: str | None = None
    last_learned_at: str | None = None
    created_at: str
    updated_at: str


class PlanBundleCreate(BaseModel):
    feature_request: str = Field(min_length=1)
    target_ids: list[str] | None = None
    include_debug: bool = False


class PlanRunOut(BaseModel):
    id: str
    workspace_id: str
    feature_request: str
    target_ids: list[str]
    status: str
    plan_bundle_json: dict[str, Any] | None = None
    created_at: str


class PlanBundleRunResponse(BaseModel):
    run_id: str
    plan_bundle: dict[str, Any]


class DiscoverResponse(BaseModel):
    target_id: str
    status: str
    discovered_at: str
    snapshot: dict[str, Any]


class LearningStatusResponse(BaseModel):
    target_id: str
    status: str
    state: dict[str, Any]
    recipe_count: int


class RecipesResponse(BaseModel):
    target_id: str
    recipes: list[dict[str, Any]]
