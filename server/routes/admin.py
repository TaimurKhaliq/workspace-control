"""Local-only administrative API routes."""

from __future__ import annotations

import shutil
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from app.services.repo_learning import DEFAULT_LEARNING_REPORT_ROOT, DEFAULT_LEARNING_ROOT
from app.services.semantic_enrichment import DEFAULT_SEMANTIC_ROOT
from server.db import get_db
from server.schemas import ResetLocalDataRequest, ResetLocalDataResponse

router = APIRouter(tags=["admin"])

RESET_CONFIRMATION = "RESET"


@router.post("/api/admin/reset-local-data", response_model=ResetLocalDataResponse)
def reset_local_data(
    payload: ResetLocalDataRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> ResetLocalDataResponse:
    """Reset app-owned local UI/API state without touching source or target repos."""

    if payload.confirm != RESET_CONFIRMATION:
        raise HTTPException(status_code=400, detail='Type "RESET" to confirm local data reset')

    reset_tables = ["plan_runs", "repo_targets", "workspaces"]
    for table in reset_tables:
        db.execute(f"DELETE FROM {table}")
    db.commit()

    paths = [
        Path(request.app.state.registry_path),
        DEFAULT_LEARNING_ROOT,
        DEFAULT_SEMANTIC_ROOT,
        DEFAULT_LEARNING_REPORT_ROOT,
    ]
    deleted_paths: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
        deleted_paths.append(str(path))

    return ResetLocalDataResponse(
        status="reset",
        reset_tables=reset_tables,
        deleted_paths=deleted_paths,
        message="Local StackPilot UI/API state was reset. Source repos and baseline reports were not modified.",
    )
