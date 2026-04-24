"""Base repository adapter interface and deterministic discovery helpers."""

import re
from abc import ABC, abstractmethod
from collections.abc import Iterable, Sequence
from pathlib import Path

from app.models.discovery import AdapterDiscovery
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class RepoAdapter(ABC):
    """Adapter contract for deterministic repository architecture discovery."""

    name = "adapter"

    @abstractmethod
    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        """Return whether this adapter applies to `repo_path`."""

    @abstractmethod
    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        """Return framework and location findings for `repo_path`."""

    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        """Compatibility wrapper for older evidence-oriented service code."""

        repo_path = Path(repo_name)
        if not self.detect(repo_path, manifest):
            return []

        discovery = self.discover(repo_path, manifest)
        signals = discovery.frameworks or [self.name]
        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal=signal,
                weight=1,
                details={},
            )
            for signal in signals
        ]


ArchitectureAdapter = RepoAdapter


def normalize_text(values: Sequence[str]) -> str:
    """Normalize arbitrary text values into a lowercase token-safe string."""

    return " ".join(re.findall(r"[a-z0-9]+", " ".join(values).lower()))


def manifest_hint_text(manifest: RepoManifest, agents_text: str = "") -> str:
    """Build deterministic hint text from manifest fields and AGENTS.md text."""

    return normalize_text(
        [
            manifest.type,
            manifest.language,
            manifest.domain,
            *manifest.build_commands,
            *manifest.test_commands,
            *manifest.owns_entities,
            *manifest.owns_fields,
            *manifest.owns_tables,
            *manifest.api_keywords,
            agents_text,
        ]
    )


def read_text_if_exists(path: Path) -> str:
    """Read a small text hint file if it exists."""

    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def first_existing_paths(repo_path: Path, candidates: Sequence[str]) -> list[str]:
    """Return candidate paths that exist below `repo_path`, preserving order."""

    existing: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        if (repo_path / candidate).exists():
            existing.append(candidate)
            seen.add(candidate)
    return existing


def matching_file_parent_paths(
    repo_path: Path, patterns: Sequence[str], roots: Iterable[str]
) -> list[str]:
    """Return parent folders for matching files under known roots."""

    paths: list[str] = []
    seen: set[str] = set()
    for root in roots:
        root_path = repo_path / root
        if not root_path.exists():
            continue
        for pattern in patterns:
            for match in sorted(root_path.rglob(pattern), key=lambda item: str(item)):
                relative = match.parent.relative_to(repo_path).as_posix()
                if relative not in seen:
                    paths.append(relative)
                    seen.add(relative)
    return paths


def matching_directory_paths(
    repo_path: Path, names: Sequence[str], roots: Iterable[str]
) -> list[str]:
    """Return existing directory paths whose final segment matches known names."""

    wanted = {name.lower() for name in names}
    paths: list[str] = []
    seen: set[str] = set()
    for root in roots:
        root_path = repo_path / root
        if not root_path.exists():
            continue
        for current in sorted(root_path.rglob("*"), key=lambda item: str(item)):
            if not current.is_dir() or current.name.lower() not in wanted:
                continue
            relative = current.relative_to(repo_path).as_posix()
            if relative not in seen:
                paths.append(relative)
                seen.add(relative)
    return paths


def merge_paths(*groups: Sequence[str]) -> list[str]:
    """Merge path groups deterministically without duplicates."""

    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for path in group:
            if path in seen:
                continue
            merged.append(path)
            seen.add(path)
    return merged
