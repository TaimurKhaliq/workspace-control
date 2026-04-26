import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.concept_grounding import ConceptGroundingService
from app.services.text_normalization import normalize_text
from workspace_control.analyze import analyze_feature
from workspace_control.manifests import build_inventory
from workspace_control.plan import create_feature_plan
from workspace_control.plan_bundle import create_plan_bundle
from workspace_control.propose import create_change_proposal


FEATURE_REQUEST = "create a contact page and persist the fields so we can retrieve them later"
CONTACT_US_BACKEND_REQUEST = "create a new contact-us page with the proper backend objects and api"


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _write_manifest(
    root: Path,
    repo_name: str,
    *,
    repo_type: str,
    language: str,
    domain: str,
    build_commands: list[str],
    test_commands: list[str],
) -> None:
    lines = [
        f"type: {repo_type}",
        f"language: {language}",
        f"domain: {domain}",
        "build_commands:",
        *[f"  - {command}" for command in build_commands],
        "test_commands:",
        *[f"  - {command}" for command in test_commands],
        "owns_entities: []",
        "owns_fields: []",
        "owns_tables: []",
        "api_keywords: []",
    ]
    _write(root / repo_name / "stackpilot.yml", "\n".join(lines))


def _seed_frontend_only_workspace(root: Path) -> None:
    _write_manifest(
        root,
        "web-ui",
        repo_type="frontend",
        language="typescript",
        domain="public-site",
        build_commands=["npm run build"],
        test_commands=["npm test"],
    )
    _write(
        root / "web-ui/package.json",
        json.dumps(
            {
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"build": "vite build", "test": "vitest"},
            }
        ),
    )
    for path in [
        "web-ui/src/pages",
        "web-ui/src/components",
        "web-ui/src/forms",
        "web-ui/src/api",
        "web-ui/src/services",
    ]:
        (root / path).mkdir(parents=True, exist_ok=True)
    _write(root / "web-ui/src/pages/HomePage.tsx", "export function HomePage() { return null; }\n")
    _write(root / "web-ui/src/api/client.ts", "export const client = {};\n")


def _seed_full_stack_workspace(root: Path) -> None:
    _seed_frontend_only_workspace(root)
    _write_manifest(
        root,
        "service-a",
        repo_type="backend-service",
        language="java",
        domain="customer-platform",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
    )
    _write(
        root / "service-a/build.gradle",
        "plugins { id 'org.springframework.boot' version '3.2.0' }\n",
    )
    for path in [
        "service-a/src/main/java/com/acme/controller",
        "service-a/src/main/java/com/acme/dto",
        "service-a/src/main/java/com/acme/service",
        "service-a/src/main/java/com/acme/entity",
        "service-a/src/main/java/com/acme/repository",
        "service-a/src/main/resources/db/migration",
    ]:
        (root / path).mkdir(parents=True, exist_ok=True)
    _write(
        root / "service-a/src/main/resources/openapi.yaml",
        "openapi: 3.0.0\npaths: {}\n",
    )
    _write(
        root / "service-a/src/main/java/com/acme/controller/HealthController.java",
        "class HealthController {}\n",
    )
    _write(
        root / "service-a/src/main/java/com/acme/service/CustomerService.java",
        "class CustomerService {}\n",
    )


def _seed_full_stack_monorepo(root: Path) -> None:
    _write(root / "build.gradle", "plugins { id 'org.springframework.boot' version '3.2.0' }\n")
    _write(
        root / "client/package.json",
        json.dumps(
            {
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"build": "vite build", "test": "vitest"},
            }
        ),
    )
    for path in [
        "client/src/pages",
        "client/src/components",
        "client/src/forms",
        "client/src/api",
        "client/src/services",
        "src/main/java/com/acme/controller",
        "src/main/java/com/acme/dto",
        "src/main/java/com/acme/service",
        "src/main/java/com/acme/entity",
        "src/main/java/com/acme/repository",
        "src/main/resources/db/migration",
    ]:
        (root / path).mkdir(parents=True, exist_ok=True)
    _write(root / "client/src/pages/HomePage.tsx", "export function HomePage() { return null; }\n")
    _write(root / "client/src/api/client.ts", "export const client = {};\n")
    _write(root / "src/main/resources/openapi.yaml", "openapi: 3.0.0\npaths: {}\n")
    _write(root / "src/main/java/com/acme/controller/HealthController.java", "class HealthController {}\n")
    _write(root / "src/main/java/com/acme/service/CustomerService.java", "class CustomerService {}\n")
    _write(root / "src/main/java/com/acme/entity/Customer.java", "class Customer {}\n")


def _run_pipeline(root: Path, prompt: str = FEATURE_REQUEST):
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(root))
    rows = build_inventory(root)
    impacts = analyze_feature(prompt, rows, scan_root=root, discovery_snapshot=snapshot)
    plan = create_feature_plan(
        prompt,
        rows,
        impacts=impacts,
        scan_root=root,
        discovery_snapshot=snapshot,
    )
    proposal = create_change_proposal(
        prompt,
        rows,
        impacts=impacts,
        scan_root=root,
        discovery_snapshot=snapshot,
    )
    bundle = create_plan_bundle(
        feature_request=prompt,
        target_id=None,
        rows=rows,
        impacts=impacts,
        plan=plan,
        proposal=proposal,
        discovery_snapshot=snapshot,
        recipe_report=None,
    )
    return rows, impacts, plan, proposal, bundle


def _proposal_text(proposal) -> str:
    return json.dumps(proposal.model_dump(mode="python")).lower()


def _plan_text(plan) -> str:
    return json.dumps(plan.model_dump(mode="python")).lower()


def test_contact_us_page_concept_parsing_does_not_extract_us() -> None:
    grounding = ConceptGroundingService().ground("create a new contact-us page", [])
    concepts = {item.concept for item in grounding}

    assert "contact" in concepts
    assert "us" not in concepts


def test_contact_us_pascal_case_normalizes_to_contact_us_page() -> None:
    assert normalize_text("Create ContactUsPage") == "create contact us page"


def test_contact_page_underscore_normalizes_to_contact_page() -> None:
    assert normalize_text("create contact_page") == "create contact page"


def test_contact_persist_feature_in_frontend_only_workspace_reports_missing_backend(
    tmp_path: Path,
) -> None:
    _seed_frontend_only_workspace(tmp_path)

    _rows, _impacts, plan, proposal, bundle = _run_pipeline(tmp_path)
    grounding = {item.concept: item.status for item in plan.concept_grounding}
    output_text = f"{_plan_text(plan)} {_proposal_text(proposal)}"

    assert set(plan.feature_intents) >= {"ui", "api", "persistence"}
    assert grounding["contact"] == "ungrounded_new_domain_candidate"
    assert plan.ui_change_needed is True
    assert plan.api_change_needed is True
    assert plan.db_change_needed is True
    assert any(
        "Backend/API work requested but no backend-capable target is registered" in message
        for message in plan.missing_evidence
    )
    assert bundle.summary.missing_backend_required is True
    assert bundle.summary.backend_required is True
    assert bundle.summary.backend_available is False
    assert any(
        risk.severity == "high"
        and "Backend/API work requested but no backend-capable target is registered" in risk.message
        for risk in bundle.risks_and_caveats
    )
    assert "owner-specific" not in output_text
    assert "owner form" not in output_text
    assert "telephone" not in output_text
    assert "phone number" not in output_text
    assert "/owners/" not in output_text
    assert "/pets/" not in output_text
    assert "/vets/" not in output_text
    assert proposal.proposed_changes
    assert {item.repo_name for item in proposal.proposed_changes} == {"web-ui"}
    web_change = proposal.proposed_changes[0]
    assert "src/pages/ContactPage.tsx" in web_change.possible_new_files
    assert "src/forms/ContactForm.tsx" in web_change.possible_new_files
    assert "src/api/contactApi.ts" in web_change.possible_new_files


def test_contact_persist_feature_in_full_stack_workspace_proposes_new_domain_surfaces(
    tmp_path: Path,
) -> None:
    _seed_full_stack_workspace(tmp_path)

    _rows, _impacts, plan, proposal, _bundle = _run_pipeline(tmp_path)
    grounding = {item.concept: item.status for item in plan.concept_grounding}
    changes_by_repo = {item.repo_name: item for item in proposal.proposed_changes}
    all_possible_new_files = {
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    }
    all_file_paths = {
        file_plan.path
        for item in proposal.proposed_changes
        for file_plan in item.files
    }
    output_text = f"{_plan_text(plan)} {_proposal_text(proposal)}"

    assert set(plan.feature_intents) >= {"ui", "api", "persistence"}
    assert grounding["contact"] == "ungrounded_new_domain_candidate"
    assert plan.primary_owner == "service-a"
    assert plan.implementation_owner == "web-ui"
    assert plan.domain_owner == "service-a"
    assert plan.ui_change_needed is True
    assert plan.api_change_needed is True
    assert plan.db_change_needed is True
    assert any("new domain concept" in message for message in plan.missing_evidence)
    assert "service-a" in changes_by_repo
    assert "web-ui" in changes_by_repo
    assert "src/pages/ContactPage.tsx" in all_possible_new_files
    assert "src/forms/ContactForm.tsx" in all_possible_new_files
    assert "src/api/contactApi.ts" in all_possible_new_files
    assert "src/main/java/com/acme/controller/ContactController.java" in all_file_paths
    assert "src/main/java/com/acme/dto/ContactRequest.java" in all_file_paths
    assert "src/main/java/com/acme/dto/ContactResponse.java" in all_file_paths
    assert "src/main/java/com/acme/service/ContactService.java" in all_file_paths
    assert "src/main/java/com/acme/entity/Contact.java" in all_file_paths
    assert "src/main/java/com/acme/repository/ContactRepository.java" in all_file_paths
    assert "new migration file" in all_possible_new_files
    assert "owner-specific" not in output_text
    assert "owner form" not in output_text
    assert "telephone" not in output_text
    assert "phone number" not in output_text


def test_existing_owner_phone_update_regression_still_uses_existing_domain_owner() -> None:
    fixture_root = Path(__file__).parent / "fixtures" / "mixed_source_stack"
    prompt = "Allow users to update their phone number from the profile screen"

    rows, _impacts, plan, proposal, _bundle = _run_pipeline(fixture_root, prompt)
    grounding = {item.concept: item.status for item in plan.concept_grounding}

    assert rows
    assert grounding["phone number"] in {"direct_match", "alias_match"}
    assert grounding["profile"] in {"direct_match", "weak_match", "alias_match"}
    assert "ungrounded_new_domain_candidate" not in grounding.values()
    assert plan.primary_owner == "service-a"
    assert plan.implementation_owner == "web-ui"
    assert plan.domain_owner == "service-a"
    assert plan.api_change_needed is True
    assert any(item.repo_name == "service-a" for item in proposal.proposed_changes)


def test_contact_us_backend_api_prompt_uses_contact_concept_not_us(tmp_path: Path) -> None:
    _seed_frontend_only_workspace(tmp_path)

    _rows, _impacts, plan, proposal, bundle = _run_pipeline(
        tmp_path,
        CONTACT_US_BACKEND_REQUEST,
    )
    grounding = {item.concept: item.status for item in plan.concept_grounding}
    paths = {
        file_plan.path
        for item in proposal.proposed_changes
        for file_plan in item.files
    }
    output_text = f"{_plan_text(plan)} {_proposal_text(proposal)}"

    assert grounding == {"contact": "ungrounded_new_domain_candidate"}
    assert "us" not in grounding
    assert set(plan.feature_intents) >= {"ui", "api"}
    assert plan.api_change_needed is True
    assert plan.db_change_needed is False
    assert bundle.summary.new_domain_candidates == ["contact"]
    assert "src/pages/ContactUsPage.tsx" in paths or "src/components/ContactUsPage.tsx" in paths
    assert "telephone" not in output_text
    assert "owner-specific" not in output_text


def test_contact_us_backend_api_prompt_in_full_stack_root_gets_backend_objects(
    tmp_path: Path,
) -> None:
    _seed_full_stack_workspace(tmp_path)

    _rows, _impacts, plan, proposal, bundle = _run_pipeline(
        tmp_path,
        CONTACT_US_BACKEND_REQUEST,
    )
    all_paths = {
        file_plan.path
        for item in proposal.proposed_changes
        for file_plan in item.files
    }
    possible_new = {
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    }

    assert set(plan.feature_intents) >= {"ui", "api"}
    assert "persistence" not in plan.feature_intents
    assert plan.primary_owner == "service-a"
    assert plan.domain_owner == "service-a"
    assert bundle.summary.backend_required is True
    assert bundle.summary.backend_available is True
    assert bundle.summary.missing_backend_required is False
    assert "src/pages/ContactUsPage.tsx" in all_paths or "src/pages/ContactUsPage.tsx" in possible_new
    assert "src/forms/ContactForm.tsx" in all_paths or "src/forms/ContactForm.tsx" in possible_new
    assert "src/api/contactApi.ts" in all_paths or "src/api/contactApi.ts" in possible_new
    assert "src/main/java/com/acme/controller/ContactController.java" in all_paths
    assert "src/main/java/com/acme/dto/ContactRequest.java" in all_paths
    assert "src/main/java/com/acme/dto/ContactResponse.java" in all_paths
    assert "src/main/java/com/acme/service/ContactService.java" in all_paths
    assert "src/main/java/com/acme/entity/Contact.java" in all_paths
    assert not any(path.endswith("ContactRepository.java") for path in all_paths)
    assert "new migration file" not in possible_new


def test_contact_us_backend_api_prompt_in_monorepo_root_gets_backend_objects(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "petclinic"
    _seed_full_stack_monorepo(repo_root)

    _rows, _impacts, plan, proposal, bundle = _run_pipeline(
        repo_root,
        CONTACT_US_BACKEND_REQUEST,
    )
    all_paths = {
        file_plan.path
        for item in proposal.proposed_changes
        for file_plan in item.files
    }
    possible_new = {
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    }
    output_text = f"{_plan_text(plan)} {_proposal_text(proposal)}"

    assert bundle.target.detected_repo_type == "full-stack/monorepo"
    assert bundle.summary.backend_required is True
    assert bundle.summary.backend_available is True
    assert bundle.summary.missing_backend_required is False
    assert plan.primary_owner == "petclinic"
    assert plan.domain_owner == "petclinic"
    assert set(plan.feature_intents) >= {"ui", "api"}
    assert "client/src/pages/ContactUsPage.tsx" in all_paths or "client/src/pages/ContactUsPage.tsx" in possible_new
    assert "client/src/forms/ContactForm.tsx" in all_paths or "client/src/forms/ContactForm.tsx" in possible_new
    assert "client/src/api/contactApi.ts" in all_paths or "client/src/api/contactApi.ts" in possible_new
    assert "src/main/java/com/acme/controller/ContactController.java" in all_paths
    assert "src/main/java/com/acme/dto/ContactRequest.java" in all_paths
    assert "src/main/java/com/acme/dto/ContactResponse.java" in all_paths
    assert "src/main/java/com/acme/service/ContactService.java" in all_paths
    assert "src/main/java/com/acme/entity/Contact.java" in all_paths
    assert "telephone" not in output_text
    assert "owner-specific" not in output_text


def test_contact_us_backend_api_prompt_with_selected_client_path_warns_about_backend(
    tmp_path: Path,
) -> None:
    repo_root = tmp_path / "petclinic"
    _seed_full_stack_monorepo(repo_root)

    _rows, _impacts, plan, proposal, bundle = _run_pipeline(
        repo_root / "client",
        CONTACT_US_BACKEND_REQUEST,
    )
    all_paths = {
        file_plan.path
        for item in proposal.proposed_changes
        for file_plan in item.files
    }
    output_text = f"{_plan_text(plan)} {_proposal_text(proposal)}"

    assert bundle.target.detected_repo_type == "frontend-only"
    assert bundle.target.selected_path == str((repo_root / "client").resolve())
    assert bundle.target.suggested_root_path == str(repo_root.resolve())
    assert bundle.summary.backend_required is True
    assert bundle.summary.backend_available is False
    assert bundle.summary.missing_backend_required is True
    assert any("frontend subfolder" in warning for warning in bundle.target.warnings)
    assert any(risk.severity == "high" for risk in bundle.risks_and_caveats)
    assert any(
        "Backend/API work requested but no backend-capable target is registered" in message
        for message in plan.missing_evidence
    )
    assert any(path.endswith("ContactUsPage.tsx") for path in all_paths)
    assert not any(path.endswith("ContactController.java") for path in all_paths)
    assert "/owners/" not in output_text
    assert "/pets/" not in output_text
    assert "/visits/" not in output_text
