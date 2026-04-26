"""Deterministic feature intent classification using phrase matching only."""

from typing import Literal

from app.services.text_normalization import normalize_text

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
        "save",
        "field",
        "column",
        "table",
        "migration",
        "database",
    ),
    "api": (
        "api",
        "backend",
        "endpoint",
        "object",
        "objects",
        "model",
        "request",
        "response",
        "controller",
        "validation",
        "retrieve",
        "read",
        "list",
        "query",
    ),
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


class FeatureIntentClassifier:
    """Classifies feature intents with deterministic phrase checks."""

    def classify(self, feature_request: str) -> list[FeatureIntent]:
        """Return intent labels in stable order when matched."""

        normalized = normalize_text(feature_request)
        wrapped = f" {normalized} "
        intents: list[FeatureIntent] = []

        for intent in _INTENT_ORDER:
            phrases = _INTENT_PHRASES[intent]
            if any(f" {phrase} " in wrapped for phrase in phrases):
                intents.append(intent)

        if _new_persisted_ui_flow(normalized):
            intent_set = set(intents)
            intent_set.update({"ui", "persistence", "api"})
            intents = [intent for intent in _INTENT_ORDER if intent in intent_set]

        return intents


def _new_persisted_ui_flow(normalized_text: str) -> bool:
    tokens = set(normalized_text.split())
    create_terms = {"add", "build", "create", "new"}
    storage_terms = {"persist", "store", "save", "retrieve", "read", "list", "query"}
    ui_terms = {"page", "screen", "form"}
    return bool(tokens & create_terms and tokens & storage_terms and tokens & ui_terms)
