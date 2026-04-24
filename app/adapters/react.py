"""React adapter for deterministic frontend architecture discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    matching_file_parent_paths,
    manifest_hint_text,
    merge_paths,
    read_text_if_exists,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest

FRONTEND_ROOTS = ("", "client", "frontend", "web", "ui")
UI_SUBPATHS = (
    "src/pages",
    "src/app",
    "src/components",
    "src/forms",
    "src/features",
    "src/containers",
    "src/routes",
    "src/views",
    "src/types",
    "components",
    "pages",
)
API_SUBPATHS = (
    "src/api",
    "src/services",
    "src/lib/api",
    "src/clients",
)
SERVICE_SUBPATHS = (
    "src/services",
    "src/hooks",
    "src/state",
    "src/store",
)
FRONTEND_FILE_PATTERNS = ("*.tsx", "*.jsx")


class ReactAdapter(RepoAdapter):
    """Detects React-style frontends and common UI/client locations."""

    name = "react"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        hints = manifest_hint_text(manifest, agents_text)
        package_text = " ".join(
            read_text_if_exists(repo_path / package_path).lower()
            for package_path in _rooted(("package.json",))
        )
        has_react_package = '"react"' in package_text or "'react'" in package_text
        has_frontend_sources = any(
            (repo_path / path).exists()
            for path in _rooted(
                (
                    "src/components",
                    "src/pages",
                    "src/app",
                    "src/features",
                    "src/routes",
                    "src/views",
                )
            )
        )
        frontend_hint = any(
            token in hints for token in ("frontend", "react", "typescript", "tsx", "npm")
        )

        return has_react_package or ("react" in hints) or (has_frontend_sources and frontend_hint)

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        ui_locations = merge_paths(
            first_existing_paths(repo_path, _rooted(UI_SUBPATHS)),
            matching_file_parent_paths(
                repo_path,
                FRONTEND_FILE_PATTERNS,
                _rooted(
                    (
                        "src/components",
                        "src/pages",
                        "src/forms",
                        "src/features",
                        "src/containers",
                        "src/routes",
                        "src/views",
                    )
                ),
            ),
        )
        api_locations = first_existing_paths(repo_path, _rooted(API_SUBPATHS))
        service_locations = first_existing_paths(repo_path, _rooted(SERVICE_SUBPATHS))

        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["react"],
            api_locations=api_locations,
            service_locations=service_locations,
            ui_locations=ui_locations,
        )


def _rooted(subpaths: tuple[str, ...]) -> list[str]:
    """Return root-level and common nested frontend candidate paths."""

    paths: list[str] = []
    for root in FRONTEND_ROOTS:
        for subpath in subpaths:
            paths.append(f"{root}/{subpath}" if root else subpath)
    return paths
