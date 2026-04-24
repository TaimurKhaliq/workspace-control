"""App-layer feature plan model that keeps compatibility with CLI output fields."""

from workspace_control.models import FeaturePlan as WorkspaceFeaturePlan


class FeaturePlan(WorkspaceFeaturePlan):
    """Compatibility wrapper over the existing deterministic plan schema."""
