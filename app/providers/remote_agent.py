"""Remote agent discovery provider placeholder.

Remote materialization is intentionally not implemented yet because discovery is
currently deterministic, read-only, and local to workspace-control.
"""

from app.models.discovery import DiscoveryTarget, MaterializedWorkspace

from .base import DiscoveryProvider


class RemoteAgentProvider(DiscoveryProvider):
    """Typed stub for future remote-agent discovery snapshots."""

    name = "remote_agent"

    def supports(self, target: DiscoveryTarget) -> bool:
        """Return true for remote agent discovery targets."""

        return target.source == "remote_agent"

    def materialize(self, target: DiscoveryTarget) -> MaterializedWorkspace:
        """Raise until deterministic remote materialization is implemented."""

        if not self.supports(target):
            raise ValueError(f"{self.name} does not support target source {target.source}")
        raise NotImplementedError("Remote agent discovery materialization is not implemented yet")
