from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

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
