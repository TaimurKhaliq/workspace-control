"""Angular adapter for deterministic frontend architecture discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    manifest_hint_text,
    read_text_if_exists,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class AngularAdapter(RepoAdapter):
    """Detects Angular-style frontends and common UI/client locations."""

    name = "angular"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        hints = manifest_hint_text(manifest, agents_text)
        package_text = read_text_if_exists(repo_path / "package.json").lower()
        angular_package = "@angular/core" in package_text
        angular_hint = "angular" in hints
        return angular_package or angular_hint

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["angular"],
            api_locations=first_existing_paths(
                repo_path,
                ["src/app/api", "src/app/services", "src/services"],
            ),
            service_locations=first_existing_paths(
                repo_path,
                ["src/app/services", "src/app/state", "src/services"],
            ),
            ui_locations=first_existing_paths(
                repo_path,
                ["src/app/components", "src/app/pages", "src/components"],
            ),
        )
