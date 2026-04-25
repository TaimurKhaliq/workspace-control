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
from .repo_learning import (
    ChangeRecipe,
    CommitLearningObservation,
    RecipeValidationResult,
    RepoLearningReport,
    RepoLearningState,
)
from .repo_profile import InferredRepoProfile, RepoProfileBootstrapReport
from .recipe_suggestion import MatchedRecipe, RecipeLikelyAction, RecipeSuggestionReport

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
    "RepoLearningState",
    "ChangeRecipe",
    "RecipeValidationResult",
    "CommitLearningObservation",
    "RepoLearningReport",
    "InferredRepoProfile",
    "RepoProfileBootstrapReport",
    "MatchedRecipe",
    "RecipeLikelyAction",
    "RecipeSuggestionReport",
]
