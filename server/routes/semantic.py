"""Semantic enrichment API routes."""

from __future__ import annotations

import os

from fastapi import APIRouter

from app.services.semantic_enrichment import DEFAULT_SEMANTIC_ROOT, semantic_result_path
from server.schemas import SemanticStatusResponse

router = APIRouter(tags=["semantic"])


@router.get("/api/semantic/status", response_model=SemanticStatusResponse)
def semantic_status(target_id: str | None = None) -> SemanticStatusResponse:
    """Return non-secret semantic provider configuration for the UI."""

    base_url = os.environ.get("STACKPILOT_SEMANTIC_BASE_URL", "").strip()
    api_key = os.environ.get("STACKPILOT_SEMANTIC_API_KEY", "").strip()
    model = os.environ.get("STACKPILOT_SEMANTIC_MODEL", "").strip()
    api_style = os.environ.get("STACKPILOT_SEMANTIC_API_STYLE", "auto").strip() or "auto"
    configured = bool(base_url and api_key and model)
    cached_artifact_available = False
    if target_id:
        cached_artifact_available = semantic_result_path(
            target_id,
            semantic_root=DEFAULT_SEMANTIC_ROOT,
        ).is_file()
    return SemanticStatusResponse(
        configured=configured,
        provider="openai-compatible" if configured else None,
        model=model or None,
        api_style=api_style,
        cached_artifact_available=cached_artifact_available,
        available=configured or cached_artifact_available,
    )
