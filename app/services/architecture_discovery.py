"""Service that runs repository adapters to discover architecture locations."""

from collections.abc import Sequence
from pathlib import Path

from app.adapters.base import RepoAdapter, merge_paths
from app.adapters.flyway import FlywayAdapter
from app.adapters.openapi import OpenAPIAdapter
from app.adapters.react import ReactAdapter
from app.adapters.spring_boot import SpringBootAdapter
from app.models.discovery import AdapterDiscovery, ArchitectureDiscoveryReport, RepoDiscovery
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest
from workspace_control.manifests import MANIFEST_FILENAME, load_manifest


class ArchitectureDiscoveryService:
    """Builds deterministic architecture discovery reports from repository folders."""

    def __init__(self, adapters: Sequence[RepoAdapter] | None = None):
        self._adapters = tuple(
            adapters
            if adapters is not None
            else (
                SpringBootAdapter(),
                FlywayAdapter(),
                OpenAPIAdapter(),
                ReactAdapter(),
            )
        )

    def discover(self, base_dir: Path) -> ArchitectureDiscoveryReport:
        """Discover adapter findings for direct child repositories under `base_dir`."""

        repos: list[RepoDiscovery] = []
        for repo_path in self._repo_dirs(base_dir):
            manifest = self._load_manifest_hint(repo_path)
            agents_text = self._read_agents_hint(repo_path)
            discoveries = self._discover_repo(repo_path, manifest, agents_text)

            if not discoveries and not (repo_path / MANIFEST_FILENAME).is_file():
                continue

            repos.append(self._build_repo_discovery(repo_path, manifest, discoveries))

        repos.sort(key=lambda item: item.repo_name)
        return ArchitectureDiscoveryReport(repos=repos)

    def _repo_dirs(self, base_dir: Path) -> list[Path]:
        base = base_dir.resolve()
        return sorted(
            [child for child in base.iterdir() if child.is_dir()],
            key=lambda item: item.name,
        )

    def _load_manifest_hint(self, repo_path: Path) -> RepoManifest:
        manifest_path = repo_path / MANIFEST_FILENAME
        if manifest_path.is_file():
            loaded = load_manifest(manifest_path)
            return RepoManifest.model_validate(loaded.model_dump(mode="python"))

        return RepoManifest(type="", language="", domain=repo_path.name)

    def _read_agents_hint(self, repo_path: Path) -> str:
        agents_path = repo_path / "AGENTS.md"
        if not agents_path.is_file():
            return ""
        return agents_path.read_text(encoding="utf-8", errors="ignore")

    def _discover_repo(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str
    ) -> list[AdapterDiscovery]:
        discoveries: list[AdapterDiscovery] = []
        for adapter in self._adapters:
            if adapter.detect(repo_path, manifest, agents_text):
                discoveries.append(adapter.discover(repo_path, manifest, agents_text))

        discoveries.sort(key=lambda item: item.adapter)
        return discoveries

    def _build_repo_discovery(
        self,
        repo_path: Path,
        manifest: RepoManifest,
        discoveries: Sequence[AdapterDiscovery],
    ) -> RepoDiscovery:
        frameworks = merge_paths(*(item.frameworks for item in discoveries))
        api_locations = merge_paths(*(item.api_locations for item in discoveries))
        service_locations = merge_paths(*(item.service_locations for item in discoveries))
        persistence_locations = merge_paths(
            *(item.persistence_locations for item in discoveries)
        )
        ui_locations = merge_paths(*(item.ui_locations for item in discoveries))
        event_locations = merge_paths(*(item.event_locations for item in discoveries))
        evidence = [
            Evidence(
                repo_name=repo_path.name,
                source="adapter_discovery",
                category="framework",
                signal=framework,
                weight=1,
                details={"adapter": item.adapter},
            )
            for item in discoveries
            for framework in item.frameworks
        ]

        return RepoDiscovery(
            repo_name=repo_path.name,
            repo_type=manifest.type,
            language=manifest.language,
            domain=manifest.domain,
            detected_frameworks=frameworks,
            likely_api_locations=api_locations,
            likely_service_locations=service_locations,
            likely_persistence_locations=persistence_locations,
            likely_ui_locations=ui_locations,
            likely_event_locations=event_locations,
            evidence=evidence,
        )


def format_architecture_discovery(report: ArchitectureDiscoveryReport) -> str:
    """Render architecture discovery output as a deterministic human-readable report."""

    if not report.repos:
        return "No repository architecture detected."

    lines = ["Architecture Discovery"]
    for repo in report.repos:
        lines.append("")
        lines.append(f"repo: {repo.repo_name}")
        lines.append(f"  frameworks: {_format_values(repo.detected_frameworks)}")
        lines.append(f"  api: {_format_values(repo.likely_api_locations)}")
        lines.append(
            f"  service/business logic: {_format_values(repo.likely_service_locations)}"
        )
        lines.append(
            "  persistence/migration: "
            + _format_values(repo.likely_persistence_locations)
        )
        lines.append(f"  ui/components: {_format_values(repo.likely_ui_locations)}")
        if repo.likely_event_locations:
            lines.append(
                "  events/integrations: "
                + _format_values(repo.likely_event_locations)
            )

    return "\n".join(lines)


def _format_values(values: Sequence[str]) -> str:
    if not values:
        return "-"
    return ", ".join(values)
