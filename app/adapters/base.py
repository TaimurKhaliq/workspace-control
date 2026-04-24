"""Base abstractions and helpers for architecture evidence adapters."""

import re
from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class ArchitectureAdapter(ABC):
    """Deterministic adapter contract for collecting repository evidence."""

    name = "adapter"

    @abstractmethod
    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        """Return adapter-specific evidence entries for a repository."""


def normalize_text(values: Sequence[str]) -> str:
    """Normalize arbitrary text values into a lowercase token-safe string."""

    return " ".join(re.findall(r"[a-z0-9]+", " ".join(values).lower()))
