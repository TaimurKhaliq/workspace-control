import json
from pathlib import Path

from app.graph.pattern_packs.base import compact_tokens
from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.graph import build_graph_quality_report
from workspace_control.cli import run


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _node_types(snapshot, repo_name: str) -> set[str]:
    assert snapshot.source_graph is not None
    return {node.node_type for node in snapshot.source_graph.nodes if node.repo_name == repo_name}


def _nodes_by_path(snapshot, repo_name: str) -> dict[str, str]:
    assert snapshot.source_graph is not None
    return {
        node.path: node.node_type
        for node in snapshot.source_graph.nodes
        if node.repo_name == repo_name
    }


def test_source_graph_token_normalization_avoids_broken_variants() -> None:
    tokens = compact_tokens([
        "Owner address specialty named specialties addresses",
    ])

    assert "address" in tokens
    assert "specialty" in tokens
    assert "addres" not in tokens
    assert "specialtys" not in tokens
    assert "nameds" not in tokens


def test_source_graph_react_pack_classifies_frontend_surfaces(tmp_path: Path) -> None:
    repo = tmp_path / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export default function App() { return null; }\n")
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")
    _write(repo / "client/src/components/owners/EditOwnerPage.tsx", "export function EditOwnerPage() { return null; }\n")
    _write(repo / "client/src/components/owners/OwnerEditor.tsx", "export const OwnerEditor = () => null;\n")
    _write(repo / "client/src/types/index.ts", "export interface Owner { id: number }\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    nodes = _nodes_by_path(snapshot, "web-ui")

    assert nodes["client/src/main.tsx"] == "frontend_entrypoint"
    assert nodes["client/src/components/App.tsx"] == "app_shell"
    assert nodes["client/src/components/WelcomePage.tsx"] == "landing_page"
    assert nodes["client/src/components/owners/EditOwnerPage.tsx"] == "edit_surface"
    assert nodes["client/src/components/owners/OwnerEditor.tsx"] == "form_component"
    assert nodes["client/src/types/index.ts"] == "frontend_type"


def test_source_graph_react_pack_marks_validation_surfaces(tmp_path: Path) -> None:
    repo = tmp_path / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(
        repo / "client/src/components/owners/NewOwnerPage.tsx",
        "export function NewOwnerPage() { return <form><label>Owner</label><input name=\"lastName\" required aria-invalid=\"true\" /></form>; }\n",
    )
    _write(repo / "client/src/components/ErrorPage.tsx", "export function ErrorPage() { return <h1>Error</h1>; }\n")
    _write(repo / "client/src/components/NotFoundPage.tsx", "export function NotFoundPage() { return <h1>Not found</h1>; }\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    by_path = {node.path: node for node in snapshot.source_graph.nodes}

    new_owner = by_path["client/src/components/owners/NewOwnerPage.tsx"]
    assert new_owner.metadata["has_form_inputs"] == "true"
    assert new_owner.metadata["has_validation_terms"] == "true"
    assert new_owner.metadata["has_field_terms"] == "true"
    assert by_path["client/src/components/ErrorPage.tsx"].metadata["is_error_route_page"] == "true"
    assert by_path["client/src/components/NotFoundPage.tsx"].metadata["is_not_found_page"] == "true"


def test_source_graph_spring_pack_classifies_backend_surfaces(tmp_path: Path) -> None:
    repo = tmp_path / "clinic-service"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "src/main/java/com/example/clinic/OwnerRestController.java", "class OwnerRestController {}\n")
    _write(repo / "src/main/java/com/example/clinic/ClinicService.java", "class ClinicService {}\n")
    _write(repo / "src/main/java/com/example/clinic/Owner.java", "class Owner {}\n")
    _write(repo / "src/main/java/com/example/clinic/OwnerRepository.java", "class OwnerRepository {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    node_types = _node_types(snapshot, "clinic-service")

    assert "api_controller" in node_types
    assert "service_layer" in node_types
    assert "domain_model" in node_types
    assert "repository" in node_types


def test_source_graph_extracts_repository_query_metadata(tmp_path: Path) -> None:
    repo = tmp_path / "clinic-service"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(
        repo / "src/main/java/com/example/clinic/OwnerRepository.java",
        """
        interface OwnerRepository {
            @Query("select owner from Owner owner where lower(owner.lastName) like lower(:lastName)")
            java.util.Collection<Owner> findByLastName(String lastName);
        }
        """,
    )

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    node = next(
        node
        for node in snapshot.source_graph.nodes
        if node.path == "src/main/java/com/example/clinic/OwnerRepository.java"
    )

    assert node.node_type == "repository"
    assert "findByLastName" in node.metadata["method_names"]
    assert "findby" in node.metadata["query_indicators"]
    assert "lower" in node.metadata["case_insensitive_indicators"]
    assert "owner" in node.metadata["search_terms"]


def test_source_graph_extracts_sql_case_insensitive_migration_metadata(tmp_path: Path) -> None:
    repo = tmp_path / "clinic-service"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(
        repo / "src/main/resources/db/hsqldb/initDB.sql",
        "CREATE TABLE owners (id INTEGER, last_name VARCHAR_IGNORECASE(30));\n",
    )

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    node = next(
        node
        for node in snapshot.source_graph.nodes
        if node.path == "src/main/resources/db/hsqldb/initDB.sql"
    )

    assert node.node_type == "migration"
    assert "owners" in node.metadata["table_names"]
    assert "last_name" in node.metadata["column_names"]
    assert "varchar_ignorecase" in node.metadata["case_insensitive_indicators"]


def test_source_graph_spring_pack_does_not_classify_mappers_as_domain_models(tmp_path: Path) -> None:
    repo = tmp_path / "clinic-service"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "src/main/java/com/example/clinic/OwnerMapper.java", "class OwnerMapper {}\n")
    _write(repo / "src/main/java/com/example/clinic/Owner.java", "class Owner {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    nodes = _nodes_by_path(snapshot, "clinic-service")

    assert nodes["src/main/java/com/example/clinic/OwnerMapper.java"] == "mapper"
    assert nodes["src/main/java/com/example/clinic/Owner.java"] == "domain_model"


def test_source_graph_openapi_pack_classifies_contract(tmp_path: Path) -> None:
    repo = tmp_path / "api"
    _write(repo / "openapi.yml", "openapi: 3.0.0\npaths:\n  /owners: {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    node_types = _node_types(snapshot, "api")

    assert "api_contract" in node_types


def test_source_graph_petclinic_like_full_stack_edges(tmp_path: Path) -> None:
    repo = tmp_path / "petclinic"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "import { WelcomePage } from './WelcomePage';\n")
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")
    _write(repo / "client/src/components/owners/EditOwnerPage.tsx", "export function EditOwnerPage() { const owner = null; return null; }\n")
    _write(repo / "client/src/components/owners/OwnerEditor.tsx", "export const OwnerEditor = () => null;\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/OwnerRestController.java", "class OwnerRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/OwnerService.java", "class OwnerService {}\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/Owner.java", "class Owner {}\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/OwnerRepository.java", "class OwnerRepository {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    edges = snapshot.source_graph.edges

    assert any(edge.edge_type == "route_or_entrypoint_link" for edge in edges)
    assert any(edge.edge_type == "renders_or_composes" for edge in edges)
    assert any(
        edge.edge_type == "likely_frontend_backend_link" and "owner" in edge.reason
        for edge in edges
    )


def test_source_graph_preserves_strong_owner_pet_visit_links(tmp_path: Path) -> None:
    repo = tmp_path / "petclinic"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/components/owners/EditOwnerPage.tsx", "export function EditOwnerPage() { return null; }\n")
    _write(repo / "client/src/components/pets/EditPetPage.tsx", "export function EditPetPage() { return null; }\n")
    _write(repo / "client/src/components/visits/VisitsPage.tsx", "export function VisitsPage() { return null; }\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/OwnerRestController.java", "class OwnerRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Owner.java", "class Owner {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetRestController.java", "class PetRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Pet.java", "class Pet {}\n")
    _write(repo / "src/main/java/com/example/petclinic/visit/VisitRestController.java", "class VisitRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Visit.java", "class Visit {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    edge_pairs = {
        (edge.source_id, edge.target_id, edge.edge_type)
        for edge in snapshot.source_graph.edges
    }

    assert ("petclinic:client/src/components/owners/EditOwnerPage.tsx:edit_surface", "petclinic:src/main/java/com/example/petclinic/owner/OwnerRestController.java:api_controller", "likely_frontend_backend_link") in edge_pairs
    assert ("petclinic:client/src/components/pets/EditPetPage.tsx:edit_surface", "petclinic:src/main/java/com/example/petclinic/pet/PetRestController.java:api_controller", "likely_frontend_backend_link") in edge_pairs
    assert ("petclinic:client/src/components/visits/VisitsPage.tsx:page_component", "petclinic:src/main/java/com/example/petclinic/visit/VisitRestController.java:api_controller", "likely_frontend_backend_link") in edge_pairs


def test_source_graph_skips_loose_cross_domain_links(tmp_path: Path) -> None:
    repo = tmp_path / "petclinic"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/components/visits/PetDetails.tsx", "export function PetDetails() { const owner = null; return null; }\n")
    _write(repo / "src/main/java/com/example/petclinic/owner/OwnerRestController.java", "class OwnerRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/pet/PetRestController.java", "class PetRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/visit/VisitRestController.java", "class VisitRestController {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Owner.java", "class Owner {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Pet.java", "class Pet {}\n")
    _write(repo / "src/main/java/com/example/petclinic/model/Visit.java", "class Visit {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    edge_pairs = {
        (edge.source_id, edge.target_id, edge.edge_type)
        for edge in snapshot.source_graph.edges
    }

    assert ("petclinic:client/src/components/visits/PetDetails.tsx:detail_component", "petclinic:src/main/java/com/example/petclinic/owner/OwnerRestController.java:api_controller", "likely_frontend_backend_link") not in edge_pairs
    assert ("petclinic:src/main/java/com/example/petclinic/pet/PetRestController.java:api_controller", "petclinic:src/main/java/com/example/petclinic/model/Owner.java:domain_model", "api_handles_domain") not in edge_pairs
    assert ("petclinic:src/main/java/com/example/petclinic/visit/VisitRestController.java:api_controller", "petclinic:src/main/java/com/example/petclinic/model/Pet.java:domain_model", "api_handles_domain") not in edge_pairs


def test_source_graph_preserves_frontend_structural_edges(tmp_path: Path) -> None:
    repo = tmp_path / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "import { WelcomePage } from './WelcomePage';\n")
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None
    edges = snapshot.source_graph.edges

    assert any(edge.edge_type == "route_or_entrypoint_link" for edge in edges)
    assert any(edge.edge_type == "renders_or_composes" for edge in edges)


def test_source_graph_generic_tokens_do_not_create_shares_domain_token_edges(tmp_path: Path) -> None:
    repo = tmp_path / "backend"
    _write(repo / "pom.xml", "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>")
    _write(repo / "src/main/java/com/example/backend/CustomerInfoController.java", "class CustomerInfoController {}\n")
    _write(repo / "src/main/java/com/example/backend/OrderInfoController.java", "class OrderInfoController {}\n")
    _write(repo / "src/main/java/com/example/backend/CustomerBase.java", "class CustomerBase {}\n")
    _write(repo / "src/main/java/com/example/backend/OrderBase.java", "class OrderBase {}\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    assert snapshot.source_graph is not None

    noisy_medium_or_high_edges = [
        edge
        for edge in snapshot.source_graph.edges
        if edge.confidence in {"medium", "high"}
        and set(edge.metadata.get("tokens", "").split(",")) & {"info", "infos", "base", "bases"}
    ]
    assert noisy_medium_or_high_edges == []


def test_source_graph_cli_json_text_and_explain_node(tmp_path: Path, capsys) -> None:
    workspace = tmp_path / "workspace"
    repo = workspace / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export default function App() { return null; }\n")
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")
    registry_path = tmp_path / "registry.json"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(id="graph-fixture", source_type="local_path", locator=str(workspace))
    )

    exit_code = run([
        "discover-graph",
        "--target-id",
        "graph-fixture",
        "--registry-path",
        str(registry_path),
        "--format",
        "json",
    ])
    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert exit_code == 0
    assert any(node["node_type"] == "app_shell" for node in payload["nodes"])

    exit_code = run([
        "discover-graph",
        "--target-id",
        "graph-fixture",
        "--registry-path",
        str(registry_path),
        "--format",
        "text",
        "--limit",
        "1",
    ])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Source Graph" in captured.out
    assert "total nodes: 3" in captured.out
    assert "showing nodes: 1" in captured.out
    assert "total edges: 2" in captured.out
    assert "showing edges: 1" in captured.out

    exit_code = run([
        "explain-graph-node",
        "--target-id",
        "graph-fixture",
        "--registry-path",
        str(registry_path),
        "--path",
        "client/src/components/App.tsx",
    ])
    captured = capsys.readouterr()
    explanation = json.loads(captured.out)
    assert exit_code == 0
    assert explanation["node"]["node_type"] == "app_shell"
    assert "classification_reason" in explanation


def test_source_graph_quality_report_and_cli_output(tmp_path: Path, capsys) -> None:
    workspace = tmp_path / "workspace"
    repo = workspace / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export default function App() { return null; }\n")
    _write(repo / "client/src/components/WelcomePage.tsx", "export function WelcomePage() { return null; }\n")
    registry_path = tmp_path / "registry.json"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(id="quality-fixture", source_type="local_path", locator=str(workspace))
    )

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(workspace))
    assert snapshot.source_graph is not None
    report = build_graph_quality_report(snapshot.source_graph)
    assert report["total_nodes"] >= 3
    assert report["node_counts_by_node_type"]["app_shell"] == 1
    assert "edges_grouped_by_confidence" in report

    exit_code = run([
        "graph-quality",
        "--target-id",
        "quality-fixture",
        "--registry-path",
        str(registry_path),
    ])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Graph Quality" in captured.out
    assert "Node counts by node_type:" in captured.out
