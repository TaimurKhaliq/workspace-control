from pathlib import Path

import pytest
from pydantic import ValidationError

from workspace_control.manifests import build_inventory, discover_manifest_paths, load_manifest


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_discover_manifest_paths_one_level_sorted(tmp_path: Path) -> None:
    _write(
        tmp_path / "repo-b" / "stackpilot.yml",
        """
type: service
language: python
domain: billing
""".strip(),
    )
    _write(
        tmp_path / "repo-a" / "stackpilot.yml",
        """
type: service
language: go
domain: auth
""".strip(),
    )
    _write(
        tmp_path / "repo-c" / "nested" / "stackpilot.yml",
        """
type: service
language: rust
domain: search
""".strip(),
    )

    paths = discover_manifest_paths(tmp_path)

    assert [path.parent.name for path in paths] == ["repo-a", "repo-b"]


def test_load_manifest_parses_required_fields_and_commands(tmp_path: Path) -> None:
    manifest_path = tmp_path / "repo-x" / "stackpilot.yml"
    _write(
        manifest_path,
        """
type: service
language: python
domain: platform
build_commands:
  - uv sync
  - uv build
test_commands:
  - pytest
owns_entities:
  - customer_profile
owns_fields:
  - phone_number
owns_tables:
  - customer_profiles
api_keywords:
  - customer profile
""".strip(),
    )

    manifest = load_manifest(manifest_path)

    assert manifest.type == "service"
    assert manifest.language == "python"
    assert manifest.domain == "platform"
    assert manifest.build_commands == ["uv sync", "uv build"]
    assert manifest.test_commands == ["pytest"]
    assert manifest.owns_entities == ["customer_profile"]
    assert manifest.owns_fields == ["phone_number"]
    assert manifest.owns_tables == ["customer_profiles"]
    assert manifest.api_keywords == ["customer profile"]


def test_load_manifest_raises_for_missing_required_fields(tmp_path: Path) -> None:
    manifest_path = tmp_path / "repo-y" / "stackpilot.yml"
    _write(
        manifest_path,
        """
language: python
domain: platform
""".strip(),
    )

    with pytest.raises(ValidationError):
        load_manifest(manifest_path)


def test_build_inventory_uses_repo_folder_name(tmp_path: Path) -> None:
    _write(
        tmp_path / "repo-z" / "stackpilot.yml",
        """
type: library
language: python
domain: tooling
build_commands:
  - python -m build
test_commands:
  - pytest -q
""".strip(),
    )

    rows = build_inventory(tmp_path)

    assert len(rows) == 1
    row = rows[0]
    assert row.repo_name == "repo-z"
    assert row.type == "library"
    assert row.language == "python"
    assert row.domain == "tooling"
    assert row.build_commands == ["python -m build"]
    assert row.test_commands == ["pytest -q"]
    assert row.owns_entities == []
    assert row.owns_fields == []
    assert row.owns_tables == []
    assert row.api_keywords == []
