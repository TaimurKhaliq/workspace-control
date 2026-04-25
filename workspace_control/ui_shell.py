"""Deterministic UI shell and landing-page source surface helpers."""

from __future__ import annotations

import re
from pathlib import Path

FRONTEND_ROOTS = ("", "client", "frontend", "web", "ui")
UI_SHELL_PHRASES = (
    "welcome page",
    "landing page",
    "home page",
    "app shell",
    "application shell",
    "entry point",
    "public assets",
    "static assets",
)
UI_SHELL_TOKENS = {"entrypoint", "home", "landing", "layout", "welcome"}
APP_SHELL_NAMES = {"app.jsx", "app.tsx"}
ENTRYPOINT_NAMES = {"index.jsx", "index.tsx", "main.jsx", "main.tsx"}
LANDING_PAGE_STEMS = {"home", "homepage", "landing", "landingpage", "welcome", "welcomepage"}
STATIC_ASSET_DIRS = {"assets", "images", "img", "static"}


def ui_shell_requested(feature_request: str) -> bool:
    """Return whether a request points at UI shell, landing, or public assets."""

    normalized = _normalize(feature_request)
    wrapped = f" {normalized} "
    if any(f" {phrase} " in wrapped for phrase in UI_SHELL_PHRASES):
        return True

    tokens = set(normalized.split())
    return bool(
        tokens & UI_SHELL_TOKENS
        or {"app", "shell"}.issubset(tokens)
        or ({"public", "asset"}.issubset(tokens) or {"public", "assets"}.issubset(tokens))
        or ({"static", "asset"}.issubset(tokens) or {"static", "assets"}.issubset(tokens))
    )


def ui_shell_paths(repo_dir: Path | None) -> list[str]:
    """Return existing shell/landing/entrypoint/static paths in priority order."""

    if repo_dir is None or not repo_dir.is_dir():
        return []

    groups: list[list[str]] = [[], [], [], [], []]
    for root in FRONTEND_ROOTS:
        base = repo_dir / root if root else repo_dir
        if not base.exists():
            continue

        groups[0].extend(_landing_page_files(repo_dir, base))
        groups[1].extend(_app_shell_files(repo_dir, base))
        groups[2].extend(_entrypoint_files(repo_dir, base))
        groups[3].extend(_public_entry_files(repo_dir, base))
        groups[4].extend(_static_asset_paths(repo_dir, base))

    return _dedupe(path for group in groups for path in group)


def ui_shell_path_kind(path: str) -> str | None:
    """Classify a path into a UI-shell source-surface kind if it matches."""

    lowered = path.lower()
    name = Path(path).name.lower()
    stem = Path(path).stem.lower()
    if name in APP_SHELL_NAMES:
        return "app_shell"
    if name in ENTRYPOINT_NAMES and "/src/" in f"/{lowered}":
        return "entrypoint"
    if stem in LANDING_PAGE_STEMS:
        return "landing_page"
    if lowered.endswith("/public/index.html") or lowered == "public/index.html":
        return "public_entry_html"
    if "/public/" in f"/{lowered}/" and any(
        f"/{dirname}" in f"/{lowered}" for dirname in STATIC_ASSET_DIRS
    ):
        return "static_assets"
    return None


def _landing_page_files(repo_dir: Path, base: Path) -> list[str]:
    src = base / "src"
    if not src.is_dir():
        return []
    matches: list[str] = []
    for path in sorted(src.rglob("*"), key=lambda item: item.as_posix())[:800]:
        if not path.is_file() or path.suffix.lower() not in {".tsx", ".jsx", ".ts", ".js"}:
            continue
        if path.stem.lower() not in LANDING_PAGE_STEMS:
            continue
        matches.append(path.relative_to(repo_dir).as_posix())
    return matches


def _app_shell_files(repo_dir: Path, base: Path) -> list[str]:
    candidates = [
        base / "src" / "App.tsx",
        base / "src" / "App.jsx",
        base / "src" / "components" / "App.tsx",
        base / "src" / "components" / "App.jsx",
    ]
    return [path.relative_to(repo_dir).as_posix() for path in candidates if path.is_file()]


def _entrypoint_files(repo_dir: Path, base: Path) -> list[str]:
    candidates = [
        base / "src" / "main.tsx",
        base / "src" / "main.jsx",
        base / "src" / "index.tsx",
        base / "src" / "index.jsx",
    ]
    return [path.relative_to(repo_dir).as_posix() for path in candidates if path.is_file()]


def _public_entry_files(repo_dir: Path, base: Path) -> list[str]:
    path = base / "public" / "index.html"
    if not path.is_file():
        return []
    return [path.relative_to(repo_dir).as_posix()]


def _static_asset_paths(repo_dir: Path, base: Path) -> list[str]:
    public = base / "public"
    if not public.is_dir():
        return []
    paths: list[str] = []
    for child in sorted(public.iterdir(), key=lambda item: item.as_posix()):
        if child.name.lower() not in STATIC_ASSET_DIRS:
            continue
        if child.exists():
            paths.append(child.relative_to(repo_dir).as_posix())
    return paths


def _normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _dedupe(values) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered
