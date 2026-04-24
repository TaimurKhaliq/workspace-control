"""Deterministic feature intent classification using phrase matching only."""

import re
from typing import Literal

FeatureIntent = Literal["ui", "persistence", "api", "event_integration"]

_INTENT_ORDER: tuple[FeatureIntent, ...] = (
    "ui",
    "persistence",
    "api",
    "event_integration",
)
_INTENT_PHRASES: dict[FeatureIntent, tuple[str, ...]] = {
    "ui": ("screen", "page", "form", "button", "modal", "settings", "ui", "frontend"),
    "persistence": (
        "persist",
        "store",
        "field",
        "column",
        "table",
        "migration",
        "database",
    ),
    "api": ("api", "endpoint", "request", "response", "controller", "validation"),
    "event_integration": (
        "publish event",
        "emit event",
        "event",
        "downstream",
        "notify",
        "sync",
        "integration",
        "whenever changes",
    ),
}


def _normalize_text(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


class FeatureIntentClassifier:
    """Classifies feature intents with deterministic phrase checks."""

    def classify(self, feature_request: str) -> list[FeatureIntent]:
        """Return intent labels in stable order when matched."""

        normalized = _normalize_text(feature_request)
        wrapped = f" {normalized} "
        intents: list[FeatureIntent] = []

        for intent in _INTENT_ORDER:
            phrases = _INTENT_PHRASES[intent]
            if any(f" {phrase} " in wrapped for phrase in phrases):
                intents.append(intent)

        return intents
