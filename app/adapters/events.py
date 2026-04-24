"""Events adapter for deterministic integration and messaging discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    manifest_hint_text,
    matching_file_parent_paths,
    merge_paths,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class EventsAdapter(RepoAdapter):
    """Detects repositories likely involved in eventing or downstream sync."""

    name = "events"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        hints = manifest_hint_text(manifest, agents_text)
        explicit_paths = first_existing_paths(
            repo_path,
            [
                "src/events",
                "src/integrations",
                "src/main/java/events",
                "src/main/java/integration",
            ],
        )
        event_hint = any(
            token in hints
            for token in ("event", "sync", "downstream", "integration", "notify")
        )
        return bool(explicit_paths or event_hint)

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        event_locations = merge_paths(
            first_existing_paths(
                repo_path,
                [
                    "src/events",
                    "src/integrations",
                    "src/main/java/events",
                    "src/main/java/integration",
                ],
            ),
            matching_file_parent_paths(
                repo_path,
                ["*Event*.*", "*Producer.*", "*Consumer.*", "*Subscriber.*"],
                ["src", "src/main/java"],
            ),
        )

        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["events"],
            event_locations=event_locations,
        )
