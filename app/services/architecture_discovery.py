"""Service that combines manifest loading and adapters into discovery output."""

from pathlib import Path

from app.adapters.angular import AngularAdapter
from app.adapters.events import EventsAdapter
from app.adapters.flyway import FlywayAdapter
from app.adapters.openapi import OpenAPIAdapter
from app.adapters.react import ReactAdapter
from app.adapters.spring_boot import SpringBootAdapter
from app.models.discovery import ArchitectureDiscoveryReport, RepoDiscovery
from app.services.evidence_aggregator import EvidenceAggregator
from app.services.manifest_loader import ManifestLoader


class ArchitectureDiscoveryService:
    """Builds deterministic architecture discovery reports from repository manifests."""

    def __init__(
        self,
        manifest_loader: ManifestLoader | None = None,
        evidence_aggregator: EvidenceAggregator | None = None,
    ):
        self._manifest_loader = manifest_loader or ManifestLoader()
        self._evidence_aggregator = evidence_aggregator or EvidenceAggregator(
            adapters=(
                SpringBootAdapter(),
                ReactAdapter(),
                AngularAdapter(),
                FlywayAdapter(),
                OpenAPIAdapter(),
                EventsAdapter(),
            )
        )

    def discover(self, base_dir: Path) -> ArchitectureDiscoveryReport:
        """Discover adapter evidence for all repositories under `base_dir`."""

        rows = self._manifest_loader.build_inventory(base_dir)
        repos: list[RepoDiscovery] = []

        for row in rows:
            repos.append(
                RepoDiscovery(
                    repo_name=row.repo_name,
                    repo_type=row.type,
                    language=row.language,
                    domain=row.domain,
                    evidence=self._evidence_aggregator.collect_for_row(row),
                )
            )

        repos.sort(key=lambda item: item.repo_name)
        return ArchitectureDiscoveryReport(repos=repos)
