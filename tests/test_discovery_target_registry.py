from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.services.discovery_target_registry import DiscoveryTargetRegistry, parse_hints
from workspace_control.cli import run


def _write_manifest(repo_path: Path) -> None:
    repo_path.mkdir(parents=True, exist_ok=True)
    (repo_path / "stackpilot.yml").write_text(
        "\n".join(
            [
                "type: backend-service",
                "language: java",
                "domain: customer-profile",
                "build_commands:",
                "  - ./gradlew build",
                "test_commands:",
                "  - ./gradlew test",
            ]
        ),
        encoding="utf-8",
    )


def test_discovery_target_registry_registers_and_lists_targets(
    tmp_path: Path,
) -> None:
    registry_path = tmp_path / "registry.json"
    registry = DiscoveryTargetRegistry(registry_path)
    registry.register(
        DiscoveryTargetRecord(
            id="local-dev",
            source_type="local_path",
            locator=str(tmp_path),
            ref=None,
            hints={"team": "platform"},
        )
    )

    targets = registry.list_targets()

    assert [target.id for target in targets] == ["local-dev"]
    assert targets[0].to_target().source == "local_path"
    assert targets[0].to_target().location == str(tmp_path)
    assert targets[0].to_target().metadata == {"team": "platform"}


def test_parse_hints_sorts_key_value_pairs() -> None:
    assert parse_hints(["team=platform", "env=dev"]) == {
        "env": "dev",
        "team": "platform",
    }


def test_cli_registers_lists_and_discovers_registered_local_path_target(
    tmp_path: Path,
    capsys,
) -> None:
    workspace_root = tmp_path / "workspace"
    _write_manifest(workspace_root / "profile-api")
    registry_path = tmp_path / "registry.json"

    register_exit = run(
        [
            "register-discovery-target",
            "local-dev",
            "--source-type",
            "local_path",
            "--locator",
            str(workspace_root),
            "--hint",
            "team=platform",
            "--registry-path",
            str(registry_path),
        ]
    )
    register_output = capsys.readouterr()

    list_exit = run(["list-discovery-targets", "--registry-path", str(registry_path)])
    list_output = capsys.readouterr()

    discover_exit = run(
        [
            "discover-architecture",
            "--target-id",
            "local-dev",
            "--registry-path",
            str(registry_path),
        ]
    )
    discover_output = capsys.readouterr()

    assert register_exit == 0
    assert "Registered discovery target: local-dev" in register_output.out
    assert list_exit == 0
    assert "local-dev" in list_output.out
    assert "local_path" in list_output.out
    assert str(workspace_root) in list_output.out
    assert "team=platform" in list_output.out
    assert discover_exit == 0
    assert "repo: profile-api" in discover_output.out
    assert "mode: metadata-only" in discover_output.out
