from __future__ import annotations

from pathlib import Path

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
