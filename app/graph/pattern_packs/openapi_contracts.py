"""OpenAPI contract pattern pack for source graph node extraction."""

from __future__ import annotations

from app.graph.pattern_packs.base import SourcePatternPack, make_node, repo_dirs, repo_frameworks
from app.models.discovery import DiscoverySnapshot, MaterializedWorkspace
from app.models.source_graph import GraphNode

CONTRACT_NAMES = {"openapi.yaml", "openapi.yml", "swagger.yaml", "swagger.yml", "openapi.json", "swagger.json"}


class OpenApiContractPack(SourcePatternPack):
    """Classify OpenAPI/Swagger files as API contract nodes."""

    name = "openapi_contracts"
    supported_frameworks = ("openapi",)

    def extract_nodes(
        self,
        workspace: MaterializedWorkspace,
        discovery_snapshot: DiscoverySnapshot,
        framework_pack_context: dict[str, object] | None = None,
    ) -> list[GraphNode]:
        nodes: list[GraphNode] = []
        for repo_path in repo_dirs(workspace):
            frameworks = repo_frameworks(discovery_snapshot, repo_path.name)
            if "openapi" not in frameworks and not any(repo_path.rglob("openapi.y*ml")):
                continue
            for path in sorted(repo_path.rglob("*"), key=lambda item: item.as_posix())[:1200]:
                if not path.is_file() or path.name.lower() not in CONTRACT_NAMES:
                    continue
                relative = path.relative_to(repo_path).as_posix()
                nodes.append(
                    make_node(
                        repo_name=repo_path.name,
                        repo_path=repo_path,
                        path=relative,
                        node_type="api_contract",
                        framework="openapi",
                        language="yaml" if path.suffix.lower() in {".yaml", ".yml"} else "json",
                        confidence="high",
                        evidence_source=self.name,
                        reason="OpenAPI/Swagger contract file detected by filename",
                        extra_tokens=_contract_tokens(path),
                    )
                )
        return nodes


def _contract_tokens(path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")[:50000]
    tokens: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith(("/", "operationId:", "title:", "tags:")):
            tokens.append(stripped)
    return tokens[:80]
