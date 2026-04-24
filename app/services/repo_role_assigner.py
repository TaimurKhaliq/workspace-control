"""Deterministic repository role assignment wrapper over current scoring heuristics."""

from collections.abc import Sequence

from app.models.discovery import DiscoverySnapshot
from workspace_control.analyze import analyze_feature
from workspace_control.models import FeatureImpact, InventoryRow


class RepoRoleAssigner:
    """Assign repository roles for a feature request using existing logic."""

    def assign(
        self,
        feature_request: str,
        rows: Sequence[InventoryRow],
        *,
        discovery_snapshot: DiscoverySnapshot | None = None,
    ) -> list[FeatureImpact]:
        """Return scored repo impacts in deterministic order."""

        return analyze_feature(
            feature_request,
            rows,
            discovery_snapshot=discovery_snapshot,
        )
