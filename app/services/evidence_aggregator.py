"""Aggregate deterministic evidence for feature analysis."""

from collections.abc import Iterable, Sequence
from pathlib import Path

from app.adapters.base import ArchitectureAdapter
from app.models.discovery import (
    ArchitectureDiscoveryReport,
    DiscoverySnapshot,
    RepoDiscovery,
)
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.text_normalization import normalize_text as normalize_request_text
from app.services.text_normalization import tokenize_text
from workspace_control.models import InventoryRow

STOPWORDS = {
    "a",
    "an",
    "and",
    "add",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "with",
}

CATEGORY_HINTS = {
    "frontend": {
        "keywords": {
            "screen",
            "page",
            "button",
            "form",
            "modal",
            "settings",
            "ui",
            "frontend",
        },
        "phrases": {"settings page", "settings screen", "modal form"},
        "repo_type_tokens": {"frontend", "web", "ui", "client"},
        "repo_tokens": {"frontend", "ui", "web", "client", "browser", "react", "vue"},
    },
    "backend": {
        "keywords": {
            "api",
            "endpoint",
            "controller",
            "service",
            "validation",
            "response",
            "request",
        },
        "phrases": {"api endpoint", "request validation", "response validation"},
        "repo_type_tokens": {"backend", "service", "api", "server"},
        "repo_tokens": {"backend", "service", "api", "endpoint", "request", "response"},
    },
    "data": {
        "keywords": {"database", "persist", "store", "table", "column", "migration"},
        "phrases": {"database migration", "table column", "persist data", "store data"},
        "repo_type_tokens": {"data", "db", "database", "storage", "repository"},
        "repo_tokens": {
            "data",
            "database",
            "db",
            "store",
            "persist",
            "table",
            "column",
            "migration",
            "sql",
            "schema",
        },
    },
}

KEYWORD_WEIGHT = 3
PHRASE_WEIGHT = 6
REPO_TYPE_WEIGHT = 5
REPO_TOKEN_WEIGHT = 2
DOMAIN_WEIGHT = 2
ADAPTER_SOURCE_WEIGHT = 7
ADAPTER_MIXED_WEIGHT = 4
ADAPTER_OWNERSHIP_WEIGHT = 12
OWNERSHIP_WEIGHTS = {
    "owns_entities": {"phrase": 11, "token": 5},
    "owns_fields": {"phrase": 13, "token": 6},
    "owns_tables": {"phrase": 10, "token": 4},
    "api_keywords": {"phrase": 9, "token": 4},
}
DOWNSTREAM_HINT_KEYWORDS = {
    "sync",
    "event",
    "events",
    "integration",
    "integrations",
    "downstream",
    "publish",
    "subscribe",
    "consumer",
    "producer",
    "replicate",
    "webhook",
    "queue",
    "stream",
    "notification",
}
DOWNSTREAM_HINT_PHRASES = {
    "cross service sync",
    "sync customer profile",
    "publish event",
    "consume event",
    "downstream integration",
}

ALL_HINT_KEYWORDS = {
    keyword
    for config in CATEGORY_HINTS.values()
    for keyword in config["keywords"]
} | DOWNSTREAM_HINT_KEYWORDS


def tokenize(text: str) -> set[str]:
    """Tokenize text with the same stopword rules used for feature matching."""

    return tokenize_text(text, stopwords=STOPWORDS)


def normalize_text(text: str) -> str:
    """Normalize text for deterministic phrase matching."""

    return normalize_request_text(text)


def phrase_matches(normalized_text: str, phrases: set[str]) -> list[str]:
    """Return matching phrases in stable order."""

    text = f" {normalized_text} "
    return sorted(phrase for phrase in phrases if f" {phrase} " in text)


class EvidenceAggregator:
    """Collects deterministic feature-analysis evidence from available sources."""

    def __init__(self, adapters: Sequence[ArchitectureAdapter] | None = None):
        self._adapters = tuple(adapters or ())

    def aggregate(
        self,
        feature_description: str,
        rows: Sequence[InventoryRow],
        *,
        scan_root: Path | None = None,
        architecture_report: ArchitectureDiscoveryReport | None = None,
        discovery_snapshot: DiscoverySnapshot | None = None,
    ) -> list[Evidence]:
        """Aggregate repo evidence for a feature request."""

        feature_tokens = tokenize(feature_description)
        if not feature_tokens:
            return []

        normalized_feature = normalize_text(feature_description)
        feature_signal_matches = _feature_signal_matches(
            normalized_feature, feature_tokens
        )
        feature_downstream_intent = _feature_downstream_intent(
            normalized_feature, feature_tokens
        )
        workspace_root = _workspace_root(scan_root, discovery_snapshot)
        architecture_by_repo = self._architecture_by_repo(
            scan_root,
            architecture_report,
            discovery_snapshot,
        )

        evidence: list[Evidence] = []
        for row in rows:
            evidence.extend(
                self._stackpilot_evidence(
                    row,
                    normalized_feature,
                    feature_tokens,
                    feature_signal_matches,
                    feature_downstream_intent,
                )
            )
            evidence.extend(self._agents_evidence(row, feature_tokens, workspace_root))
            discovery = architecture_by_repo.get(row.repo_name)
            if discovery is not None:
                evidence.extend(
                    self._adapter_discovery_evidence(
                        row,
                        discovery,
                        normalized_feature,
                        feature_tokens,
                        feature_signal_matches,
                        feature_downstream_intent,
                    )
                )

        return evidence

    def collect_for_manifest(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        """Collect adapter framework evidence for compatibility with older callers."""

        evidence: list[Evidence] = []
        for adapter in self._adapters:
            evidence.extend(adapter.collect(repo_name, manifest))

        evidence.sort(key=lambda item: (-item.weight, item.source, item.category, item.signal))
        return evidence

    def collect_for_row(self, row: InventoryRow) -> list[Evidence]:
        """Collect adapter framework evidence for an inventory row."""

        manifest = RepoManifest(
            type=row.type,
            language=row.language,
            domain=row.domain,
            build_commands=row.build_commands,
            test_commands=row.test_commands,
            owns_entities=row.owns_entities,
            owns_fields=row.owns_fields,
            owns_tables=row.owns_tables,
            api_keywords=row.api_keywords,
        )
        return self.collect_for_manifest(row.repo_name, manifest)

    def _stackpilot_evidence(
        self,
        row: InventoryRow,
        normalized_feature: str,
        feature_tokens: set[str],
        feature_signal_matches: dict[str, dict[str, list[str]]],
        feature_downstream_intent: bool,
    ) -> list[Evidence]:
        row_tokens = _manifest_tokens(row)
        row_text = _manifest_text(row)
        row_type_tokens = tokenize(row.type)
        domain_overlap = sorted(feature_tokens & tokenize(row.domain))
        backend_repo = bool(row_type_tokens & CATEGORY_HINTS["backend"]["repo_type_tokens"])
        metadata_source = getattr(row, "metadata_source", "stackpilot.yml")
        evidence: list[Evidence] = []

        if domain_overlap:
            evidence.append(
                Evidence(
                    repo_name=row.repo_name,
                    source=metadata_source,
                    category="domain",
                    signal="domain match",
                    weight=len(domain_overlap) * DOMAIN_WEIGHT,
                    details={
                        "matches": ", ".join(domain_overlap[:4]),
                        "reason": f"domain match ({', '.join(domain_overlap[:4])})",
                    },
                )
            )

        for category, config in CATEGORY_HINTS.items():
            feature_keyword_matches = feature_signal_matches[category]["keywords"]
            feature_phrase_matches = feature_signal_matches[category]["phrases"]
            if not feature_keyword_matches and not feature_phrase_matches:
                continue

            repo_type_match = bool(row_type_tokens & config["repo_type_tokens"])
            repo_token_overlap = sorted(row_tokens & config["repo_tokens"])
            if not repo_type_match and not repo_token_overlap:
                continue

            category_score = 0
            signal_parts: list[str] = []
            if feature_keyword_matches:
                category_score += len(feature_keyword_matches) * KEYWORD_WEIGHT
                signal_parts.append(f"keywords: {', '.join(feature_keyword_matches[:4])}")
            if feature_phrase_matches:
                category_score += len(feature_phrase_matches) * PHRASE_WEIGHT
                signal_parts.append(f"phrases: {', '.join(feature_phrase_matches[:3])}")
            if repo_type_match:
                category_score += REPO_TYPE_WEIGHT
                signal_parts.append("repo type")
            if repo_token_overlap:
                category_score += min(len(repo_token_overlap), 4) * REPO_TOKEN_WEIGHT
                signal_parts.append(f"manifest: {', '.join(repo_token_overlap[:4])}")

            evidence.append(
                Evidence(
                    repo_name=row.repo_name,
                    source="deterministic_intent",
                    category=category,
                    signal=f"{category} signals",
                    weight=category_score,
                    details={
                        "reason": f"{category} signals ({'; '.join(signal_parts)})",
                        "keywords": ", ".join(feature_keyword_matches),
                        "phrases": ", ".join(feature_phrase_matches),
                        "manifest_overlap": ", ".join(repo_token_overlap[:4]),
                    },
                )
            )

        if backend_repo:
            for field_name in ("owns_entities", "owns_fields", "owns_tables", "api_keywords"):
                values = getattr(row, field_name)
                phrase_match_values, token_matches = _ownership_matches(
                    normalized_feature, feature_tokens, values
                )
                if not phrase_match_values and not token_matches:
                    continue

                weights = OWNERSHIP_WEIGHTS[field_name]
                field_score = len(phrase_match_values) * weights["phrase"]
                field_score += len(token_matches) * weights["token"]
                reason_tokens: list[str] = []
                if phrase_match_values:
                    reason_tokens.append(", ".join(phrase_match_values[:3]))
                if token_matches:
                    reason_tokens.append(f"tokens: {', '.join(token_matches[:3])}")

                evidence.append(
                    Evidence(
                        repo_name=row.repo_name,
                        source=metadata_source,
                        category="ownership",
                        signal=field_name,
                        weight=field_score,
                        details={
                            "reason": f"{field_name}: {'; '.join(reason_tokens)}",
                            "primary_ownership": str(
                                field_name in {"owns_entities", "owns_fields", "owns_tables"}
                            ).lower(),
                        },
                    )
                )

        if feature_downstream_intent:
            downstream_overlap = sorted(row_tokens & DOWNSTREAM_HINT_KEYWORDS)
            downstream_phrase_matches = phrase_matches(row_text, DOWNSTREAM_HINT_PHRASES)
            downstream_score = len(downstream_overlap) * 2
            downstream_score += len(downstream_phrase_matches) * 4
            if (downstream_overlap or downstream_phrase_matches) and backend_repo:
                downstream_score += 2

            if downstream_score > 0:
                reason_tokens: list[str] = []
                if downstream_overlap:
                    reason_tokens.append(f"keywords: {', '.join(downstream_overlap[:4])}")
                if downstream_phrase_matches:
                    reason_tokens.append(
                        f"phrases: {', '.join(downstream_phrase_matches[:3])}"
                    )
                evidence.append(
                    Evidence(
                        repo_name=row.repo_name,
                        source="deterministic_intent",
                        category="downstream",
                        signal="downstream signals",
                        weight=downstream_score,
                        details={
                            "reason": f"downstream signals ({'; '.join(reason_tokens)})"
                        },
                    )
                )

        generic_feature_tokens = feature_tokens - ALL_HINT_KEYWORDS
        generic_overlap = sorted(
            token
            for token in (generic_feature_tokens & row_tokens)
            if token not in domain_overlap
        )
        if generic_overlap:
            evidence.append(
                Evidence(
                    repo_name=row.repo_name,
                    source=metadata_source,
                    category="keyword_overlap",
                    signal="manifest keyword overlap",
                    weight=len(generic_overlap),
                    details={
                        "matches": ", ".join(generic_overlap[:4]),
                        "reason": f"keyword overlap ({', '.join(generic_overlap[:4])})",
                    },
                )
            )

        return evidence

    def _agents_evidence(
        self,
        row: InventoryRow,
        feature_tokens: set[str],
        scan_root: Path | None,
    ) -> list[Evidence]:
        if scan_root is None:
            return []

        agents_path = scan_root / row.repo_name / "AGENTS.md"
        if not agents_path.is_file():
            return []

        agents_tokens = tokenize(agents_path.read_text(encoding="utf-8", errors="ignore"))
        generic_feature_tokens = feature_tokens - ALL_HINT_KEYWORDS
        overlap = sorted(generic_feature_tokens & agents_tokens)
        if not overlap:
            return []

        return [
            Evidence(
                repo_name=row.repo_name,
                source="AGENTS.md",
                category="keyword_overlap",
                signal="agents hints",
                weight=min(len(overlap), 3),
                details={
                    "matches": ", ".join(overlap[:4]),
                    "reason": f"AGENTS.md hints ({', '.join(overlap[:4])})",
                },
            )
        ]

    def _adapter_discovery_evidence(
        self,
        row: InventoryRow,
        discovery: RepoDiscovery,
        normalized_feature: str,
        feature_tokens: set[str],
        feature_signal_matches: dict[str, dict[str, list[str]]],
        feature_downstream_intent: bool,
    ) -> list[Evidence]:
        evidence: list[Evidence] = []
        frontend_intent = bool(
            feature_signal_matches["frontend"]["keywords"]
            or feature_signal_matches["frontend"]["phrases"]
        )
        backend_intent = bool(
            feature_signal_matches["backend"]["keywords"]
            or feature_signal_matches["backend"]["phrases"]
        )
        data_intent = bool(
            feature_signal_matches["data"]["keywords"]
            or feature_signal_matches["data"]["phrases"]
        )
        adapter_weight = _adapter_weight(discovery)

        if frontend_intent and (discovery.likely_ui_locations or "react" in discovery.detected_frameworks):
            evidence.append(
                _adapter_evidence(
                    row.repo_name,
                    "frontend",
                    "frontend adapter discovery",
                    adapter_weight,
                    discovery.detected_frameworks,
                    discovery.likely_ui_locations,
                )
            )

        if backend_intent and (
            "spring_boot" in discovery.detected_frameworks
            or "openapi" in discovery.detected_frameworks
            or discovery.likely_api_locations
            or discovery.likely_service_locations
        ):
            evidence.append(
                _adapter_evidence(
                    row.repo_name,
                    "backend",
                    "backend adapter discovery",
                    adapter_weight,
                    discovery.detected_frameworks,
                    discovery.likely_api_locations or discovery.likely_service_locations,
                )
            )

        if data_intent and (
            "flyway" in discovery.detected_frameworks
            or discovery.likely_persistence_locations
        ):
            evidence.append(
                _adapter_evidence(
                    row.repo_name,
                    "data",
                    "data adapter discovery",
                    adapter_weight,
                    discovery.detected_frameworks,
                    discovery.likely_persistence_locations,
                )
            )

        if feature_downstream_intent and discovery.likely_event_locations:
            evidence.append(
                _adapter_evidence(
                    row.repo_name,
                    "downstream",
                    "event adapter discovery",
                    adapter_weight,
                    discovery.detected_frameworks,
                    discovery.likely_event_locations,
                )
            )

        ownership_evidence = _source_ownership_evidence(
            row,
            discovery,
            normalized_feature,
            feature_tokens,
        )
        if ownership_evidence is not None:
            evidence.append(ownership_evidence)

        return evidence

    def _architecture_by_repo(
        self,
        scan_root: Path | None,
        architecture_report: ArchitectureDiscoveryReport | None,
        discovery_snapshot: DiscoverySnapshot | None,
    ) -> dict[str, RepoDiscovery]:
        if architecture_report is None and discovery_snapshot is not None:
            architecture_report = discovery_snapshot.report

        if architecture_report is None and scan_root is not None and scan_root.is_dir():
            architecture_report = ArchitectureDiscoveryService().discover_local(scan_root)

        if architecture_report is None:
            return {}

        return {repo.repo_name: repo for repo in architecture_report.repos}


def _workspace_root(
    scan_root: Path | None,
    discovery_snapshot: DiscoverySnapshot | None,
) -> Path | None:
    if discovery_snapshot is not None:
        return discovery_snapshot.workspace.root_path
    return scan_root


def _feature_signal_matches(
    normalized_feature: str, feature_tokens: set[str]
) -> dict[str, dict[str, list[str]]]:
    return {
        category: {
            "keywords": sorted(feature_tokens & config["keywords"]),
            "phrases": phrase_matches(normalized_feature, config["phrases"]),
        }
        for category, config in CATEGORY_HINTS.items()
    }


def _feature_downstream_intent(
    normalized_feature: str, feature_tokens: set[str]
) -> bool:
    feature_downstream_keywords = sorted(feature_tokens & DOWNSTREAM_HINT_KEYWORDS)
    feature_downstream_phrases = phrase_matches(
        normalized_feature, DOWNSTREAM_HINT_PHRASES
    )
    return bool(feature_downstream_keywords or feature_downstream_phrases)


def _adapter_evidence(
    repo_name: str,
    category: str,
    signal: str,
    weight: int,
    frameworks: Sequence[str],
    locations: Sequence[str],
) -> Evidence:
    reason_bits: list[str] = []
    if frameworks:
        reason_bits.append(", ".join(frameworks[:3]))
    if locations:
        reason_bits.append(f"paths: {', '.join(locations[:3])}")

    return Evidence(
        repo_name=repo_name,
        source="adapter_discovery",
        category=category,
        signal=signal,
        weight=weight,
        details={
            "frameworks": ", ".join(frameworks),
            "locations": ", ".join(locations[:5]),
            "reason": f"adapter discovery ({'; '.join(reason_bits)})",
        },
    )


def _adapter_weight(discovery: RepoDiscovery) -> int:
    if not _has_real_source_evidence(discovery):
        return 0
    if discovery.evidence_mode == "source-discovered":
        return ADAPTER_SOURCE_WEIGHT
    return ADAPTER_MIXED_WEIGHT


def _has_real_source_evidence(discovery: RepoDiscovery) -> bool:
    return bool(
        discovery.detected_frameworks
        or discovery.likely_api_locations
        or discovery.likely_service_locations
        or discovery.likely_persistence_locations
        or discovery.likely_ui_locations
        or discovery.likely_event_locations
    )


def _source_ownership_evidence(
    row: InventoryRow,
    discovery: RepoDiscovery,
    normalized_feature: str,
    feature_tokens: set[str],
) -> Evidence | None:
    if not _backend_source_structure_is_complete(discovery):
        return None

    matches: list[str] = []
    for field_name in ("owns_entities", "owns_fields", "owns_tables"):
        phrase_matches_for_field, token_matches = _ownership_matches(
            normalized_feature,
            feature_tokens,
            getattr(row, field_name),
        )
        if phrase_matches_for_field or token_matches:
            values = [*phrase_matches_for_field, *token_matches]
            matches.append(f"{field_name}: {', '.join(values[:3])}")

    if not matches:
        return None

    structure = _source_structure_summary(discovery)
    return Evidence(
        repo_name=row.repo_name,
        source="adapter_discovery",
        category="ownership",
        signal="source-backed ownership",
        weight=ADAPTER_OWNERSHIP_WEIGHT,
        details={
            "primary_ownership": "true",
            "reason": (
                "source-backed ownership "
                f"({'; '.join(matches[:3])}; discovered {structure})"
            ),
        },
    )


def _backend_source_structure_is_complete(discovery: RepoDiscovery) -> bool:
    return bool(
        discovery.likely_api_locations
        and discovery.likely_service_locations
        and _has_entity_or_repository(discovery.likely_persistence_locations)
    )


def _has_entity_or_repository(paths: Sequence[str]) -> bool:
    return any(
        any(marker in path.lower() for marker in ("entity", "repository"))
        for path in paths
    )


def _source_structure_summary(discovery: RepoDiscovery) -> str:
    parts: list[str] = []
    if discovery.likely_api_locations:
        parts.append("controller/dto")
    if discovery.likely_service_locations:
        parts.append("service")
    if _has_entity_or_repository(discovery.likely_persistence_locations):
        parts.append("entity/repository")
    if any("migration" in path.lower() for path in discovery.likely_persistence_locations):
        parts.append("migration")
    return ", ".join(parts)


def _ownership_matches(
    normalized_feature: str,
    feature_tokens: set[str],
    values: Sequence[str],
) -> tuple[list[str], list[str]]:
    text = f" {normalized_feature} "
    phrase_match_set: set[str] = set()
    token_match_set: set[str] = set()

    for value in values:
        normalized_value = normalize_text(value)
        if not normalized_value:
            continue

        if f" {normalized_value} " in text:
            phrase_match_set.add(normalized_value)
            continue

        value_tokens = set(normalized_value.split())
        if value_tokens and not feature_tokens.isdisjoint(value_tokens):
            token_match_set.add(normalized_value)

    token_only = token_match_set - phrase_match_set
    return sorted(phrase_match_set), sorted(token_only)


def _manifest_tokens(row: InventoryRow) -> set[str]:
    tokens: set[str] = set()
    fields: Iterable[str] = (
        row.type,
        row.language,
        row.domain,
        *row.build_commands,
        *row.test_commands,
        *row.owns_entities,
        *row.owns_fields,
        *row.owns_tables,
        *row.api_keywords,
    )

    for value in fields:
        tokens.update(tokenize(value))

    return tokens


def _manifest_text(row: InventoryRow) -> str:
    values = (
        row.type,
        row.language,
        row.domain,
        *row.build_commands,
        *row.test_commands,
        *row.owns_entities,
        *row.owns_fields,
        *row.owns_tables,
        *row.api_keywords,
    )
    return normalize_text(" ".join(values))
