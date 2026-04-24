"""Typed models used by the app-layer services and adapters."""

from .discovery import (
    AdapterDiscovery,
    ArchitectureDiscoveryReport,
    DiscoverySnapshot,
    DiscoveryTarget,
    DiscoveryTargetRecord,
    DiscoveryTargetRegistryState,
    MaterializedWorkspace,
    RepoDiscovery,
)
from .evidence import Evidence
from .feature_plan import FeaturePlan
from .repo_manifest import RepoManifest

__all__ = [
    "ArchitectureDiscoveryReport",
    "AdapterDiscovery",
    "DiscoverySnapshot",
    "DiscoveryTarget",
    "DiscoveryTargetRecord",
    "DiscoveryTargetRegistryState",
    "Evidence",
    "FeaturePlan",
    "MaterializedWorkspace",
    "RepoDiscovery",
    "RepoManifest",
]
