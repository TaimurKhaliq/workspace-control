"""Helpers for resolving repo paths inside source-agnostic discovery snapshots."""

from __future__ import annotations

from pathlib import Path


def repo_path_for(workspace_root: Path, repo_name: str) -> Path:
    """Return the local path for a discovered repo name.

    Most workspace-control fixture targets are workspace folders containing
    sibling repos, so the path is usually ``workspace_root / repo_name``.
    Public single-repo targets can also use the repo root directly; in that
    case the repo name is the workspace root name.
    """

    candidate = workspace_root / repo_name
    if candidate.exists():
        return candidate
    if workspace_root.name == repo_name:
        return workspace_root
    return candidate
