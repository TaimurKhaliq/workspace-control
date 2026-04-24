"""Git URL discovery provider placeholder.

This module defines the provider shape without cloning repositories yet, keeping
workspace-control read-only and deterministic for the current local workflow.
"""

from app.models.discovery import DiscoveryTarget, MaterializedWorkspace

from .base import DiscoveryProvider


class GitUrlProvider(DiscoveryProvider):
    """Typed stub for future git URL materialization."""

    name = "git_url"

    def supports(self, target: DiscoveryTarget) -> bool:
        """Return true for git URL discovery targets."""

        return target.source == "git_url"

    def materialize(self, target: DiscoveryTarget) -> MaterializedWorkspace:
        """Raise until deterministic git materialization is implemented."""

        if not self.supports(target):
            raise ValueError(f"{self.name} does not support target source {target.source}")
        raise NotImplementedError("Git URL discovery materialization is not implemented yet")
