"""Aggregate deterministic adapter evidence for each repository."""

from collections.abc import Sequence

from app.adapters.base import ArchitectureAdapter
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest
from workspace_control.models import InventoryRow


class EvidenceAggregator:
    """Collects and sorts evidence emitted by configured adapters."""

    def __init__(self, adapters: Sequence[ArchitectureAdapter]):
        self._adapters = tuple(adapters)

    def collect_for_manifest(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        """Collect all adapter evidence for one manifest."""

        evidence: list[Evidence] = []
        for adapter in self._adapters:
            evidence.extend(adapter.collect(repo_name, manifest))

        evidence.sort(key=lambda item: (-item.weight, item.adapter, item.signal))
        return evidence

    def collect_for_row(self, row: InventoryRow) -> list[Evidence]:
        """Collect evidence for an inventory row using manifest-compatible fields."""

        manifest = RepoManifest(
            type=row.type,
            language=row.language,
            domain=row.domain,
            build_commands=row.build_commands,
            test_commands=row.test_commands,
            owns_entities=row.owns_entities,
            owns_fields=row.owns_fields,
            owns_tables=row.owns_tables,
            api_keywords=row.api_keywords,
        )
        return self.collect_for_manifest(row.repo_name, manifest)
