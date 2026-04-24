import json
from pathlib import Path

from workspace_control.analyze import analyze_feature
from workspace_control.cli import run
from workspace_control.manifests import build_inventory
from workspace_control.propose import create_change_proposal

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "mixed_source_stack"


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


def _seed_proposal_workspace(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
        api_keywords=["profile settings page"],
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
        api_keywords=["profile update", "customer profile endpoint"],
    )
    _write_manifest(
        tmp_path,
        repo_name="notification-sync",
        repo_type="backend-service",
        domain="profile-notifications",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        api_keywords=[
            "publish event",
            "downstream integration",
            "subscriber",
            "notify customer",
        ],
    )

    for path in [
        "profile-api/src/main/java/com/acme/profile/controller",
        "profile-api/src/main/java/com/acme/profile/service",
        "profile-api/src/main/java/com/acme/profile/dto",
        "profile-api/src/main/java/com/acme/profile/entity",
        "profile-api/src/main/java/com/acme/profile/repository",
        "profile-api/src/main/java/com/acme/profile/events",
        "profile-api/src/main/resources/db/migration",
        "notification-sync/src/main/java/com/acme/notification/events",
        "notification-sync/src/main/java/com/acme/notification/integration",
        "web-ui/src/pages",
        "web-ui/src/components",
        "web-ui/src/forms",
        "web-ui/src/services",
        "web-ui/src/api",
    ]:
        (tmp_path / path).mkdir(parents=True, exist_ok=True)

    (tmp_path / "profile-api/src/main/resources/openapi.yaml").write_text(
        "openapi: 3.0.0",
        encoding="utf-8",
    )


def _proposal_by_repo(proposal):
    return {item.repo_name: item for item in proposal.proposed_changes}


def test_propose_changes_event_publishing_feature(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = (
        "Whenever customer profile phone number changes, publish event for downstream sync"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    proposal = create_change_proposal(
        feature_request,
        rows,
        impacts=impacts,
        scan_root=tmp_path,
    )
    by_repo = _proposal_by_repo(proposal)

    primary = by_repo["profile-api"]
    downstream = by_repo["notification-sync"]

    assert primary.role == "primary-owner"
    assert downstream.role == "possible-downstream"
    assert "src/main/java/com/acme/profile/events" in primary.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/service" in primary.likely_files_to_inspect
    assert any("publish logic" in change for change in primary.likely_changes)
    assert primary.possible_new_files == [
        "new event payload class",
        "new publisher/producer class",
    ]
    assert any("integration" in path for path in downstream.likely_files_to_inspect)
    assert downstream.possible_new_files == ["new consumer/handler class"]


def test_propose_changes_ui_and_persistence_feature(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = (
        "Add phone number field to the customer profile settings form "
        "and persist it to database"
    )
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)

    backend = by_repo["profile-api"]
    frontend = by_repo["web-ui"]

    assert backend.role == "primary-owner"
    assert frontend.role == "direct-dependent"
    assert "src/main/resources/db/migration" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/entity" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/repository" in backend.likely_files_to_inspect
    assert any(path.endswith(".sql") for path in backend.possible_new_files)
    assert "src/pages" in frontend.likely_files_to_inspect
    assert "src/forms" in frontend.likely_files_to_inspect
    assert "src/api" in frontend.likely_files_to_inspect
    assert any(path.endswith(".tsx") for path in frontend.possible_new_files)


def test_propose_changes_backend_only_api_feature(tmp_path: Path, capsys) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = "Update customer profile phone number API request validation"
    exit_code = run(["propose-changes", feature_request, "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()
    parsed = json.loads(captured.out)
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)
    backend = by_repo["profile-api"]

    assert exit_code == 0
    assert parsed["feature_request"] == feature_request
    assert "proposed_changes" in parsed
    assert "web-ui" not in by_repo
    assert backend.role == "primary-owner"
    assert "src/main/resources/openapi.yaml" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/controller" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/dto" in backend.likely_files_to_inspect
    assert any("API request/response contract" in change for change in backend.likely_changes)
    assert any("validation flow" in change for change in backend.likely_changes)


def test_propose_changes_prefers_specific_backend_file_names(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    for path in [
        "profile-api/src/main/java/com/acme/profile/controller/CustomerProfileController.java",
        "profile-api/src/main/java/com/acme/profile/service/CustomerProfileService.java",
        "profile-api/src/main/java/com/acme/profile/entity/CustomerProfile.java",
        "profile-api/src/main/java/com/acme/profile/repository/CustomerProfileRepository.java",
    ]:
        (tmp_path / path).write_text("class Placeholder {}", encoding="utf-8")

    feature_request = (
        "Update customer profile phone number API request validation and "
        "persist field to database"
    )
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    backend = _proposal_by_repo(proposal)["profile-api"]

    expected_files = [
        "src/main/java/com/acme/profile/controller/CustomerProfileController.java",
        "src/main/java/com/acme/profile/service/CustomerProfileService.java",
        "src/main/java/com/acme/profile/entity/CustomerProfile.java",
        "src/main/java/com/acme/profile/repository/CustomerProfileRepository.java",
    ]
    for expected_file in expected_files:
        assert expected_file in backend.likely_files_to_inspect

    assert backend.likely_files_to_inspect.index(expected_files[0]) < (
        backend.likely_files_to_inspect.index("src/main/java/com/acme/profile/controller")
    )
    assert "owns_fields" in backend.rationale
    assert "spring_boot" in backend.rationale
    assert "Concrete files were inferred" in backend.rationale


def test_propose_changes_metadata_only_repo_stays_conservative(tmp_path: Path) -> None:
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

    feature_request = "Update customer profile phone number API request"
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    backend = _proposal_by_repo(proposal)["profile-api"]

    assert "stackpilot.yml" in backend.likely_files_to_inspect
    assert "src/main/java/controller" in backend.likely_files_to_inspect
    assert "src/main/java/service" in backend.likely_files_to_inspect
    assert all("*" not in path for path in backend.likely_files_to_inspect)
    assert backend.possible_new_files == []
    assert "metadata-only mode" in backend.rationale
    assert "manifest hints" in backend.rationale


def test_propose_changes_mutable_domain_field_metadata_only_keeps_two_owners(
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
        repo_name="service-a",
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

    feature_request = "Allow users to update their phone number from the profile screen"
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)

    assert proposal.implementation_owner == "web-ui"
    assert proposal.domain_owner == "service-a"
    assert set(proposal.feature_intents).issuperset({"ui", "api"})
    assert set(by_repo) == {"service-a", "web-ui"}
    assert by_repo["service-a"].possible_new_files == []
    assert by_repo["web-ui"].possible_new_files == []
    assert "metadata-only mode" in by_repo["service-a"].rationale
    assert "manifest hints" in by_repo["web-ui"].rationale


def test_propose_changes_source_discovered_event_avoids_literal_new_files() -> None:
    feature_request = (
        "When a user updates their preferred language, publish a profile-updated "
        "event to downstream systems"
    )
    rows = build_inventory(FIXTURE_ROOT)
    proposal = create_change_proposal(feature_request, rows, scan_root=FIXTURE_ROOT)
    by_repo = _proposal_by_repo(proposal)

    assert set(by_repo) == {"service-a", "service-b"}

    all_inspect_paths = [
        path
        for item in proposal.proposed_changes
        for path in item.likely_files_to_inspect
    ]
    all_new_files = [
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    ]

    assert "stackpilot.yml" not in all_inspect_paths
    assert all("*" not in path for path in all_inspect_paths)
    assert all("**" not in path for path in all_inspect_paths)
    assert "src/main/java/com/example/servicea/service/ProfileService.java" in (
        by_repo["service-a"].likely_files_to_inspect
    )
    assert "src/main/java/com/example/serviceb/events/ProfileEventConsumer.java" in (
        by_repo["service-b"].likely_files_to_inspect
    )
    assert by_repo["service-a"].possible_new_files == [
        "new event payload class",
        "new publisher/producer class",
    ]
    assert not any("UserUpdatesPreferredLanguage" in path for path in all_new_files)
    assert not any("WhenAUserUpdates" in path for path in all_new_files)
