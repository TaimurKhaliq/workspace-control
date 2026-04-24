"""JSON-backed registry for source-agnostic discovery targets."""

import json
import re
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord, DiscoveryTargetRegistryState

DEFAULT_REGISTRY_PATH = Path.cwd() / ".workspace-control" / "discovery_targets.json"
TARGET_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


class DiscoveryTargetRegistry:
    """Read and write deterministic discovery target records."""

    def __init__(self, path: Path | None = None):
        self.path = path or DEFAULT_REGISTRY_PATH

    def list_targets(self) -> list[DiscoveryTargetRecord]:
        """Return registered targets sorted by id."""

        state = self._load()
        return sorted(state.targets, key=lambda target: target.id)

    def get(self, target_id: str) -> DiscoveryTargetRecord:
        """Return one registered target by id."""

        for target in self.list_targets():
            if target.id == target_id:
                return target
        raise ValueError(f"Discovery target not found: {target_id}")

    def register(self, target: DiscoveryTargetRecord) -> DiscoveryTargetRecord:
        """Add or replace a registered discovery target."""

        _validate_target_id(target.id)
        state = self._load()
        targets = [current for current in state.targets if current.id != target.id]
        targets.append(target)
        targets.sort(key=lambda current: current.id)
        self._save(DiscoveryTargetRegistryState(targets=targets))
        return target

    def _load(self) -> DiscoveryTargetRegistryState:
        if not self.path.is_file():
            return DiscoveryTargetRegistryState()

        data = json.loads(self.path.read_text(encoding="utf-8"))
        return DiscoveryTargetRegistryState.model_validate(data)

    def _save(self, state: DiscoveryTargetRegistryState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = state.model_dump(mode="python")
        self.path.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )


def parse_hints(values: list[str] | None) -> dict[str, str]:
    """Parse repeated key=value CLI hints deterministically."""

    hints: dict[str, str] = {}
    for value in values or []:
        if "=" not in value:
            raise ValueError(f"Invalid hint {value!r}; expected key=value")
        key, hint_value = value.split("=", 1)
        key = key.strip()
        hint_value = hint_value.strip()
        if not key:
            raise ValueError(f"Invalid hint {value!r}; key cannot be empty")
        hints[key] = hint_value
    return dict(sorted(hints.items()))


def format_target_list(targets: list[DiscoveryTargetRecord]) -> str:
    """Render registered discovery targets as a deterministic table."""

    if not targets:
        return "No discovery targets registered."

    headers = ["id", "source_type", "locator", "ref", "hints"]
    rows = [
        [
            target.id,
            target.source_type,
            target.locator,
            target.ref or "-",
            _format_hints(target.hints),
        ]
        for target in targets
    ]
    widths = [len(header) for header in headers]
    for row in rows:
        for idx, value in enumerate(row):
            widths[idx] = max(widths[idx], len(value))

    header_line = " | ".join(
        header.ljust(widths[idx]) for idx, header in enumerate(headers)
    )
    separator_line = "-+-".join("-" * width for width in widths)
    data_lines = [
        " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(row))
        for row in rows
    ]
    return "\n".join([header_line, separator_line, *data_lines])


def _format_hints(hints: dict[str, str]) -> str:
    if not hints:
        return "-"
    return ", ".join(f"{key}={value}" for key, value in sorted(hints.items()))


def _validate_target_id(target_id: str) -> None:
    if not TARGET_ID_PATTERN.fullmatch(target_id):
        raise ValueError(
            "Discovery target id may contain only letters, numbers, '_', '-', and '.'"
        )
