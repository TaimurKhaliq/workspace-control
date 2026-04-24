from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.analyze import analyze_feature
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
FEATURE_REQUEST = "Allow users to update their phone number from the profile screen"
PERSISTED_FIELD_REQUEST = (
    "Add phone number field to the customer profile settings form and persist it to database"
)
EVENT_REQUEST = "Publish profile-updated event when phone number changes"
EVENT_WHEN_FIELD_CHANGES_REQUEST = (
    "Publish a profile-updated event whenever a user's phone number changes"
)


def _register_fixture_targets(tmp_path: Path) -> DiscoveryTargetRegistry:
    registry = DiscoveryTargetRegistry(tmp_path / "registry.json")
    for target_id in ["metadata-only", "mixed-source"]:
        fixture_name = (
            "metadata_only_stack"
            if target_id == "metadata-only"
            else "mixed_source_stack"
        )
        registry.register(
            DiscoveryTargetRecord(
                id=target_id,
                source_type="local_path",
                locator=str(FIXTURE_ROOT / fixture_name),
                hints={"fixture": fixture_name},
            )
        )
    return registry


def _snapshot_for_target(registry: DiscoveryTargetRegistry, target_id: str):
    record = registry.get(target_id)
    return ArchitectureDiscoveryService().discover(record.to_target())


def _repo_by_name(snapshot):
    return {repo.repo_name: repo for repo in snapshot.report.repos}


def _analyze_and_plan(snapshot, feature_request: str):
    rows = build_inventory(snapshot.workspace.root_path)
    impacts = analyze_feature(
        feature_request,
        rows,
        discovery_snapshot=snapshot,
    )
    plan = create_feature_plan(
        feature_request,
        rows,
        impacts=impacts,
        discovery_snapshot=snapshot,
    )
    return impacts, plan


def test_fixture_targets_compare_discover_architecture_modes(tmp_path: Path) -> None:
    registry = _register_fixture_targets(tmp_path)
    metadata_snapshot = _snapshot_for_target(registry, "metadata-only")
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")

    metadata_repos = _repo_by_name(metadata_snapshot)
    mixed_repos = _repo_by_name(mixed_snapshot)

    assert sorted(metadata_repos) == ["service-a", "service-b", "web-ui"]
    assert sorted(mixed_repos) == ["service-a", "service-b", "web-ui"]
    assert {repo.evidence_mode for repo in metadata_repos.values()} == {
        "metadata-only"
    }
    assert metadata_repos["service-a"].confidence == "low"
    assert metadata_repos["web-ui"].detected_frameworks == []
    assert metadata_repos["web-ui"].hinted_frameworks == ["react"]

    assert mixed_repos["service-a"].evidence_mode == "source-discovered"
    assert mixed_repos["service-a"].confidence == "high"
    assert mixed_repos["service-a"].detected_frameworks == [
        "flyway",
        "openapi",
        "spring_boot",
    ]
    assert "src/main/resources/openapi.yaml" in mixed_repos["service-a"].likely_api_locations
    assert (
        "src/main/java/com/example/servicea/controller"
        in mixed_repos["service-a"].likely_api_locations
    )
    assert (
        "src/main/resources/db/migration"
        in mixed_repos["service-a"].likely_persistence_locations
    )
    assert mixed_repos["service-b"].evidence_mode == "mixed"
    assert mixed_repos["service-b"].confidence == "medium"
    assert (
        "src/main/java/com/example/serviceb/events"
        in mixed_repos["service-b"].likely_event_locations
    )
    assert mixed_repos["web-ui"].evidence_mode == "source-discovered"
    assert mixed_repos["web-ui"].detected_frameworks == ["react"]
    assert mixed_repos["web-ui"].likely_ui_locations == [
        "src/pages",
        "src/components",
        "src/forms",
    ]


def test_fixture_targets_compare_analyze_feature_evidence(
    tmp_path: Path,
) -> None:
    registry = _register_fixture_targets(tmp_path)
    metadata_snapshot = _snapshot_for_target(registry, "metadata-only")
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")
    metadata_rows = build_inventory(metadata_snapshot.workspace.root_path)
    mixed_rows = build_inventory(mixed_snapshot.workspace.root_path)

    metadata_impacts = analyze_feature(
        FEATURE_REQUEST,
        metadata_rows,
        discovery_snapshot=metadata_snapshot,
    )
    mixed_impacts = analyze_feature(
        FEATURE_REQUEST,
        mixed_rows,
        discovery_snapshot=mixed_snapshot,
    )
    metadata_by_repo = {impact.repo_name: impact for impact in metadata_impacts}
    mixed_by_repo = {impact.repo_name: impact for impact in mixed_impacts}

    assert metadata_impacts[0].repo_name == "service-a"
    assert mixed_impacts[0].repo_name == "service-a"
    assert metadata_by_repo["service-a"].role == "primary-owner"
    assert mixed_by_repo["service-a"].role == "primary-owner"
    assert metadata_by_repo["web-ui"].role == "direct-dependent"
    assert mixed_by_repo["web-ui"].role == "direct-dependent"
    assert "adapter_discovery:" not in metadata_by_repo["web-ui"].reason
    assert "adapter_discovery:" in mixed_by_repo["web-ui"].reason
    assert mixed_by_repo["service-a"].score > metadata_by_repo["service-a"].score


def test_fixture_targets_compare_plan_feature_behavior(tmp_path: Path) -> None:
    registry = _register_fixture_targets(tmp_path)
    metadata_snapshot = _snapshot_for_target(registry, "metadata-only")
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")
    metadata_rows = build_inventory(metadata_snapshot.workspace.root_path)
    mixed_rows = build_inventory(mixed_snapshot.workspace.root_path)

    metadata_plan = create_feature_plan(
        FEATURE_REQUEST,
        metadata_rows,
        discovery_snapshot=metadata_snapshot,
    )
    mixed_plan = create_feature_plan(
        FEATURE_REQUEST,
        mixed_rows,
        discovery_snapshot=mixed_snapshot,
    )

    assert metadata_plan.primary_owner == "service-a"
    assert metadata_plan.implementation_owner == "web-ui"
    assert metadata_plan.domain_owner == "service-a"
    assert "no API contract file found" in metadata_plan.missing_evidence
    assert "src/main/java/controller" in metadata_plan.likely_paths_by_repo["service-a"]

    assert mixed_plan.primary_owner == "service-a"
    assert mixed_plan.implementation_owner == "web-ui"
    assert mixed_plan.domain_owner == "service-a"
    assert "no API contract file found" not in mixed_plan.missing_evidence
    assert (
        "src/main/java/com/example/servicea/controller"
        in mixed_plan.likely_paths_by_repo["service-a"]
    )
    assert "src/pages" in mixed_plan.likely_paths_by_repo["web-ui"]
    assert metadata_plan.db_change_needed is False
    assert mixed_plan.db_change_needed is False


def test_fixture_targets_compare_persisted_ui_field_behavior(tmp_path: Path) -> None:
    registry = _register_fixture_targets(tmp_path)
    metadata_snapshot = _snapshot_for_target(registry, "metadata-only")
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")
    metadata_impacts, metadata_plan = _analyze_and_plan(
        metadata_snapshot,
        PERSISTED_FIELD_REQUEST,
    )
    mixed_impacts, mixed_plan = _analyze_and_plan(
        mixed_snapshot,
        PERSISTED_FIELD_REQUEST,
    )
    metadata_by_repo = {impact.repo_name: impact for impact in metadata_impacts}
    mixed_by_repo = {impact.repo_name: impact for impact in mixed_impacts}

    assert metadata_plan.primary_owner == "service-a"
    assert mixed_plan.primary_owner == "service-a"
    assert metadata_plan.domain_owner == "service-a"
    assert mixed_plan.domain_owner == "service-a"
    assert metadata_plan.api_change_needed is True
    assert mixed_plan.api_change_needed is True
    assert metadata_plan.db_change_needed is True
    assert mixed_plan.db_change_needed is True
    assert "no API contract file found" in metadata_plan.missing_evidence
    assert "no migration system detected" in metadata_plan.missing_evidence
    assert mixed_plan.missing_evidence == []
    assert mixed_by_repo["service-a"].score > metadata_by_repo["service-a"].score
    assert "adapter_discovery:" in mixed_by_repo["service-a"].reason
    assert "using discovered API/service paths" in mixed_plan.ordered_steps[0]
    assert "persistence/schema paths" in mixed_plan.ordered_steps[0]


def test_fixture_targets_compare_event_publishing_behavior(tmp_path: Path) -> None:
    registry = _register_fixture_targets(tmp_path)
    metadata_snapshot = _snapshot_for_target(registry, "metadata-only")
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")
    metadata_impacts, metadata_plan = _analyze_and_plan(
        metadata_snapshot,
        EVENT_REQUEST,
    )
    mixed_impacts, mixed_plan = _analyze_and_plan(
        mixed_snapshot,
        EVENT_REQUEST,
    )
    metadata_by_repo = {impact.repo_name: impact for impact in metadata_impacts}
    mixed_by_repo = {impact.repo_name: impact for impact in mixed_impacts}

    assert metadata_plan.primary_owner == "service-a"
    assert mixed_plan.primary_owner == "service-a"
    assert "service-b" in metadata_plan.possible_downstreams
    assert "service-b" in mixed_plan.possible_downstreams
    assert "no event folder or publisher pattern found" in metadata_plan.missing_evidence
    assert mixed_plan.missing_evidence == []
    assert mixed_by_repo["service-a"].score > metadata_by_repo["service-a"].score
    assert mixed_by_repo["service-b"].score > metadata_by_repo["service-b"].score
    assert "adapter_discovery:" in mixed_by_repo["service-b"].reason
    assert "using discovered event/service trigger paths" in mixed_plan.ordered_steps[0]
    assert "using discovered consumer/integration paths" in mixed_plan.ordered_steps[1]


def test_fixture_targets_event_publishing_prefers_service_event_evidence(
    tmp_path: Path,
) -> None:
    registry = _register_fixture_targets(tmp_path)
    mixed_snapshot = _snapshot_for_target(registry, "mixed-source")
    _, mixed_plan = _analyze_and_plan(
        mixed_snapshot,
        EVENT_WHEN_FIELD_CHANGES_REQUEST,
    )

    primary_step = mixed_plan.ordered_steps[0]

    assert mixed_plan.primary_owner == "service-a"
    assert mixed_plan.domain_owner == "service-a"
    assert "service-b" in mixed_plan.possible_downstreams
    assert mixed_plan.api_change_needed is False
    assert "event emission/publish logic" in primary_step
    assert "trigger point in service flow" in primary_step
    assert "src/main/java/com/example/servicea/service" in primary_step
    assert "API request/response" not in primary_step
    assert "openapi" not in primary_step.lower()
    assert "controller" not in primary_step.lower()
    assert "dto" not in primary_step.lower()
    assert "stackpilot.yml" not in mixed_plan.likely_paths_by_repo["service-a"]
    assert "src/main/java/com/example/servicea/service" in mixed_plan.likely_paths_by_repo["service-a"]
    assert "src/main/resources/openapi.yaml" not in mixed_plan.likely_paths_by_repo["service-a"]
    assert (
        "src/main/java/com/example/servicea/controller"
        not in mixed_plan.likely_paths_by_repo["service-a"]
    )
    assert "src/main/java/com/example/servicea/dto" not in mixed_plan.likely_paths_by_repo["service-a"]
