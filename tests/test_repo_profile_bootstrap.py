import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.repo_profile_bootstrap import RepoProfileBootstrapService
from workspace_control.cli import run
from workspace_control.manifests import build_inventory

FIXTURE_ROOT = Path(__file__).parent / "fixtures"


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_source_only_profile_workspace(root: Path) -> None:
    api = root / "profile-api"
    _write(
        api / "build.gradle",
        'plugins { id "org.springframework.boot" version "3.2.0" }\n'
        'dependencies { implementation "org.flywaydb:flyway-core" }\n',
    )
    _write(api / "src/main/java/com/acme/profile/controller/ProfileController.java")
    _write(api / "src/main/java/com/acme/profile/dto/PreferredLanguageRequest.java")
    _write(api / "src/main/java/com/acme/profile/dto/PreferredLanguageResponse.java")
    _write(api / "src/main/java/com/acme/profile/service/ProfileService.java")
    _write(api / "src/main/java/com/acme/profile/entity/CustomerProfile.java")
    _write(api / "src/main/java/com/acme/profile/repository/CustomerProfileRepository.java")
    _write(api / "src/main/resources/db/migration/V1__create_customer_profile.sql")
    _write(api / "src/main/resources/openapi.yaml", "title: Customer Profile API\n")

    ui = root / "web-ui"
    _write(
        ui / "package.json",
        json.dumps(
            {
                "name": "customer-profile-web-ui",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
    )
    _write(ui / "src/pages/ProfileScreen.tsx")
    _write(ui / "src/components/ProfileForm.tsx")
    _write(ui / "src/forms/PreferredLanguageForm.tsx")
    _write(ui / "src/api/profileClient.ts")
    _write(ui / "src/services/profileService.ts")


def _seed_public_like_workspace(root: Path) -> None:
    repo = root / "spring-petclinic-reactjs"
    _write(
        repo / "pom.xml",
        "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
    )
    _write(
        repo / "package.json",
        json.dumps(
            {
                "name": "spring-petclinic-reactjs",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
    )
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerEmailRequest.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerService.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/Owner.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java")
    _write(repo / "src/pages/OwnerPage.tsx")
    _write(repo / "src/components/OwnerForm.tsx")


def _seed_public_like_backend_workspace(root: Path) -> None:
    repo = root / "spring-petclinic"
    _write(
        repo / "pom.xml",
        "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
    )
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRequest.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerResponse.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerService.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/Owner.java")
    _write(repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java")
    _write(repo / "src/main/resources/db/migration/V1__owner.sql")
    _write(repo / "src/main/resources/openapi.yaml", "title: Owner API\n")


def test_bootstrap_profiles_supplement_explicit_stackpilot_metadata() -> None:
    scan_root = FIXTURE_ROOT / "mixed_source_stack"
    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(scan_root))

    report = RepoProfileBootstrapService().bootstrap(snapshot)
    profiles = {profile.repo_name: profile for profile in report.profiles}
    effective_rows = RepoProfileBootstrapService().effective_inventory(
        build_inventory(scan_root),
        snapshot,
    )
    rows = {row.repo_name: row for row in effective_rows}

    assert profiles["service-a"].metadata_mode == "explicit-plus-inferred"
    assert profiles["service-a"].explicit_metadata_present is True
    assert "spring_boot" in profiles["service-a"].inferred_frameworks
    assert "src/main/java/com/example/servicea/controller" in profiles["service-a"].inferred_api_paths
    assert rows["service-a"].metadata_source == "stackpilot.yml"
    assert "domain service owner candidate" in rows["service-a"].api_keywords


def test_source_only_workspace_bootstraps_rows_and_plans_feature(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_source_only_profile_workspace(tmp_path)

    exit_code = run(
        [
            "bootstrap-repo-profile",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    bootstrap = json.loads(captured.out)

    assert exit_code == 0
    assert {profile["metadata_mode"] for profile in bootstrap["profiles"]} == {
        "inferred-metadata"
    }

    exit_code = run(
        [
            "plan-feature",
            "Allow users to update their preferred language from the profile screen",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    plan = json.loads(captured.out)

    assert exit_code == 0
    assert plan["primary_owner"] == "profile-api"
    assert plan["implementation_owner"] == "web-ui"
    assert plan["domain_owner"] == "profile-api"
    assert set(plan["feature_intents"]).issuperset({"ui", "api"})
    assert plan["likely_paths_by_repo"]["profile-api"]
    assert plan["likely_paths_by_repo"]["web-ui"]


def test_public_repo_like_source_shape_gets_inferred_profile_and_owner(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_public_like_workspace(tmp_path)

    exit_code = run(
        [
            "plan-feature",
            "Add a new owner email API endpoint",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    plan = json.loads(captured.out)

    assert exit_code == 0
    assert plan["primary_owner"] == "spring-petclinic-reactjs"
    assert plan["implementation_owner"] == "spring-petclinic-reactjs"
    assert "api" in plan["feature_intents"]
    assert plan["likely_paths_by_repo"]["spring-petclinic-reactjs"]

    exit_code = run(
        [
            "bootstrap-repo-profile",
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    bootstrap = json.loads(captured.out)
    profile = bootstrap["profiles"][0]

    assert exit_code == 0
    assert profile["metadata_mode"] == "inferred-metadata"
    assert set(profile["inferred_frameworks"]).issuperset({"spring_boot", "react"})
    assert "backend-service" in profile["inferred_repo_type"]
    assert "frontend" in profile["inferred_repo_type"]


def test_public_repo_like_single_repo_persisted_screen_field_flags_api_and_ui_uncertainty(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_public_like_backend_workspace(tmp_path)

    feature_request = "Add a phone number field to the owner edit screen and persist it"
    exit_code = run(
        [
            "plan-feature",
            feature_request,
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    plan = json.loads(captured.out)

    assert exit_code == 0
    assert plan["primary_owner"] == "spring-petclinic"
    assert plan["implementation_owner"] == "spring-petclinic"
    assert plan["domain_owner"] == "spring-petclinic"
    assert set(plan["feature_intents"]).issuperset({"ui", "persistence", "api"})
    assert "ui" in plan["unsupported_intents"]
    assert plan["db_change_needed"] is True
    assert plan["api_change_needed"] is True
    assert plan["ui_change_needed"] is True
    assert any(
        "no UI/component paths were discovered" in item
        for item in plan["missing_evidence"]
    )
    assert plan["confidence"] == "low"
    assert "src/main/resources/openapi.yaml" in plan["likely_paths_by_repo"]["spring-petclinic"]
    assert "src/main/java/org/springframework/samples/petclinic/owner" in plan[
        "likely_paths_by_repo"
    ]["spring-petclinic"]


def test_public_repo_like_unsupported_ui_label_change_reports_unbacked_intent(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_public_like_backend_workspace(tmp_path)

    feature_request = "Rename the telephone label on the owner edit screen"
    exit_code = run(
        [
            "plan-feature",
            feature_request,
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    plan = json.loads(captured.out)

    assert exit_code == 0
    assert "ui" in plan["feature_intents"]
    assert "ui" in plan["unsupported_intents"]
    assert plan["confidence"] == "low"
    assert plan["primary_owner"] is None
    assert plan["implementation_owner"] is None
    assert plan["domain_owner"] is None
    assert plan["likely_paths_by_repo"] == {}
    assert plan["ordered_steps"] == []


def test_public_repo_like_single_repo_api_feature_sets_domain_owner(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_public_like_backend_workspace(tmp_path)

    feature_request = "Add a new search API for owners by telephone"
    exit_code = run(
        [
            "plan-feature",
            feature_request,
            "--scan-root",
            str(tmp_path),
        ]
    )
    captured = capsys.readouterr()
    plan = json.loads(captured.out)

    assert exit_code == 0
    assert plan["primary_owner"] == "spring-petclinic"
    assert plan["implementation_owner"] == "spring-petclinic"
    assert plan["domain_owner"] == "spring-petclinic"
    assert plan["api_change_needed"] is True
