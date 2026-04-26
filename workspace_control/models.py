from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StackpilotManifest(BaseModel):
    """Schema for stackpilot.yml files."""

    model_config = ConfigDict(extra="ignore")

    type: str
    language: str
    domain: str
    build_commands: list[str] = Field(default_factory=list)
    test_commands: list[str] = Field(default_factory=list)
    framework: str | None = None
    frameworks: list[str] = Field(default_factory=list)
    owns_entities: list[str] = Field(default_factory=list)
    owns_fields: list[str] = Field(default_factory=list)
    owns_tables: list[str] = Field(default_factory=list)
    api_keywords: list[str] = Field(default_factory=list)


class InventoryRow(BaseModel):
    """Normalized row used for table rendering."""

    repo_name: str
    type: str
    language: str
    domain: str
    build_commands: list[str] = Field(default_factory=list)
    test_commands: list[str] = Field(default_factory=list)
    owns_entities: list[str] = Field(default_factory=list)
    owns_fields: list[str] = Field(default_factory=list)
    owns_tables: list[str] = Field(default_factory=list)
    api_keywords: list[str] = Field(default_factory=list)
    metadata_source: str = "stackpilot.yml"


class FeatureImpact(BaseModel):
    """Analysis result for one likely impacted repo."""

    repo_name: str
    role: Literal[
        "primary-owner",
        "direct-dependent",
        "possible-downstream",
        "weak-match",
    ]
    score: int
    reason: str


class ConceptGrounding(BaseModel):
    """Grounding result for one feature-request concept."""

    concept: str
    status: Literal[
        "direct_match",
        "alias_match",
        "weak_match",
        "ungrounded",
        "ungrounded_new_domain_candidate",
    ]
    matched_terms: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


class FeaturePlan(BaseModel):
    """Deterministic execution plan derived from feature analysis."""

    feature_request: str
    feature_intents: list[
        Literal["ui", "persistence", "api", "event_integration"]
    ] = Field(default_factory=list)
    unsupported_intents: list[
        Literal["ui", "persistence", "api", "event_integration"]
    ] = Field(default_factory=list)
    concept_grounding: list[ConceptGrounding] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    missing_evidence: list[str] = Field(default_factory=list)
    primary_owner: str | None = None
    implementation_owner: str | None = None
    domain_owner: str | None = None
    direct_dependents: list[str] = Field(default_factory=list)
    possible_downstreams: list[str] = Field(default_factory=list)
    db_change_needed: bool = False
    api_change_needed: bool = False
    ui_change_needed: bool = False
    likely_paths_by_repo: dict[str, list[str]] = Field(default_factory=dict)
    validation_commands: list[str] = Field(default_factory=list)
    ordered_steps: list[str] = Field(default_factory=list)
    requires_human_approval: bool = False
    matched_recipes: list["PlanRecipeMatch"] = Field(default_factory=list)
    recipe_guidance: list["PlanRecipeGuidance"] = Field(default_factory=list)
    recipe_confidence_summary: dict[str, object] = Field(default_factory=dict)


class FilePlan(BaseModel):
    """Typed file-level proposal with action and confidence classification."""

    path: str
    action: Literal["modify", "create", "inspect", "inspect-only"]
    confidence: Literal["high", "medium", "low"]
    reason: str


class PlanRecipeMatch(BaseModel):
    """Compact recipe match evidence included in a feature plan."""

    recipe_id: str
    recipe_type: str
    structural_confidence: float
    planner_effectiveness: float
    score: int
    why_matched: list[str] = Field(default_factory=list)


class PlanRecipeGuidance(BaseModel):
    """Recipe-derived guidance that stays separate from native plan steps."""

    matched_recipe_id: str
    node_type: str
    action: Literal["create", "modify", "inspect"]
    path: str | None = None
    folder: str | None = None
    confidence: Literal["high", "medium", "low"]
    evidence: list[str] = Field(default_factory=list)


class CombinedRecommendation(BaseModel):
    """File-level recommendation with planner/recipe provenance."""

    repo_name: str
    path: str
    action: Literal["modify", "create", "inspect", "inspect-only"]
    confidence: Literal["high", "medium", "low"]
    source: Literal["planner", "recipe", "both"]
    evidence: list[str] = Field(default_factory=list)
    matched_recipe_id: str | None = None


class ChangeProposalItem(BaseModel):
    """Read-only proposed change hints for one impacted repository."""

    repo_name: str
    role: Literal[
        "primary-owner",
        "direct-dependent",
        "possible-downstream",
        "weak-match",
    ]
    likely_files_to_inspect: list[str] = Field(default_factory=list)
    files: list[FilePlan] = Field(default_factory=list)
    likely_changes: list[str] = Field(default_factory=list)
    possible_new_files: list[str] = Field(default_factory=list)
    rationale: str

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_file_suggestions(cls, values):
        if not isinstance(values, dict):
            return values

        data = dict(values)
        if not data.get("files"):
            legacy_paths = data.get("likely_files_to_inspect", [])
            data["files"] = [
                {
                    "path": path,
                    "action": "inspect",
                    "confidence": "medium",
                    "reason": "Legacy file suggestion without detailed classification.",
                }
                for path in legacy_paths
                if isinstance(path, str)
            ]

        if not data.get("likely_files_to_inspect"):
            files = data.get("files", [])
            data["likely_files_to_inspect"] = [
                file_plan["path"] if isinstance(file_plan, dict) else file_plan.path
                for file_plan in files
                if (
                    (
                        isinstance(file_plan, dict)
                        and file_plan.get("action") != "create"
                    )
                    or (
                        not isinstance(file_plan, dict)
                        and getattr(file_plan, "action", None) != "create"
                    )
                )
            ]

        return data


class ChangeProposal(BaseModel):
    """Deterministic read-only change proposal derived from a feature plan."""

    feature_request: str
    feature_intents: list[
        Literal["ui", "persistence", "api", "event_integration"]
    ] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "medium"
    missing_evidence: list[str] = Field(default_factory=list)
    implementation_owner: str | None = None
    domain_owner: str | None = None
    proposed_changes: list[ChangeProposalItem] = Field(default_factory=list)
    recipe_suggestions: list[CombinedRecommendation] = Field(default_factory=list)
    combined_recommendations: list[CombinedRecommendation] = Field(default_factory=list)


FeaturePlan.model_rebuild()
