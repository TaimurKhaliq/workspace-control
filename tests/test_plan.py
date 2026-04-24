import json
from pathlib import Path

from workspace_control.analyze import analyze_feature
from workspace_control.cli import run
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan


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


def _seed_common_workspace(tmp_path: Path) -> None:
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
        owns_fields=["phone_number", "marketing_opt_in"],
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


def test_plan_feature_ui_and_persistence_feature(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    (tmp_path / "profile-api" / "src/main/java/controller").mkdir(
        parents=True, exist_ok=True
    )
    (tmp_path / "profile-api" / "src/main/java/service").mkdir(
        parents=True, exist_ok=True
    )
    (tmp_path / "profile-api" / "src/main/java/dto").mkdir(parents=True, exist_ok=True)
    (tmp_path / "profile-api" / "src/main/java/entity").mkdir(
        parents=True, exist_ok=True
    )
    (tmp_path / "profile-api" / "src/main/java/repository").mkdir(
        parents=True, exist_ok=True
    )
    (tmp_path / "web-ui" / "src/pages").mkdir(parents=True, exist_ok=True)
    (tmp_path / "web-ui" / "src/components").mkdir(parents=True, exist_ok=True)
    (tmp_path / "web-ui" / "src/forms").mkdir(parents=True, exist_ok=True)
    (tmp_path / "web-ui" / "src/services").mkdir(parents=True, exist_ok=True)
    (tmp_path / "web-ui" / "src/api").mkdir(parents=True, exist_ok=True)

    feature_request = (
        "Add phone number field to the customer profile settings form "
        "and persist it to database"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.feature_intents == ["ui", "persistence", "api"]
    assert plan.primary_owner == "profile-api"
    assert plan.direct_dependents == ["web-ui"]
    assert plan.possible_downstreams == []
    assert plan.ui_change_needed is True
    assert plan.db_change_needed is True
    assert plan.api_change_needed is True
    assert "src/main/resources/db/migration" in plan.likely_paths_by_repo["profile-api"]
    assert "src/main/resources/db/changelog" in plan.likely_paths_by_repo["profile-api"]
    assert "src/main/resources" in plan.likely_paths_by_repo["profile-api"]
    assert "src/main/java/db/migration" not in plan.likely_paths_by_repo["profile-api"]
    assert "db/migration" not in plan.likely_paths_by_repo["profile-api"]
    assert "src/pages" in plan.likely_paths_by_repo["web-ui"]
    assert "src/components" in plan.likely_paths_by_repo["web-ui"]
    assert "src/forms" in plan.likely_paths_by_repo["web-ui"]
    assert all(
        not path.startswith("src/main/java")
        for path in plan.likely_paths_by_repo["web-ui"]
    )


def test_plan_feature_backend_only_event_publishing_feature(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = (
        "Whenever changes to customer profile phone number happen, "
        "publish event for downstream sync"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert "event_integration" in plan.feature_intents
    assert "ui" not in plan.feature_intents
    assert plan.ui_change_needed is False
    assert plan.api_change_needed is False
    assert plan.primary_owner == "profile-api"
    assert "web-ui" not in plan.likely_paths_by_repo
    assert "web-ui" not in plan.direct_dependents
    owner_step = next(step for step in plan.ordered_steps if "(primary-owner" in step)
    assert "event emission/publish logic" in owner_step
    assert "payload/schema mapping" in owner_step
    assert "trigger point in service flow" in owner_step
    assert "outbox/producer/integration path" in owner_step


def test_plan_feature_event_and_downstream_notification_feature(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = (
        "When customer profile phone number changes, emit event and notify "
        "downstream integration"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert "event_integration" in plan.feature_intents
    assert "notification-sync" in plan.possible_downstreams
    assert any(
        "consumer/subscriber/integration changes are needed" in step
        for step in plan.ordered_steps
    )


def test_plan_feature_pure_ui_rename_feature(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = "Rename the preferred language label on the profile screen"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)
    primary_step = plan.ordered_steps[0]

    assert plan.feature_intents == ["ui"]
    assert plan.primary_owner == "web-ui"
    assert plan.implementation_owner == "web-ui"
    assert plan.domain_owner is None
    assert plan.direct_dependents == []
    assert plan.possible_downstreams == []
    assert plan.ui_change_needed is True
    assert plan.db_change_needed is False
    assert plan.api_change_needed is False
    assert "profile-api" not in plan.likely_paths_by_repo
    assert set(plan.likely_paths_by_repo["web-ui"]).issuperset(
        {"stackpilot.yml", "src/pages", "src/components", "src/forms"}
    )
    assert all(
        not path.startswith("src/main/java")
        for path in plan.likely_paths_by_repo["web-ui"]
    )
    assert "src/api" not in plan.likely_paths_by_repo["web-ui"]
    assert "src/services" not in plan.likely_paths_by_repo["web-ui"]
    assert "UI copy" in primary_step
    assert "label text" in primary_step
    assert "presentation" in primary_step
    assert "client service wiring" not in primary_step
    assert "payload" not in primary_step
    assert "validation flow" not in primary_step
    assert "API" not in primary_step


def test_cli_plan_feature_prints_feature_plan_json(tmp_path: Path, capsys) -> None:
    _seed_common_workspace(tmp_path)

    exit_code = run(
        [
            "plan-feature",
            "Allow users to update their phone number from the profile screen",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    parsed = json.loads(captured.out)

    assert exit_code == 0
    assert parsed["feature_request"] == "Allow users to update their phone number from the profile screen"
    assert "feature_intents" in parsed
    assert "direct_dependents" in parsed
    assert "possible_downstreams" in parsed
    assert "likely_paths_by_repo" in parsed
    assert "confidence" in parsed
    assert "missing_evidence" in parsed
    assert "implementation_owner" in parsed
    assert "domain_owner" in parsed


def test_plan_feature_mutable_domain_field_from_screen_keeps_backend_owner(
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
    _write_manifest(
        tmp_path,
        repo_name="service-b",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
    )

    feature_request = "Allow users to update their phone number from the profile screen"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.implementation_owner == "web-ui"
    assert plan.domain_owner == "service-a"
    assert set(plan.feature_intents).issuperset({"ui", "api"})
    assert plan.primary_owner == "service-a"
    assert "web-ui" in plan.direct_dependents
    assert plan.db_change_needed is False
    assert plan.api_change_needed is True
    assert plan.requires_human_approval is True
    assert "no API contract file found" in plan.missing_evidence
    assert "service-a" in plan.likely_paths_by_repo
    assert "web-ui" in plan.likely_paths_by_repo


def test_plan_feature_high_confidence_clear_owner(tmp_path: Path) -> None:
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
        api_keywords=["profile endpoint", "phone number"],
    )
    _write_manifest(
        tmp_path,
        repo_name="billing-api",
        repo_type="backend-service",
        domain="billing",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
    )
    (tmp_path / "profile-api" / "build.gradle").write_text(
        'plugins { id "org.springframework.boot" version "3.2.0" }\n'
        'dependencies { implementation "org.flywaydb:flyway-core" }',
        encoding="utf-8",
    )
    (tmp_path / "profile-api" / "src/main/java/com/acme/profile/controller").mkdir(
        parents=True,
        exist_ok=True,
    )
    (tmp_path / "profile-api" / "src/main/java/com/acme/profile/service").mkdir(
        parents=True,
        exist_ok=True,
    )
    (tmp_path / "profile-api" / "src/main/resources/db/migration").mkdir(
        parents=True,
        exist_ok=True,
    )
    (tmp_path / "profile-api" / "src/main/resources/openapi.yaml").write_text(
        "openapi: 3.0.0",
        encoding="utf-8",
    )

    feature_request = (
        "Update customer profile phone number API request and persist field "
        "with database migration"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.primary_owner == "profile-api"
    assert plan.confidence == "high"
    assert plan.missing_evidence == []


def test_plan_feature_low_confidence_ambiguous_owner_tie(tmp_path: Path) -> None:
    for repo_name in ["profile-api", "account-api"]:
        _write_manifest(
            tmp_path,
            repo_name=repo_name,
            repo_type="backend-service",
            domain="customer-profile",
            language="java",
            build_commands=["./gradlew build"],
            test_commands=["./gradlew test"],
            owns_entities=["customer_profile"],
            owns_fields=["phone_number"],
            owns_tables=["customer_profiles"],
            api_keywords=["profile endpoint", "phone number"],
        )

    feature_request = "Update customer profile phone number API request"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.confidence == "low"
    assert any(
        "multiple repos tied on ownership" in item for item in plan.missing_evidence
    )


def test_plan_feature_event_missing_publisher_evidence(tmp_path: Path) -> None:
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
        api_keywords=["profile update", "phone number"],
    )
    _write_manifest(
        tmp_path,
        repo_name="notification-sync",
        repo_type="backend-service",
        domain="profile-notifications",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        api_keywords=["notification sync", "downstream integration"],
    )

    feature_request = (
        "Publish event when customer profile phone number changes for downstream sync"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert "event_integration" in plan.feature_intents
    assert "no event folder or publisher pattern found" in plan.missing_evidence
    assert plan.confidence in {"medium", "low"}


def test_plan_feature_fix_profile_stuff_reports_weak_evidence(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = "Fix profile stuff"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.confidence == "low"
    assert plan.primary_owner is None
    assert plan.direct_dependents == []
    assert plan.possible_downstreams == []
    assert plan.likely_paths_by_repo == {}
    assert plan.ordered_steps == []
    assert (
        "weak evidence for concrete repo ownership or implementation steps"
        in plan.missing_evidence
    )
    assert "no primary owner identified from strong evidence" in plan.missing_evidence


def test_plan_feature_improve_customer_settings_filters_low_signal(tmp_path: Path) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = "Improve customer settings"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.feature_intents == ["ui"]
    assert plan.confidence == "low"
    assert plan.primary_owner is None
    assert plan.direct_dependents == []
    assert plan.possible_downstreams == []
    assert (
        "weak evidence for concrete repo ownership or implementation steps"
        in plan.missing_evidence
    )
    assert all("pages/components/forms" not in step for step in plan.ordered_steps)


def test_plan_feature_generic_api_owner_reports_inferred_owner_gap(
    tmp_path: Path,
) -> None:
    _write_manifest(
        tmp_path,
        repo_name="orders-api",
        repo_type="backend-service",
        domain="orders",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
    )

    feature_request = "Update loyalty API request"
    rows = build_inventory(tmp_path)
    plan = create_feature_plan(feature_request, rows, scan_root=tmp_path)

    assert plan.primary_owner == "orders-api"
    assert (
        "primary owner inferred from generic intent alignment" in plan.missing_evidence
    )
    assert "no API contract file found" in plan.missing_evidence
    assert plan.confidence == "low"


def test_plan_feature_no_owner_skips_repo_specific_missing_evidence(
    tmp_path: Path,
) -> None:
    _seed_common_workspace(tmp_path)

    feature_request = "Persist frobnicator database field"
    rows = build_inventory(tmp_path)
    plan = create_feature_plan(feature_request, rows, scan_root=tmp_path)

    assert plan.primary_owner is None
    assert plan.confidence == "low"
    assert "no primary owner identified from strong evidence" in plan.missing_evidence
    assert "no migration system detected" not in plan.missing_evidence
