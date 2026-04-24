from pathlib import Path

import pytest

from app.models.discovery import DiscoveryTarget
from app.providers.git_url import GitUrlProvider
from app.providers.local_path import LocalPathProvider
from app.providers.remote_agent import RemoteAgentProvider
from app.services.architecture_discovery import ArchitectureDiscoveryService


def test_local_path_provider_materializes_existing_workspace(tmp_path: Path) -> None:
    target = DiscoveryTarget.local_path(tmp_path)
    workspace = LocalPathProvider().materialize(target)

    assert workspace.target == target
    assert workspace.root_path == tmp_path.resolve()
    assert workspace.provider == "local_path"
    assert workspace.read_only is True
    assert workspace.cleanup_required is False


def test_architecture_discovery_snapshot_uses_local_path_provider(
    tmp_path: Path,
) -> None:
    repo_path = tmp_path / "profile-api"
    repo_path.mkdir()
    (repo_path / "stackpilot.yml").write_text(
        "\n".join(
            [
                "type: backend-service",
                "language: java",
                "domain: customer-profile",
                "build_commands: []",
                "test_commands: []",
            ]
        ),
        encoding="utf-8",
    )

    target = DiscoveryTarget.local_path(tmp_path)
    snapshot = ArchitectureDiscoveryService().discover(target)
    repo = snapshot.report.repos[0]

    assert snapshot.target == target
    assert snapshot.workspace.root_path == tmp_path.resolve()
    assert snapshot.workspace.provider == "local_path"
    assert repo.repo_name == "profile-api"
    assert repo.evidence_mode == "metadata-only"
    assert repo.confidence == "low"
    assert "no source folders or build files found" in repo.missing_evidence


def test_architecture_discovery_local_path_target_with_partial_source(
    tmp_path: Path,
) -> None:
    repo_path = tmp_path / "profile-api"
    repo_path.mkdir()
    (repo_path / "stackpilot.yml").write_text(
        "\n".join(
            [
                "type: backend-service",
                "language: java",
                "domain: customer-profile",
                "build_commands: []",
                "test_commands: []",
                "owns_entities: [customer_profile]",
                "owns_fields: [phone_number]",
                "owns_tables: [customer_profiles]",
            ]
        ),
        encoding="utf-8",
    )
    (repo_path / "src/main/java/com/acme/profile/controller").mkdir(
        parents=True,
        exist_ok=True,
    )

    target = DiscoveryTarget.local_path(tmp_path)
    snapshot = ArchitectureDiscoveryService().discover(target)
    repo = snapshot.report.repos[0]

    assert snapshot.workspace.provider == "local_path"
    assert snapshot.workspace.root_path == tmp_path.resolve()
    assert repo.repo_name == "profile-api"
    assert repo.evidence_mode == "mixed"
    assert repo.likely_api_locations == [
        "src/main/java/com/acme/profile/controller"
    ]
    assert "no build file found" in repo.missing_evidence
    assert "no service/business logic path found" in repo.missing_evidence


def test_future_providers_are_typed_stubs() -> None:
    git_target = DiscoveryTarget(source="git_url", location="https://example.com/repo.git")
    remote_target = DiscoveryTarget(source="remote_agent", location="agent://workspace")

    git_provider = GitUrlProvider()
    remote_provider = RemoteAgentProvider()

    assert git_provider.supports(git_target) is True
    assert remote_provider.supports(remote_target) is True
    with pytest.raises(NotImplementedError):
        git_provider.materialize(git_target)
    with pytest.raises(NotImplementedError):
        remote_provider.materialize(remote_target)
