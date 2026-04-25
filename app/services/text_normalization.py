"""Shared deterministic text normalization helpers for feature analysis."""

from __future__ import annotations

import re
from collections.abc import Iterable


def split_identifiers(text: str) -> str:
    """Split camelCase/PascalCase identifiers before tokenization."""

    split_camel = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", split_camel)


def normalize_text(text: str) -> str:
    """Normalize text into lowercase token-safe words."""

    return " ".join(re.findall(r"[a-z0-9]+", split_identifiers(text).lower()))


def tokenize_text(text: str, *, stopwords: Iterable[str] = ()) -> set[str]:
    """Tokenize text after identifier splitting, optionally removing stopwords."""

    blocked = set(stopwords)
    return {
        token
        for token in re.findall(r"[a-z0-9]+", split_identifiers(text).lower())
        if token and token not in blocked
    }
