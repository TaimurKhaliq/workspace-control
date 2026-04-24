import re
from collections.abc import Iterable, Sequence

from .models import FeatureImpact, InventoryRow

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


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if token and token not in STOPWORDS
    }


def _normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def _phrase_matches(normalized_text: str, phrases: set[str]) -> list[str]:
    text = f" {normalized_text} "
    matches = [phrase for phrase in phrases if f" {phrase} " in text]
    return sorted(matches)


def _ownership_matches(
    normalized_feature: str,
    feature_tokens: set[str],
    values: Sequence[str],
) -> tuple[list[str], list[str]]:
    text = f" {normalized_feature} "
    phrase_matches: set[str] = set()
    token_matches: set[str] = set()

    for value in values:
        normalized_value = _normalize_text(value)
        if not normalized_value:
            continue

        if f" {normalized_value} " in text:
            phrase_matches.add(normalized_value)
            continue

        value_tokens = set(normalized_value.split())
        if value_tokens and not feature_tokens.isdisjoint(value_tokens):
            token_matches.add(normalized_value)

    token_only = token_matches - phrase_matches
    return sorted(phrase_matches), sorted(token_only)


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
        tokens.update(_tokenize(value))

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
    return _normalize_text(" ".join(values))


def analyze_feature(
    feature_description: str, rows: Sequence[InventoryRow]
) -> list[FeatureImpact]:
    """Score likely impacted repos using simple deterministic heuristics."""

    normalized_feature = _normalize_text(feature_description)
    feature_tokens = _tokenize(feature_description)
    if not feature_tokens:
        return []

    feature_signal_matches = {
        category: {
            "keywords": sorted(feature_tokens & config["keywords"]),
            "phrases": _phrase_matches(normalized_feature, config["phrases"]),
        }
        for category, config in CATEGORY_HINTS.items()
    }
    feature_ui_intent = bool(
        feature_signal_matches["frontend"]["keywords"]
        or feature_signal_matches["frontend"]["phrases"]
    )
    feature_backend_intent = bool(
        feature_signal_matches["backend"]["keywords"]
        or feature_signal_matches["backend"]["phrases"]
    )
    feature_downstream_keywords = sorted(feature_tokens & DOWNSTREAM_HINT_KEYWORDS)
    feature_downstream_phrases = _phrase_matches(
        normalized_feature, DOWNSTREAM_HINT_PHRASES
    )
    feature_downstream_intent = bool(
        feature_downstream_keywords or feature_downstream_phrases
    )

    scored_rows: list[dict[str, object]] = []
    max_primary_ownership_score = 0

    for row in rows:
        row_tokens = _manifest_tokens(row)
        row_text = _manifest_text(row)
        row_type_tokens = _tokenize(row.type)
        domain_overlap = sorted(feature_tokens & _tokenize(row.domain))
        domain_score = len(domain_overlap) * DOMAIN_WEIGHT
        score = domain_score
        reason_parts: list[str] = []
        category_scores = {"frontend": 0, "backend": 0, "data": 0}

        if domain_overlap:
            reason_parts.append(f"domain match ({', '.join(domain_overlap[:4])})")

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

            score += category_score
            category_scores[category] = category_score
            reason_parts.append(f"{category} signals ({'; '.join(signal_parts)})")

        backend_repo = bool(row_type_tokens & CATEGORY_HINTS["backend"]["repo_type_tokens"])
        ownership_score = 0
        primary_ownership_score = 0
        if backend_repo:
            ownership_reasons: list[str] = []
            for field_name in ("owns_entities", "owns_fields", "owns_tables", "api_keywords"):
                values = getattr(row, field_name)
                phrase_matches, token_matches = _ownership_matches(
                    normalized_feature, feature_tokens, values
                )
                if not phrase_matches and not token_matches:
                    continue

                weights = OWNERSHIP_WEIGHTS[field_name]
                field_score = len(phrase_matches) * weights["phrase"]
                field_score += len(token_matches) * weights["token"]
                ownership_score += field_score
                if field_name in {"owns_entities", "owns_fields", "owns_tables"}:
                    primary_ownership_score += field_score

                reason_tokens: list[str] = []
                if phrase_matches:
                    reason_tokens.append(", ".join(phrase_matches[:3]))
                if token_matches:
                    reason_tokens.append(f"tokens: {', '.join(token_matches[:3])}")
                ownership_reasons.append(f"{field_name}: {'; '.join(reason_tokens)}")

            if ownership_score > 0:
                score += ownership_score
                reason_parts.append(f"backend ownership ({' | '.join(ownership_reasons)})")

        downstream_score = 0
        if feature_downstream_intent:
            downstream_overlap = sorted(row_tokens & DOWNSTREAM_HINT_KEYWORDS)
            downstream_phrase_matches = _phrase_matches(row_text, DOWNSTREAM_HINT_PHRASES)
            if downstream_overlap or downstream_phrase_matches:
                downstream_score += len(downstream_overlap) * 2
                downstream_score += len(downstream_phrase_matches) * 4
                if backend_repo:
                    downstream_score += 2
                score += downstream_score
                reason_tokens: list[str] = []
                if downstream_overlap:
                    reason_tokens.append(f"keywords: {', '.join(downstream_overlap[:4])}")
                if downstream_phrase_matches:
                    reason_tokens.append(
                        f"phrases: {', '.join(downstream_phrase_matches[:3])}"
                    )
                reason_parts.append(f"downstream signals ({'; '.join(reason_tokens)})")

        generic_feature_tokens = feature_tokens - ALL_HINT_KEYWORDS
        generic_overlap = sorted(
            token
            for token in (generic_feature_tokens & row_tokens)
            if token not in domain_overlap
        )
        generic_score = 0
        if generic_overlap:
            generic_score = len(generic_overlap)
            score += generic_score
            reason_parts.append(f"keyword overlap ({', '.join(generic_overlap[:4])})")

        if score <= 0:
            continue

        max_primary_ownership_score = max(
            max_primary_ownership_score, primary_ownership_score
        )
        non_domain_score = score - domain_score
        scored_rows.append(
            {
                "repo_name": row.repo_name,
                "score": score,
                "reason": "; ".join(reason_parts),
                "domain_score": domain_score,
                "non_domain_score": non_domain_score,
                "only_domain": bool(domain_score > 0 and non_domain_score == 0),
                "frontend_score": category_scores["frontend"],
                "backend_score": category_scores["backend"],
                "downstream_score": downstream_score,
                "primary_ownership_score": primary_ownership_score,
            }
        )

    impacts: list[FeatureImpact] = []
    for scored_row in scored_rows:
        primary_ownership_score = int(scored_row["primary_ownership_score"])
        if primary_ownership_score > 0 and primary_ownership_score == max_primary_ownership_score:
            role = "primary-owner"
        elif bool(scored_row["only_domain"]):
            role = "weak-match"
        elif int(scored_row["downstream_score"]) > 0:
            role = "possible-downstream"
        elif (
            feature_ui_intent and int(scored_row["frontend_score"]) >= REPO_TYPE_WEIGHT
        ) or (
            feature_backend_intent and int(scored_row["backend_score"]) >= REPO_TYPE_WEIGHT
        ):
            role = "direct-dependent"
        elif int(scored_row["non_domain_score"]) > 0:
            role = "possible-downstream"
        else:
            role = "weak-match"

        impacts.append(
            FeatureImpact(
                repo_name=str(scored_row["repo_name"]),
                role=role,
                score=int(scored_row["score"]),
                reason=str(scored_row["reason"]),
            )
        )

    impacts.sort(key=lambda impact: (-impact.score, impact.repo_name))
    return impacts


def format_feature_analysis(
    feature_description: str, impacts: Sequence[FeatureImpact]
) -> str:
    """Render impacted repos with short reasons."""

    if not impacts:
        return (
            f'Feature: "{feature_description}"\n'
            "No likely impacted repos found from current stackpilot.yml metadata."
        )

    headers = ["repo", "role", "score", "reason"]
    rows = [
        [impact.repo_name, impact.role, str(impact.score), impact.reason]
        for impact in impacts
    ]

    widths = [len(headers[0]), len(headers[1]), len(headers[2]), len(headers[3])]
    for repo, role, score, reason in rows:
        widths[0] = max(widths[0], len(repo))
        widths[1] = max(widths[1], len(role))
        widths[2] = max(widths[2], len(score))
        widths[3] = max(widths[3], len(reason))

    header_line = " | ".join(
        header.ljust(widths[idx]) for idx, header in enumerate(headers)
    )
    separator_line = "-+-".join("-" * width for width in widths)
    data_lines = [
        " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(values))
        for values in rows
    ]

    return "\n".join(
        [
            f'Feature: "{feature_description}"',
            header_line,
            separator_line,
            *data_lines,
        ]
    )
