"""Workspace API routes."""

from __future__ import annotations

import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException

from server.db import get_db, utc_now
from server.schemas import WorkspaceCreate, WorkspaceOut

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def workspace_from_row(row: sqlite3.Row) -> WorkspaceOut:
    return WorkspaceOut(**dict(row))


def require_workspace(db: sqlite3.Connection, workspace_id: str) -> sqlite3.Row:
    row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return row


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(db: sqlite3.Connection = Depends(get_db)) -> list[WorkspaceOut]:
    rows = db.execute("SELECT * FROM workspaces ORDER BY created_at, name").fetchall()
    return [workspace_from_row(row) for row in rows]


@router.post("", response_model=WorkspaceOut, status_code=201)
def create_workspace(
    payload: WorkspaceCreate,
    db: sqlite3.Connection = Depends(get_db),
) -> WorkspaceOut:
    now = utc_now()
    workspace_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (workspace_id, payload.name.strip(), now, now),
    )
    db.commit()
    row = require_workspace(db, workspace_id)
    return workspace_from_row(row)


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(
    workspace_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> WorkspaceOut:
    return workspace_from_row(require_workspace(db, workspace_id))
