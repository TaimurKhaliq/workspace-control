"""Base pattern-pack contract and small deterministic graph helpers."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from collections.abc import Sequence
from pathlib import Path

from app.models.discovery import DiscoverySnapshot, MaterializedWorkspace
from app.models.source_graph import GraphEdge, GraphNode, SourceGraph

TECHNICAL_TOKENS = {
    "api",
    "app",
    "application",
    "assets",
    "base",
    "client",
    "clinic",
    "clinics",
    "com",
    "component",
    "components",
    "controller",
    "data",
    "description",
    "descriptions",
    "dto",
    "edit",
    "editor",
    "entity",
    "error",
    "errors",
    "example",
    "examples",
    "event",
    "field",
    "fields",
    "form",
    "html",
    "http",
    "https",
    "id",
    "ids",
    "info",
    "infos",
    "index",
    "impl",
    "impls",
    "java",
    "jdbc",
    "jdbcs",
    "jpa",
    "jpas",
    "localhost",
    "main",
    "mapper",
    "mappers",
    "model",
    "message",
    "messages",
    "name",
    "named",
    "names",
    "object",
    "objects",
    "openapi",
    "org",
    "page",
    "path",
    "paths",
    "petclinic",
    "petclinics",
    "public",
    "repository",
    "request",
    "resources",
    "response",
    "rest",
    "root",
    "roots",
    "service",
    "springframework",
    "spring",
    "springdata",
    "springdatajpa",
    "sample",
    "samples",
    "src",
    "static",
    "swagger",
    "tsx",
    "type",
    "types",
    "ui",
    "url",
    "urls",
    "web",
    "yaml",
    "yml",
    "value",
    "values",
    "version",
    "versions",
    "date",
    "dates",
    "title",
    "titles",
}
SOURCE_SUFFIXES = {".java", ".kt", ".ts", ".tsx", ".js", ".jsx", ".yaml", ".yml", ".json"}


class SourcePatternPack(ABC):
    """Contract for deterministic source graph pattern packs."""

    name = "pattern_pack"
    supported_frameworks: tuple[str, ...] = ()

    @abstractmethod
    def extract_nodes(
        self,
        workspace: MaterializedWorkspace,
        discovery_snapshot: DiscoverySnapshot,
        framework_pack_context: dict[str, object] | None = None,
    ) -> list[GraphNode]:
        """Extract graph nodes from a materialized workspace."""

    def extract_edges(self, source_graph: SourceGraph) -> list[GraphEdge]:
        """Extract pack-specific edges after all nodes have been merged."""

        return []


def node_id(repo_name: str, path: str, node_type: str) -> str:
    """Build a stable graph node id."""

    return f"{repo_name}:{path}:{node_type}"


def repo_dirs(workspace: MaterializedWorkspace) -> list[Path]:
    """Return deterministic child repository directories from a workspace."""

    root = workspace.root_path
    if not root.is_dir():
        return []
    if looks_like_repo_root(root):
        return [root]
    return sorted([child for child in root.iterdir() if child.is_dir()], key=lambda item: item.name)


def looks_like_repo_root(path: Path) -> bool:
    """Return true when the path itself appears to be the project root."""

    if (path / "stackpilot.yml").is_file():
        return True
    if any((path / filename).is_file() for filename in ("pom.xml", "build.gradle", "build.gradle.kts", "package.json")):
        return True
    if (path / "src/main/java").is_dir():
        return True
    if any((path / root / "package.json").is_file() for root in ("client", "frontend", "web", "ui")):
        return True
    return False


def repo_frameworks(snapshot: DiscoverySnapshot, repo_name: str) -> set[str]:
    """Return detected, hinted, and pack-loaded frameworks for a repo."""

    for repo in snapshot.report.repos:
        if repo.repo_name == repo_name:
            return set(repo.detected_frameworks) | set(repo.hinted_frameworks) | set(repo.loaded_framework_packs)
    return set()


def make_node(
    *,
    repo_name: str,
    repo_path: Path,
    path: str,
    node_type: str,
    framework: str | None,
    language: str | None,
    confidence: str = "medium",
    evidence_source: str,
    reason: str,
    extra_tokens: Sequence[str] = (),
) -> GraphNode:
    """Create a graph node with compact deterministic tokens and symbols."""

    absolute = repo_path / path
    symbols = symbols_for_file(absolute)
    token_values = [path, Path(path).stem, *symbols, *extra_tokens]
    tokens = compact_tokens(token_values)
    return GraphNode(
        id=node_id(repo_name, path, node_type),
        repo_name=repo_name,
        path=path,
        node_type=node_type,
        framework=framework,
        language=language,
        domain_tokens=tokens,
        symbols=symbols[:12],
        confidence=confidence,
        evidence_sources=[evidence_source],
        metadata={"classification_reason": reason},
    )


def symbols_for_file(path: Path) -> list[str]:
    """Extract compact symbols from a source-ish file with deterministic regexes."""

    if not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")[:80000]
    patterns = (
        r"\bexport\s+(?:default\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)",
        r"\bfunction\s+([A-Z][A-Za-z0-9_]*)",
        r"\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=",
        r"\b(?:class|interface|record|enum)\s+([A-Z][A-Za-z0-9_]*)",
        r"\b(?:private|protected|public)\s+[A-Za-z0-9_<>,.?\s]+\s+([a-z][A-Za-z0-9_]*)\s*(?:[;=])",
        r"\b([A-Za-z][A-Za-z0-9_]*)\??\s*:",
    )
    symbols: list[str] = []
    for pattern in patterns:
        symbols.extend(match.group(1) for match in re.finditer(pattern, text))
    return dedupe(symbols)[:24]


def compact_tokens(values: Sequence[str]) -> list[str]:
    """Extract useful compact domain tokens from paths and symbols."""

    tokens: list[str] = []
    for value in values:
        for token in split_tokens(value):
            tokens.extend(normalize_token(token))
    return dedupe(tokens)[:24]


def split_tokens(value: str) -> list[str]:
    """Split text, paths, snake/kebab case, and CamelCase into lowercase tokens."""

    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    return re.findall(r"[a-z0-9]+", spaced.lower())


def useful_token(token: str) -> bool:
    """Return whether a token is useful for graph domain matching."""

    return len(token) > 2 and not token.isdigit() and token not in TECHNICAL_TOKENS


def normalize_token(token: str) -> list[str]:
    """Return safe deterministic normalized forms for one token."""

    if not useful_token(token):
        return []

    normalized = [token]
    singular = singularize_token(token)
    if singular != token and useful_token(singular):
        normalized.append(singular)
    return normalized


def singularize_token(token: str) -> str:
    """Conservatively singularize tokens that already look plural."""

    if token.endswith("ies") and len(token) > 4:
        return f"{token[:-3]}y"
    if token.endswith(("ches", "shes", "sses", "xes", "zes")) and len(token) > 5:
        return token[:-2]
    if token.endswith("s") and not token.endswith(("ss", "us", "is")) and len(token) > 4:
        return token[:-1]
    return token


def dedupe(values: Sequence[str]) -> list[str]:
    """Dedupe values while preserving order."""

    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered
