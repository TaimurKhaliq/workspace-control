"""Load small local framework knowledge packs for discovery enrichment."""

from __future__ import annotations

import json
from pathlib import Path

from app.adapters.base import merge_paths
from app.models.framework_descriptor import FrameworkDescriptor
from app.models.framework_pack import FrameworkPack

PACK_DIR = Path(__file__).resolve().parents[2] / "framework_packs"


class FrameworkPackLoader:
    """Load hand-authored framework packs from local JSON storage."""

    def __init__(self, pack_dir: Path | None = None):
        self._pack_dir = pack_dir or PACK_DIR

    def load(self, name: str) -> FrameworkPack | None:
        """Load one framework pack by canonical framework name."""

        path = self._pack_dir / f"{name}.json"
        if not path.is_file():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return FrameworkPack.model_validate(data)

    def load_for_descriptors(
        self,
        descriptors: list[FrameworkDescriptor],
        hinted_frameworks: list[str] | None = None,
    ) -> dict[str, FrameworkPack]:
        """Load packs for detected descriptors and optional inferred framework hints."""

        names = merge_paths([descriptor.name for descriptor in descriptors], hinted_frameworks or [])
        packs: dict[str, FrameworkPack] = {}
        for name in names:
            pack = self.load(name)
            if pack is not None:
                packs[name] = pack
        return packs
