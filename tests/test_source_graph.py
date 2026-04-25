import json
from pathlib import Path

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.services.architecture_discovery import ArchitectureDiscoveryService
from app.services.discovery_target_registry import DiscoveryTargetRegistry
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


def test_source_graph_cli_json_text_and_explain_node(tmp_path: Path, capsys) -> None:
    workspace = tmp_path / "workspace"
    repo = workspace / "web-ui"
    _write(repo / "client/package.json", json.dumps({"dependencies": {"react": "18.2.0"}}))
    _write(repo / "client/src/main.tsx", "import App from './components/App';\n")
    _write(repo / "client/src/components/App.tsx", "export default function App() { return null; }\n")
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
    ])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Source Graph" in captured.out
    assert "app_shell" in captured.out

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
