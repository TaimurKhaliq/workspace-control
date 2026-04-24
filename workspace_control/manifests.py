from pathlib import Path

import yaml

from .models import InventoryRow, StackpilotManifest

MANIFEST_FILENAME = "stackpilot.yml"


def discover_manifest_paths(base_dir: Path) -> list[Path]:
    """Discover stackpilot manifests one directory below base_dir."""

    base = base_dir.resolve()
    manifests: list[Path] = []

    for child in sorted(base.iterdir(), key=lambda path: path.name):
        if not child.is_dir():
            continue

        candidate = child / MANIFEST_FILENAME
        if candidate.is_file():
            manifests.append(candidate)

    return manifests


def load_manifest(path: Path) -> StackpilotManifest:
    """Load and validate one stackpilot.yml manifest."""

    with path.open("r", encoding="utf-8") as file:
        raw_data = yaml.safe_load(file) or {}

    if not isinstance(raw_data, dict):
        raise ValueError(f"Manifest root must be a mapping: {path}")

    return StackpilotManifest.model_validate(raw_data)


def build_inventory(base_dir: Path) -> list[InventoryRow]:
    """Build normalized inventory rows from manifests under base_dir."""

    rows: list[InventoryRow] = []

    for manifest_path in discover_manifest_paths(base_dir):
        manifest = load_manifest(manifest_path)
        rows.append(
            InventoryRow(
                repo_name=manifest_path.parent.name,
                type=manifest.type,
                language=manifest.language,
                domain=manifest.domain,
                build_commands=manifest.build_commands,
                test_commands=manifest.test_commands,
                owns_entities=manifest.owns_entities,
                owns_fields=manifest.owns_fields,
                owns_tables=manifest.owns_tables,
                api_keywords=manifest.api_keywords,
            )
        )

    return rows
