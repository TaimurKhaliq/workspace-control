"""Smoke tests for app-layer modules.

These are lightweight and intentionally minimal because the CLI still runs through
existing workspace_control entrypoints.
"""

from app.services.feature_intent_classifier import FeatureIntentClassifier


def test_intent_classifier_smoke() -> None:
    classifier = FeatureIntentClassifier()
    intents = classifier.classify("Update profile settings form and persist field")
    assert intents == ["ui", "persistence"]
