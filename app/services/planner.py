"""Deterministic planner service wrapper used by the app architecture layer."""

from collections.abc import Sequence
from pathlib import Path

from app.models.feature_plan import FeaturePlan
from workspace_control.models import FeatureImpact, InventoryRow
from workspace_control.plan import create_feature_plan


class Planner:
    """Creates read-only feature plans while preserving current CLI behavior."""

    def plan(
        self,
        feature_request: str,
        rows: Sequence[InventoryRow],
        impacts: Sequence[FeatureImpact] | None = None,
        *,
        scan_root: Path | None = None,
    ) -> FeaturePlan:
        """Build and return a deterministic feature plan."""

        plan = create_feature_plan(
            feature_request,
            rows,
            impacts=impacts,
            scan_root=scan_root,
        )
        return FeaturePlan.model_validate(plan.model_dump(mode="python"))
