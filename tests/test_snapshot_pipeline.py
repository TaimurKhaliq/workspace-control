from pathlib import Path

from app.models.discovery import DiscoveryTarget
from app.services.architecture_discovery import ArchitectureDiscoveryService
from workspace_control.analyze import analyze_feature
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan
from workspace_control.propose import create_change_proposal


def _write_manifest(
    root: Path,
    repo_name: str,
    repo_type: str,
    domain: str,
    language: str,
    build_commands: list[str],
    test_commands: list[str],
    owns_entities: list[str] | None = None,
    owns_fields: list[str] | None = None,
    owns_tables: list[str] | None = None,
    api_keywords: list[str] | None = None,
) -> None:
    owns_entities = owns_entities or []
    owns_fields = owns_fields or []
    owns_tables = owns_tables or []
    api_keywords = api_keywords or []

    lines = [
        f"type: {repo_type}",
        f"language: {language}",
        f"domain: {domain}",
        "build_commands:",
        *[f"  - {command}" for command in build_commands],
        "test_commands:",
        *[f"  - {command}" for command in test_commands],
        f"owns_entities: {owns_entities if owns_entities else []}",
        f"owns_fields: {owns_fields if owns_fields else []}",
        f"owns_tables: {owns_tables if owns_tables else []}",
        f"api_keywords: {api_keywords if api_keywords else []}",
    ]
    manifest_path = root / repo_name / "stackpilot.yml"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def test_feature_pipeline_consumes_local_path_discovery_snapshot_metadata_only(
    tmp_path: Path,
) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
        api_keywords=["profile screen"],
    )
    _write_manifest(
        tmp_path,
        repo_name="profile-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["phone_number"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile update"],
    )

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    rows = build_inventory(snapshot.workspace.root_path)
    feature_request = "Allow users to update their phone number from the profile screen"
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
    proposal = create_change_proposal(
        feature_request,
        rows,
        impacts=impacts,
        discovery_snapshot=snapshot,
    )

    assert {repo.evidence_mode for repo in snapshot.report.repos} == {"metadata-only"}
    assert plan.implementation_owner == "web-ui"
    assert plan.domain_owner == "profile-api"
    assert set(plan.feature_intents).issuperset({"ui", "api"})
    assert plan.db_change_needed is False
    assert plan.requires_human_approval is True
    assert {item.repo_name for item in proposal.proposed_changes} == {
        "profile-api",
        "web-ui",
    }
    assert all(item.possible_new_files == [] for item in proposal.proposed_changes)
    assert all("metadata-only mode" in item.rationale for item in proposal.proposed_changes)


def test_feature_pipeline_consumes_local_path_discovery_snapshot_partial_source(
    tmp_path: Path,
) -> None:
    _write_manifest(
        tmp_path,
        repo_name="profile-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["phone_number"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile endpoint"],
    )
    controller_path = (
        tmp_path / "profile-api" / "src/main/java/com/acme/profile/controller"
    )
    controller_path.mkdir(parents=True, exist_ok=True)

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    rows = build_inventory(snapshot.workspace.root_path)
    feature_request = "Update customer profile phone number API request validation"
    impacts = analyze_feature(
        feature_request,
        rows,
        discovery_snapshot=snapshot,
    )
    proposal = create_change_proposal(
        feature_request,
        rows,
        impacts=impacts,
        discovery_snapshot=snapshot,
    )
    backend = proposal.proposed_changes[0]

    assert snapshot.report.repos[0].evidence_mode == "mixed"
    assert impacts[0].repo_name == "profile-api"
    assert impacts[0].role == "primary-owner"
    assert "src/main/java/com/acme/profile/controller" in backend.likely_files_to_inspect
