"""React component pattern pack for source graph node extraction."""

from __future__ import annotations

import re
from pathlib import Path

from app.graph.pattern_packs.base import (
    SourcePatternPack,
    make_node,
    repo_dirs,
    repo_frameworks,
)
from app.models.discovery import DiscoverySnapshot, MaterializedWorkspace
from app.models.source_graph import GraphNode

FRONTEND_ROOTS = ("client", "frontend", "web", "ui", "")
SOURCE_SUFFIXES = {".tsx", ".jsx", ".ts", ".js"}
LANDING_STEMS = {"welcome", "welcomepage", "home", "homepage", "landing", "landingpage"}
FORM_INPUT_RE = re.compile(
    r"(<form\b|<input\b|<select\b|<textarea\b|useform\b|formcontrol\b|textfield\b|"
    r"\binput\b|onchange\b|(?:^|[\s<])value\s*=|(?:^|[\s<])name\s*=)",
    re.IGNORECASE,
)
VALIDATION_RE = re.compile(
    r"\b(invalid|valid|validate|validation|required|constraint|minlength|maxlength|min|max|pattern)\b",
    re.IGNORECASE,
)
ERROR_FEEDBACK_RE = re.compile(
    r"\b(error|errors|feedback|touched|dirty|invalid|validationmessage)\b",
    re.IGNORECASE,
)
FIELD_RE = re.compile(r"\b(field|fields|input|inputs|label|labels|form|forms)\b", re.IGNORECASE)


class ReactComponentPack(SourcePatternPack):
    """Classify common React app shell, page, component, type, and static surfaces."""

    name = "react_components"
    supported_frameworks = ("react",)

    def extract_nodes(
        self,
        workspace: MaterializedWorkspace,
        discovery_snapshot: DiscoverySnapshot,
        framework_pack_context: dict[str, object] | None = None,
    ) -> list[GraphNode]:
        nodes: list[GraphNode] = []
        for repo_path in repo_dirs(workspace):
            frameworks = repo_frameworks(discovery_snapshot, repo_path.name)
            if "react" not in frameworks and not self._has_frontend_source(repo_path):
                continue

            for root in FRONTEND_ROOTS:
                base = repo_path / root if root else repo_path
                src = base / "src"
                if not src.is_dir():
                    continue
                for path in sorted(src.rglob("*"), key=lambda item: item.as_posix())[:1000]:
                    if not path.is_file() or path.suffix.lower() not in SOURCE_SUFFIXES:
                        continue
                    relative = path.relative_to(repo_path).as_posix()
                    node_type, reason = _classify_frontend_file(path, src)
                    node = make_node(
                        repo_name=repo_path.name,
                        repo_path=repo_path,
                        path=relative,
                        node_type=node_type,
                        framework="react",
                        language="typescript" if path.suffix.lower() in {".ts", ".tsx"} else "javascript",
                        confidence="high" if node_type != "shared_component" else "medium",
                        evidence_source=self.name,
                        reason=reason,
                    )
                    metadata = {**node.metadata, **_frontend_semantic_metadata(path, src)}
                    nodes.append(node.model_copy(update={"metadata": metadata}))

                public = base / "public"
                if public.is_dir():
                    index_html = public / "index.html"
                    if index_html.is_file():
                        relative = index_html.relative_to(repo_path).as_posix()
                        nodes.append(
                            make_node(
                                repo_name=repo_path.name,
                                repo_path=repo_path,
                                path=relative,
                                node_type="public_html",
                                framework="react",
                                language="html",
                                confidence="high",
                                evidence_source=self.name,
                                reason="public/index.html is the frontend public HTML entrypoint",
                            )
                        )
                    for asset_dir in sorted(public.iterdir(), key=lambda item: item.as_posix()):
                        if asset_dir.name.lower() not in {"assets", "images", "img", "static"}:
                            continue
                        if not asset_dir.is_dir():
                            continue
                        relative = asset_dir.relative_to(repo_path).as_posix()
                        nodes.append(
                            make_node(
                                repo_name=repo_path.name,
                                repo_path=repo_path,
                                path=relative,
                                node_type="static_asset",
                                framework="react",
                                language=None,
                                confidence="medium",
                                evidence_source=self.name,
                                reason="public asset folder may support frontend shell or page presentation",
                                extra_tokens=[asset_dir.name],
                            )
                        )
        return nodes

    def _has_frontend_source(self, repo_path: Path) -> bool:
        for root in FRONTEND_ROOTS:
            src = repo_path / root / "src" if root else repo_path / "src"
            if (src / "components").is_dir() or any(src.glob("*.tsx")):
                return True
        return False


def _classify_frontend_file(path: Path, src: Path) -> tuple[str, str]:
    name = path.name
    stem = path.stem
    lowered_stem = stem.lower()
    relative = path.relative_to(src).as_posix().lower()
    tokens = relative.replace("/", " ").replace("-", " ").replace("_", " ")

    if name in {"main.tsx", "main.jsx", "index.tsx", "index.jsx"} and path.parent == src:
        return "frontend_entrypoint", "root src entrypoint bootstraps the frontend app"
    if name in {"App.tsx", "App.jsx"}:
        return "app_shell", "App component is the likely React shell/composition root"
    if lowered_stem in LANDING_STEMS:
        return "landing_page", "landing or welcome page component detected by filename"
    if "types/" in relative or path.parent.name.lower() == "types":
        return "frontend_type", "frontend type file detected under a types path"
    if "form" in tokens or "editor" in tokens:
        return "form_component", "form/editor component detected from filename or path"
    if "edit" in tokens or lowered_stem.startswith("edit"):
        return "edit_surface", "edit surface detected from filename or path"
    if any(token in tokens for token in ("detail", "details", "information", "info")):
        return "detail_component", "detail/information component detected from filename or path"
    if any(token in tokens for token in ("list", "table")):
        return "list_component", "list/table component detected from filename or path"
    if lowered_stem.endswith("page"):
        if any(part in relative for part in ("pages/", "routes/", "views/")):
            return "route_page", "route/page component detected under a routing path"
        return "page_component", "page component detected by filename"
    return "shared_component", "shared frontend component or support source file"


def _frontend_semantic_metadata(path: Path, src: Path) -> dict[str, str]:
    """Extract compact frontend semantics for recipe ranking and debugging."""

    name = path.name
    stem = path.stem.lower()
    relative = path.relative_to(src).as_posix().lower()
    words = relative.replace("/", " ").replace("-", " ").replace("_", " ")
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")[:80000]
    except OSError:
        content = ""
    searchable = f"{words}\n{content}"
    metadata: dict[str, str] = {}

    if FORM_INPUT_RE.search(searchable) or any(term in stem for term in ("form", "editor")):
        metadata["has_form_inputs"] = "true"
    if VALIDATION_RE.search(searchable):
        metadata["has_validation_terms"] = "true"
    if ERROR_FEEDBACK_RE.search(searchable):
        metadata["has_error_feedback_terms"] = "true"
    if FIELD_RE.search(searchable):
        metadata["has_field_terms"] = "true"
    if name in {"ErrorPage.tsx", "ErrorPage.jsx"} or stem in {"errorpage", "error"}:
        metadata["is_error_route_page"] = "true"
    if stem in {"notfoundpage", "notfound", "notfound404"} or "404" in stem:
        metadata["is_not_found_page"] = "true"
    return metadata
