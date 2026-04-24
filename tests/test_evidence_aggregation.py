from pathlib import Path

from app.services.evidence_aggregator import EvidenceAggregator
from workspace_control.manifests import build_inventory


def _write_manifest(repo_path: Path) -> None:
    lines = [
        "type: backend-service",
        "language: java",
        "domain: customer-profile",
        "build_commands:",
        "  - ./gradlew build",
        "test_commands:",
        "  - ./gradlew test",
        "owns_entities: [customer_profile]",
        "owns_fields: [phone_number]",
        "owns_tables: [customer_profiles]",
        "api_keywords: [profile endpoint, phone number]",
    ]
    repo_path.mkdir(parents=True, exist_ok=True)
    (repo_path / "stackpilot.yml").write_text("\n".join(lines), encoding="utf-8")


def test_evidence_aggregator_collects_all_feature_sources(tmp_path: Path) -> None:
    repo_path = tmp_path / "profile-api"
    _write_manifest(repo_path)
    (repo_path / "AGENTS.md").write_text(
        "Owns profile phone number validation flows.",
        encoding="utf-8",
    )
    (repo_path / "build.gradle").write_text(
        'plugins { id "org.springframework.boot" version "3.2.0" }',
        encoding="utf-8",
    )
    (repo_path / "src/main/java/com/acme/profile/controller").mkdir(
        parents=True, exist_ok=True
    )
    (repo_path / "src/main/java/com/acme/profile/controller/ProfileController.java").write_text(
        "class ProfileController {}",
        encoding="utf-8",
    )

    rows = build_inventory(tmp_path)
    evidence = EvidenceAggregator().aggregate(
        "Update customer profile phone number validation API endpoint",
        rows,
        scan_root=tmp_path,
    )

    sources = {item.source for item in evidence}
    categories = {item.category for item in evidence}
    signals = {item.signal for item in evidence}

    assert sources >= {
        "stackpilot.yml",
        "AGENTS.md",
        "adapter_discovery",
        "deterministic_intent",
    }
    assert {"domain", "backend", "ownership", "keyword_overlap"} <= categories
    assert "backend adapter discovery" in signals
    assert all(item.repo_name == "profile-api" for item in evidence)
    assert any(item.weight > 0 for item in evidence if item.source == "stackpilot.yml")
    assert any(item.weight > 0 for item in evidence if item.source == "deterministic_intent")


def test_evidence_aggregator_is_deterministic(tmp_path: Path) -> None:
    repo_path = tmp_path / "profile-api"
    _write_manifest(repo_path)
    rows = build_inventory(tmp_path)
    aggregator = EvidenceAggregator()

    first = [
        item.model_dump(mode="python")
        for item in aggregator.aggregate("Update profile phone number", rows)
    ]
    second = [
        item.model_dump(mode="python")
        for item in aggregator.aggregate("Update profile phone number", rows)
    ]

    assert first == second
