"""Read-only manifest loading service that wraps existing workspace loaders."""

from pathlib import Path

from app.models.repo_manifest import RepoManifest
from workspace_control.manifests import (
    build_inventory as _build_inventory,
    discover_manifest_paths as _discover_manifest_paths,
    load_manifest as _load_manifest,
)
from workspace_control.models import InventoryRow


class ManifestLoader:
    """Service for deterministic stackpilot manifest discovery and parsing."""

    def discover_manifest_paths(self, base_dir: Path) -> list[Path]:
        """Return manifest files one level under `base_dir`."""

        return _discover_manifest_paths(base_dir)

    def load_manifest(self, path: Path) -> RepoManifest:
        """Load one manifest and normalize it into the app-layer model."""

        loaded = _load_manifest(path)
        return RepoManifest.model_validate(loaded.model_dump(mode="python"))

    def build_inventory(self, base_dir: Path) -> list[InventoryRow]:
        """Build normalized inventory rows from manifests under `base_dir`."""

        return _build_inventory(base_dir)
