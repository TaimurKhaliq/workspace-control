"""Local path discovery provider for already-materialized workspaces."""

from pathlib import Path

from app.models.discovery import DiscoveryTarget, MaterializedWorkspace

from .base import DiscoveryProvider


class LocalPathProvider(DiscoveryProvider):
    """Materialize a local workspace path without copying or mutating it."""

    name = "local_path"

    def supports(self, target: DiscoveryTarget) -> bool:
        """Return true for local path discovery targets."""

        return target.source == "local_path"

    def materialize(self, target: DiscoveryTarget) -> MaterializedWorkspace:
        """Validate and expose the target path as a read-only workspace."""

        if not self.supports(target):
            raise ValueError(f"{self.name} does not support target source {target.source}")

        root_path = Path(target.location).expanduser().resolve()
        if not root_path.is_dir():
            raise ValueError(f"Local discovery target is not a directory: {root_path}")

        return MaterializedWorkspace(
            target=target,
            root_path=root_path,
            provider=self.name,
            read_only=True,
            cleanup_required=False,
        )
