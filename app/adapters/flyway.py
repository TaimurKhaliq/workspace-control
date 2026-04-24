"""Flyway adapter for migration tooling hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class FlywayAdapter(ArchitectureAdapter):
    """Detects repositories that likely own Flyway-style database migrations."""

    name = "flyway"

    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        normalized = normalize_text(
            [
                *manifest.build_commands,
                *manifest.test_commands,
                *manifest.api_keywords,
                *manifest.owns_tables,
            ]
        )
        if "flyway" not in normalized and "migration" not in normalized:
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="db-migration-tooling",
                weight=2,
                details={"domain": manifest.domain},
            )
        ]
