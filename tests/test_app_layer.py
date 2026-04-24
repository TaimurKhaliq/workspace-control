from pathlib import Path

from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.feature_intent_classifier import FeatureIntentClassifier
from app.services.manifest_loader import ManifestLoader
from app.services.planner import Planner
from app.services.repo_role_assigner import RepoRoleAssigner


def _write_manifest(
    root: Path,
    repo_name: str,
    repo_type: str,
    domain: str,
    language: str,
    build_commands: list[str],
    test_commands: list[str],
    api_keywords: list[str] | None = None,
) -> None:
    api_keywords = api_keywords or []

    lines = [
        f"type: {repo_type}",
        f"language: {language}",
        f"domain: {domain}",
        "build_commands:",
        *[f"  - {command}" for command in build_commands],
        "test_commands:",
        *[f"  - {command}" for command in test_commands],
        "owns_entities: []",
        "owns_fields: []",
        "owns_tables: []",
        f"api_keywords: {api_keywords if api_keywords else []}",
    ]
    manifest_path = root / repo_name / "stackpilot.yml"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def test_app_services_smoke(tmp_path: Path) -> None:
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
        api_keywords=["profile endpoint", "publish event"],
    )

    loader = ManifestLoader()
    rows = loader.build_inventory(tmp_path)
    assert [row.repo_name for row in rows] == ["profile-api", "web-ui"]

    classifier = FeatureIntentClassifier()
    intents = classifier.classify("Update profile page and publish event")
    assert intents == ["ui", "event_integration"]

    assigner = RepoRoleAssigner()
    impacts = assigner.assign("Update profile page and publish event", rows)
    assert len(impacts) >= 1

    planner = Planner()
    plan = planner.plan(
        "Update profile page and publish event",
        rows,
        impacts=impacts,
        scan_root=tmp_path,
    )
    assert plan.feature_request == "Update profile page and publish event"

    discovery = ArchitectureDiscoveryService().discover_local(tmp_path)
    repos = {repo.repo_name: repo for repo in discovery.repos}
    assert "profile-api" in repos
    assert "web-ui" in repos
    assert len(repos["profile-api"].evidence) >= 1
