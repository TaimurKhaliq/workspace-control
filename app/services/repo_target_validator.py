"""Validate user-selected local repo targets before registration."""

from __future__ import annotations

from pathlib import Path

from app.discovery.services.framework_detector import FrameworkDetector
from app.models.repo_target_validation import DetectedRepoType, RepoTargetValidation

FRONTEND_SUBFOLDER_NAMES = {"client", "frontend", "ui", "web"}
OPENAPI_FILENAMES = {
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
}


class RepoTargetValidator:
    """Detect likely target shape and warn about common selection mistakes."""

    def __init__(self, framework_detector: FrameworkDetector | None = None) -> None:
        self._framework_detector = framework_detector or FrameworkDetector()

    def validate_local_path(self, path: Path | str) -> RepoTargetValidation:
        """Return deterministic warnings and repo-type hints for a local path."""

        selected = Path(path).expanduser().resolve()
        frameworks = _framework_names(self._framework_detector.detect_repo(selected))
        repo_type = _detected_repo_type(selected, frameworks)
        warnings: list[str] = []
        suggested_root: Path | None = None

        if selected.name.lower() in FRONTEND_SUBFOLDER_NAMES:
            parent = selected.parent
            parent_frameworks = _framework_names(self._framework_detector.detect_repo(parent))
            parent_type = _detected_repo_type(parent, parent_frameworks)
            if parent_type in {"backend-only", "full-stack/monorepo"} or _has_backend_indicators(parent):
                suggested_root = parent
                warnings.append(
                    "Selected path appears to be a frontend subfolder; the parent looks backend/full-stack capable. "
                    "Register the parent monorepo root or backend repo for API/persistence planning."
                )

        if repo_type == "frontend-only":
            warnings.append(
                "Selected target appears frontend-only; backend/API/persistence prompts will require an additional backend-capable target."
            )

        return RepoTargetValidation(
            selected_path=str(selected),
            suggested_root_path=str(suggested_root) if suggested_root is not None else None,
            detected_frameworks=frameworks,
            detected_repo_type=repo_type,
            warnings=_dedupe(warnings),
        )


def _framework_names(descriptors) -> list[str]:
    return _dedupe([descriptor.name for descriptor in descriptors])


def _detected_repo_type(path: Path, frameworks: list[str]) -> DetectedRepoType:
    frontend = _has_frontend_indicators(path) or bool({"react", "angular"} & set(frameworks))
    backend = _has_backend_indicators(path) or bool({"spring_boot", "openapi"} & set(frameworks))
    if frontend and backend:
        return "full-stack/monorepo"
    if frontend:
        return "frontend-only"
    if backend:
        return "backend-only"
    return "unknown"


def _has_frontend_indicators(path: Path) -> bool:
    return bool(
        (path / "package.json").is_file()
        or any((path / root / "package.json").is_file() for root in FRONTEND_SUBFOLDER_NAMES)
        or any((path / root / "src").is_dir() for root in FRONTEND_SUBFOLDER_NAMES)
        or _has_source_suffix(path / "src", {".tsx", ".jsx"})
    )


def _has_backend_indicators(path: Path) -> bool:
    return bool(
        (path / "pom.xml").is_file()
        or (path / "build.gradle").is_file()
        or (path / "build.gradle.kts").is_file()
        or (path / "src/main/java").is_dir()
        or _has_openapi_file(path)
        or any((path / child).is_dir() and _has_backend_indicators(path / child) for child in ("api", "backend", "server", "service"))
    )


def _has_openapi_file(path: Path) -> bool:
    candidates = [
        *(path / filename for filename in OPENAPI_FILENAMES),
        *(path / "src/main/resources" / filename for filename in OPENAPI_FILENAMES),
        *(path / "docs" / filename for filename in OPENAPI_FILENAMES),
    ]
    return any(candidate.is_file() for candidate in candidates)


def _has_source_suffix(root: Path, suffixes: set[str]) -> bool:
    if not root.is_dir():
        return False
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix())[:400]:
        if path.is_file() and path.suffix.lower() in suffixes:
            return True
    return False


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered
