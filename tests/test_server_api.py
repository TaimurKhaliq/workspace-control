from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.models.semantic_enrichment import SemanticEnrichmentResult, SemanticFeatureSpec
from app.services.semantic_enrichment import save_semantic_enrichment
from server.app import create_app


FIXTURE_STACK = Path("tests/fixtures/mixed_source_stack").resolve()


def test_create_workspace_and_add_local_repo(tmp_path: Path) -> None:
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        workspace = client.post("/api/workspaces", json={"name": "Fixture"})
        assert workspace.status_code == 201
        workspace_id = workspace.json()["id"]

        repo = client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )
        assert repo.status_code == 201
        assert repo.json()["target_id"] == "fixture-stack"
        assert repo.json()["status"] == "registered"

        repos = client.get(f"/api/workspaces/{workspace_id}/repos")
        assert repos.status_code == 200
        assert [item["target_id"] for item in repos.json()] == ["fixture-stack"]


def test_validate_local_frontend_subfolder_warns_about_parent_root(tmp_path: Path) -> None:
    repo_root = tmp_path / "petclinic"
    (repo_root / "src/main/java").mkdir(parents=True)
    (repo_root / "client/src/components").mkdir(parents=True)
    (repo_root / "pom.xml").write_text("<project />\n", encoding="utf-8")
    (repo_root / "client/package.json").write_text(
        '{"dependencies":{"react":"18.2.0"}}\n',
        encoding="utf-8",
    )
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/repos/validate-target",
            json={
                "source_type": "local_path",
                "locator": str(repo_root / "client"),
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["selected_path"] == str((repo_root / "client").resolve())
    assert body["suggested_root_path"] == str(repo_root.resolve())
    assert body["detected_repo_type"] == "frontend-only"
    assert "react" in body["detected_frameworks"]
    assert any("frontend subfolder" in warning for warning in body["warnings"])
    assert any("backend/API/persistence prompts" in warning for warning in body["warnings"])


def test_discover_and_generate_plan_bundle(tmp_path: Path) -> None:
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Fixture"}).json()["id"]
        client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )

        discovered = client.post("/api/repos/fixture-stack/discover")
        assert discovered.status_code == 200
        assert discovered.json()["status"] == "discovered"
        assert discovered.json()["snapshot"]["report"]["repos"]

        response = client.post(
            f"/api/workspaces/{workspace_id}/plan-bundles",
            json={
                "feature_request": "Allow users to update their phone number from the profile screen",
                "target_ids": ["fixture-stack"],
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["run_id"]
        bundle = body["plan_bundle"]
        assert bundle["schema_version"] == "1.0"
        assert bundle["feature_request"].startswith("Allow users")
        assert bundle["recommended_change_set"]
        assert bundle["handoff_prompts"]

        run = client.get(f"/api/plan-bundles/{body['run_id']}")
        assert run.status_code == 200
        assert run.json()["status"] == "completed"
        assert run.json()["plan_bundle_json"]["schema_version"] == "1.0"

        runs = client.get(f"/api/workspaces/{workspace_id}/plan-runs")
        assert runs.status_code == 200
        assert [item["id"] for item in runs.json()] == [body["run_id"]]
        assert runs.json()[0]["feature_request"].startswith("Allow users")


def test_plan_bundle_api_threads_semantic_flag(tmp_path: Path, monkeypatch) -> None:
    captured: dict[str, Any] = {}

    class FakeBundle:
        def model_dump(self, mode: str) -> dict[str, Any]:
            return {
                "schema_version": "1.0",
                "feature_request": "upload pet photo",
                "semantic_enrichment": {"available": captured.get("use_semantic", False)},
                "semantic_missing_details": ["Storage strategy is unknown."]
                if captured.get("use_semantic")
                else [],
            }

    def fake_generate_plan_bundle_for_target(**kwargs):
        captured.update(kwargs)
        return FakeBundle()

    monkeypatch.setattr(
        "server.routes.plan_bundles.generate_plan_bundle_for_target",
        fake_generate_plan_bundle_for_target,
    )
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Fixture"}).json()["id"]
        client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )
        response = client.post(
            f"/api/workspaces/{workspace_id}/plan-bundles",
            json={
                "feature_request": "upload pet photo",
                "target_ids": ["fixture-stack"],
                "use_semantic": True,
            },
        )

    assert response.status_code == 200
    assert captured["use_semantic"] is True
    assert response.json()["plan_bundle"]["semantic_enrichment"]["available"] is True
    assert response.json()["plan_bundle"]["semantic_missing_details"] == ["Storage strategy is unknown."]


def test_reset_local_data_clears_api_state_and_app_caches(tmp_path: Path, monkeypatch) -> None:
    registry_path = tmp_path / ".workspace-control" / "discovery_targets.json"
    learning_root = tmp_path / "data" / "learning"
    semantic_root = tmp_path / "data" / "semantic"
    learning_report_root = tmp_path / "reports" / "learning"
    for path in [learning_root, semantic_root, learning_report_root]:
        path.mkdir(parents=True)
        (path / "sentinel.txt").write_text("state\n", encoding="utf-8")
    monkeypatch.setattr("server.routes.admin.DEFAULT_LEARNING_ROOT", learning_root)
    monkeypatch.setattr("server.routes.admin.DEFAULT_SEMANTIC_ROOT", semantic_root)
    monkeypatch.setattr("server.routes.admin.DEFAULT_LEARNING_REPORT_ROOT", learning_report_root)

    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=registry_path,
    )
    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Fixture"}).json()["id"]
        client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )
        client.post(
            f"/api/workspaces/{workspace_id}/plan-bundles",
            json={
                "feature_request": "Allow users to update their phone number from the profile screen",
                "target_ids": ["fixture-stack"],
            },
        )
        assert client.get("/api/workspaces").json()
        assert client.get(f"/api/workspaces/{workspace_id}/repos").json()
        assert client.get(f"/api/workspaces/{workspace_id}/plan-runs").json()
        assert registry_path.exists()

        rejected = client.post("/api/admin/reset-local-data", json={"confirm": "nope"})
        assert rejected.status_code == 400

        response = client.post("/api/admin/reset-local-data", json={"confirm": "RESET"})
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "reset"
        assert set(body["reset_tables"]) == {"workspaces", "repo_targets", "plan_runs"}
        assert client.get("/api/workspaces").json() == []
        assert not registry_path.exists()
        assert not learning_root.exists()
        assert not semantic_root.exists()
        assert not learning_report_root.exists()


def test_learning_status_missing_state_is_controlled_json(tmp_path: Path, monkeypatch) -> None:
    class FakeLearningService:
        def status(self, target_id: str) -> list[Any]:
            return []

        def recipes_for_target(self, target_id: str) -> list[Any]:
            return []

        def recipe_catalog_path(self, target_id: str) -> Path:
            return tmp_path / "learning" / target_id / "change_recipes.json"

        def validation_history_path(self, target_id: str) -> Path:
            return tmp_path / "learning" / target_id / "validation_history.json"

    monkeypatch.setattr("server.routes.learning._learning_service", lambda request: FakeLearningService())
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )

    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Fixture"}).json()["id"]
        client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )
        response = client.get("/api/repos/fixture-stack/learning-status")

    assert response.status_code == 200
    body = response.json()
    assert body["target_id"] == "fixture-stack"
    assert body["status"] == "missing"
    assert body["recipe_count"] == 0
    assert body["message"] == "Learning has not been run for this target yet"


def test_semantic_status_does_not_expose_api_key(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("STACKPILOT_SEMANTIC_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_KEY", "secret-key")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_MODEL", "gpt-5.5")
    monkeypatch.setenv("STACKPILOT_SEMANTIC_API_STYLE", "responses")
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        response = client.get("/api/semantic/status")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "configured": True,
        "provider": "openai-compatible",
        "model": "gpt-5.5",
        "api_style": "responses",
        "cached_artifact_available": False,
        "available": True,
    }
    assert "secret-key" not in response.text


def test_semantic_status_reports_cached_target_artifact(tmp_path: Path, monkeypatch) -> None:
    semantic_root = tmp_path / "semantic"
    monkeypatch.setattr("server.routes.semantic.DEFAULT_SEMANTIC_ROOT", semantic_root)
    monkeypatch.delenv("STACKPILOT_SEMANTIC_BASE_URL", raising=False)
    monkeypatch.delenv("STACKPILOT_SEMANTIC_API_KEY", raising=False)
    monkeypatch.delenv("STACKPILOT_SEMANTIC_MODEL", raising=False)
    artifact = semantic_root / "petclinic-react" / "latest_semantic_enrichment.json"
    artifact.parent.mkdir(parents=True)
    artifact.write_text("{}\n", encoding="utf-8")
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        response = client.get("/api/semantic/status?target_id=petclinic-react")

    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["cached_artifact_available"] is True
    assert body["available"] is True


def test_plan_bundle_skips_semantic_cache_for_different_prompt(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("STACKPILOT_SEMANTIC_BASE_URL", raising=False)
    monkeypatch.delenv("STACKPILOT_SEMANTIC_API_KEY", raising=False)
    monkeypatch.delenv("STACKPILOT_SEMANTIC_MODEL", raising=False)
    semantic_root = tmp_path / "semantic"
    monkeypatch.setattr("server.planner.DEFAULT_SEMANTIC_ROOT", semantic_root)
    photo_prompt = "add the ability to upload a picture of your pet"
    friends_prompt = "the ability to add other pets as friends"
    save_semantic_enrichment(
        SemanticEnrichmentResult(
            feature_request=photo_prompt,
            target_id="fixture-stack",
            generated_at="2026-04-27T00:00:00+00:00",
            feature_spec=SemanticFeatureSpec(
                feature_request=photo_prompt,
                normalized_request="add ability upload picture pet",
                domain_concepts=["pet", "picture"],
                technical_intents=["file upload", "pet picture storage"],
                technical_intent_labels=["ui", "api", "file_upload", "media_upload", "storage"],
                missing_details=["Storage strategy for pet pictures is unknown."],
                clarifying_questions=["Where should uploaded pictures be stored?"],
                confidence="high",
            ),
            annotations=[],
            caveats=["Picture upload caveat"],
            model_info={"provider": "test", "model": "mock-photo"},
        ),
        semantic_root=semantic_root,
    )
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Fixture"}).json()["id"]
        client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "fixture-stack",
                "source_type": "local_path",
                "locator": str(FIXTURE_STACK),
            },
        )
        response_a = client.post(
            f"/api/workspaces/{workspace_id}/plan-bundles",
            json={
                "feature_request": photo_prompt,
                "target_ids": ["fixture-stack"],
                "use_semantic": True,
            },
        )
        response_b = client.post(
            f"/api/workspaces/{workspace_id}/plan-bundles",
            json={
                "feature_request": friends_prompt,
                "target_ids": ["fixture-stack"],
                "use_semantic": True,
            },
        )

    assert response_a.status_code == 200
    bundle_a = response_a.json()["plan_bundle"]
    assert bundle_a["feature_request"] == photo_prompt
    assert bundle_a["semantic_cache_status"] == "hit"
    assert bundle_a["semantic_enrichment"]["available"] is True
    assert response_b.status_code == 200
    bundle_b = response_b.json()["plan_bundle"]
    assert bundle_b["feature_request"] == friends_prompt
    assert bundle_b["semantic_cache_status"] == "skipped_prompt_mismatch"
    assert bundle_b["semantic_enrichment"]["available"] is False
    rendered = str(bundle_b).lower()
    for forbidden in [
        "picture upload",
        "file_upload",
        "media_upload",
        "storage strategy",
        "image metadata",
        "picture preview",
    ]:
        assert forbidden not in rendered


def test_git_url_repo_is_stored_but_discovery_is_stubbed(tmp_path: Path) -> None:
    app = create_app(
        db_path=tmp_path / "workspace_control.db",
        registry_path=tmp_path / "discovery_targets.json",
    )
    with TestClient(app) as client:
        workspace_id = client.post("/api/workspaces", json={"name": "Remote later"}).json()["id"]
        repo = client.post(
            f"/api/workspaces/{workspace_id}/repos",
            json={
                "target_id": "remote-demo",
                "source_type": "git_url",
                "locator": "https://github.com/example/demo.git",
            },
        )
        assert repo.status_code == 201
        assert repo.json()["status"] == "not_implemented"

        discovered = client.post("/api/repos/remote-demo/discover")
        assert discovered.status_code == 501
