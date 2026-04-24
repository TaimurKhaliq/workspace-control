"""OpenAPI adapter for deterministic API contract discovery."""

from pathlib import Path

from app.adapters.base import RepoAdapter, first_existing_paths, manifest_hint_text
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class OpenAPIAdapter(RepoAdapter):
    """Detects repositories that expose OpenAPI or Swagger contract files."""

    name = "openapi"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        if self._contract_locations(repo_path):
            return True

        hints = manifest_hint_text(manifest, agents_text)
        return "openapi" in hints or "swagger" in hints

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["openapi"],
            api_locations=self._contract_locations(repo_path),
        )

    def _contract_locations(self, repo_path: Path) -> list[str]:
        return first_existing_paths(
            repo_path,
            [
                "openapi.yaml",
                "openapi.yml",
                "openapi.json",
                "swagger.yaml",
                "swagger.yml",
                "swagger.json",
                "docs/openapi.yaml",
                "docs/openapi.yml",
                "src/main/resources/openapi.yaml",
                "src/main/resources/openapi.yml",
            ],
        )
