"""Spring MVC pattern pack for backend source graph node extraction."""

from __future__ import annotations

from app.graph.pattern_packs.base import SourcePatternPack, make_node, repo_dirs, repo_frameworks
from app.models.discovery import DiscoverySnapshot, MaterializedWorkspace
from app.models.source_graph import GraphNode


class SpringMvcPack(SourcePatternPack):
    """Classify common Spring MVC controller/service/model/repository surfaces."""

    name = "spring_mvc"
    supported_frameworks = ("spring_boot",)

    def extract_nodes(
        self,
        workspace: MaterializedWorkspace,
        discovery_snapshot: DiscoverySnapshot,
        framework_pack_context: dict[str, object] | None = None,
    ) -> list[GraphNode]:
        nodes: list[GraphNode] = []
        for repo_path in repo_dirs(workspace):
            frameworks = repo_frameworks(discovery_snapshot, repo_path.name)
            java_root = repo_path / "src/main/java"
            if "spring_boot" not in frameworks and not java_root.is_dir():
                continue
            if not java_root.is_dir():
                continue

            for path in sorted(java_root.rglob("*.java"), key=lambda item: item.as_posix())[:1200]:
                relative = path.relative_to(repo_path).as_posix()
                node_type, reason = _classify_java_file(relative, path.stem)
                if node_type == "unknown":
                    continue
                nodes.append(
                    make_node(
                        repo_name=repo_path.name,
                        repo_path=repo_path,
                        path=relative,
                        node_type=node_type,
                        framework="spring_boot",
                        language="java",
                        confidence="high" if node_type != "domain_model" else "medium",
                        evidence_source=self.name,
                        reason=reason,
                    )
                )
        return nodes


def _classify_java_file(relative: str, stem: str) -> tuple[str, str]:
    lowered = relative.lower()
    lowered_stem = stem.lower()
    if lowered_stem.endswith("controller") or lowered_stem.endswith("resource") or "/rest/controller/" in lowered or "/controller/" in lowered:
        return "api_controller", "Spring controller/resource file detected by name or controller path"
    if lowered_stem.endswith("service") or "/service/" in lowered or "/services/" in lowered:
        return "service_layer", "service-layer file detected by name or service path"
    if lowered_stem.endswith("repository") or "/repository/" in lowered or "/repositories/" in lowered:
        return "repository", "repository file detected by name or repository path"
    if any(lowered_stem.endswith(suffix) for suffix in ("publisher", "producer")):
        return "event_publisher", "event publisher/producer file detected by suffix"
    if any(lowered_stem.endswith(suffix) for suffix in ("consumer", "listener", "handler", "subscriber")):
        return "event_consumer", "event consumer/listener/handler file detected by suffix"
    if "/event/" in lowered or "/events/" in lowered or "/integration/" in lowered:
        return "event_publisher", "event/integration path detected"
    if any(marker in lowered for marker in ("/model/", "/models/", "/entity/", "/entities/", "/domain/")):
        return "domain_model", "domain model/entity file detected by path"
    if stem and stem[0].isupper() and not lowered_stem.endswith(("application", "configuration", "config")):
        return "domain_model", "Java domain-style class detected as a conservative model surface"
    return "unknown", "unclassified Java file"
