import json
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.cli import run

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "metadata_only_stack"
FEATURE_REQUEST = "Allow users to update their phone number from the profile screen"


def _register_fixture_target(registry_path: Path) -> None:
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id="fixture-stack",
            source_type="local_path",
            locator=str(FIXTURE_ROOT),
        )
    )


def _run_command(args: list[str], capsys) -> str:
    exit_code = run(args)
    captured = capsys.readouterr()

    assert exit_code == 0
    assert captured.err == ""
    return captured.out


def test_analyze_feature_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
) -> None:
    registry_path = tmp_path / "registry.json"
    _register_fixture_target(registry_path)

    scan_root_output = _run_command(
        [
            "analyze-feature",
            FEATURE_REQUEST,
            "--scan-root",
            str(FIXTURE_ROOT),
        ],
        capsys,
    )
    target_output = _run_command(
        [
            "analyze-feature",
            FEATURE_REQUEST,
            "--target-id",
            "fixture-stack",
            "--registry-path",
            str(registry_path),
        ],
        capsys,
    )

    assert target_output == scan_root_output
    assert "service-a" in target_output
    assert "web-ui" in target_output


def test_plan_feature_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
) -> None:
    registry_path = tmp_path / "registry.json"
    _register_fixture_target(registry_path)

    scan_root_plan = json.loads(
        _run_command(
            [
                "plan-feature",
                FEATURE_REQUEST,
                "--scan-root",
                str(FIXTURE_ROOT),
            ],
            capsys,
        )
    )
    target_plan = json.loads(
        _run_command(
            [
                "plan-feature",
                FEATURE_REQUEST,
                "--target-id",
                "fixture-stack",
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )

    assert target_plan == scan_root_plan
    assert target_plan["implementation_owner"] == "web-ui"
    assert target_plan["domain_owner"] == "service-a"


def test_propose_changes_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
) -> None:
    registry_path = tmp_path / "registry.json"
    _register_fixture_target(registry_path)

    scan_root_proposal = json.loads(
        _run_command(
            [
                "propose-changes",
                FEATURE_REQUEST,
                "--scan-root",
                str(FIXTURE_ROOT),
            ],
            capsys,
        )
    )
    target_proposal = json.loads(
        _run_command(
            [
                "propose-changes",
                FEATURE_REQUEST,
                "--target-id",
                "fixture-stack",
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )

    assert target_proposal == scan_root_proposal
    assert target_proposal["implementation_owner"] == "web-ui"
    assert target_proposal["domain_owner"] == "service-a"
