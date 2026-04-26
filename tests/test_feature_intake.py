import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.cli import run
from workspace_control.intake import create_feature_intake
from workspace_control.manifests import build_inventory

CONTACT_US_PROMPT = "create a new contact-us page with the proper backend objects and api"
CONTACT_PERSIST_PROMPT = "create a contact page and persist the fields so we can retrieve them later"


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_frontend_only(root: Path) -> None:
    _write(
        root / "web-ui" / "stackpilot.yml",
        "\n".join(
            [
                "type: frontend",
                "language: typescript",
                "domain: public-site",
                "build_commands:",
                "  - npm run build",
                "test_commands:",
                "  - npm test",
            ]
        ),
    )
    _write(
        root / "web-ui" / "package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}, "scripts": {"test": "vitest"}}),
    )
    for folder in ["src/pages", "src/components", "src/forms", "src/api"]:
        (root / "web-ui" / folder).mkdir(parents=True, exist_ok=True)
    _write(root / "web-ui" / "src/pages/HomePage.tsx", "export function HomePage() { return null; }\n")


def _seed_full_stack(root: Path) -> None:
    _seed_frontend_only(root)
    _write(
        root / "service-a" / "stackpilot.yml",
        "\n".join(
            [
                "type: backend-service",
                "language: java",
                "domain: customer-platform",
                "build_commands:",
                "  - ./gradlew build",
                "test_commands:",
                "  - ./gradlew test",
            ]
        ),
    )
    _write(root / "service-a/build.gradle", "plugins { id 'org.springframework.boot' version '3.2.0' }\n")
    for folder in [
        "src/main/java/com/acme/controller",
        "src/main/java/com/acme/dto",
        "src/main/java/com/acme/service",
        "src/main/java/com/acme/entity",
        "src/main/java/com/acme/repository",
        "src/main/resources/db/migration",
    ]:
        (root / "service-a" / folder).mkdir(parents=True, exist_ok=True)
    _write(root / "service-a/src/main/resources/openapi.yaml", "openapi: 3.0.0\npaths: {}\n")
    _write(root / "service-a/src/main/java/com/acme/controller/HealthController.java", "class HealthController {}\n")


def _intake(root: Path, prompt: str):
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(root))
    return create_feature_intake(
        prompt,
        build_inventory(root),
        scan_root=root,
        discovery_snapshot=snapshot,
    )


def test_contact_us_intake_outputs_defaults_and_questions(tmp_path: Path) -> None:
    _seed_full_stack(tmp_path)

    intake = _intake(tmp_path, CONTACT_US_PROMPT)

    assert set(intake.detected_intents) >= {"ui", "api"}
    assert intake.new_domain_candidates == ["contact"]
    assert [item.concept for item in intake.ungrounded_concepts] == ["contact"]
    assert intake.proposed_defaults.route_path == "/contact-us"
    assert intake.proposed_defaults.page_name == "ContactUsPage"
    assert intake.proposed_defaults.form_name == "ContactForm"
    assert intake.proposed_defaults.domain_model_name == "Contact"
    assert [field.name for field in intake.proposed_defaults.fields] == [
        "name",
        "email",
        "message",
        "createdAt",
    ]
    assert "ContactController" in {item.name for item in intake.proposed_defaults.backend_objects}
    assert "ContactRequest" in {item.name for item in intake.proposed_defaults.backend_objects}
    assert "ContactRepository" not in {item.name for item in intake.proposed_defaults.backend_objects}
    assert any("What fields should be collected?" == question for question in intake.clarifying_questions)
    assert any("What route should the page use?" == question for question in intake.clarifying_questions)
    assert intake.can_generate_plan is False


def test_contact_persist_retrieve_intake_infers_api_persistence_and_repository(tmp_path: Path) -> None:
    _seed_full_stack(tmp_path)

    intake = _intake(tmp_path, CONTACT_PERSIST_PROMPT)

    assert set(intake.detected_intents) >= {"ui", "api", "persistence"}
    assert intake.repo_capability_summary.backend_available is True
    assert intake.repo_capability_summary.persistence_available is True
    assert "ContactRepository" in {item.name for item in intake.proposed_defaults.backend_objects}
    assert any(endpoint.method == "GET" for endpoint in intake.proposed_defaults.api_endpoints)
    assert any("retrieval/list API" in question for question in intake.clarifying_questions)
    assert any("Database table" in detail for detail in intake.missing_details)


def test_existing_grounded_feature_has_fewer_clarifying_questions() -> None:
    fixture_root = Path(__file__).parent / "fixtures" / "mixed_source_stack"

    intake = _intake(
        fixture_root,
        "Allow users to update their phone number from the profile screen",
    )

    assert "contact" not in intake.new_domain_candidates
    assert any(item.concept == "phone number" for item in intake.grounded_concepts)
    assert len(intake.clarifying_questions) == 0
    assert intake.can_generate_plan is True


def test_frontend_only_target_reports_backend_missing(tmp_path: Path) -> None:
    _seed_frontend_only(tmp_path)

    intake = _intake(tmp_path, CONTACT_PERSIST_PROMPT)

    assert intake.repo_capability_summary.frontend_available is True
    assert intake.repo_capability_summary.backend_available is False
    assert intake.repo_capability_summary.persistence_available is False
    assert any("no backend-capable target" in detail for detail in intake.missing_details)
    assert any("Register the monorepo root or backend repo" in caveat for caveat in intake.caveats)
    assert intake.confidence == "low"


def test_intake_feature_cli_outputs_json_for_target_id(tmp_path: Path, capsys) -> None:
    _seed_full_stack(tmp_path)
    registry_path = tmp_path / "targets.json"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id="stack",
            source_type="local_path",
            locator=str(tmp_path),
        )
    )

    exit_code = run(
        [
            "intake-feature",
            "--target-id",
            "stack",
            "--registry-path",
            str(registry_path),
            CONTACT_US_PROMPT,
        ]
    )
    payload = json.loads(capsys.readouterr().out)

    assert exit_code == 0
    assert payload["feature_request"] == CONTACT_US_PROMPT
    assert payload["new_domain_candidates"] == ["contact"]
    assert payload["proposed_defaults"]["route_path"] == "/contact-us"
    assert payload["repo_capability_summary"]["backend_available"] is True
