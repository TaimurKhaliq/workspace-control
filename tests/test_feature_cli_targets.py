import json
from pathlib import Path

import pytest

from app.models.discovery import DiscoveryTargetRecord
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.cli import run

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
FIXTURE_STACKS = ("metadata_only_stack", "mixed_source_stack")
FEATURE_REQUEST = "Allow users to update their phone number from the profile screen"


def _register_fixture_target(registry_path: Path, fixture_stack: str) -> str:
    target_id = f"fixture-{fixture_stack.replace('_', '-')}"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id=target_id,
            source_type="local_path",
            locator=str(FIXTURE_ROOT / fixture_stack),
        )
    )
    return target_id


def _run_command(args: list[str], capsys) -> str:
    exit_code = run(args)
    captured = capsys.readouterr()

    assert exit_code == 0
    assert captured.err == ""
    return captured.out


def _analysis_rows(output: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    assert lines[0].startswith("Feature:")
    headers = [value.strip() for value in lines[1].split("|")]
    rows: list[dict[str, str]] = []
    for line in lines[3:]:
        values = [value.strip() for value in line.split("|", maxsplit=len(headers) - 1)]
        rows.append(dict(zip(headers, values, strict=True)))
    return rows


@pytest.mark.parametrize("fixture_stack", FIXTURE_STACKS)
def test_analyze_feature_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
    fixture_stack: str,
) -> None:
    registry_path = tmp_path / "registry.json"
    target_id = _register_fixture_target(registry_path, fixture_stack)
    scan_root = FIXTURE_ROOT / fixture_stack

    scan_root_output = _run_command(
        [
            "analyze-feature",
            FEATURE_REQUEST,
            "--scan-root",
            str(scan_root),
        ],
        capsys,
    )
    target_output = _run_command(
        [
            "analyze-feature",
            FEATURE_REQUEST,
            "--target-id",
            target_id,
            "--registry-path",
            str(registry_path),
        ],
        capsys,
    )

    assert _analysis_rows(target_output) == _analysis_rows(scan_root_output)
    assert "service-a" in target_output
    assert "web-ui" in target_output


@pytest.mark.parametrize("fixture_stack", FIXTURE_STACKS)
def test_plan_feature_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
    fixture_stack: str,
) -> None:
    registry_path = tmp_path / "registry.json"
    target_id = _register_fixture_target(registry_path, fixture_stack)
    scan_root = FIXTURE_ROOT / fixture_stack

    scan_root_plan = json.loads(
        _run_command(
            [
                "plan-feature",
                FEATURE_REQUEST,
                "--scan-root",
                str(scan_root),
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
                target_id,
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )

    assert target_plan == scan_root_plan
    assert target_plan["implementation_owner"] == "web-ui"
    assert target_plan["domain_owner"] == "service-a"


@pytest.mark.parametrize("fixture_stack", FIXTURE_STACKS)
def test_propose_changes_supports_scan_root_and_target_id(
    tmp_path: Path,
    capsys,
    fixture_stack: str,
) -> None:
    registry_path = tmp_path / "registry.json"
    target_id = _register_fixture_target(registry_path, fixture_stack)
    scan_root = FIXTURE_ROOT / fixture_stack

    scan_root_proposal = json.loads(
        _run_command(
            [
                "propose-changes",
                FEATURE_REQUEST,
                "--scan-root",
                str(scan_root),
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
                target_id,
                "--registry-path",
                str(registry_path),
            ],
            capsys,
        )
    )

    assert target_proposal == scan_root_proposal
    assert target_proposal["implementation_owner"] == "web-ui"
    assert target_proposal["domain_owner"] == "service-a"
