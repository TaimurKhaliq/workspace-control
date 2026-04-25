import json
from pathlib import Path

from workspace_control.analyze import analyze_feature
from workspace_control.cli import run
from workspace_control.manifests import build_inventory
from workspace_control.models import ChangeProposalItem
from workspace_control.propose import create_change_proposal

FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "mixed_source_stack"


def _write_manifest(
    root: Path,
    repo_name: str,
    repo_type: str,
    domain: str,
    language: str,
    build_commands: list[str],
    test_commands: list[str],
    owns_entities: list[str] | None = None,
    owns_fields: list[str] | None = None,
    owns_tables: list[str] | None = None,
    api_keywords: list[str] | None = None,
) -> None:
    owns_entities = owns_entities or []
    owns_fields = owns_fields or []
    owns_tables = owns_tables or []
    api_keywords = api_keywords or []

    lines = [
        f"type: {repo_type}",
        f"language: {language}",
        f"domain: {domain}",
        "build_commands:",
        *[f"  - {command}" for command in build_commands],
        "test_commands:",
        *[f"  - {command}" for command in test_commands],
        f"owns_entities: {owns_entities if owns_entities else []}",
        f"owns_fields: {owns_fields if owns_fields else []}",
        f"owns_tables: {owns_tables if owns_tables else []}",
        f"api_keywords: {api_keywords if api_keywords else []}",
    ]
    manifest_path = root / repo_name / "stackpilot.yml"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def _seed_proposal_workspace(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
        api_keywords=["profile settings page"],
    )
    _write_manifest(
        tmp_path,
        repo_name="profile-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["phone_number"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile update", "customer profile endpoint"],
    )
    _write_manifest(
        tmp_path,
        repo_name="notification-sync",
        repo_type="backend-service",
        domain="profile-notifications",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        api_keywords=[
            "publish event",
            "downstream integration",
            "subscriber",
            "notify customer",
        ],
    )

    for path in [
        "profile-api/src/main/java/com/acme/profile/controller",
        "profile-api/src/main/java/com/acme/profile/service",
        "profile-api/src/main/java/com/acme/profile/dto",
        "profile-api/src/main/java/com/acme/profile/entity",
        "profile-api/src/main/java/com/acme/profile/repository",
        "profile-api/src/main/java/com/acme/profile/events",
        "profile-api/src/main/resources/db/migration",
        "notification-sync/src/main/java/com/acme/notification/events",
        "notification-sync/src/main/java/com/acme/notification/integration",
        "web-ui/src/pages",
        "web-ui/src/components",
        "web-ui/src/forms",
        "web-ui/src/services",
        "web-ui/src/api",
    ]:
        (tmp_path / path).mkdir(parents=True, exist_ok=True)

    (tmp_path / "profile-api/src/main/resources/openapi.yaml").write_text(
        "openapi: 3.0.0",
        encoding="utf-8",
    )


def _seed_public_repo_like_proposal_workspace(tmp_path: Path) -> None:
    repo = tmp_path / "spring-petclinic-fullstack"
    (repo / "src/main/java/org/springframework/samples/petclinic/owner").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/rest/controller").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/pet").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/vet").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/visit").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/specialty").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/root").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/user").mkdir(
        parents=True,
        exist_ok=True,
    )
    (repo / "client/src/components/owners").mkdir(parents=True, exist_ok=True)
    (repo / "client/src/components/pets").mkdir(parents=True, exist_ok=True)
    (repo / "client/src/components/vets").mkdir(parents=True, exist_ok=True)
    (repo / "client/src/components/visits").mkdir(parents=True, exist_ok=True)
    (repo / "client/src/types").mkdir(parents=True, exist_ok=True)
    (repo / "src/main/resources").mkdir(parents=True, exist_ok=True)

    (repo / "pom.xml").write_text(
        "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
        encoding="utf-8",
    )
    (repo / "client/package.json").write_text(
        json.dumps(
            {
                "name": "petclinic-client",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
        encoding="utf-8",
    )
    (repo / "src/main/resources/openapi.yaml").write_text(
        "paths:\n  /owners/{ownerId}:\n    put:\n      operationId: updateOwner\n",
        encoding="utf-8",
    )

    owner_files = {
        "OwnerRestController.java": "class OwnerRestController { private String telephone; }",
        "OwnerRequest.java": "class OwnerRequest { private String telephone; }",
        "OwnerResponse.java": "class OwnerResponse { private String telephone; }",
        "OwnerService.java": "class OwnerService { private String telephone; }",
        "Owner.java": "class Owner { private String telephone; }",
        "OwnerRepository.java": "class OwnerRepository {}",
    }
    for filename, text in owner_files.items():
        (repo / "src/main/java/org/springframework/samples/petclinic/owner" / filename).write_text(
            text,
            encoding="utf-8",
        )

    for relative in [
        "rest/controller/PetRestController.java",
        "rest/controller/PetTypeRestController.java",
        "rest/controller/VetRestController.java",
        "rest/controller/VisitRestController.java",
        "rest/controller/SpecialtyRestController.java",
        "rest/controller/RootRestController.java",
        "rest/controller/UserRestController.java",
    ]:
        (repo / "src/main/java/org/springframework/samples/petclinic" / relative).write_text(
            "class UnrelatedController {}",
            encoding="utf-8",
        )

    (repo / "client/src/components/owners/EditOwnerPage.tsx").write_text(
        "export function EditOwnerPage() { const telephone = ''; return null; }\n",
        encoding="utf-8",
    )
    (repo / "client/src/components/owners/OwnerEditor.tsx").write_text(
        "export const OwnerEditor = ({ telephone }: { telephone: string }) => null;\n",
        encoding="utf-8",
    )
    (repo / "client/src/components/owners/NewOwnerPage.tsx").write_text(
        "export function NewOwnerPage() { return null; }\n",
        encoding="utf-8",
    )
    (repo / "client/src/components/owners/OwnerInformation.tsx").write_text(
        "export function OwnerInformation() { const telephone = ''; return null; }\n",
        encoding="utf-8",
    )
    (repo / "client/src/types/index.ts").write_text(
        "export interface Owner { telephone?: string }\n",
        encoding="utf-8",
    )
    for relative in [
        "pets/NewPetPage.tsx",
        "pets/PetEditor.tsx",
        "vets/VetList.tsx",
        "visits/VisitList.tsx",
    ]:
        (repo / "client/src/components" / relative).write_text(
            "export const Unrelated = () => null;\n",
            encoding="utf-8",
        )


def _seed_petclinic_like_ui_shell_workspace(tmp_path: Path) -> None:
    repo = tmp_path / "spring-petclinic-reactjs"
    for path in [
        "client/src/components",
        "client/public/images",
        "src/main/java/org/springframework/samples/petclinic/web/api",
    ]:
        (repo / path).mkdir(parents=True, exist_ok=True)

    (repo / "pom.xml").write_text(
        "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
        encoding="utf-8",
    )
    (repo / "client/package.json").write_text(
        json.dumps(
            {
                "name": "petclinic-client",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
        encoding="utf-8",
    )
    files = {
        "client/src/main.tsx": "import App from './components/App';\n",
        "client/src/components/App.tsx": "export default function App() { return null; }\n",
        "client/src/components/WelcomePage.tsx": "export function WelcomePage() { return null; }\n",
        "client/src/components/NotFoundPage.tsx": "export function NotFoundPage() { return null; }\n",
        "client/public/index.html": "<div id=\"root\"></div>\n",
        "client/public/images/logo.svg": "<svg />\n",
        "src/main/java/org/springframework/samples/petclinic/web/api/OwnerController.java": "class OwnerController {}\n",
    }
    for relative, text in files.items():
        (repo / relative).parent.mkdir(parents=True, exist_ok=True)
        (repo / relative).write_text(text, encoding="utf-8")


def _seed_petclinic_like_page_add_workspace(tmp_path: Path) -> None:
    repo = tmp_path / "spring-petclinic-reactjs"
    for path in [
        "client/src/components/owners",
        "client/src/types",
        "src/main/java/org/springframework/samples/petclinic/owner",
    ]:
        (repo / path).mkdir(parents=True, exist_ok=True)

    (repo / "pom.xml").write_text(
        "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
        encoding="utf-8",
    )
    (repo / "client/package.json").write_text(
        json.dumps(
            {
                "name": "petclinic-client",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
        encoding="utf-8",
    )
    (repo / "client/src/configureRoutes.tsx").write_text(
        "const ownerRoutes = [{ path: '/owners', component: 'FindOwnersPage' }];\n",
        encoding="utf-8",
    )
    (repo / "client/src/components/owners/FindOwnersPage.tsx").write_text(
        "export function FindOwnersPage() { return null; }\n",
        encoding="utf-8",
    )
    (repo / "client/src/types/index.ts").write_text(
        "export interface Owner { id: string }\n",
        encoding="utf-8",
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java").write_text(
        "class OwnerRestController {}\n",
        encoding="utf-8",
    )
    (repo / "src/main/java/org/springframework/samples/petclinic/owner/Owner.java").write_text(
        "class Owner {}\n",
        encoding="utf-8",
    )


def _proposal_by_repo(proposal):
    return {item.repo_name: item for item in proposal.proposed_changes}


def _file_by_path(item):
    return {file_plan.path: file_plan for file_plan in item.files}


def test_propose_changes_event_publishing_feature(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = (
        "Whenever customer profile phone number changes, publish event for downstream sync"
    )
    rows = build_inventory(tmp_path)
    impacts = analyze_feature(feature_request, rows, scan_root=tmp_path)
    proposal = create_change_proposal(
        feature_request,
        rows,
        impacts=impacts,
        scan_root=tmp_path,
    )
    by_repo = _proposal_by_repo(proposal)

    primary = by_repo["profile-api"]
    downstream = by_repo["notification-sync"]

    assert primary.role == "primary-owner"
    assert downstream.role == "possible-downstream"
    assert "src/main/java/com/acme/profile/events" in primary.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/service" in primary.likely_files_to_inspect
    assert any("publish logic" in change for change in primary.likely_changes)
    assert primary.possible_new_files == [
        "new event payload class",
        "new publisher/producer class",
    ]
    assert any("integration" in path for path in downstream.likely_files_to_inspect)
    assert downstream.possible_new_files == ["new consumer/handler class"]


def test_propose_changes_ui_and_persistence_feature(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = (
        "Add phone number field to the customer profile settings form "
        "and persist it to database"
    )
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)

    backend = by_repo["profile-api"]
    frontend = by_repo["web-ui"]

    assert backend.role == "primary-owner"
    assert frontend.role == "direct-dependent"
    assert "src/main/resources/db/migration" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/entity" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/repository" in backend.likely_files_to_inspect
    assert backend.possible_new_files == [
        "new request DTO",
        "new response DTO",
        "new migration file",
    ]
    assert "src/pages" in frontend.likely_files_to_inspect
    assert "src/forms" in frontend.likely_files_to_inspect
    assert "src/api" in frontend.likely_files_to_inspect
    assert frontend.possible_new_files == [
        "new UI form component",
        "new client API helper",
    ]


def test_propose_changes_backend_only_api_feature(tmp_path: Path, capsys) -> None:
    _seed_proposal_workspace(tmp_path)

    feature_request = "Update customer profile phone number API request validation"
    exit_code = run(["propose-changes", feature_request, "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()
    parsed = json.loads(captured.out)
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)
    backend = by_repo["profile-api"]

    assert exit_code == 0
    assert parsed["feature_request"] == feature_request
    assert "proposed_changes" in parsed
    assert "web-ui" not in by_repo
    assert backend.role == "primary-owner"
    assert "src/main/resources/openapi.yaml" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/controller" in backend.likely_files_to_inspect
    assert "src/main/java/com/acme/profile/dto" in backend.likely_files_to_inspect
    assert any("API request/response contract" in change for change in backend.likely_changes)
    assert any("validation flow" in change for change in backend.likely_changes)


def test_propose_changes_prefers_specific_backend_file_names(tmp_path: Path) -> None:
    _seed_proposal_workspace(tmp_path)

    for path in [
        "profile-api/src/main/java/com/acme/profile/controller/CustomerProfileController.java",
        "profile-api/src/main/java/com/acme/profile/service/CustomerProfileService.java",
        "profile-api/src/main/java/com/acme/profile/entity/CustomerProfile.java",
        "profile-api/src/main/java/com/acme/profile/repository/CustomerProfileRepository.java",
    ]:
        (tmp_path / path).write_text("class Placeholder {}", encoding="utf-8")

    feature_request = (
        "Update customer profile phone number API request validation and "
        "persist field to database"
    )
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    backend = _proposal_by_repo(proposal)["profile-api"]

    expected_files = [
        "src/main/java/com/acme/profile/controller/CustomerProfileController.java",
        "src/main/java/com/acme/profile/service/CustomerProfileService.java",
        "src/main/java/com/acme/profile/entity/CustomerProfile.java",
        "src/main/java/com/acme/profile/repository/CustomerProfileRepository.java",
    ]
    for expected_file in expected_files:
        assert expected_file in backend.likely_files_to_inspect

    assert "src/main/java/com/acme/profile/controller" not in (
        backend.likely_files_to_inspect
    )
    assert "ownership hints for fields" in backend.rationale
    assert "discovered frameworks" in backend.rationale
    assert "Concrete files were inferred" in backend.rationale


def test_propose_changes_source_discovered_ui_persistence_stays_conservative() -> None:
    feature_request = (
        "Add a phone number field to the profile screen and persist it for each customer"
    )
    rows = build_inventory(FIXTURE_ROOT)
    proposal = create_change_proposal(feature_request, rows, scan_root=FIXTURE_ROOT)
    by_repo = _proposal_by_repo(proposal)

    backend = by_repo["service-a"]
    frontend = by_repo["web-ui"]
    all_new_files = [
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    ]

    assert backend.likely_files_to_inspect[:6] == [
        "src/main/java/com/example/servicea/controller/ProfileController.java",
        "src/main/java/com/example/servicea/dto/ProfileRequest.java",
        "src/main/resources/openapi.yaml",
        "src/main/java/com/example/servicea/service/ProfileService.java",
        "src/main/java/com/example/servicea/repository/UserProfileRepository.java",
        "src/main/java/com/example/servicea/entity/UserProfile.java",
    ]
    assert "src/main/java/com/example/servicea/controller" not in (
        backend.likely_files_to_inspect
    )
    assert "src/main/java/com/example/servicea/dto" not in backend.likely_files_to_inspect
    assert "src/main/resources/db/migration" in backend.likely_files_to_inspect
    assert frontend.likely_files_to_inspect[0] == "src/components/ProfileForm.tsx"
    assert "src/components" not in frontend.likely_files_to_inspect
    assert backend.possible_new_files == [
        "new request DTO",
        "new response DTO",
        "new migration file",
    ]
    assert frontend.possible_new_files == [
        "new UI form component",
        "new client API helper",
    ]
    assert not any("AddPhoneNumberFieldProfile" in path for path in all_new_files)
    assert not any("add-phone-number-field-profile" in path for path in all_new_files)


def test_propose_changes_grounded_public_repo_case_filters_unrelated_domains(
    tmp_path: Path,
) -> None:
    _seed_public_repo_like_proposal_workspace(tmp_path)

    feature_request = "Allow users to update the owner's telephone on the owner edit screen"
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    item = _proposal_by_repo(proposal)["spring-petclinic-fullstack"]
    inspect_paths = item.likely_files_to_inspect
    files = _file_by_path(item)
    frontend_paths = [
        path for path in inspect_paths if path.startswith("client/")
    ]
    backend_paths = [
        path
        for path in inspect_paths
        if path.startswith("src/main/java/")
    ]
    shared_paths = [
        path
        for path in inspect_paths
        if any(token in path.lower() for token in ("openapi", "swagger", "schema"))
    ]

    assert "client/src/components/owners/EditOwnerPage.tsx" in inspect_paths
    assert "client/src/components/owners/OwnerEditor.tsx" in inspect_paths
    assert files["client/src/components/owners/EditOwnerPage.tsx"].action == "modify"
    assert files["client/src/components/owners/EditOwnerPage.tsx"].confidence == "high"
    assert (
        files["client/src/components/owners/EditOwnerPage.tsx"].reason
        == "Feature explicitly mentions the owner edit screen, and this page likely owns the edit flow."
    )
    assert files["client/src/components/owners/OwnerEditor.tsx"].action == "modify"
    assert files["client/src/components/owners/OwnerEditor.tsx"].confidence == "high"
    assert (
        files["client/src/components/owners/OwnerEditor.tsx"].reason
        == "Likely owner form component where telephone input and validation are handled."
    )
    assert "client/src/components/owners/NewOwnerPage.tsx" in inspect_paths
    assert files["client/src/components/owners/NewOwnerPage.tsx"].action == "inspect"
    assert files["client/src/components/owners/NewOwnerPage.tsx"].confidence == "medium"
    assert (
        files["client/src/components/owners/NewOwnerPage.tsx"].reason
        == "May share owner form behavior with the edit flow, but the feature specifically targets editing existing owners."
    )
    assert "client/src/components/owners/OwnerInformation.tsx" in inspect_paths
    assert files["client/src/components/owners/OwnerInformation.tsx"].action == "inspect"
    assert files["client/src/components/owners/OwnerInformation.tsx"].confidence == "medium"
    assert (
        files["client/src/components/owners/OwnerInformation.tsx"].reason
        == "Same owner domain and may display the telephone field after update, but the request specifically targets the edit screen."
    )
    assert (
        "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java"
        in inspect_paths
    )
    assert (
        "src/main/java/org/springframework/samples/petclinic/owner/OwnerService.java"
        in inspect_paths
    )
    assert (
        "src/main/java/org/springframework/samples/petclinic/owner/OwnerRequest.java"
        in inspect_paths
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java"
        ].action
        == "modify"
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java"
        ].confidence
        == "high"
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java"
        ].reason
        == "Owner-specific REST controller likely handles update requests for owner fields."
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/Owner.java"
        ].action
        == "inspect"
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/Owner.java"
        ].confidence
        == "medium"
    )
    assert (
        files[
            "src/main/java/org/springframework/samples/petclinic/owner/Owner.java"
        ].reason
        == "Owner telephone may already exist on the domain model; inspect for validation or serialization behavior."
    )
    mismatch_paths = [
        "src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java",
        "src/main/java/org/springframework/samples/petclinic/rest/controller/PetTypeRestController.java",
        "client/src/components/pets/NewPetPage.tsx",
    ]
    for mismatch_path in mismatch_paths:
        if mismatch_path not in files:
            continue
        assert files[mismatch_path].action == "inspect-only"
        assert files[mismatch_path].confidence == "low"
        assert "Owner-specific" not in files[mismatch_path].reason
        assert "owner-specific" not in files[mismatch_path].reason
    assert not any(
        file_plan.action == "modify" and file_plan.confidence == "high"
        for path, file_plan in files.items()
        if (
            "PetRestController" in path
            or "PetTypeRestController" in path
            or "NewPetPage" in path
        )
    )
    assert not any(
        "owner-specific" in file_plan.reason.lower()
        for path, file_plan in files.items()
        if "/pets/" in path.lower()
        or "PetRestController" in Path(path).name
        or "PetTypeRestController" in Path(path).name
        or "NewPetPage" in Path(path).name
    )
    assert not any(
        file_plan.path in {"new UI form component", "new client API helper"}
        for file_plan in item.files
    )
    assert item.possible_new_files == []
    assert item.likely_files_to_inspect == [
        file_plan.path
        for file_plan in item.files
        if file_plan.action != "create"
    ]
    assert not any(
        file_plan.reason == "Strong feature, concept, and path evidence points to this file."
        for file_plan in item.files
    )
    assert "tokens:" not in item.rationale
    assert "inferred_metadata" not in item.rationale
    assert len(frontend_paths) <= 5
    assert len(backend_paths) <= 6
    assert len(shared_paths) <= 2
    assert not any(
        token in path.lower()
        for path in inspect_paths
        for token in (
            "/pet/",
            "/pets/",
            "/rest/controller/pet",
            "/root/",
            "/vet/",
            "/vets/",
            "/visit/",
            "/visits/",
        )
    )
    assert not any(
        token in path
        for path in inspect_paths
        for token in (
            "PetRestController",
            "PetTypeRestController",
            "RootRestController",
            "VetRestController",
            "VisitRestController",
        )
    )


def test_ui_shell_landing_page_request_prefers_shell_entrypoint_and_public_files(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_petclinic_like_ui_shell_workspace(tmp_path)

    feature_request = "Add Layout and Welcome page"
    exit_code = run(["plan-feature", feature_request, "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()
    plan = json.loads(captured.out)
    repo_name = "spring-petclinic-reactjs"

    assert exit_code == 0
    assert "ui" in plan["feature_intents"]
    assert plan["implementation_owner"] == repo_name
    assert "client/src/components/WelcomePage.tsx" in plan["likely_paths_by_repo"][repo_name]
    assert "client/src/components/App.tsx" in plan["likely_paths_by_repo"][repo_name]
    assert "client/src/main.tsx" in plan["likely_paths_by_repo"][repo_name]
    assert "client/public/index.html" in plan["likely_paths_by_repo"][repo_name]
    assert not any(
        path.startswith("src/main/java")
        for path in plan["likely_paths_by_repo"][repo_name]
    )

    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    item = _proposal_by_repo(proposal)[repo_name]
    files = _file_by_path(item)

    assert "client/src/components/WelcomePage.tsx" in item.likely_files_to_inspect
    assert "client/src/components/App.tsx" in item.likely_files_to_inspect
    assert "client/src/main.tsx" in item.likely_files_to_inspect
    assert "client/public/index.html" in item.likely_files_to_inspect
    assert "client/public/images" in item.likely_files_to_inspect
    assert "client/src/components/NotFoundPage.tsx" not in item.likely_files_to_inspect
    assert not any(path.startswith("src/main/java") for path in item.likely_files_to_inspect)
    assert files["client/src/components/WelcomePage.tsx"].action == "modify"
    assert files["client/src/components/WelcomePage.tsx"].confidence == "high"
    assert files["client/src/components/App.tsx"].action == "modify"
    assert files["client/src/components/App.tsx"].confidence == "high"
    assert files["client/src/main.tsx"].action == "inspect"
    assert files["client/public/index.html"].action == "inspect"
    assert files["client/public/images"].action == "inspect-only"
    assert item.possible_new_files == []


def test_ui_page_add_identifier_request_proposes_new_page_and_route_wiring(
    tmp_path: Path,
    capsys,
) -> None:
    _seed_petclinic_like_page_add_workspace(tmp_path)

    feature_request = "Add OwnersPage (no actions yet)"
    exit_code = run(["plan-feature", feature_request, "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()
    plan = json.loads(captured.out)
    repo_name = "spring-petclinic-reactjs"

    assert exit_code == 0
    assert "ui" in plan["feature_intents"]
    assert plan["implementation_owner"] == repo_name
    assert plan["ui_change_needed"] is True
    assert plan["api_change_needed"] is False
    assert plan["db_change_needed"] is False
    assert not any(
        path.startswith("src/main/java")
        for path in plan["likely_paths_by_repo"][repo_name]
    )

    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    item = _proposal_by_repo(proposal)[repo_name]
    files = _file_by_path(item)

    assert "client/src/components/owners/OwnersPage.tsx" in files
    assert files["client/src/components/owners/OwnersPage.tsx"].action == "create"
    assert "client/src/components/owners/OwnersPage.tsx" in item.possible_new_files
    assert "client/src/configureRoutes.tsx" in item.likely_files_to_inspect
    assert files["client/src/configureRoutes.tsx"].action in {"modify", "inspect"}
    assert not any(path.startswith("src/main/java") for path in item.likely_files_to_inspect)
    assert item.possible_new_files == ["client/src/components/owners/OwnersPage.tsx"]


def test_change_proposal_item_normalizes_legacy_file_strings_into_file_objects() -> None:
    item = ChangeProposalItem.model_validate(
        {
            "repo_name": "service-a",
            "role": "primary-owner",
            "likely_files_to_inspect": ["src/service/ProfileService.java"],
            "likely_changes": [],
            "possible_new_files": [],
            "rationale": "legacy",
        }
    )

    assert len(item.files) == 1
    assert item.files[0].path == "src/service/ProfileService.java"
    assert item.files[0].action == "inspect"
    assert item.files[0].confidence == "medium"
    assert (
        item.files[0].reason
        == "Legacy file suggestion without detailed classification."
    )


def test_propose_changes_metadata_only_repo_stays_conservative(tmp_path: Path) -> None:
    _write_manifest(
        tmp_path,
        repo_name="profile-api",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["phone_number"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile endpoint"],
    )

    feature_request = "Update customer profile phone number API request"
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    backend = _proposal_by_repo(proposal)["profile-api"]

    assert "stackpilot.yml" in backend.likely_files_to_inspect
    assert "src/main/java/controller" in backend.likely_files_to_inspect
    assert "src/main/java/service" in backend.likely_files_to_inspect
    assert all("*" not in path for path in backend.likely_files_to_inspect)
    assert backend.possible_new_files == []
    assert "metadata-only mode" in backend.rationale
    assert "manifest hints" in backend.rationale


def test_propose_changes_mutable_domain_field_metadata_only_keeps_two_owners(
    tmp_path: Path,
) -> None:
    _write_manifest(
        tmp_path,
        repo_name="web-ui",
        repo_type="frontend",
        domain="customer-profile",
        language="typescript",
        build_commands=["npm run build"],
        test_commands=["npm test"],
        api_keywords=["profile screen"],
    )
    _write_manifest(
        tmp_path,
        repo_name="service-a",
        repo_type="backend-service",
        domain="customer-profile",
        language="java",
        build_commands=["./gradlew build"],
        test_commands=["./gradlew test"],
        owns_entities=["customer_profile"],
        owns_fields=["phone_number"],
        owns_tables=["customer_profiles"],
        api_keywords=["profile update"],
    )

    feature_request = "Allow users to update their phone number from the profile screen"
    rows = build_inventory(tmp_path)
    proposal = create_change_proposal(feature_request, rows, scan_root=tmp_path)
    by_repo = _proposal_by_repo(proposal)

    assert proposal.implementation_owner == "web-ui"
    assert proposal.domain_owner == "service-a"
    assert set(proposal.feature_intents).issuperset({"ui", "api"})
    assert set(by_repo) == {"service-a", "web-ui"}
    assert by_repo["service-a"].possible_new_files == []
    assert by_repo["web-ui"].possible_new_files == []
    assert "metadata-only mode" in by_repo["service-a"].rationale
    assert "manifest hints" in by_repo["web-ui"].rationale


def test_propose_changes_source_discovered_event_avoids_literal_new_files() -> None:
    feature_request = (
        "When a user updates their preferred language, publish a profile-updated "
        "event to downstream systems"
    )
    rows = build_inventory(FIXTURE_ROOT)
    proposal = create_change_proposal(feature_request, rows, scan_root=FIXTURE_ROOT)
    by_repo = _proposal_by_repo(proposal)

    assert set(by_repo) == {"service-a", "service-b"}

    all_inspect_paths = [
        path
        for item in proposal.proposed_changes
        for path in item.likely_files_to_inspect
    ]
    all_new_files = [
        path
        for item in proposal.proposed_changes
        for path in item.possible_new_files
    ]

    assert "stackpilot.yml" not in all_inspect_paths
    assert all("*" not in path for path in all_inspect_paths)
    assert all("**" not in path for path in all_inspect_paths)
    assert "src/main/java/com/example/servicea/service/ProfileService.java" in (
        by_repo["service-a"].likely_files_to_inspect
    )
    assert "src/main/java/com/example/serviceb/events/ProfileEventConsumer.java" in (
        by_repo["service-b"].likely_files_to_inspect
    )
    assert by_repo["service-a"].possible_new_files == [
        "new event payload class",
        "new publisher/producer class",
    ]
    assert not any("UserUpdatesPreferredLanguage" in path for path in all_new_files)
    assert not any("WhenAUserUpdates" in path for path in all_new_files)
