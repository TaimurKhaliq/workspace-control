"""Repo-local learning API routes."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.repo_learning import DEFAULT_LEARNING_REPORT_ROOT, DEFAULT_LEARNING_ROOT, RepoLearningService
from server.db import get_db, utc_now
from server.routes.repos import require_repo
from server.schemas import LearningStatusResponse, RecipesResponse

router = APIRouter(prefix="/api/repos", tags=["learning"])


def _learning_service(request: Request) -> RepoLearningService:
    return RepoLearningService(
        registry=DiscoveryTargetRegistry(Path(request.app.state.registry_path)),
        learning_root=DEFAULT_LEARNING_ROOT,
        report_root=DEFAULT_LEARNING_REPORT_ROOT,
    )


@router.post("/{target_id}/refresh-learning")
def refresh_learning(
    target_id: str,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    repo = require_repo(db, target_id)
    if repo["source_type"] != "local_path":
        raise HTTPException(status_code=501, detail="git_url learning is not implemented yet")
    report = _learning_service(request).refresh_target(target_id)
    now = utc_now()
    db.execute(
        """
        UPDATE repo_targets
        SET status = ?, last_learned_at = ?, updated_at = ?
        WHERE target_id = ?
        """,
        ("learned" if report.status != "error" else "error", now, now, target_id),
    )
    db.commit()
    return report.model_dump(mode="json")


@router.get("/{target_id}/learning-status", response_model=LearningStatusResponse)
def learning_status(
    target_id: str,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> LearningStatusResponse:
    require_repo(db, target_id)
    service = _learning_service(request)
    states = service.status(target_id)
    state = states[0] if states else None
    recipes = service.recipes_for_target(target_id)
    return LearningStatusResponse(
        target_id=target_id,
        status=state.status if state else "missing",
        state=state.model_dump(mode="json") if state else {},
        recipe_count=len(recipes),
    )


@router.get("/{target_id}/recipes", response_model=RecipesResponse)
def list_recipes(
    target_id: str,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> RecipesResponse:
    require_repo(db, target_id)
    recipes = _learning_service(request).recipes_for_target(target_id)
    return RecipesResponse(
        target_id=target_id,
        recipes=[recipe.model_dump(mode="json") for recipe in recipes],
    )
