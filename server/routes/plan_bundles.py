"""Plan Bundle API routes."""

from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from server.db import get_db, utc_now
from server.planner import generate_plan_bundle_for_target
from server.routes.repos import require_repo
from server.routes.workspaces import require_workspace
from server.schemas import PlanBundleCreate, PlanBundleRunResponse, PlanRunOut

router = APIRouter(tags=["plan-bundles"])


def plan_run_from_row(row: sqlite3.Row) -> PlanRunOut:
    data = dict(row)
    return PlanRunOut(
        id=data["id"],
        workspace_id=data["workspace_id"],
        feature_request=data["feature_request"],
        target_ids=json.loads(data["target_ids_json"]),
        status=data["status"],
        plan_bundle_json=json.loads(data["plan_bundle_json"]) if data["plan_bundle_json"] else None,
        created_at=data["created_at"],
    )


def _target_ids_for_run(
    db: sqlite3.Connection,
    workspace_id: str,
    requested: list[str] | None,
) -> list[str]:
    if requested:
        target_ids = requested
    else:
        rows = db.execute(
            "SELECT target_id FROM repo_targets WHERE workspace_id = ? ORDER BY created_at, target_id",
            (workspace_id,),
        ).fetchall()
        target_ids = [row["target_id"] for row in rows]
    if not target_ids:
        raise HTTPException(status_code=400, detail="No repo targets registered for this workspace")
    for target_id in target_ids:
        repo = require_repo(db, target_id)
        if repo["workspace_id"] != workspace_id:
            raise HTTPException(status_code=400, detail=f"Target {target_id} is not in this workspace")
    if len(target_ids) > 1:
        raise HTTPException(status_code=400, detail="This minimal API slice supports one target per plan run")
    return target_ids


@router.post("/api/workspaces/{workspace_id}/plan-bundles", response_model=PlanBundleRunResponse)
def create_plan_bundle_run(
    workspace_id: str,
    payload: PlanBundleCreate,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
) -> PlanBundleRunResponse:
    require_workspace(db, workspace_id)
    target_ids = _target_ids_for_run(db, workspace_id, payload.target_ids)
    repo = require_repo(db, target_ids[0])
    if repo["source_type"] != "local_path":
        raise HTTPException(status_code=501, detail="git_url plan generation is not implemented yet")
    run_id = str(uuid.uuid4())
    now = utc_now()
    try:
        bundle = generate_plan_bundle_for_target(
            target_id=target_ids[0],
            feature_request=payload.feature_request,
            registry_path=Path(request.app.state.registry_path),
            include_debug=payload.include_debug,
        )
    except Exception as exc:
        db.execute(
            """
            INSERT INTO plan_runs (
                id, workspace_id, feature_request, target_ids_json, status, plan_bundle_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                workspace_id,
                payload.feature_request,
                json.dumps(target_ids),
                "error",
                json.dumps({"error": str(exc)}),
                now,
            ),
        )
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    bundle_json = bundle.model_dump(mode="json")
    db.execute(
        """
        INSERT INTO plan_runs (
            id, workspace_id, feature_request, target_ids_json, status, plan_bundle_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            workspace_id,
            payload.feature_request,
            json.dumps(target_ids),
            "completed",
            json.dumps(bundle_json),
            now,
        ),
    )
    db.commit()
    return PlanBundleRunResponse(run_id=run_id, plan_bundle=bundle_json)


@router.get("/api/plan-bundles/{run_id}", response_model=PlanRunOut)
def get_plan_bundle_run(
    run_id: str,
    db: sqlite3.Connection = Depends(get_db),
) -> PlanRunOut:
    row = db.execute("SELECT * FROM plan_runs WHERE id = ?", (run_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Plan run not found")
    return plan_run_from_row(row)
