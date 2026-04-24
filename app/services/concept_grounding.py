"""Ground feature-request concepts against deterministic repo evidence."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from pathlib import Path

from app.models.discovery import DiscoverySnapshot, RepoDiscovery
from workspace_control.manifests import MANIFEST_FILENAME
from workspace_control.models import ConceptGrounding, InventoryRow

SOURCE_SUFFIXES = {".java", ".kt", ".ts", ".tsx", ".js", ".jsx", ".yaml", ".yml", ".json"}
KNOWN_CONCEPTS = (
    "phone number",
    "preferred language",
    "language preference",
    "marketing opt in",
    "marketing opt-in",
    "email address",
    "customer profile",
    "profile",
    "telephone",
    "customer",
    "owner",
    "owners",
    "email",
)
CONCEPT_ALIASES = {
    "phone number": ("telephone", "phone", "tel"),
    "telephone": ("phone number", "phone", "tel"),
    "preferred language": ("language preference", "locale", "language"),
    "language preference": ("preferred language", "locale", "language"),
    "customer": ("owner",),
    "owner": ("customer",),
    "owners": ("customer",),
    "email address": ("email",),
    "email": ("email address",),
    "marketing opt in": ("marketing opt-in", "marketing optin", "opt in"),
    "marketing opt-in": ("marketing opt in", "marketing optin", "opt in"),
}
GENERIC_CONCEPT_TOKENS = {
    "field",
    "form",
    "screen",
    "page",
    "button",
    "modal",
    "api",
    "endpoint",
    "request",
    "response",
    "validation",
    "database",
    "migration",
    "table",
    "column",
    "event",
    "downstream",
    "sync",
    "search",
    "label",
    "edit",
    "new",
    "add",
    "update",
    "rename",
    "persist",
    "store",
}


class ConceptGroundingService:
    """Deterministically ground request concepts against source and metadata."""

    def ground(
        self,
        feature_request: str,
        rows: Sequence[InventoryRow],
        *,
        scan_root: Path | None = None,
        discovery_snapshot: DiscoverySnapshot | None = None,
    ) -> list[ConceptGrounding]:
        """Return grounding records for key concepts in the feature request."""

        concepts = _extract_concepts(feature_request)
        if not concepts:
            return []

        terms_by_value = _collect_grounding_terms(
            rows,
            scan_root=scan_root,
            discovery_snapshot=discovery_snapshot,
        )
        return [_ground_concept(concept, terms_by_value) for concept in concepts]


def _extract_concepts(feature_request: str) -> list[str]:
    normalized = _normalize_text(feature_request)
    concepts: list[str] = []
    for concept in sorted(KNOWN_CONCEPTS, key=lambda item: (-len(item), item)):
        normalized_concept = _normalize_text(concept)
        if not normalized_concept:
            continue
        if f" {normalized_concept} " not in f" {normalized} ":
            continue
        canonical = _canonical_concept(normalized_concept)
        if _concept_is_subsumed(canonical, concepts):
            continue
        concepts = [current for current in concepts if not _concept_subsumes(current, canonical)]
        concepts.append(canonical)
    return concepts


def _canonical_concept(concept: str) -> str:
    if concept == "owners":
        return "owner"
    if concept == "marketing opt-in":
        return "marketing opt in"
    return concept


def _concept_is_subsumed(concept: str, concepts: Sequence[str]) -> bool:
    return any(_concept_subsumes(existing, concept) for existing in concepts)


def _concept_subsumes(existing: str, concept: str) -> bool:
    return existing == concept or f" {concept} " in f" {existing} "


def _collect_grounding_terms(
    rows: Sequence[InventoryRow],
    *,
    scan_root: Path | None,
    discovery_snapshot: DiscoverySnapshot | None,
) -> dict[str, set[str]]:
    terms: dict[str, set[str]] = {}
    for row in rows:
        _add_terms(
            terms,
            [
                row.repo_name,
                row.type,
                row.language,
                row.domain,
                *row.owns_entities,
                *row.owns_fields,
                *row.owns_tables,
                *row.api_keywords,
            ],
            f"{row.metadata_source}:{row.repo_name}",
        )

    if discovery_snapshot is None:
        return terms

    workspace_root = discovery_snapshot.workspace.root_path
    for repo in discovery_snapshot.report.repos:
        repo_path = workspace_root / repo.repo_name
        _add_discovery_terms(terms, repo, repo_path)
        _add_source_terms(terms, repo_path, repo.repo_name)

    return terms


def _add_discovery_terms(
    terms: dict[str, set[str]],
    repo: RepoDiscovery,
    repo_path: Path,
) -> None:
    _add_terms(
        terms,
        [
            repo.repo_name,
            repo.repo_type,
            repo.language,
            repo.domain,
            *repo.detected_frameworks,
            *repo.hinted_frameworks,
            *repo.likely_api_locations,
            *repo.likely_service_locations,
            *repo.likely_persistence_locations,
            *repo.likely_ui_locations,
            *repo.likely_event_locations,
            *repo.hinted_api_locations,
            *repo.hinted_service_locations,
            *repo.hinted_persistence_locations,
            *repo.hinted_ui_locations,
            *repo.hinted_event_locations,
        ],
        f"adapter_discovery:{repo.repo_name}",
    )

    manifest_path = repo_path / MANIFEST_FILENAME
    if manifest_path.is_file():
        _add_terms(
            terms,
            [manifest_path.read_text(encoding="utf-8", errors="ignore")],
            f"stackpilot.yml:{repo.repo_name}",
        )


def _add_source_terms(
    terms: dict[str, set[str]], repo_path: Path, repo_name: str) -> None:
    if not repo_path.is_dir():
        return

    for path in sorted(repo_path.rglob("*"), key=lambda item: item.as_posix())[:800]:
        if not path.is_file():
            continue
        relative = path.relative_to(repo_path).as_posix()
        source = f"source:{repo_name}:{relative}"
        _add_terms(terms, [relative, path.stem], source)
        if path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")[:100000]
        _add_terms(terms, _symbols_from_text(text), source)


def _symbols_from_text(text: str) -> list[str]:
    symbols: list[str] = []
    patterns = (
        r"\bexport\s+(?:default\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)",
        r"\bfunction\s+([A-Z][A-Za-z0-9_]*)",
        r"\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=",
        r"\b(?:const|let|var)\s+([a-z][A-Za-z0-9_]*)\b",
        r"\b(?:class|interface|record|enum)\s+([A-Z][A-Za-z0-9_]*)",
        r"\b(?:private|protected|public)\s+[A-Za-z0-9_<>,.?\s]+\s+([a-z][A-Za-z0-9_]*)\s*(?:[;=])",
        r"\b([A-Za-z][A-Za-z0-9_]*)\??\s*:",
        r"\b([A-Za-z][A-Za-z0-9_]*)\s*:",
    )
    for pattern in patterns:
        symbols.extend(match.group(1) for match in re.finditer(pattern, text))
    return symbols


def _add_terms(terms: dict[str, set[str]], values: Iterable[str], source: str) -> None:
    for value in values:
        for term in _candidate_terms(value):
            if not term:
                continue
            terms.setdefault(term, set()).add(source)


def _candidate_terms(value: str) -> list[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return []
    tokens = [token for token in normalized.split() if token not in GENERIC_CONCEPT_TOKENS]
    candidates = [normalized]
    if len(tokens) > 80:
        candidates.extend(tokens)
        return _dedupe(candidates)

    candidates.extend(tokens)
    for size in (2, 3):
        for idx in range(0, max(len(tokens) - size + 1, 0)):
            candidates.append(" ".join(tokens[idx : idx + size]))
    return _dedupe(candidates)


def _ground_concept(
    concept: str,
    terms_by_value: dict[str, set[str]],
) -> ConceptGrounding:
    direct = _matching_terms(concept, terms_by_value)
    if direct:
        return _record(concept, "direct_match", direct, terms_by_value)

    alias_matches: list[str] = []
    for alias in CONCEPT_ALIASES.get(concept, ()):
        alias_matches.extend(_matching_terms(alias, terms_by_value))
    alias_matches = _dedupe(alias_matches)
    if alias_matches:
        return _record(concept, "alias_match", alias_matches, terms_by_value)

    weak = _weak_matching_terms(concept, terms_by_value)
    if weak:
        return _record(concept, "weak_match", weak[:6], terms_by_value)

    return ConceptGrounding(concept=concept, status="ungrounded")


def _matching_terms(concept: str, terms_by_value: dict[str, set[str]]) -> list[str]:
    normalized = _normalize_text(concept)
    matches = [
        term
        for term in terms_by_value
        if term == normalized or f" {normalized} " in f" {term} "
    ]
    return sorted(matches, key=lambda item: (len(item), item))[:8]


def _weak_matching_terms(concept: str, terms_by_value: dict[str, set[str]]) -> list[str]:
    concept_tokens = set(_normalize_text(concept).split()) - GENERIC_CONCEPT_TOKENS
    if not concept_tokens:
        return []
    matches = [
        term
        for term in terms_by_value
        if concept_tokens & set(term.split())
    ]
    return sorted(matches, key=lambda item: (len(set(item.split()) & concept_tokens) * -1, len(item), item))


def _record(
    concept: str,
    status: str,
    matched_terms: Sequence[str],
    terms_by_value: dict[str, set[str]],
) -> ConceptGrounding:
    sources: list[str] = []
    for term in matched_terms:
        sources.extend(sorted(terms_by_value.get(term, set())))
    return ConceptGrounding(
        concept=concept,
        status=status,
        matched_terms=list(matched_terms),
        sources=_dedupe(sources)[:8],
    )


def _normalize_text(text: str) -> str:
    split_camel = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    split_initialism = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", split_camel)
    return " ".join(re.findall(r"[a-z0-9]+", split_initialism.lower()))


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
