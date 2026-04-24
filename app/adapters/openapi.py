"""OpenAPI adapter for API contract hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class OpenAPIAdapter(ArchitectureAdapter):
    """Detects repositories that likely expose OpenAPI or Swagger contracts."""

    name = "openapi"

    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        normalized = normalize_text(
            [
                *manifest.build_commands,
                *manifest.test_commands,
                *manifest.api_keywords,
                manifest.type,
            ]
        )
        if not any(token in normalized for token in ("openapi", "swagger")):
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="openapi-contract",
                weight=2,
                details={"repo_type": manifest.type},
            )
        ]
