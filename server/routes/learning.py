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


def _fallback_learning_state(
    target_id: str,
    repo: sqlite3.Row,
    service: RepoLearningService,
    status: str,
    error: str | None = None,
) -> dict:
    state = {
        "target_id": target_id,
        "repo_name": repo["repo_name"],
        "repo_path": repo["locator"],
        "current_head": None,
        "last_analyzed_commit": None,
        "analyzed_commits": [],
        "recipe_catalog_path": str(service.recipe_catalog_path(target_id)),
        "validation_history_path": str(service.validation_history_path(target_id)),
        "last_learning_run_at": None,
        "status": status,
    }
    if error:
        state["error"] = error
    return state


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
    repo = require_repo(db, target_id)
    service = _learning_service(request)
    status = "missing"
    state_payload = _fallback_learning_state(target_id, repo, service, status)

    try:
        states = service.status(target_id)
        state = states[0] if states else None
        if state is not None:
            status = state.status
            state_payload = state.model_dump(mode="json")
    except Exception as exc:
        try:
            existing_state = service.load_state(target_id)
        except Exception:
            existing_state = None
        if existing_state is None and not service.state_path(target_id).is_file():
            status = "missing"
            state_payload = _fallback_learning_state(
                target_id,
                repo,
                service,
                status,
                str(exc),
            )
        else:
            status = "error"
            state_payload = (
                existing_state.model_dump(mode="json")
                if existing_state is not None
                else _fallback_learning_state(target_id, repo, service, status)
            )
            state_payload["status"] = status
            state_payload["error"] = str(exc)

    try:
        recipes = service.recipes_for_target(target_id)
        recipe_count = len(recipes)
    except Exception as exc:
        status = "error"
        state_payload["status"] = status
        state_payload["error"] = str(exc)
        recipe_count = 0

    return LearningStatusResponse(
        target_id=target_id,
        status=status,
        state=state_payload,
        recipe_count=recipe_count,
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
