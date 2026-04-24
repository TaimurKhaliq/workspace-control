"""Infer conservative repository metadata from deterministic discovery results."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from pathlib import Path

from app.adapters.base import merge_paths
from app.models.discovery import DiscoverySnapshot, DiscoveryTarget, RepoDiscovery
from app.models.repo_profile import InferredRepoProfile, RepoProfileBootstrapReport
from app.services.architecture_discovery import ArchitectureDiscoveryService
from workspace_control.manifests import MANIFEST_FILENAME
from workspace_control.models import InventoryRow

TECHNICAL_TOKENS = {
    "api",
    "app",
    "application",
    "build",
    "changelog",
    "client",
    "com",
    "component",
    "components",
    "config",
    "controller",
    "controllers",
    "create",
    "db",
    "dto",
    "dtos",
    "entity",
    "entities",
    "event",
    "events",
    "example",
    "form",
    "forms",
    "handler",
    "java",
    "js",
    "jsx",
    "lib",
    "main",
    "migration",
    "migrations",
    "model",
    "models",
    "openapi",
    "org",
    "page",
    "pages",
    "repository",
    "repositories",
    "request",
    "resource",
    "resources",
    "response",
    "rest",
    "sample",
    "samples",
    "service",
    "services",
    "source",
    "spec",
    "spring",
    "springframework",
    "src",
    "swagger",
    "table",
    "test",
    "tests",
    "ts",
    "tsx",
    "ui",
    "update",
    "v1",
    "v2",
    "yaml",
    "yml",
}
SOURCE_SUFFIXES = {
    ".java",
    ".kt",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".sql",
    ".xml",
    ".yaml",
    ".yml",
    ".json",
}
ENTITY_MARKERS = {"entity", "entities", "model", "models", "repository", "repositories"}
FIELD_MARKERS = {"dto", "dtos", "request", "response", "form", "forms"}
TABLE_MARKERS = {"migration", "migrations", "changelog", "db"}
EVENT_ROLE_TOKENS = {
    "consumer",
    "handler",
    "integration",
    "listener",
    "producer",
    "publisher",
    "subscriber",
}
FRONTEND_PACKAGE_ROOTS = ("", "client", "frontend", "web", "ui")


class RepoProfileBootstrapService:
    """Build inferred repo profiles and effective inventory rows from discovery."""

    def bootstrap(self, snapshot: DiscoverySnapshot) -> RepoProfileBootstrapReport:
        """Infer conservative profiles for every discovered repository."""

        profiles = [self._profile_for_repo(snapshot, repo) for repo in snapshot.report.repos]
        profiles.sort(key=lambda profile: profile.repo_name)
        return RepoProfileBootstrapReport(profiles=profiles)

    def effective_inventory(
        self,
        explicit_rows: Sequence[InventoryRow],
        snapshot: DiscoverySnapshot | None,
    ) -> list[InventoryRow]:
        """Merge explicit stackpilot rows with inferred fallback metadata."""

        rows_by_name = {row.repo_name: row for row in explicit_rows}
        if snapshot is None:
            return sorted(rows_by_name.values(), key=lambda row: row.repo_name)

        profiles = self.bootstrap(snapshot).profiles
        for profile in profiles:
            explicit = rows_by_name.get(profile.repo_name)
            if explicit is None:
                rows_by_name[profile.repo_name] = self._row_from_profile(profile)
            elif profile.metadata_mode == "explicit-metadata":
                rows_by_name[profile.repo_name] = explicit
            else:
                rows_by_name[profile.repo_name] = self._merge_row_with_profile(
                    explicit,
                    profile,
                )

        return sorted(rows_by_name.values(), key=lambda row: row.repo_name)

    def effective_inventory_for_scan(
        self,
        explicit_rows: Sequence[InventoryRow],
        *,
        scan_root: Path | None = None,
        discovery_snapshot: DiscoverySnapshot | None = None,
    ) -> list[InventoryRow]:
        """Return explicit rows plus inferred profiles from a snapshot or scan root."""

        snapshot = discovery_snapshot
        if snapshot is None and scan_root is not None and scan_root.is_dir():
            snapshot = ArchitectureDiscoveryService().discover(
                DiscoveryTarget.local_path(scan_root)
            )
        return self.effective_inventory(explicit_rows, snapshot)

    def _profile_for_repo(
        self,
        snapshot: DiscoverySnapshot,
        discovery: RepoDiscovery,
    ) -> InferredRepoProfile:
        repo_path = snapshot.workspace.root_path / discovery.repo_name
        explicit_metadata = (repo_path / MANIFEST_FILENAME).is_file()
        profile_terms = self._collect_profile_terms(repo_path, discovery)
        repo_type = _repo_type(discovery, repo_path)
        role_hints = _role_hints(discovery, repo_type)
        language = _language(discovery, repo_path)
        frameworks = merge_paths(discovery.detected_frameworks, discovery.hinted_frameworks)
        validation_commands = _validation_commands(repo_path)
        if "backend-service" in repo_type:
            entities, fields, tables, api_keywords = _ownership_terms(
                repo_path,
                discovery,
                profile_terms,
                role_hints,
            )
        else:
            entities, fields, tables = [], [], []
            api_keywords = merge_paths(profile_terms[:8], role_hints)

        if explicit_metadata and _has_inferred_signal(discovery, profile_terms):
            metadata_mode = "explicit-plus-inferred"
        elif explicit_metadata:
            metadata_mode = "explicit-metadata"
        else:
            metadata_mode = "inferred-metadata"

        return InferredRepoProfile(
            repo_name=discovery.repo_name,
            metadata_mode=metadata_mode,
            explicit_metadata_present=explicit_metadata,
            inferred_repo_type=repo_type,
            inferred_language=language,
            inferred_frameworks=frameworks,
            inferred_domain_keywords=profile_terms,
            inferred_api_paths=list(discovery.likely_api_locations),
            inferred_ui_paths=list(discovery.likely_ui_locations),
            inferred_persistence_paths=list(discovery.likely_persistence_locations),
            inferred_event_paths=list(discovery.likely_event_locations),
            inferred_validation_commands=validation_commands,
            inferred_role_hints=role_hints,
            inferred_owns_entities=entities,
            inferred_owns_fields=fields,
            inferred_owns_tables=tables,
            inferred_api_keywords=api_keywords,
        )

    def _collect_profile_terms(
        self,
        repo_path: Path,
        discovery: RepoDiscovery,
    ) -> list[str]:
        paths = merge_paths(
            discovery.likely_api_locations,
            discovery.likely_service_locations,
            discovery.likely_persistence_locations,
            discovery.likely_ui_locations,
            discovery.likely_event_locations,
            discovery.hinted_api_locations,
            discovery.hinted_service_locations,
            discovery.hinted_persistence_locations,
            discovery.hinted_ui_locations,
            discovery.hinted_event_locations,
        )
        token_groups: list[list[str]] = []
        token_groups.append(_domain_tokens(repo_path.name))
        token_groups.extend(_package_name_tokens(repo_path))
        token_groups.extend(_tokens_from_paths_and_files(repo_path, paths))
        token_groups.extend(_openapi_tokens(repo_path, discovery.likely_api_locations))
        return _keywords_from_token_groups(token_groups)

    def _row_from_profile(self, profile: InferredRepoProfile) -> InventoryRow:
        return InventoryRow(
            repo_name=profile.repo_name,
            type=profile.inferred_repo_type or "repository",
            language=profile.inferred_language,
            domain=_domain_text(profile),
            build_commands=[],
            test_commands=profile.inferred_validation_commands,
            owns_entities=profile.inferred_owns_entities,
            owns_fields=profile.inferred_owns_fields,
            owns_tables=profile.inferred_owns_tables,
            api_keywords=_row_api_keywords_from_profile(profile),
            metadata_source="inferred_metadata",
        )

    def _merge_row_with_profile(
        self,
        row: InventoryRow,
        profile: InferredRepoProfile,
    ) -> InventoryRow:
        return row.model_copy(
            update={
                "build_commands": row.build_commands or [],
                "test_commands": row.test_commands
                or profile.inferred_validation_commands,
                "owns_entities": merge_paths(
                    row.owns_entities,
                    profile.inferred_owns_entities,
                ),
                "owns_fields": merge_paths(
                    row.owns_fields,
                    profile.inferred_owns_fields,
                ),
                "owns_tables": merge_paths(
                    row.owns_tables,
                    profile.inferred_owns_tables,
                ),
                "api_keywords": merge_paths(
                    row.api_keywords,
                    _row_api_keywords_from_profile(profile),
                ),
            }
        )


def format_repo_profile_bootstrap(report: RepoProfileBootstrapReport) -> str:
    """Render bootstrap profiles as deterministic JSON."""

    return json.dumps(report.model_dump(mode="python"), indent=2, sort_keys=False)


def _repo_type(discovery: RepoDiscovery, repo_path: Path) -> str:
    frontend = bool(
        discovery.likely_ui_locations
        or "react" in discovery.detected_frameworks
        or "angular" in discovery.detected_frameworks
    )
    source_backend = bool(
        "spring_boot" in discovery.detected_frameworks
        or "openapi" in discovery.detected_frameworks
        or discovery.likely_persistence_locations
        or (repo_path / "src/main/java").is_dir()
        or (repo_path / "pom.xml").is_file()
        or (repo_path / "build.gradle").is_file()
        or (repo_path / "build.gradle.kts").is_file()
    )
    backend = bool(
        source_backend
        or (
            not frontend
            and (discovery.likely_api_locations or discovery.likely_service_locations)
        )
    )
    event = bool(discovery.likely_event_locations)

    parts: list[str] = []
    if frontend:
        parts.append("frontend")
    if backend:
        parts.append("backend-service")
    if event:
        parts.append("integration")
    if not parts and (repo_path / "package.json").is_file():
        parts.append("frontend")
    if not parts:
        parts.append("repository")
    return " ".join(parts)


def _language(discovery: RepoDiscovery, repo_path: Path) -> str:
    languages: list[str] = []
    if (
        "spring_boot" in discovery.detected_frameworks
        or (repo_path / "pom.xml").is_file()
        or (repo_path / "build.gradle").is_file()
        or (repo_path / "build.gradle.kts").is_file()
        or (repo_path / "src/main/java").is_dir()
    ):
        languages.append("java")

    if (repo_path / "package.json").is_file() or discovery.likely_ui_locations:
        if _has_file_suffix(repo_path, {".ts", ".tsx"}) or "typescript" in _read_text(
            repo_path / "package.json"
        ).lower():
            languages.append("typescript")
        else:
            languages.append("javascript")

    return "/".join(merge_paths(languages))


def _role_hints(discovery: RepoDiscovery, repo_type: str) -> list[str]:
    hints: list[str] = []
    backend = "backend-service" in repo_type
    frontend = "frontend" in repo_type
    if discovery.likely_ui_locations:
        hints.append("ui entrypoint")
    if discovery.likely_api_locations and backend:
        hints.append("api owner candidate")
    elif discovery.likely_api_locations and frontend:
        hints.append("client api dependency")
    if discovery.likely_service_locations and backend:
        hints.append("domain service owner candidate")
    elif discovery.likely_service_locations and frontend:
        hints.append("client service dependency")
    if discovery.likely_persistence_locations:
        hints.append("persistence owner candidate")
    if discovery.likely_event_locations:
        hints.extend(["event integration candidate", "downstream integration"])
    return merge_paths(hints)


def _ownership_terms(
    repo_path: Path,
    discovery: RepoDiscovery,
    profile_terms: Sequence[str],
    role_hints: Sequence[str],
) -> tuple[list[str], list[str], list[str], list[str]]:
    path_terms = _terms_by_category(repo_path, discovery)
    entities = merge_paths(path_terms["entity"], profile_terms[:8])
    fields = merge_paths(path_terms["field"], path_terms["api"][:6])
    tables = merge_paths(path_terms["table"], path_terms["entity"][:4])
    api_keywords = merge_paths(path_terms["api"], profile_terms[:8], role_hints)
    return entities[:12], fields[:12], tables[:12], api_keywords[:16]


def _terms_by_category(repo_path: Path, discovery: RepoDiscovery) -> dict[str, list[str]]:
    categories = {
        "api": merge_paths(discovery.likely_api_locations, discovery.hinted_api_locations),
        "entity": merge_paths(
            discovery.likely_persistence_locations,
            discovery.likely_service_locations,
            discovery.hinted_persistence_locations,
        ),
        "field": merge_paths(discovery.likely_api_locations, discovery.likely_ui_locations),
        "table": merge_paths(discovery.likely_persistence_locations),
    }
    result: dict[str, list[str]] = {key: [] for key in categories}
    for category, paths in categories.items():
        token_groups = _tokens_from_paths_and_files(repo_path, paths)
        result[category] = _keywords_from_token_groups(token_groups)
    return result


def _validation_commands(repo_path: Path) -> list[str]:
    commands: list[str] = []
    if (repo_path / "gradlew").is_file():
        commands.append("./gradlew test")
    elif (repo_path / "build.gradle").is_file() or (repo_path / "build.gradle.kts").is_file():
        commands.append("gradle test")

    if (repo_path / "mvnw").is_file():
        commands.append("./mvnw test")
    elif (repo_path / "pom.xml").is_file():
        commands.append("mvn test")

    for package_path in _package_json_paths(repo_path):
        package = _read_json(package_path)
        scripts = package.get("scripts", {}) if isinstance(package, dict) else {}
        if isinstance(scripts, dict):
            prefix = _command_prefix_for_package(repo_path, package_path)
            if "test" in scripts:
                commands.append(f"{prefix}npm test")
            if "build" in scripts:
                commands.append(f"{prefix}npm run build")

    return merge_paths(commands)


def _package_json_paths(repo_path: Path) -> list[Path]:
    paths: list[Path] = []
    seen: set[Path] = set()
    for root in FRONTEND_PACKAGE_ROOTS:
        package_path = repo_path / root / "package.json"
        if not package_path.is_file() or package_path in seen:
            continue
        paths.append(package_path)
        seen.add(package_path)
    return paths


def _command_prefix_for_package(repo_path: Path, package_path: Path) -> str:
    package_dir = package_path.parent
    if package_dir == repo_path:
        return ""
    return f"cd {package_dir.relative_to(repo_path).as_posix()} && "


def _package_name_tokens(repo_path: Path) -> list[list[str]]:
    package = _read_json(repo_path / "package.json")
    if not isinstance(package, dict):
        return []
    name = package.get("name")
    if not isinstance(name, str):
        return []
    return [_domain_tokens(name)]


def _tokens_from_paths_and_files(repo_path: Path, paths: Sequence[str]) -> list[list[str]]:
    token_groups: list[list[str]] = []
    for relative_path in paths:
        path = repo_path / relative_path
        token_groups.append(_domain_tokens(relative_path))
        if path.is_file():
            token_groups.append(_domain_tokens(path.stem))
            continue
        if not path.is_dir():
            continue
        for child in sorted(path.rglob("*"), key=lambda item: item.as_posix())[:300]:
            if not child.is_file() or child.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            token_groups.append(_domain_tokens(child.stem))
    return token_groups


def _openapi_tokens(repo_path: Path, api_paths: Sequence[str]) -> list[list[str]]:
    token_groups: list[list[str]] = []
    for relative_path in api_paths:
        if not relative_path.lower().endswith((".yaml", ".yml", ".json")):
            continue
        text = _read_text(repo_path / relative_path)[:50000]
        if not text:
            continue
        token_groups.append(_domain_tokens(text))
    return token_groups


def _keywords_from_token_groups(token_groups: Iterable[Sequence[str]]) -> list[str]:
    keywords: list[str] = []
    for raw_tokens in token_groups:
        tokens = [token for token in raw_tokens if token and token not in TECHNICAL_TOKENS]
        if not tokens:
            continue
        if len(tokens) >= 2:
            keywords.append(" ".join(tokens[:3]))
        keywords.extend(tokens[:4])
    return merge_paths([keyword for keyword in keywords if len(keyword) > 1])[:24]


def _domain_tokens(text: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    tokens = re.findall(r"[a-z0-9]+", spaced.lower())
    return [token for token in tokens if not token.isdigit()]


def _domain_text(profile: InferredRepoProfile) -> str:
    if profile.inferred_domain_keywords:
        return " ".join(profile.inferred_domain_keywords[:8])
    return profile.repo_name.replace("-", " ").replace("_", " ")


def _row_api_keywords_from_profile(profile: InferredRepoProfile) -> list[str]:
    profile_keywords = [
        keyword
        for keyword in profile.inferred_api_keywords
        if not keyword.startswith("client ")
    ]
    role_hints = [
        hint for hint in profile.inferred_role_hints if not hint.startswith("client ")
    ]
    return merge_paths(
        profile_keywords,
        role_hints,
        profile.inferred_frameworks,
    )


def _has_inferred_signal(
    discovery: RepoDiscovery,
    profile_terms: Sequence[str],
) -> bool:
    return bool(
        discovery.likely_api_locations
        or discovery.likely_service_locations
        or discovery.likely_persistence_locations
        or discovery.likely_ui_locations
        or discovery.likely_event_locations
        or discovery.detected_frameworks
    )


def _has_file_suffix(repo_path: Path, suffixes: set[str]) -> bool:
    return any(
        path.is_file() and path.suffix.lower() in suffixes
        for path in repo_path.rglob("*")
    )


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
