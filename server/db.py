"""SQLite helpers for the local workspace-control API."""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from fastapi import Request

DEFAULT_DB_PATH = Path("data") / "workspace_control.db"


def utc_now() -> str:
    """Return a stable UTC timestamp for persisted API records."""

    return datetime.now(UTC).replace(microsecond=0).isoformat()


def configured_db_path() -> Path:
    """Return the SQLite path configured for the local API."""

    return Path(os.environ.get("WORKSPACE_CONTROL_DB_PATH", DEFAULT_DB_PATH))


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    """Open a SQLite connection with row dictionaries and foreign keys enabled."""

    path = db_path or configured_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: Path | None = None) -> None:
    """Create API persistence tables if they do not exist."""

    with connect(db_path) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repo_targets (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                target_id TEXT NOT NULL UNIQUE,
                repo_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                locator TEXT NOT NULL,
                ref TEXT,
                status TEXT NOT NULL,
                last_discovered_at TEXT,
                last_learned_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS plan_runs (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                feature_request TEXT NOT NULL,
                target_ids_json TEXT NOT NULL,
                status TEXT NOT NULL,
                plan_bundle_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
            """
        )


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    """FastAPI dependency that opens a request-scoped SQLite connection."""

    db_path = Path(request.app.state.db_path)
    connection = connect(db_path)
    try:
        yield connection
    finally:
        connection.close()
