"""Events adapter for integration and messaging hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class EventsAdapter(ArchitectureAdapter):
    """Detects repositories likely involved in eventing or downstream sync."""

    name = "events"

    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        normalized = normalize_text(
            [
                manifest.domain,
                manifest.type,
                *manifest.api_keywords,
                *manifest.build_commands,
            ]
        )
        if not any(
            token in normalized
            for token in ("event", "sync", "downstream", "integration", "notify")
        ):
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="event-integration",
                weight=2,
                details={"domain": manifest.domain},
            )
        ]
