"""Typed framework detection descriptors used by discovery enrichment."""

from typing import Literal

from pydantic import BaseModel


class FrameworkDescriptor(BaseModel):
    """A deterministic framework detection or framework hint for one repository."""

    repo_name: str = ""
    name: str
    version: str | None = None
    source: str
    confidence: Literal["high", "medium", "low"] = "medium"
    origin: Literal["detected", "inferred"] = "detected"
