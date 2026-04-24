from pathlib import Path

from app.services.architecture_discovery import ArchitectureDiscoveryService
from workspace_control.cli import run


def _write_manifest(
    repo_path: Path,
    repo_type: str,
    language: str,
    domain: str,
    build_commands: list[str],
    test_commands: list[str],
) -> None:
    lines = [
        f"type: {repo_type}",
        f"language: {language}",
        f"domain: {domain}",
        "build_commands:",
        *[f"  - {command}" for command in build_commands],
        "test_commands:",
        *[f"  - {command}" for command in test_commands],
        "owns_entities: [customer_profile]",
        "owns_fields: [phone_number]",
        "owns_tables: [customer_profiles]",
        "api_keywords: [profile endpoint, openapi contract]",
    ]
    repo_path.mkdir(parents=True, exist_ok=True)
    (repo_path / "stackpilot.yml").write_text("\n".join(lines), encoding="utf-8")


def test_discover_architecture_backend_repo_prefers_existing_locations(
    tmp_path: Path, capsys
) -> None:
    repo_path = tmp_path / "profile-api"
    _write_manifest(
        repo_path,
        repo_type="backend-service",
        language="java",
        domain="customer-profile",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
    )
    (repo_path / "AGENTS.md").write_text(
        "Spring Boot service with Flyway migrations and OpenAPI docs.",
        encoding="utf-8",
    )
    (repo_path / "build.gradle").write_text(
        'plugins { id "org.springframework.boot" version "3.2.0" }\n'
        'dependencies { implementation "org.flywaydb:flyway-core" }',
        encoding="utf-8",
    )
    for path in [
        "src/main/java/com/acme/profile/controller",
        "src/main/java/com/acme/profile/dto",
        "src/main/java/com/acme/profile/service",
        "src/main/java/com/acme/profile/entity",
        "src/main/java/com/acme/profile/repository",
        "src/main/java/com/acme/profile/integration",
        "src/main/resources/db/migration",
    ]:
        (repo_path / path).mkdir(parents=True, exist_ok=True)

    (repo_path / "src/main/resources/openapi.yaml").write_text(
        "openapi: 3.0.0",
        encoding="utf-8",
    )
    (repo_path / "src/main/java/com/acme/profile/controller/ProfileController.java").write_text(
        "class ProfileController {}",
        encoding="utf-8",
    )
    (repo_path / "src/main/java/com/acme/profile/service/ProfileService.java").write_text(
        "class ProfileService {}",
        encoding="utf-8",
    )

    report = ArchitectureDiscoveryService().discover(tmp_path)
    repo = report.repos[0]

    assert repo.repo_name == "profile-api"
    assert repo.detected_frameworks == ["flyway", "openapi", "spring_boot"]
    assert repo.likely_api_locations == [
        "src/main/resources/openapi.yaml",
        "src/main/java/com/acme/profile/controller",
        "src/main/java/com/acme/profile/dto",
    ]
    assert repo.likely_service_locations == [
        "src/main/java/com/acme/profile/service"
    ]
    assert repo.likely_persistence_locations == [
        "src/main/resources/db/migration",
        "src/main/java/com/acme/profile/entity",
        "src/main/java/com/acme/profile/repository",
    ]
    assert repo.likely_event_locations == [
        "src/main/java/com/acme/profile/integration"
    ]
    assert "src/main/java/controller" not in repo.likely_api_locations
    assert "db/migration" not in repo.likely_persistence_locations

    exit_code = run(["discover-architecture", "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "Architecture Discovery" in captured.out
    assert "repo: profile-api" in captured.out
    assert "frameworks: flyway, openapi, spring_boot" in captured.out
    assert "service/business logic: src/main/java/com/acme/profile/service" in captured.out


def test_discover_architecture_frontend_repo_prefers_existing_locations(
    tmp_path: Path, capsys
) -> None:
    repo_path = tmp_path / "web-ui"
    for path in [
        "src/pages",
        "src/components",
        "src/forms",
        "src/services",
        "src/api",
    ]:
        (repo_path / path).mkdir(parents=True, exist_ok=True)

    (repo_path / "package.json").write_text(
        '{"dependencies": {"react": "18.2.0"}}',
        encoding="utf-8",
    )
    (repo_path / "src/components/ProfileForm.tsx").write_text(
        "export function ProfileForm() { return null }",
        encoding="utf-8",
    )

    report = ArchitectureDiscoveryService().discover(tmp_path)
    repo = report.repos[0]

    assert repo.repo_name == "web-ui"
    assert repo.detected_frameworks == ["react"]
    assert repo.likely_ui_locations == ["src/pages", "src/components", "src/forms"]
    assert repo.likely_api_locations == ["src/api", "src/services"]
    assert repo.likely_service_locations == ["src/services"]
    assert repo.likely_persistence_locations == []
    assert repo.likely_event_locations == []

    exit_code = run(["discover-architecture", "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "repo: web-ui" in captured.out
    assert "frameworks: react" in captured.out
    assert "ui/components: src/pages, src/components, src/forms" in captured.out
