"""Flyway adapter for deterministic migration location discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    manifest_hint_text,
    read_text_if_exists,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class FlywayAdapter(RepoAdapter):
    """Detects repositories that likely own Flyway-style migrations."""

    name = "flyway"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        migration_locations = self._migration_locations(repo_path)
        if migration_locations:
            return True

        hints = manifest_hint_text(manifest, agents_text)
        build_text = " ".join(
            read_text_if_exists(repo_path / path)
            for path in ("pom.xml", "build.gradle", "build.gradle.kts")
        ).lower()
        return "flyway" in hints or "flyway" in build_text or "migration" in hints

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["flyway"],
            persistence_locations=self._migration_locations(repo_path),
        )

    def _migration_locations(self, repo_path: Path) -> list[str]:
        return first_existing_paths(
            repo_path,
            [
                "src/main/resources/db/migration",
                "src/main/resources/db/changelog",
                "db/migration",
                "migrations",
            ],
        )
