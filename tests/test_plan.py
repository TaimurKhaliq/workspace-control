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

    assert plan.feature_intents == ["ui", "persistence"]
    assert plan.primary_owner == "profile-api"
    assert plan.direct_dependents == ["web-ui"]
    assert plan.possible_downstreams == []
    assert plan.ui_change_needed is True
    assert plan.db_change_needed is True
    assert plan.api_change_needed is False
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

    feature_request = "Rename the phone number label on the profile settings page"
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows)
    plan = create_feature_plan(feature_request, rows, impacts=impacts, scan_root=tmp_path)

    assert plan.feature_intents == ["ui"]
    assert plan.primary_owner == "web-ui"
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
