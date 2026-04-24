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


def test_plan_feature_ui_and_backend_feature(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
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
        api_keywords=["profile update", "phone number"],
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

    feature_request = "Allow users to update their phone number from the profile screen"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts)

    assert plan.feature_request == feature_request
    assert plan.primary_owner == "profile-api"
    assert plan.direct_dependents == ["web-ui"]
    assert plan.possible_downstreams == []
    assert plan.ui_change_needed is True
    assert plan.api_change_needed is True
    assert plan.db_change_needed is False
    assert plan.requires_human_approval is False
    assert "profile-api" in plan.likely_paths_by_repo
    assert any("score=" in step and "profile-api" in step for step in plan.ordered_steps)


def test_plan_feature_backend_only_feature(tmp_path: Path) -> None:
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
        api_keywords=["profile update", "request validation"],
    )
    _write_manifest(
        tmp_path,
        repo_name="audit-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["status"],
        api_keywords=["audit trail"],
    )

    feature_request = "Update customer profile phone number validation request and response"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts)

    assert plan.primary_owner == "profile-api"
    assert plan.direct_dependents == ["audit-api"]
    assert plan.possible_downstreams == []
    assert plan.ui_change_needed is False
    assert plan.api_change_needed is True
    assert plan.db_change_needed is False
    assert plan.requires_human_approval is False


def test_plan_feature_cross_service_sync_feature(tmp_path: Path) -> None:
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
        api_keywords=["notification sync", "publish event", "downstream integration"],
    )
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile-ui",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
    )

    feature_request = (
        "When customer profile phone number changes, publish event and sync "
        "downstream notification integration"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts)

    assert plan.primary_owner == "profile-api"
    assert plan.possible_downstreams == ["notification-sync"]
    assert plan.requires_human_approval is True
    assert plan.api_change_needed is True
    assert plan.ui_change_needed is False


def test_cli_plan_feature_prints_feature_plan_json(tmp_path: Path, capsys) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
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
        api_keywords=["profile update", "phone number"],
    )

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
    assert parsed["primary_owner"] == "profile-api"
    assert "direct_dependents" in parsed
    assert "possible_downstreams" in parsed
    assert "likely_paths_by_repo" in parsed
