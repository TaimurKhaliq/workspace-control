from pathlib import Path

from workspace_control.analyze import analyze_feature
from workspace_control.cli import run
from workspace_control.manifests import build_inventory


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


def _seed_workspace(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
        api_keywords=["profile screen", "settings ui"],
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
        owns_fields=["phone_number", "marketing_opt_in", "email"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile update", "customer profile endpoint"],
    )
    _write_manifest(
        tmp_path,
        repo_name="notification-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["notification_preference"],
        api_keywords=[
            "profile events",
            "notification sync",
            "downstream integration",
        ],
    )


def _assert_sorted_by_score(impacts) -> None:
    scores = [impact.score for impact in impacts]
    assert scores == sorted(scores, reverse=True)


def test_analyze_feature_ui_and_backend_roles(tmp_path: Path) -> None:
    _seed_workspace(tmp_path)

    rows = build_inventory(tmp_path)
    impacts = analyze_feature(
        "Add customer profile settings page and backend API endpoint for marketing opt-in",
        rows,
    )

    _assert_sorted_by_score(impacts)
    by_repo = {impact.repo_name: impact for impact in impacts}
    assert by_repo["profile-api"].role == "primary-owner"
    assert by_repo["web-ui"].role == "direct-dependent"


def test_analyze_feature_backend_only_roles(tmp_path: Path) -> None:
    _seed_workspace(tmp_path)

    rows = build_inventory(tmp_path)
    impacts = analyze_feature(
        "Update customer profile phone number validation request and response",
        rows,
    )

    _assert_sorted_by_score(impacts)
    by_repo = {impact.repo_name: impact for impact in impacts}
    assert by_repo["profile-api"].role == "primary-owner"
    assert by_repo["notification-api"].role == "direct-dependent"


def test_analyze_feature_cross_service_sync_roles(tmp_path: Path) -> None:
    _seed_workspace(tmp_path)

    rows = build_inventory(tmp_path)
    impacts = analyze_feature(
        (
            "When customer profile phone number changes, publish event and sync "
            "downstream notification integration"
        ),
        rows,
    )

    _assert_sorted_by_score(impacts)
    by_repo = {impact.repo_name: impact for impact in impacts}
    assert by_repo["profile-api"].role == "primary-owner"
    assert by_repo["notification-api"].role == "possible-downstream"
    assert by_repo["web-ui"].role == "weak-match"


def test_analyze_feature_returns_empty_when_no_heuristic_match(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="billing-worker",
        repo_type="worker",
        domain="billing",
        language="python",
        build_commands=["python -m build"],
        test_commands=["pytest -q"],
    )

    rows = build_inventory(tmp_path)
    impacts = analyze_feature("Translate onboarding email copy", rows)

    assert impacts == []


def test_cli_analyze_feature_prints_repo_role_score_reason(
    tmp_path: Path, capsys
) -> None:
    _seed_workspace(tmp_path)

    exit_code = run(
        [
            "analyze-feature",
            "Add customer profile settings page and backend API endpoint for marketing opt-in",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "repo" in captured.out
    assert "role" in captured.out
    assert "score" in captured.out
    assert "reason" in captured.out
    assert "profile-api" in captured.out


def test_analyze_feature_compares_ui_persistence_and_event_requests(
    tmp_path: Path,
) -> None:
    _seed_workspace(tmp_path)

    (tmp_path / "web-ui" / "package.json").write_text(
        '{"dependencies": {"react": "18.2.0"}}',
        encoding="utf-8",
    )
    for path in ["src/pages", "src/components", "src/forms", "src/services", "src/api"]:
        (tmp_path / "web-ui" / path).mkdir(parents=True, exist_ok=True)

    (tmp_path / "profile-api" / "AGENTS.md").write_text(
        "Owns customer profile phone number persistence and validation.",
        encoding="utf-8",
    )
    (tmp_path / "profile-api" / "build.gradle").write_text(
        'plugins { id "org.springframework.boot" version "3.2.0" }\n'
        'dependencies { implementation "org.flywaydb:flyway-core" }',
        encoding="utf-8",
    )
    for path in [
        "src/main/java/com/acme/profile/controller",
        "src/main/java/com/acme/profile/service",
        "src/main/java/com/acme/profile/entity",
        "src/main/java/com/acme/profile/repository",
        "src/main/resources/db/migration",
    ]:
        (tmp_path / "profile-api" / path).mkdir(parents=True, exist_ok=True)

    (tmp_path / "notification-api" / "AGENTS.md").write_text(
        "Handles downstream notification sync and event integration.",
        encoding="utf-8",
    )
    (tmp_path / "notification-api" / "build.gradle").write_text(
        'plugins { id "org.springframework.boot" version "3.2.0" }',
        encoding="utf-8",
    )
    (tmp_path / "notification-api" / "src/main/java/com/acme/notification/integration").mkdir(
        parents=True,
        exist_ok=True,
    )

    rows = build_inventory(tmp_path)

    ui_impacts = analyze_feature(
        "Update the customer profile settings page form",
        rows,
        scan_root=tmp_path,
    )
    persistence_impacts = analyze_feature(
        "Persist customer profile phone number field with database migration",
        rows,
        scan_root=tmp_path,
    )
    event_impacts = analyze_feature(
        (
            "Publish event when customer profile phone number changes for "
            "downstream notification sync"
        ),
        rows,
        scan_root=tmp_path,
    )

    ui_by_repo = {impact.repo_name: impact for impact in ui_impacts}
    persistence_by_repo = {impact.repo_name: impact for impact in persistence_impacts}
    event_by_repo = {impact.repo_name: impact for impact in event_impacts}

    assert ui_impacts[0].repo_name == "profile-api"
    assert ui_by_repo["profile-api"].role == "primary-owner"
    assert ui_by_repo["web-ui"].role == "direct-dependent"
    assert "deterministic_intent:" in ui_by_repo["web-ui"].reason
    assert "adapter_discovery:" in ui_by_repo["web-ui"].reason

    assert persistence_impacts[0].repo_name == "profile-api"
    assert persistence_by_repo["profile-api"].role == "primary-owner"
    assert "stackpilot.yml:" in persistence_by_repo["profile-api"].reason
    assert "adapter_discovery:" in persistence_by_repo["profile-api"].reason

    assert event_by_repo["profile-api"].role == "primary-owner"
    assert event_by_repo["notification-api"].role == "possible-downstream"
    assert "deterministic_intent:" in event_by_repo["notification-api"].reason
    assert "adapter_discovery:" in event_by_repo["notification-api"].reason
