"""Spring MVC pattern pack for backend source graph node extraction."""

from __future__ import annotations

import re
from pathlib import Path

from app.graph.pattern_packs.base import SourcePatternPack, make_node, repo_dirs, repo_frameworks
from app.models.discovery import DiscoverySnapshot, MaterializedWorkspace
from app.models.source_graph import GraphNode

SEARCH_METHOD_WORDS = ("find", "search", "query", "lookup", "get", "by")
QUERY_INDICATOR_PATTERNS = {
    "@query": r"@Query\b",
    "like": r"\bLIKE\b|\blike\b",
    "lower": r"\blower\s*\(",
    "upper": r"\bupper\s*\(",
    "ignorecase": r"ignoreCase|IgnoreCase",
    "containing": r"Containing|containing",
    "findby": r"findBy[A-Z]",
    "orderby": r"OrderBy|orderBy",
    "where": r"\bWHERE\b|\bwhere\b",
    "select": r"\bSELECT\b|\bselect\b",
}
CASE_INSENSITIVE_PATTERNS = {
    "lower": r"\blower\s*\(",
    "upper": r"\bupper\s*\(",
    "ignorecase": r"ignoreCase|IgnoreCase|ignorecase",
    "case_insensitive": r"case[-\s]?insensitive",
    "varchar_ignorecase": r"VARCHAR_IGNORECASE|varchar_ignorecase",
}
DOMAIN_FIELD_TERMS = {
    "address",
    "city",
    "first",
    "firstname",
    "first_name",
    "last",
    "lastname",
    "last_name",
    "name",
    "owner",
    "owners",
    "pet",
    "pets",
    "specialty",
    "specialties",
    "telephone",
    "vet",
    "vets",
    "visit",
    "visits",
}


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

            if java_root.is_dir():
                for path in sorted(java_root.rglob("*.java"), key=lambda item: item.as_posix())[:1200]:
                    relative = path.relative_to(repo_path).as_posix()
                    node_type, reason = _classify_java_file(relative, path.stem)
                    if node_type == "unknown":
                        continue
                    metadata = (
                        _java_query_metadata(path)
                        if node_type in {"api_controller", "api_dto", "service_layer", "repository"}
                        else {}
                    )
                    nodes.append(
                        _with_metadata(
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
                                extra_tokens=_metadata_token_values(metadata),
                            ),
                            metadata,
                        )
                    )
            resources_root = repo_path / "src/main/resources"
            if resources_root.is_dir():
                for path in sorted(resources_root.rglob("*.sql"), key=lambda item: item.as_posix())[:400]:
                    relative = path.relative_to(repo_path).as_posix()
                    lowered = relative.lower()
                    if not any(marker in lowered for marker in ("/db/", "/migration/", "/migrations/", "/changelog/")):
                        continue
                    metadata = _sql_query_metadata(path)
                    nodes.append(
                        _with_metadata(
                            make_node(
                                repo_name=repo_path.name,
                                repo_path=repo_path,
                                path=relative,
                                node_type="migration",
                                framework="spring_boot",
                                language="sql",
                                confidence="medium",
                                evidence_source=self.name,
                                reason="SQL migration or DB initialization file detected under resources/db",
                                extra_tokens=_metadata_token_values(metadata),
                            ),
                            metadata,
                        )
                    )
        return nodes


def _classify_java_file(relative: str, stem: str) -> tuple[str, str]:
    lowered = relative.lower()
    lowered_stem = stem.lower()
    if lowered_stem.endswith("mapper") or "/mapper/" in lowered or "/mappers/" in lowered:
        return "mapper", "mapper file detected by name or mapper path"
    if lowered_stem.endswith(("request", "response", "dto")) or lowered_stem.endswith("resource") and "/web/api/" in lowered:
        return "api_dto", "API DTO/request/response file detected by name or API path"
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


def _java_query_metadata(path: Path) -> dict[str, str]:
    """Extract compact deterministic query/search evidence from a Java source file."""

    text = path.read_text(encoding="utf-8", errors="ignore")[:120000]
    method_names = _java_method_names(text)
    search_method_names = [
        name
        for name in method_names
        if any(word in name.lower() for word in SEARCH_METHOD_WORDS)
    ]
    query_indicators = _matching_indicators(text, QUERY_INDICATOR_PATTERNS)
    case_indicators = _matching_indicators(text, CASE_INSENSITIVE_PATTERNS)
    search_terms = _search_terms(text, search_method_names)
    metadata: dict[str, str] = {}
    if search_terms:
        metadata["search_terms"] = ",".join(search_terms)
    if search_method_names:
        metadata["method_names"] = ",".join(search_method_names[:12])
    if query_indicators:
        metadata["query_indicators"] = ",".join(query_indicators)
    if case_indicators:
        metadata["case_insensitive_indicators"] = ",".join(case_indicators)
    return metadata


def _sql_query_metadata(path: Path) -> dict[str, str]:
    """Extract compact deterministic table/field/query evidence from SQL files."""

    text = path.read_text(encoding="utf-8", errors="ignore")[:120000]
    lowered = text.lower()
    tables = sorted(set(re.findall(r"\bcreate\s+table\s+([a-zA-Z_][A-Za-z0-9_]*)", text, flags=re.IGNORECASE)))
    columns = sorted(
        set(
            match.group(1)
            for match in re.finditer(
                r"(?:^|[,(])\s*([a-zA-Z_][A-Za-z0-9_]*)\s+(?:varchar|integer|date|boolean|decimal|numeric|bigint|text|char)",
                text,
                flags=re.IGNORECASE | re.MULTILINE,
            )
        )
    )
    query_indicators = []
    if "create table" in lowered:
        query_indicators.append("create_table")
    if "create index" in lowered:
        query_indicators.append("create_index")
    if "varchar_ignorecase" in lowered:
        query_indicators.append("varchar_ignorecase")
    case_indicators = _matching_indicators(text, CASE_INSENSITIVE_PATTERNS)
    search_terms = _dedupe(
        [
            *_domain_terms_from_text(" ".join(tables)),
            *_domain_terms_from_text(" ".join(columns)),
        ]
    )
    metadata: dict[str, str] = {}
    if search_terms:
        metadata["search_terms"] = ",".join(search_terms)
    if tables:
        metadata["table_names"] = ",".join(tables[:12])
    if columns:
        metadata["column_names"] = ",".join(columns[:16])
    if query_indicators:
        metadata["query_indicators"] = ",".join(query_indicators)
    if case_indicators:
        metadata["case_insensitive_indicators"] = ",".join(case_indicators)
    return metadata


def _java_method_names(text: str) -> list[str]:
    patterns = (
        r"(?:^|[;{}\n])\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public|private|protected|static|final|abstract|default|synchronized|\s)*[\w<>\[\],.?]+\s+([a-z][A-Za-z0-9_]*)\s*\(",
        r"(?m)^\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public|private|protected|static|final|abstract|default|synchronized|\s)*[\w<>\[\],.?]+\s+([a-z][A-Za-z0-9_]*)\s*\(",
        r"(?m)^\s*(?:[\w<>\[\],.?]+\s+)+([a-z][A-Za-z0-9_]*)\s*\([^;{]*[;{]",
    )
    names: list[str] = []
    for pattern in patterns:
        names.extend(match.group(1) for match in re.finditer(pattern, text))
    blocked = {"if", "for", "while", "switch", "catch", "return", "new"}
    return _dedupe([name for name in names if name not in blocked])[:24]


def _matching_indicators(text: str, patterns: dict[str, str]) -> list[str]:
    return [name for name, pattern in patterns.items() if re.search(pattern, text)]


def _search_terms(text: str, method_names: list[str]) -> list[str]:
    values = [*method_names]
    for method_name in method_names[:12]:
        match = re.search(rf"\b{re.escape(method_name)}\b", text)
        if match:
            start = max(0, match.start() - 300)
            end = min(len(text), match.end() + 500)
            values.append(text[start:end])
    return _dedupe(_domain_terms_from_text(" ".join(values)))[:16]


def _domain_terms_from_text(text: str) -> list[str]:
    tokens: list[str] = []
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    for raw in re.findall(r"[a-zA-Z_][A-Za-z0-9_]*", spaced):
        lowered = raw.lower()
        if lowered in DOMAIN_FIELD_TERMS:
            tokens.append(lowered)
        if lowered.endswith("s") and lowered[:-1] in DOMAIN_FIELD_TERMS:
            tokens.append(lowered[:-1])
        if "_" in lowered:
            tokens.extend(part for part in lowered.split("_") if part in DOMAIN_FIELD_TERMS)
    return _dedupe(tokens)


def _metadata_token_values(metadata: dict[str, str]) -> list[str]:
    values: list[str] = []
    for key in ("search_terms", "method_names", "query_indicators", "case_insensitive_indicators", "table_names", "column_names"):
        values.extend(part for part in metadata.get(key, "").split(",") if part)
    return values


def _with_metadata(node: GraphNode, metadata: dict[str, str]) -> GraphNode:
    if not metadata:
        return node
    return node.model_copy(update={"metadata": {**node.metadata, **metadata}})


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
