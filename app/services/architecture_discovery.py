"""Service that materializes discovery targets and runs repository adapters."""

from collections.abc import Sequence
from pathlib import Path
import re

from app.adapters.base import RepoAdapter, merge_paths
from app.adapters.flyway import FlywayAdapter
from app.adapters.openapi import OpenAPIAdapter
from app.adapters.react import ReactAdapter
from app.adapters.spring_boot import SpringBootAdapter
from app.discovery.services.framework_detector import FrameworkDetector
from app.discovery.services.framework_pack_loader import FrameworkPackLoader
from app.graph.source_graph_builder import SourceGraphBuilder
from app.models.discovery import (
    AdapterDiscovery,
    ArchitectureDiscoveryReport,
    DiscoverySnapshot,
    DiscoveryTarget,
    MaterializedWorkspace,
    RepoDiscovery,
)
from app.models.evidence import Evidence
from app.models.framework_descriptor import FrameworkDescriptor
from app.models.framework_pack import FrameworkPack
from app.models.repo_manifest import RepoManifest
from app.providers import (
    DiscoveryProvider,
    GitUrlProvider,
    LocalPathProvider,
    RemoteAgentProvider,
)
from workspace_control.manifests import MANIFEST_FILENAME, load_manifest

BUILD_FILES = (
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "package.json",
    "pyproject.toml",
)
SOURCE_ROOTS = ("src", "app", "lib")
FRONTEND_ROOTS = ("", "client", "frontend", "web", "ui")
SOURCE_EXTENSIONS = (".java", ".kt", ".ts", ".tsx", ".js", ".jsx", ".py", ".sql")
EVENT_HINT_TOKENS = {
    "consumer",
    "downstream",
    "event",
    "events",
    "integration",
    "notify",
    "producer",
    "publisher",
    "subscriber",
    "sync",
}
FRAMEWORK_ALIASES = {
    "angular": "angular",
    "flyway": "flyway",
    "openapi": "openapi",
    "react": "react",
    "spring": "spring_boot",
    "springboot": "spring_boot",
    "swagger": "openapi",
}


class ArchitectureDiscoveryService:
    """Build deterministic architecture reports from source-agnostic targets."""

    def __init__(
        self,
        adapters: Sequence[RepoAdapter] | None = None,
        providers: Sequence[DiscoveryProvider] | None = None,
        framework_detector: FrameworkDetector | None = None,
        framework_pack_loader: FrameworkPackLoader | None = None,
        source_graph_builder: SourceGraphBuilder | None = None,
    ):
        self._adapters = tuple(
            adapters
            if adapters is not None
            else (
                SpringBootAdapter(),
                FlywayAdapter(),
                OpenAPIAdapter(),
                ReactAdapter(),
            )
        )
        self._providers = tuple(
            providers
            if providers is not None
            else (
                LocalPathProvider(),
                GitUrlProvider(),
                RemoteAgentProvider(),
            )
        )
        self._framework_detector = framework_detector or FrameworkDetector()
        self._framework_pack_loader = framework_pack_loader or FrameworkPackLoader()
        self._source_graph_builder = source_graph_builder or SourceGraphBuilder()

    def discover(self, target: DiscoveryTarget) -> DiscoverySnapshot:
        """Materialize a target and return its source-agnostic discovery snapshot."""

        workspace = self._provider_for(target).materialize(target)
        framework_detections = self._framework_detector.detect(workspace)
        report = self._scan_materialized_workspace(workspace, framework_detections)
        flat_detections = [
            descriptor
            for repo_name in sorted(framework_detections)
            for descriptor in framework_detections[repo_name]
        ]
        loaded_framework_packs = merge_paths(
            *(repo.loaded_framework_packs for repo in report.repos)
        )
        framework_hints = {
            repo.repo_name: repo.framework_hints
            for repo in report.repos
            if repo.framework_hints
        }
        snapshot = DiscoverySnapshot(
            target=target,
            workspace=workspace,
            report=report,
            detected_frameworks=flat_detections,
            loaded_framework_packs=loaded_framework_packs,
            framework_hints=framework_hints,
        )
        source_graph = self._source_graph_builder.build(snapshot)
        return snapshot.model_copy(update={"source_graph": source_graph})

    def snapshot(self, target: DiscoveryTarget) -> DiscoverySnapshot:
        """Compatibility alias for source-agnostic discovery snapshots."""

        return self.discover(target)

    def discover_local(self, base_dir: Path) -> ArchitectureDiscoveryReport:
        """Return the report for a local path target."""

        return self.discover(DiscoveryTarget.local_path(base_dir)).report

    def _provider_for(self, target: DiscoveryTarget) -> DiscoveryProvider:
        for provider in self._providers:
            if provider.supports(target):
                return provider
        raise ValueError(f"No discovery provider supports target source {target.source}")

    def _scan_materialized_workspace(
        self,
        workspace: MaterializedWorkspace,
        framework_detections: dict[str, list[FrameworkDescriptor]] | None = None,
    ) -> ArchitectureDiscoveryReport:
        """Discover adapter findings for a materialized local workspace path."""

        framework_detections = framework_detections or {}
        repos: list[RepoDiscovery] = []
        for repo_path in self._repo_dirs(workspace.root_path):
            manifest = self._load_manifest_hint(repo_path)
            agents_text = self._read_agents_hint(repo_path)
            discoveries = self._discover_repo(repo_path, manifest, agents_text)

            if not discoveries and not (repo_path / MANIFEST_FILENAME).is_file():
                continue

            repos.append(
                self._build_repo_discovery(
                    repo_path,
                    manifest,
                    discoveries,
                    framework_detections.get(repo_path.name, []),
                )
            )

        repos.sort(key=lambda item: item.repo_name)
        return ArchitectureDiscoveryReport(repos=repos)

    def _repo_dirs(self, base_dir: Path) -> list[Path]:
        base = base_dir.resolve()
        return sorted(
            [child for child in base.iterdir() if child.is_dir()],
            key=lambda item: item.name,
        )

    def _load_manifest_hint(self, repo_path: Path) -> RepoManifest:
        manifest_path = repo_path / MANIFEST_FILENAME
        if manifest_path.is_file():
            loaded = load_manifest(manifest_path)
            return RepoManifest.model_validate(loaded.model_dump(mode="python"))

        return RepoManifest(type="", language="", domain=repo_path.name)

    def _read_agents_hint(self, repo_path: Path) -> str:
        agents_path = repo_path / "AGENTS.md"
        if not agents_path.is_file():
            return ""
        return agents_path.read_text(encoding="utf-8", errors="ignore")

    def _discover_repo(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str
    ) -> list[AdapterDiscovery]:
        discoveries: list[AdapterDiscovery] = []
        for adapter in self._adapters:
            if adapter.detect(repo_path, manifest, agents_text):
                discoveries.append(adapter.discover(repo_path, manifest, agents_text))

        discoveries.sort(key=lambda item: item.adapter)
        return discoveries

    def _build_repo_discovery(
        self,
        repo_path: Path,
        manifest: RepoManifest,
        discoveries: Sequence[AdapterDiscovery],
        framework_descriptors: Sequence[FrameworkDescriptor] = (),
    ) -> RepoDiscovery:
        adapter_frameworks = merge_paths(*(item.frameworks for item in discoveries))
        hinted_frameworks = _hinted_frameworks(manifest, self._read_agents_hint(repo_path))
        packs_by_name = self._framework_pack_loader.load_for_descriptors(
            list(framework_descriptors),
            hinted_frameworks,
        )
        discovered_frameworks = [
            framework
            for framework in adapter_frameworks
            if _framework_is_discovered(repo_path, framework)
        ]
        detected_frameworks = merge_paths(
            discovered_frameworks,
            [descriptor.name for descriptor in framework_descriptors],
        )
        hinted_frameworks = merge_paths(
            hinted_frameworks,
            [
                framework
                for framework in adapter_frameworks
                if framework not in detected_frameworks
            ],
        )
        api_locations = merge_paths(
            *(item.api_locations for item in discoveries),
            _pack_locations(repo_path, packs_by_name.values(), "api"),
        )
        service_locations = merge_paths(*(item.service_locations for item in discoveries))
        service_locations = merge_paths(
            service_locations,
            _pack_locations(repo_path, packs_by_name.values(), "service"),
        )
        persistence_locations = merge_paths(
            *(item.persistence_locations for item in discoveries),
            _pack_locations(repo_path, packs_by_name.values(), "persistence"),
        )
        ui_locations = merge_paths(
            *(item.ui_locations for item in discoveries),
            _pack_locations(repo_path, packs_by_name.values(), "ui"),
        )
        event_locations = merge_paths(
            *(item.event_locations for item in discoveries),
            _pack_locations(repo_path, packs_by_name.values(), "event"),
        )
        hinted_locations = _hinted_locations(manifest, self._read_agents_hint(repo_path))
        missing_evidence = _missing_evidence(
            manifest,
            repo_path,
            api_locations,
            service_locations,
            persistence_locations,
            ui_locations,
            event_locations,
        )
        evidence_mode = _evidence_mode(
            repo_path,
            [
                *api_locations,
                *service_locations,
                *persistence_locations,
                *ui_locations,
                *event_locations,
            ],
            missing_evidence,
        )
        confidence = _confidence(evidence_mode, missing_evidence)
        evidence = [
            Evidence(
                repo_name=repo_path.name,
                source="adapter_discovery",
                category="framework",
                signal=framework,
                weight=1,
                details={"adapter": item.adapter},
            )
            for item in discoveries
            for framework in item.frameworks
        ]
        evidence.extend(
            Evidence(
                repo_name=repo_path.name,
                source="framework_detector",
                category="framework",
                signal=descriptor.name,
                weight=2 if descriptor.confidence == "high" else 1,
                details={
                    "source": descriptor.source,
                    "confidence": descriptor.confidence,
                    "version": descriptor.version or "",
                },
            )
            for descriptor in framework_descriptors
        )

        return RepoDiscovery(
            repo_name=repo_path.name,
            repo_type=manifest.type,
            language=manifest.language,
            domain=manifest.domain,
            evidence_mode=evidence_mode,
            confidence=confidence,
            missing_evidence=missing_evidence,
            detected_frameworks=detected_frameworks,
            hinted_frameworks=hinted_frameworks,
            framework_detections=list(framework_descriptors),
            loaded_framework_packs=merge_paths(list(packs_by_name)),
            framework_hints=_framework_hints_from_packs(packs_by_name.values()),
            likely_api_locations=api_locations,
            likely_service_locations=service_locations,
            likely_persistence_locations=persistence_locations,
            likely_ui_locations=ui_locations,
            likely_event_locations=event_locations,
            hinted_api_locations=hinted_locations["api"],
            hinted_service_locations=hinted_locations["service"],
            hinted_persistence_locations=hinted_locations["persistence"],
            hinted_ui_locations=hinted_locations["ui"],
            hinted_event_locations=hinted_locations["event"],
            evidence=evidence,
        )


def format_architecture_discovery(report: ArchitectureDiscoveryReport) -> str:
    """Render architecture discovery output as a deterministic human-readable report."""

    if not report.repos:
        return "No repository architecture detected."

    lines = ["Architecture Discovery"]
    for repo in report.repos:
        lines.append("")
        lines.append(f"repo: {repo.repo_name}")
        lines.append(f"  mode: {repo.evidence_mode}")
        lines.append(f"  confidence: {repo.confidence}")
        if repo.missing_evidence:
            lines.append(f"  missing_evidence: {_format_values(repo.missing_evidence)}")
        lines.append(f"  discovered frameworks: {_format_values(repo.detected_frameworks)}")
        lines.append(f"  hinted frameworks: {_format_values(repo.hinted_frameworks)}")
        if repo.framework_detections:
            lines.append(
                "  framework detections: "
                + _format_framework_descriptors(repo.framework_detections)
            )
        if repo.loaded_framework_packs:
            lines.append(
                "  framework packs loaded: "
                + _format_framework_pack_sources(repo)
            )
        if repo.framework_hints:
            lines.append(
                "  framework-derived hints: "
                + _format_values(repo.framework_hints)
            )
        lines.append(f"  discovered api: {_format_values(repo.likely_api_locations)}")
        lines.append(
            "  discovered service/business logic: "
            + _format_values(repo.likely_service_locations)
        )
        lines.append(
            "  discovered persistence/migration: "
            + _format_values(repo.likely_persistence_locations)
        )
        lines.append(f"  discovered ui/components: {_format_values(repo.likely_ui_locations)}")
        if repo.likely_event_locations or repo.hinted_event_locations:
            lines.append(
                "  discovered events/integrations: "
                + _format_values(repo.likely_event_locations)
            )
        if _has_hints(repo):
            lines.append("  hinted locations:")
            lines.append(f"    api: {_format_values(repo.hinted_api_locations)}")
            lines.append(
                "    service/business logic: "
                + _format_values(repo.hinted_service_locations)
            )
            lines.append(
                "    persistence/migration: "
                + _format_values(repo.hinted_persistence_locations)
            )
            lines.append(f"    ui/components: {_format_values(repo.hinted_ui_locations)}")
            if repo.hinted_event_locations:
                lines.append(
                    "    events/integrations: "
                    + _format_values(repo.hinted_event_locations)
                )

    return "\n".join(lines)


def format_discovery_snapshot(snapshot: DiscoverySnapshot) -> str:
    """Render a source-agnostic discovery snapshot for CLI output."""

    return format_architecture_discovery(snapshot.report)


def _format_values(values: Sequence[str]) -> str:
    if not values:
        return "-"
    return ", ".join(values)


def _format_framework_descriptors(values: Sequence[FrameworkDescriptor]) -> str:
    if not values:
        return "-"
    parts: list[str] = []
    for descriptor in values:
        version = f" {descriptor.version}" if descriptor.version else ""
        parts.append(
            f"{descriptor.name}{version} "
            f"({descriptor.origin}, {descriptor.confidence}, {descriptor.source})"
        )
    return ", ".join(parts)


def _format_framework_pack_sources(repo: RepoDiscovery) -> str:
    parts: list[str] = []
    detected = set(repo.detected_frameworks)
    for pack_name in repo.loaded_framework_packs:
        origin = "detected" if pack_name in detected else "inferred"
        parts.append(f"{pack_name} ({origin})")
    return ", ".join(parts) if parts else "-"


def _pack_locations(
    repo_path: Path,
    packs: Sequence[FrameworkPack],
    category: str,
) -> list[str]:
    locations: list[str] = []
    for pack in packs:
        for candidate in pack.common_path_roots.get(category, []):
            if (repo_path / candidate).exists():
                locations.append(candidate)
    return merge_paths(locations)


def _framework_hints_from_packs(packs: Sequence[FrameworkPack]) -> list[str]:
    hints: list[str] = []
    for pack in packs:
        node_kinds = merge_paths(pack.backend_node_kinds, pack.frontend_node_kinds)
        if node_kinds:
            hints.append(f"{pack.name} node kinds: {', '.join(node_kinds[:6])}")
        categories = sorted(pack.common_path_roots)
        if categories:
            hints.append(f"{pack.name} path categories: {', '.join(categories)}")
        if pack.validation_command_hints:
            hints.append(
                f"{pack.name} validation hints: "
                + ", ".join(pack.validation_command_hints[:3])
            )
    return merge_paths(hints)


def _hinted_locations(manifest: RepoManifest, agents_text: str) -> dict[str, list[str]]:
    hints = _hint_text(manifest, agents_text)
    repo_type_tokens = set(_tokens(manifest.type))
    hint_tokens = set(_tokens(hints))
    backend = bool(
        {"backend", "service", "api", "server"} & repo_type_tokens
        or {"backend", "service", "api", "server", "spring", "springboot"} & hint_tokens
    )
    frontend = bool(
        {"frontend", "web", "ui", "client"} & repo_type_tokens
        or {"angular", "frontend", "react", "ui", "web"} & hint_tokens
    )
    java = manifest.language.lower() == "java" or bool(
        {"java", "spring", "springboot"} & hint_tokens
    )

    locations: dict[str, list[str]] = {
        "api": [],
        "service": [],
        "persistence": [],
        "ui": [],
        "event": [],
    }

    if backend:
        if java:
            locations["api"].extend(
                ["src/main/java/**/controller", "src/main/java/**/dto"]
            )
            locations["service"].append("src/main/java/**/service")
        else:
            locations["api"].extend(["src/controllers", "src/dto"])
            locations["service"].append("src/services")

        if "openapi" in hints or "swagger" in hints or "endpoint" in hints:
            locations["api"].append("src/main/resources/openapi.yaml")

        if _has_persistence_hints(manifest, hints):
            if java:
                locations["persistence"].extend(
                    [
                        "src/main/java/**/entity",
                        "src/main/java/**/repository",
                        "src/main/resources/db/migration",
                    ]
                )
            else:
                locations["persistence"].extend(["src/models", "migrations"])

        if _has_event_hints(hints):
            if java:
                locations["event"].extend(
                    ["src/main/java/**/events", "src/main/java/**/integration"]
                )
            else:
                locations["event"].extend(["src/events", "src/integrations"])

    if frontend:
        locations["ui"].extend(["src/pages", "src/components", "src/forms"])
        locations["api"].extend(["src/api", "src/services"])
        locations["service"].append("src/services")

    return {key: merge_paths(value) for key, value in locations.items()}


def _hinted_frameworks(manifest: RepoManifest, agents_text: str) -> list[str]:
    frameworks: list[str] = []
    for value in _manifest_framework_values(manifest):
        normalized = _normalize_framework(value)
        if normalized:
            frameworks.append(normalized)

    hint_tokens = set(_tokens(agents_text))
    for token in sorted(hint_tokens):
        normalized = FRAMEWORK_ALIASES.get(token)
        if normalized:
            frameworks.append(normalized)

    return merge_paths(frameworks)


def _manifest_framework_values(manifest: RepoManifest) -> list[str]:
    values: list[str] = []
    if manifest.framework:
        values.append(manifest.framework)
    values.extend(manifest.frameworks)
    return values


def _normalize_framework(value: str) -> str | None:
    token = "_".join(_tokens(value))
    if not token:
        return None
    if token == "spring_boot":
        return "spring_boot"
    return FRAMEWORK_ALIASES.get(token, token)


def _framework_is_discovered(repo_path: Path, framework: str) -> bool:
    if framework == "react":
        package_text = " ".join(
            _read_text(repo_path / path / "package.json").lower()
            for path in _frontend_roots(repo_path)
        )
        return '"react"' in package_text or "'react'" in package_text
    if framework == "angular":
        package_text = " ".join(
            _read_text(repo_path / path / "package.json").lower()
            for path in _frontend_roots(repo_path)
        )
        return any(
            (repo_path / path / "angular.json").is_file()
            for path in _frontend_roots(repo_path)
        ) or "@angular/core" in package_text
    if framework == "spring_boot":
        build_text = _build_text(repo_path)
        return "spring-boot" in build_text or "org.springframework.boot" in build_text
    if framework == "flyway":
        build_text = _build_text(repo_path)
        return "flyway" in build_text or any(
            (repo_path / path).exists()
            for path in ("src/main/resources/db/migration", "db/migration", "migrations")
        )
    if framework == "openapi":
        return any(
            (repo_path / path).is_file()
            for path in (
                "openapi.yaml",
                "openapi.yml",
                "openapi.json",
                "swagger.yaml",
                "swagger.yml",
                "swagger.json",
                "docs/openapi.yaml",
                "docs/openapi.yml",
                "src/main/resources/openapi.yaml",
                "src/main/resources/openapi.yml",
            )
        )
    return False


def _frontend_roots(repo_path: Path) -> list[Path]:
    return [Path(root) for root in FRONTEND_ROOTS if root == "" or (repo_path / root).exists()]


def _build_text(repo_path: Path) -> str:
    return " ".join(_read_text(repo_path / filename) for filename in BUILD_FILES).lower()


def _read_text(path: Path) -> str:
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")


def _missing_evidence(
    manifest: RepoManifest,
    repo_path: Path,
    api_locations: Sequence[str],
    service_locations: Sequence[str],
    persistence_locations: Sequence[str],
    ui_locations: Sequence[str],
    event_locations: Sequence[str],
) -> list[str]:
    hints = _hint_text(manifest, _read_agents_text(repo_path))
    missing: list[str] = []
    has_build = _has_build_file(repo_path)
    has_source = _has_source_evidence(repo_path)
    repo_type_tokens = set(_tokens(manifest.type))
    hint_tokens = set(_tokens(hints))
    backend = bool(
        {"backend", "service", "api", "server"} & repo_type_tokens
        or {"backend", "service", "api", "server", "spring", "springboot"} & hint_tokens
    )
    frontend = bool(
        {"frontend", "web", "ui", "client"} & repo_type_tokens
        or {"angular", "frontend", "react", "ui", "web"} & hint_tokens
    )

    if not has_build and not has_source:
        missing.append("no source folders or build files found")
        return missing

    if not has_build:
        missing.append("no build file found")

    if backend:
        if not service_locations:
            missing.append("no service/business logic path found")
        if ("api" in repo_type_tokens or "endpoint" in hints or "openapi" in hints) and not api_locations:
            missing.append("no API/controller/OpenAPI path found")
        if _has_persistence_hints(manifest, hints) and not persistence_locations:
            missing.append("no persistence/migration path found")
        if _has_event_hints(hints) and not event_locations:
            missing.append("no event/integration path found")

    if frontend:
        if not ui_locations:
            missing.append("no UI/component path found")
        if ("api" in hints or "service" in hints) and not api_locations:
            missing.append("no client API/service path found")

    return merge_paths(missing)


def _evidence_mode(
    repo_path: Path,
    discovered_locations: Sequence[str],
    missing_evidence: Sequence[str],
) -> str:
    if not _has_build_file(repo_path) and not _has_source_evidence(repo_path):
        return "metadata-only"
    if discovered_locations and not missing_evidence:
        return "source-discovered"
    return "mixed"


def _confidence(evidence_mode: str, missing_evidence: Sequence[str]) -> str:
    if evidence_mode == "source-discovered" and not missing_evidence:
        return "high"
    if evidence_mode == "mixed":
        return "medium"
    return "low"


def _has_hints(repo: RepoDiscovery) -> bool:
    return any(
        [
            repo.hinted_api_locations,
            repo.hinted_service_locations,
            repo.hinted_persistence_locations,
            repo.hinted_ui_locations,
            repo.hinted_event_locations,
        ]
    )


def _has_build_file(repo_path: Path) -> bool:
    return any((repo_path / filename).is_file() for filename in BUILD_FILES)


def _has_source_evidence(repo_path: Path) -> bool:
    if any((repo_path / root).exists() for root in SOURCE_ROOTS):
        return True
    return any(
        path.is_file() and path.suffix.lower() in SOURCE_EXTENSIONS
        for path in repo_path.rglob("*")
        if path.name not in {MANIFEST_FILENAME, "AGENTS.md"}
    )


def _has_persistence_hints(manifest: RepoManifest, hints: str) -> bool:
    return bool(
        manifest.owns_entities
        or manifest.owns_fields
        or manifest.owns_tables
        or any(token in hints for token in ("database", "flyway", "migration", "persist"))
    )


def _has_event_hints(hints: str) -> bool:
    return bool(set(_tokens(hints)) & EVENT_HINT_TOKENS)


def _hint_text(manifest: RepoManifest, agents_text: str) -> str:
    values = [
        manifest.type,
        manifest.language,
        manifest.domain,
        *(value for value in [manifest.framework] if value),
        *manifest.frameworks,
        *manifest.build_commands,
        *manifest.test_commands,
        *manifest.owns_entities,
        *manifest.owns_fields,
        *manifest.owns_tables,
        *manifest.api_keywords,
        agents_text,
    ]
    return " ".join(_tokens(" ".join(values)))


def _read_agents_text(repo_path: Path) -> str:
    agents_path = repo_path / "AGENTS.md"
    if not agents_path.is_file():
        return ""
    return agents_path.read_text(encoding="utf-8", errors="ignore")


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())
