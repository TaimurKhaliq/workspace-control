"""Provider interface for materializing discovery targets into local workspaces."""

from abc import ABC, abstractmethod

from app.models.discovery import DiscoveryTarget, MaterializedWorkspace


class DiscoveryProvider(ABC):
    """Contract for read-only source materialization before architecture discovery."""

    name = "provider"

    @abstractmethod
    def supports(self, target: DiscoveryTarget) -> bool:
        """Return whether this provider can materialize the target."""

    @abstractmethod
    def materialize(self, target: DiscoveryTarget) -> MaterializedWorkspace:
        """Return a read-only local workspace view for discovery."""
