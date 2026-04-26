import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.semantic_enrichment import (
    MockSemanticProvider,
    SemanticEnrichmentService,
    load_latest_semantic_enrichment,
)
from workspace_control.cli import run
from workspace_control.manifests import build_inventory

FEATURE = "add the ability to upload a picture of your pet"


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_petclinic_upload_workspace(root: Path) -> Path:
    repo = root / "petclinic"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/components/pets/NewPetPage.tsx", "export function NewPetPage() { return <PetEditor />; }\n")
    _write(repo / "client/src/components/pets/EditPetPage.tsx", "export function EditPetPage() { return <PetEditor />; }\n")
    _write(repo / "client/src/components/pets/PetEditor.tsx", "export function PetEditor() { return <form><input name=\"name\" /></form>; }\n")
    _write(repo / "client/src/components/pets/PetDetails.tsx", "export function PetDetails() { return null; }\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetRestController.java", "class PetRestController { void updatePet() {} }\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetService.java", "class PetService {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/Pet.java", "class Pet { String name; }\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetRepository.java", "interface PetRepository {}\n")
    _write(repo / "src/main/resources/openapi.yaml", "openapi: 3.0.0\npaths:\n  /pets: {}\n")
    return repo


def _snapshot_and_rows(root: Path):
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(root))
    return snapshot, build_inventory(root)


def _register_target(registry_path: Path, target_id: str, root: Path) -> None:
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id=target_id,
            source_type="local_path",
            locator=str(root),
        )
    )


def test_mock_semantic_provider_extracts_feature_spec_and_annotations(tmp_path: Path) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    snapshot, rows = _snapshot_and_rows(tmp_path)

    result = SemanticEnrichmentService(MockSemanticProvider()).enrich(
        target_id="petclinic-test",
        feature_request=FEATURE,
        rows=rows,
        discovery_snapshot=snapshot,
        max_nodes=12,
        include_snippets=True,
    )

    assert "pet" in result.feature_spec.domain_concepts
    assert "picture" in result.feature_spec.domain_concepts
    assert "file_upload" in result.feature_spec.technical_intents
    assert "storage" in result.feature_spec.technical_intents
    assert any(annotation.path.endswith("PetEditor.tsx") for annotation in result.annotations)
    assert any(annotation.path.endswith("PetRestController.java") for annotation in result.annotations)


def test_semantic_annotations_require_path_or_node_evidence(tmp_path: Path) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    snapshot, rows = _snapshot_and_rows(tmp_path)

    result = SemanticEnrichmentService(MockSemanticProvider()).enrich(
        target_id="petclinic-test",
        feature_request=FEATURE,
        rows=rows,
        discovery_snapshot=snapshot,
        max_nodes=8,
    )

    assert result.annotations
    for annotation in result.annotations:
        assert annotation.evidence
        assert any(
            evidence.path == annotation.path
            and evidence.graph_node_id == annotation.graph_node_id
            for evidence in annotation.evidence
        )


def test_enrich_discovery_cli_writes_latest_semantic_artifact(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)

    exit_code = run(
        [
            "enrich-discovery",
            "--target-id",
            "petclinic-test",
            "--registry-path",
            str(registry_path),
            "--semantic-root",
            str(semantic_root),
            "--provider",
            "mock",
            "--max-nodes",
            "8",
            FEATURE,
        ]
    )
    output = capsys.readouterr()
    payload = json.loads(output.out)
    latest = load_latest_semantic_enrichment("petclinic-test", semantic_root=semantic_root)

    assert exit_code == 0
    assert payload["target_id"] == "petclinic-test"
    assert latest is not None
    assert latest.feature_spec.feature_request == FEATURE


def test_explain_feature_includes_semantic_annotations_when_requested(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    assert run([
        "enrich-discovery",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--semantic-root",
        str(semantic_root),
        "--provider",
        "mock",
        FEATURE,
    ]) == 0
    capsys.readouterr()

    exit_code = run([
        "explain-feature",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--semantic-root",
        str(semantic_root),
        "--use-semantic",
        FEATURE,
    ])
    explanation = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert explanation["semantic_enrichment"]["available"] is True
    assert explanation["semantic_enrichment"]["annotations"]
    assert "file_upload" in explanation["semantic_enrichment"]["feature_spec"]["technical_intents"]


def test_propose_changes_use_semantic_adds_supplemental_evidence(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    assert run([
        "enrich-discovery",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--semantic-root",
        str(semantic_root),
        "--provider",
        "mock",
        FEATURE,
    ]) == 0
    capsys.readouterr()

    exit_code = run([
        "propose-changes",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--semantic-root",
        str(semantic_root),
        "--use-semantic",
        FEATURE,
    ])
    proposal = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert any("semantic_enrichment technical intents" in item for item in proposal["missing_evidence"])
    assert any(
        item["source"] in {"semantic_enrichment", "both"}
        for item in proposal["combined_recommendations"]
    )


def test_no_semantic_provider_config_does_not_break_deterministic_propose(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    _register_target(registry_path, "petclinic-test", tmp_path)

    exit_code = run([
        "propose-changes",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        FEATURE,
    ])
    proposal = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert proposal["feature_request"] == FEATURE
