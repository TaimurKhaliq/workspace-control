"""FastAPI entry point for the local-first workspace-control web API."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.db import configured_db_path, init_db
from server.routes import learning, plan_bundles, repos, semantic, workspaces


def create_app(
    *,
    db_path: Path | None = None,
    registry_path: Path | None = None,
) -> FastAPI:
    """Create the local API app with configurable storage paths for tests/dev."""

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(Path(app.state.db_path))
        yield

    app = FastAPI(title="Workspace-Control API", version="0.1.0", lifespan=lifespan)
    app.state.db_path = str(db_path or configured_db_path())
    app.state.registry_path = str(
        registry_path
        or Path(os.environ.get("WORKSPACE_CONTROL_REGISTRY_PATH", ".workspace-control/discovery_targets.json"))
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(workspaces.router)
    app.include_router(repos.router)
    app.include_router(learning.router)
    app.include_router(semantic.router)
    app.include_router(plan_bundles.router)
    return app


app = create_app()
