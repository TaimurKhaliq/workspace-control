import json
import io
import urllib.error
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.models.semantic_enrichment import SemanticEnrichmentRequest, SemanticEnrichmentResult
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from app.services.semantic_enrichment import (
    MockSemanticProvider,
    OpenAICompatibleSemanticProvider,
    SemanticEnrichmentService,
    load_latest_semantic_enrichment,
    save_semantic_enrichment,
    semantic_intent_labels_for_result,
)
from workspace_control.cli import run
from workspace_control.manifests import build_inventory
from workspace_control.models import ChangeProposal, CombinedRecommendation
from workspace_control.semantic import apply_semantic_to_proposal

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
    _write(repo / "src/main/java/com/example/petclinic/pet/PetMapper.java", "class PetMapper {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetService.java", "class PetService {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/Pet.java", "class Pet { String name; }\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetRepository.java", "interface PetRepository {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/JdbcPetRepositoryImpl.java", "class JdbcPetRepositoryImpl {}\n")
    _write(repo / "Run PetClinicApplication.launch", "<launchConfiguration />\n")
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


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def read(self) -> bytes:
        return self._payload


def _semantic_request() -> SemanticEnrichmentRequest:
    return SemanticEnrichmentRequest(
        target_id="petclinic-test",
        feature_request=FEATURE,
        normalized_request=FEATURE,
        deterministic_intents=["ui"],
    )


def _semantic_result_payload() -> dict:
    return {
        "feature_request": FEATURE,
        "target_id": "petclinic-test",
        "generated_at": "2026-04-26T00:00:00Z",
        "feature_spec": {
            "feature_request": FEATURE,
            "normalized_request": FEATURE,
            "domain_concepts": ["pet"],
            "technical_intents": ["ui"],
            "confidence": "medium",
        },
        "annotations": [],
        "caveats": [],
        "model_info": {},
    }


def _gpt_like_semantic_payload(relevance_score, model_info: dict | None = None) -> dict:
    return {
        "feature_request": FEATURE,
        "target_id": "petclinic-test",
        "generated_at": "2026-04-26T00:00:00Z",
        "feature_spec": {
            "feature_request": FEATURE,
            "normalized_request": FEATURE,
            "domain_concepts": ["pet", "picture"],
            "technical_intents": [
                "Add a UI upload affordance to pet editing.",
                "Expose backend API behavior for pet picture upload.",
                "Persist or store picture metadata and retrieve it for display.",
                "Validate file size and type.",
            ],
            "technical_intent_labels": [],
            "missing_details": ["File storage strategy is not specified."],
            "clarifying_questions": ["Where should uploaded files be stored?"],
            "confidence": "medium",
            "evidence": [
                {
                    "source": "feature_request",
                    "claim": "The request mentions uploading a picture of a pet.",
                }
            ],
        },
        "annotations": [
            {
                "target_id": "petclinic-test",
                "repo_name": "petclinic",
                "path": "client/src/components/pets/PetEditor.tsx",
                "graph_node_id": "petclinic:client/src/components/pets/PetEditor.tsx:form_component",
                "semantic_roles": ["form_input_surface"],
                "domain_concepts": ["pet"],
                "capabilities": ["frontend_surface", "form_input"],
                "relevant_feature_intents": ["ui", "file_upload"],
                "relevance_score": relevance_score,
                "confidence": "high",
                "evidence": [
                    {
                        "source": "source_graph",
                        "claim": "PetEditor is a pet form surface.",
                        "repo_name": "petclinic",
                        "path": "client/src/components/pets/PetEditor.tsx",
                        "graph_node_id": "petclinic:client/src/components/pets/PetEditor.tsx:form_component",
                    }
                ],
            }
        ],
        "caveats": [],
        "model_info": model_info or {},
    }


def _run_openai_provider_with_payload(monkeypatch, payload: dict):
    def fake_urlopen(request, timeout):
        return _FakeResponse({"output_text": json.dumps(payload)})

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    return OpenAICompatibleSemanticProvider().enrich(_semantic_request())


def _upload_semantic_result(target_id: str = "petclinic-test") -> SemanticEnrichmentResult:
    payload = _gpt_like_semantic_payload(
        0.95,
        model_info={"reasoning_basis": ["source graph and feature request"]},
    )
    payload["target_id"] = target_id
    payload["feature_spec"]["technical_intent_labels"] = [
        "ui",
        "api",
        "file_upload",
        "storage",
        "persistence",
        "retrieval",
        "display",
        "validation",
    ]
    payload["feature_spec"]["missing_details"] = [
        "Storage strategy is unknown.",
        "File size/type validation is unknown.",
    ]
    payload["feature_spec"]["clarifying_questions"] = [
        "Should files be stored in object storage, filesystem, or database?",
        "Where should pet pictures be displayed?",
    ]
    payload["annotations"] = [
        {
            "target_id": target_id,
            "repo_name": "petclinic",
            "path": "client/src/components/pets/PetEditor.tsx",
            "graph_node_id": "petclinic:client/src/components/pets/PetEditor.tsx:form_component",
            "semantic_roles": ["candidate upload UI integration point"],
            "domain_concepts": ["pet"],
            "capabilities": ["frontend_surface", "form_input"],
            "relevant_feature_intents": ["file_upload"],
            "relevance_score": 0.95,
            "confidence": "high",
            "evidence": [
                {
                    "source": "source_graph",
                    "claim": "PetEditor is the pet form surface.",
                    "repo_name": "petclinic",
                    "path": "client/src/components/pets/PetEditor.tsx",
                    "graph_node_id": "petclinic:client/src/components/pets/PetEditor.tsx:form_component",
                }
            ],
        },
        {
            "target_id": target_id,
            "repo_name": "petclinic",
            "path": "client/src/components/pets/NewPetPage.tsx",
            "graph_node_id": "petclinic:client/src/components/pets/NewPetPage.tsx:page_component",
            "semantic_roles": ["pet creation upload entry point"],
            "domain_concepts": ["pet"],
            "capabilities": ["frontend_surface"],
            "relevant_feature_intents": ["ui", "file_upload"],
            "relevance_score": 0.88,
            "confidence": "high",
            "evidence": [
                {
                    "source": "source_graph",
                    "claim": "NewPetPage creates pets and may need upload wiring.",
                    "repo_name": "petclinic",
                    "path": "client/src/components/pets/NewPetPage.tsx",
                    "graph_node_id": "petclinic:client/src/components/pets/NewPetPage.tsx:page_component",
                }
            ],
        },
        {
            "target_id": target_id,
            "repo_name": "petclinic",
            "path": "src/main/java/com/example/petclinic/pet/PetRestController.java",
            "graph_node_id": "petclinic:src/main/java/com/example/petclinic/pet/PetRestController.java:api_controller",
            "semantic_roles": ["pet upload API surface"],
            "domain_concepts": ["pet"],
            "capabilities": ["api_surface"],
            "relevant_feature_intents": ["api", "file_upload"],
            "relevance_score": 0.93,
            "confidence": "high",
            "evidence": [
                {
                    "source": "source_graph",
                    "claim": "PetRestController owns pet API behavior.",
                    "repo_name": "petclinic",
                    "path": "src/main/java/com/example/petclinic/pet/PetRestController.java",
                    "graph_node_id": "petclinic:src/main/java/com/example/petclinic/pet/PetRestController.java:api_controller",
                }
            ],
        },
        {
            "target_id": target_id,
            "repo_name": "petclinic",
            "path": "Run PetClinicApplication.launch",
            "graph_node_id": "petclinic:Run PetClinicApplication.launch:unknown",
            "semantic_roles": ["run configuration"],
            "domain_concepts": [],
            "capabilities": [],
            "relevant_feature_intents": [],
            "relevance_score": 0.99,
            "confidence": "high",
            "evidence": [
                {
                    "source": "source_graph",
                    "claim": "Launch file is unrelated run configuration.",
                    "repo_name": "petclinic",
                    "path": "Run PetClinicApplication.launch",
                    "graph_node_id": "petclinic:Run PetClinicApplication.launch:unknown",
                }
            ],
        },
    ]
    return SemanticEnrichmentResult.model_validate(payload)


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
    assert any("semantic_enrichment technical intent labels" in item for item in proposal["missing_evidence"])
    assert any(
        item["source"] in {"semantic_enrichment", "both"}
        for item in proposal["combined_recommendations"]
    )


def test_semantic_intent_labels_fallback_from_prose() -> None:
    result = SemanticEnrichmentResult.model_validate(_gpt_like_semantic_payload(0.95))

    labels = semantic_intent_labels_for_result(result)

    assert set(labels).issuperset(
        {"ui", "api", "file_upload", "media_upload", "storage", "persistence", "retrieval", "display", "validation"}
    )


def test_use_semantic_supplements_feature_intents_and_structured_details(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    save_semantic_enrichment(_upload_semantic_result(), semantic_root=semantic_root)

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
    assert set(explanation["feature_understanding"]["feature_intents"]).issuperset(
        {"ui", "api", "file_upload", "storage", "persistence"}
    )
    assert explanation["semantic_missing_details"] == [
        "Storage strategy is unknown.",
        "File size/type validation is unknown.",
    ]
    assert explanation["semantic_clarifying_questions"]


def test_high_confidence_semantic_annotations_are_top_recommendations(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    save_semantic_enrichment(_upload_semantic_result(), semantic_root=semantic_root)

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
    recommendations = proposal["combined_recommendations"]
    paths = [item["path"] for item in recommendations[:6]]

    assert exit_code == 0
    assert "client/src/components/pets/PetEditor.tsx" in paths
    assert "src/main/java/com/example/petclinic/pet/PetRestController.java" in paths
    assert all(item["source"] in {"semantic_enrichment", "both", "planner"} for item in recommendations[:4])
    assert "Run PetClinicApplication.launch" not in [item["path"] for item in recommendations]
    assert proposal["semantic_missing_details"] == [
        "Storage strategy is unknown.",
        "File size/type validation is unknown.",
    ]


def test_semantic_upload_filters_noisy_backend_validation_recipe() -> None:
    semantic_result = _upload_semantic_result()
    proposal = ChangeProposal(
        feature_request=FEATURE,
        feature_intents=[],
        confidence="low",
        combined_recommendations=[
            CombinedRecommendation(
                repo_name="petclinic",
                path="src/main/java/com/example/petclinic/pet/PetRestController.java",
                action="inspect",
                confidence="medium",
                source="recipe",
                matched_recipe_id="petclinic_backend_validation_change",
                evidence=["recipe_type: backend_validation_change", "validation terms matched"],
            )
        ],
    )

    updated = apply_semantic_to_proposal(proposal, semantic_result)

    assert updated.combined_recommendations
    assert updated.combined_recommendations[0].source == "semantic_enrichment"
    assert not any(
        item.source == "recipe" and item.matched_recipe_id == "petclinic_backend_validation_change"
        for item in updated.combined_recommendations
    )


def test_semantic_recommendations_unchanged_without_use_semantic(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    save_semantic_enrichment(_upload_semantic_result(), semantic_root=semantic_root)

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
    assert "file_upload" not in proposal["feature_intents"]
    assert proposal["semantic_missing_details"] == []


def test_plan_bundle_uses_semantic_upload_guidance_in_handoff(tmp_path: Path, capsys) -> None:
    _seed_petclinic_upload_workspace(tmp_path)
    registry_path = tmp_path / "registry.json"
    semantic_root = tmp_path / "semantic"
    _register_target(registry_path, "petclinic-test", tmp_path)
    save_semantic_enrichment(_upload_semantic_result(), semantic_root=semantic_root)

    exit_code = run([
        "generate-plan-bundle",
        "--target-id",
        "petclinic-test",
        "--registry-path",
        str(registry_path),
        "--semantic-root",
        str(semantic_root),
        "--use-semantic",
        "--format",
        "json",
        FEATURE,
    ])
    bundle = json.loads(capsys.readouterr().out)
    handoff = bundle["handoff_prompts"][0]["prompt"]

    assert exit_code == 0
    assert bundle["semantic_missing_details"] == [
        "Storage strategy is unknown.",
        "File size/type validation is unknown.",
    ]
    assert "This feature likely requires UI + backend API + storage/persistence work." in handoff
    assert "Decide storage strategy before implementation" in handoff
    assert "Add file input and preview behavior" in handoff


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


def test_openai_responses_provider_success_uses_responses_payload(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return _FakeResponse({"output_text": json.dumps(_semantic_result_payload())})

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = OpenAICompatibleSemanticProvider().enrich(_semantic_request())

    assert result.feature_spec.domain_concepts == ["pet"]
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert set(captured["payload"]) == {"model", "input"}
    assert captured["payload"]["model"] == "gpt-5.5"
    assert "Required top-level JSON shape" in captured["payload"]["input"]
    assert '"feature_spec"' in captured["payload"]["input"]
    assert "Semantic enrichment request JSON" in captured["payload"]["input"]
    assert result.model_info["api_style"] == "responses"


def test_openai_auto_defaults_gpt_5_to_responses(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        return _FakeResponse({"output_text": json.dumps(_semantic_result_payload())})

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.delenv("STACKPILOT_SEMANTIC_API_STYLE", raising=False)
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = OpenAICompatibleSemanticProvider().enrich(_semantic_request())

    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert result.model_info["api_style"] == "responses"


def test_openai_responses_parser_extracts_output_content_text(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        return _FakeResponse(
            {
                "output": [
                    {
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(_semantic_result_payload()),
                            }
                        ]
                    }
                ]
            }
        )

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = OpenAICompatibleSemanticProvider().enrich(_semantic_request())

    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert result.target_id == "petclinic-test"
    assert result.model_info["api_style"] == "responses"


def test_openai_provider_normalizes_flat_feature_spec_response(monkeypatch) -> None:
    def fake_urlopen(request, timeout):
        return _FakeResponse(
            {
                "output_text": json.dumps(
                    {
                        "target_id": "petclinic-test",
                        "normalized_request": FEATURE,
                        "domain_concepts": ["pet", "picture"],
                        "technical_intents": ["ui", "file_upload"],
                        "missing_details": ["File storage strategy is not specified."],
                        "confidence": "medium",
                    }
                )
            }
        )

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = OpenAICompatibleSemanticProvider().enrich(_semantic_request())

    assert result.feature_spec.feature_request == FEATURE
    assert result.feature_spec.domain_concepts == ["pet", "picture"]
    assert result.feature_spec.technical_intents == ["ui", "file_upload"]
    assert result.feature_spec.missing_details == ["File storage strategy is not specified."]
    assert any("flat feature-spec" in caveat for caveat in result.caveats)


def test_openai_provider_accepts_relevance_score_float(monkeypatch) -> None:
    result = _run_openai_provider_with_payload(
        monkeypatch,
        _gpt_like_semantic_payload(0.95),
    )

    assert result.annotations[0].relevance_score == 0.95


def test_openai_provider_normalizes_relevance_score_percentage_int(monkeypatch) -> None:
    result = _run_openai_provider_with_payload(
        monkeypatch,
        _gpt_like_semantic_payload(95),
    )

    assert result.annotations[0].relevance_score == 0.95


def test_openai_provider_parses_relevance_score_numeric_string(monkeypatch) -> None:
    result = _run_openai_provider_with_payload(
        monkeypatch,
        _gpt_like_semantic_payload("0.8"),
    )

    assert result.annotations[0].relevance_score == 0.8


def test_openai_provider_preserves_list_reasoning_basis_model_info(monkeypatch) -> None:
    result = _run_openai_provider_with_payload(
        monkeypatch,
        _gpt_like_semantic_payload(
            0.9,
            model_info={
                "reasoning_basis": [
                    "feature request mentions upload",
                    "source graph contains PetEditor",
                ]
            },
        ),
    )

    assert result.model_info["reasoning_basis"] == [
        "feature request mentions upload",
        "source graph contains PetEditor",
    ]
    assert result.model_info["api_style"] == "responses"


def test_openai_provider_valid_gpt_like_response_passes(monkeypatch) -> None:
    result = _run_openai_provider_with_payload(
        monkeypatch,
        _gpt_like_semantic_payload(
            0.95,
            model_info={"reasoning_basis": ["source graph and feature request"]},
        ),
    )

    assert result.feature_spec.technical_intent_labels == [
        "ui",
        "api",
        "persistence",
        "storage",
        "file_upload",
        "media_upload",
        "retrieval",
        "display",
        "validation",
    ]
    assert result.annotations[0].path.endswith("PetEditor.tsx")
    assert result.annotations[0].relevance_score == 0.95


def test_openai_provider_writes_debug_file_on_validation_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    bad_payload = _gpt_like_semantic_payload(0.95)
    bad_payload["feature_spec"]["confidence"] = "certain"

    def fake_urlopen(request, timeout):
        return _FakeResponse({"output_text": json.dumps(bad_payload)})

    debug_root = tmp_path / "semantic-debug"
    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_DEBUG_ROOT", str(debug_root))
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    try:
        OpenAICompatibleSemanticProvider().enrich(_semantic_request())
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("Expected provider to raise ValueError")

    debug_path = debug_root / "petclinic-test" / "latest_semantic_validation_error.json"
    debug_payload = json.loads(debug_path.read_text(encoding="utf-8"))
    assert str(debug_path) in message
    assert debug_payload["raw_response"]
    assert debug_payload["parsed_response"]["feature_spec"]["confidence"] == "certain"


def test_openai_provider_surfaces_400_error_body(monkeypatch) -> None:
    def fake_urlopen(_request, timeout):
        raise urllib.error.HTTPError(
            url="https://api.openai.com/v1/responses",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=io.BytesIO(b'{"error":{"message":"Unsupported parameter: temperature"}}'),
        )

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    try:
        OpenAICompatibleSemanticProvider().enrich(_semantic_request())
    except ValueError as exc:
        message = str(exc)
    else:
        raise AssertionError("Expected provider to raise ValueError")

    assert "HTTP 400" in message
    assert "https://api.openai.com/v1/responses" in message
    assert "api_style=responses" in message
    assert "Unsupported parameter: temperature" in message


def test_openai_chat_completions_style_keeps_legacy_payload(monkeypatch) -> None:
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return _FakeResponse(
            {"choices": [{"message": {"content": json.dumps(_semantic_result_payload())}}]}
        )

    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://compatible.example/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "test-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "local-json-model")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "chat_completions")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    result = OpenAICompatibleSemanticProvider().enrich(_semantic_request())

    assert captured["url"] == "https://compatible.example/v1/chat/completions"
    assert captured["payload"]["model"] == "local-json-model"
    assert captured["payload"]["temperature"] == 0
    assert captured["payload"]["response_format"] == {"type": "json_object"}
    assert "messages" in captured["payload"]
    assert result.model_info["api_style"] == "chat_completions"
