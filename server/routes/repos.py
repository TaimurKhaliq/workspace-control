"""Repository discovery target API routes."""

from __future__ import annotations

import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.models.discovery import DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.repo_target_validator import RepoTargetValidator
from server.db import get_db, utc_now
from server.routes.workspaces import require_workspace
from server.schemas import (
    DiscoverResponse,
    RepoTargetCreate,
    RepoTargetOut,
    RepoTargetValidate,
    RepoTargetValidationOut,
)

router = APIRouter(tags=["repos"])


def repo_from_row(row: sqlite3.Row) -> RepoTargetOut:
    return RepoTargetOut(**dict(row))


def repo_name_for(payload: RepoTargetCreate) -> str:
    if payload.source_type == "local_path":
        return Path(payload.locator).expanduser().resolve().name
    return payload.locator.rstrip("/").split("/")[-1].removesuffix(".git") or payload.target_id


def require_repo(db: sqlite3.Connection, target_id: str) -> sqlite3.Row:
    row = db.execute("SELECT * FROM repo_targets WHERE target_id = ?", (target_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Repo target not found")
    return row


@router.post("/api/repos/validate-target", response_model=RepoTargetValidationOut)
def validate_repo_target(payload: RepoTargetValidate) -> RepoTargetValidationOut:
    if payload.source_type != "local_path":
        return RepoTargetValidationOut(
            selected_path=payload.locator,
            suggested_root_path=None,
            detected_frameworks=[],
            detected_repo_type="unknown",
            warnings=["git_url validation is stored for later and not inspected locally yet."],
        )

    path = Path(payload.locator).expanduser().resolve()
    if not path.exists():
        raise HTTPException(status_code=400, detail="Local path does not exist")
    result = RepoTargetValidator().validate_local_path(path)
    return RepoTargetValidationOut(**result.model_dump(mode="python"))


@router.get("/api/workspaces/{workspace_id}/repos", response_model=list[RepoTargetOut])
def list_repos(
    workspace_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> list[RepoTargetOut]:
    require_workspace(db, workspace_id)
    rows = db.execute(
        "SELECT * FROM repo_targets WHERE workspace_id = ? ORDER BY created_at, target_id",
        (workspace_id,),
    ).fetchall()
    return [repo_from_row(row) for row in rows]


@router.post("/api/workspaces/{workspace_id}/repos", response_model=RepoTargetOut, status_code=201)
def create_repo(
    workspace_id: str,
    payload: RepoTargetCreate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> RepoTargetOut:
    require_workspace(db, workspace_id)
    locator = payload.locator.strip()
    status = "registered"
    if payload.source_type == "local_path":
        path = Path(locator).expanduser().resolve()
        if not path.exists():
            raise HTTPException(status_code=400, detail="Local path does not exist")
        locator = str(path)
    else:
        status = "not_implemented"

    repo_id = str(uuid.uuid4())
    now = utc_now()
    repo_name = repo_name_for(payload.model_copy(update={"locator": locator}))
    try:
        db.execute(
            """
            INSERT INTO repo_targets (
                id, workspace_id, target_id, repo_name, source_type, locator, ref, status,
                last_discovered_at, last_learned_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                repo_id,
                workspace_id,
                payload.target_id,
                repo_name,
                payload.source_type,
                locator,
                payload.ref,
                status,
                now,
                now,
            ),
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="target_id already exists") from exc

    try:
        DiscoveryTargetRegistry(Path(request.app.state.registry_path)).register(
            DiscoveryTargetRecord(
                id=payload.target_id,
                source_type=payload.source_type,
                locator=locator,
                ref=payload.ref,
                hints={"workspace_id": workspace_id},
            )
        )
    except (OSError, ValidationError, ValueError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.execute("UPDATE workspaces SET updated_at = ? WHERE id = ?", (now, workspace_id))
    db.commit()
    return repo_from_row(require_repo(db, payload.target_id))


@router.post("/api/repos/{target_id}/discover", response_model=DiscoverResponse)
def discover_repo(
    target_id: str,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> DiscoverResponse:
    repo = require_repo(db, target_id)
    if repo["source_type"] != "local_path":
        raise HTTPException(status_code=501, detail="git_url discovery is not implemented yet")
    try:
        record = DiscoveryTargetRegistry(Path(request.app.state.registry_path)).get(target_id)
        snapshot = ArchitectureDiscoveryService().discover(record.to_target())
    except Exception as exc:
        now = utc_now()
        db.execute(
            "UPDATE repo_targets SET status = ?, updated_at = ? WHERE target_id = ?",
            ("error", now, target_id),
        )
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    now = utc_now()
    db.execute(
        """
        UPDATE repo_targets
        SET status = ?, last_discovered_at = ?, updated_at = ?
        WHERE target_id = ?
        """,
        ("discovered", now, now, target_id),
    )
    db.commit()
    return DiscoverResponse(
        target_id=target_id,
        status="discovered",
        discovered_at=now,
        snapshot=snapshot.model_dump(mode="json"),
    )
