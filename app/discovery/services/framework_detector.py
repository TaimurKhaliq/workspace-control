"""Detect framework descriptors from local project metadata and source patterns."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.models.discovery import MaterializedWorkspace
from app.models.framework_descriptor import FrameworkDescriptor

BUILD_FILES = ("pom.xml", "build.gradle", "build.gradle.kts")
FRONTEND_ROOTS = ("", "client", "frontend", "ui", "web")
OPENAPI_FILENAMES = {
    "openapi.yaml",
    "openapi.yml",
    "openapi.json",
    "swagger.yaml",
    "swagger.yml",
    "swagger.json",
}
IGNORED_DIRS = {".git", ".gradle", "build", "dist", "node_modules", "target"}


class FrameworkDetector:
    """Detect known frameworks using deterministic local metadata heuristics."""

    def detect(
        self,
        workspace: MaterializedWorkspace,
    ) -> dict[str, list[FrameworkDescriptor]]:
        """Return framework descriptors grouped by repository name."""

        detections: dict[str, list[FrameworkDescriptor]] = {}
        for repo_path in _repo_dirs(workspace.root_path):
            descriptors = self.detect_repo(repo_path)
            if descriptors:
                detections[repo_path.name] = descriptors
        return detections

    def detect_repo(self, repo_path: Path) -> list[FrameworkDescriptor]:
        """Return deterministic framework descriptors for one repository path."""

        descriptors = [
            *self._detect_spring_boot(repo_path),
            *self._detect_react(repo_path),
            *self._detect_openapi(repo_path),
        ]
        descriptors.sort(key=lambda item: (item.name, item.source))
        return descriptors

    def _detect_spring_boot(self, repo_path: Path) -> list[FrameworkDescriptor]:
        descriptors: list[FrameworkDescriptor] = []
        for build_file in BUILD_FILES:
            path = repo_path / build_file
            text = _read_text(path)
            if not text:
                continue
            lowered = text.lower()
            if "spring-boot" in lowered or "org.springframework.boot" in lowered:
                descriptors.append(
                    FrameworkDescriptor(
                        repo_name=repo_path.name,
                        name="spring_boot",
                        version=_spring_boot_version(build_file, text),
                        source=build_file,
                        confidence="high",
                    )
                )
                break

        if descriptors:
            return descriptors

        wrapper_source = next(
            (
                filename
                for filename in ("mvnw", "gradlew")
                if (repo_path / filename).is_file()
            ),
            None,
        )
        spring_application = _first_matching_file_text(
            repo_path / "src/main/java",
            ("*Application.java", "*.java"),
            ("SpringBootApplication", "SpringApplication.run"),
        )
        if wrapper_source and spring_application:
            return [
                FrameworkDescriptor(
                    repo_name=repo_path.name,
                    name="spring_boot",
                    version=None,
                    source=f"{wrapper_source} + {spring_application}",
                    confidence="medium",
                )
            ]

        return []

    def _detect_react(self, repo_path: Path) -> list[FrameworkDescriptor]:
        descriptors: list[FrameworkDescriptor] = []
        for root in FRONTEND_ROOTS:
            package_path = repo_path / root / "package.json"
            package = _read_json(package_path)
            if not isinstance(package, dict):
                continue
            version = _package_dependency_version(package, "react")
            if version is None:
                continue
            source = _relative_path(repo_path, package_path)
            descriptors.append(
                FrameworkDescriptor(
                    repo_name=repo_path.name,
                    name="react",
                    version=version,
                    source=source,
                    confidence="high",
                )
            )

        if descriptors:
            return descriptors

        for root in FRONTEND_ROOTS:
            src_path = repo_path / root / "src"
            if not src_path.is_dir():
                continue
            if _has_source_file(src_path, {".tsx", ".jsx"}):
                return [
                    FrameworkDescriptor(
                        repo_name=repo_path.name,
                        name="react",
                        version=None,
                        source=_relative_path(repo_path, src_path),
                        confidence="medium",
                    )
                ]

        return []

    def _detect_openapi(self, repo_path: Path) -> list[FrameworkDescriptor]:
        descriptors: list[FrameworkDescriptor] = []
        for path in _candidate_openapi_paths(repo_path):
            descriptors.append(
                FrameworkDescriptor(
                    repo_name=repo_path.name,
                    name="openapi",
                    version=_openapi_version(path),
                    source=_relative_path(repo_path, path),
                    confidence="high",
                )
            )
        return descriptors


def _repo_dirs(base_dir: Path) -> list[Path]:
    if not base_dir.exists():
        return []
    if _looks_like_repo_root(base_dir.resolve()):
        return [base_dir.resolve()]
    return sorted(
        [child for child in base_dir.resolve().iterdir() if child.is_dir()],
        key=lambda item: item.name,
    )


def _looks_like_repo_root(path: Path) -> bool:
    if not path.is_dir():
        return False
    if any((path / build_file).is_file() for build_file in BUILD_FILES):
        return True
    if (path / "package.json").is_file():
        return True
    if (path / "src/main/java").is_dir():
        return True
    if any((path / root / "package.json").is_file() for root in ("client", "frontend", "ui", "web")):
        return True
    return False


def _spring_boot_version(filename: str, text: str) -> str | None:
    if filename == "pom.xml":
        parent_match = re.search(
            r"<artifactId>spring-boot-starter-parent</artifactId>\s*<version>([^<]+)</version>",
            text,
            re.IGNORECASE,
        )
        if parent_match:
            return parent_match.group(1).strip()
    plugin_match = re.search(
        r"org\.springframework\.boot['\"]?\s+version\s+[\"']([^\"']+)[\"']",
        text,
        re.IGNORECASE,
    )
    if plugin_match:
        return plugin_match.group(1).strip()
    xml_plugin_match = re.search(
        r"<artifactId>spring-boot-maven-plugin</artifactId>\s*<version>([^<]+)</version>",
        text,
        re.IGNORECASE,
    )
    if xml_plugin_match:
        return xml_plugin_match.group(1).strip()
    return None


def _package_dependency_version(package: dict[object, object], name: str) -> str | None:
    for section in ("dependencies", "devDependencies", "peerDependencies"):
        dependencies = package.get(section)
        if isinstance(dependencies, dict):
            version = dependencies.get(name)
            if isinstance(version, str):
                return version
    return None


def _candidate_openapi_paths(repo_path: Path) -> list[Path]:
    candidates = [
        repo_path / filename
        for filename in sorted(OPENAPI_FILENAMES)
    ]
    candidates.extend(repo_path / "docs" / filename for filename in sorted(OPENAPI_FILENAMES))
    candidates.extend(
        repo_path / "src/main/resources" / filename
        for filename in sorted(OPENAPI_FILENAMES)
    )
    existing = [path for path in candidates if path.is_file()]
    seen = {path.resolve() for path in existing}

    for path in sorted(_safe_rglob(repo_path), key=lambda item: item.as_posix()):
        if path.name.lower() not in OPENAPI_FILENAMES:
            continue
        resolved = path.resolve()
        if resolved in seen:
            continue
        existing.append(path)
        seen.add(resolved)

    return existing


def _openapi_version(path: Path) -> str | None:
    text = _read_text(path)[:2000]
    match = re.search(r"^\s*openapi\s*:\s*['\"]?([^\s'\"]+)", text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    swagger_match = re.search(r"^\s*swagger\s*:\s*['\"]?([^\s'\"]+)", text, re.MULTILINE)
    if swagger_match:
        return swagger_match.group(1).strip()
    return None


def _first_matching_file_text(
    root: Path,
    patterns: tuple[str, ...],
    needles: tuple[str, ...],
) -> str | None:
    if not root.is_dir():
        return None
    for pattern in patterns:
        for path in sorted(root.rglob(pattern), key=lambda item: item.as_posix())[:200]:
            if _is_ignored(path):
                continue
            text = _read_text(path)
            if any(needle in text for needle in needles):
                return _relative_path(root.parent.parent.parent, path)
    return None


def _has_source_file(root: Path, suffixes: set[str]) -> bool:
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix())[:500]:
        if _is_ignored(path):
            continue
        if path.is_file() and path.suffix.lower() in suffixes:
            return True
    return False


def _safe_rglob(root: Path) -> list[Path]:
    paths: list[Path] = []
    for path in root.rglob("*"):
        if len(paths) >= 1000:
            break
        if _is_ignored(path):
            continue
        if path.is_file():
            paths.append(path)
    return paths


def _is_ignored(path: Path) -> bool:
    return bool(set(path.parts) & IGNORED_DIRS)


def _relative_path(repo_path: Path, path: Path) -> str:
    return path.relative_to(repo_path).as_posix()


def _read_text(path: Path) -> str:
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def _read_json(path: Path) -> object:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
