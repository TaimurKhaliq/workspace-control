"""React adapter for deterministic frontend architecture discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    manifest_hint_text,
    read_text_if_exists,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class ReactAdapter(RepoAdapter):
    """Detects React-style frontends and common UI/client locations."""

    name = "react"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        hints = manifest_hint_text(manifest, agents_text)
        package_text = read_text_if_exists(repo_path / "package.json").lower()
        has_react_package = '"react"' in package_text or "'react'" in package_text
        has_frontend_sources = any(
            (repo_path / path).exists()
            for path in ("src/components", "src/pages", "src/app")
        )
        frontend_hint = any(
            token in hints for token in ("frontend", "react", "typescript", "tsx", "npm")
        )

        return has_react_package or ("react" in hints) or (has_frontend_sources and frontend_hint)

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        ui_locations = first_existing_paths(
            repo_path,
            [
                "src/pages",
                "src/app",
                "src/components",
                "src/forms",
                "components",
                "pages",
            ],
        )
        api_locations = first_existing_paths(
            repo_path,
            [
                "src/api",
                "src/services",
                "src/lib/api",
                "src/clients",
            ],
        )
        service_locations = first_existing_paths(
            repo_path,
            [
                "src/services",
                "src/hooks",
                "src/state",
                "src/store",
            ],
        )

        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["react"],
            api_locations=api_locations,
            service_locations=service_locations,
            ui_locations=ui_locations,
        )
