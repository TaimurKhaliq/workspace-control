import json
from pathlib import Path

from app.discovery.services.framework_detector import FrameworkDetector
from app.discovery.services.framework_pack_loader import FrameworkPackLoader
from app.models.discovery import DiscoveryTarget, MaterializedWorkspace
from app.services.architecture_discovery import ArchitectureDiscoveryService
from workspace_control.cli import run


def _workspace(root: Path) -> MaterializedWorkspace:
    return MaterializedWorkspace(
        target=DiscoveryTarget.local_path(root),
        root_path=root,
        provider="local_path",
    )


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_framework_detector_detects_spring_boot_from_gradle(tmp_path: Path) -> None:
    repo = tmp_path / "service-a"
    _write(
        repo / "build.gradle",
        'plugins { id "org.springframework.boot" version "3.2.0" }\n',
    )

    detections = FrameworkDetector().detect(_workspace(tmp_path))
    descriptor = detections["service-a"][0]

    assert descriptor.name == "spring_boot"
    assert descriptor.version == "3.2.0"
    assert descriptor.source == "build.gradle"
    assert descriptor.confidence == "high"


def test_framework_detector_detects_react_from_nested_client_package_json(
    tmp_path: Path,
) -> None:
    repo = tmp_path / "web-ui"
    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}}),
    )

    detections = FrameworkDetector().detect(_workspace(tmp_path))
    descriptor = detections["web-ui"][0]

    assert descriptor.name == "react"
    assert descriptor.version == "18.2.0"
    assert descriptor.source == "client/package.json"
    assert descriptor.confidence == "high"


def test_framework_detector_detects_openapi_from_contract_file(tmp_path: Path) -> None:
    repo = tmp_path / "profile-api"
    _write(repo / "openapi.yml", "openapi: 3.1.0\n")

    detections = FrameworkDetector().detect(_workspace(tmp_path))
    descriptor = detections["profile-api"][0]

    assert descriptor.name == "openapi"
    assert descriptor.version == "3.1.0"
    assert descriptor.source == "openapi.yml"
    assert descriptor.confidence == "high"


def test_framework_pack_loader_loads_local_packs() -> None:
    pack = FrameworkPackLoader().load("react")

    assert pack is not None
    assert pack.name == "react"
    assert "component" in pack.frontend_node_kinds
    assert "client/src/components" in pack.common_path_roots["ui"]


def test_mixed_full_stack_discovery_carries_framework_descriptors_and_packs(
    tmp_path: Path,
    capsys,
) -> None:
    repo = tmp_path / "petclinic"
    _write(
        repo / "pom.xml",
        """
        <project>
          <parent>
            <artifactId>spring-boot-starter-parent</artifactId>
            <version>3.2.1</version>
          </parent>
          <dependencies>
            <dependency><artifactId>spring-boot-starter-web</artifactId></dependency>
          </dependencies>
        </project>
        """,
    )
    _write(
        repo / "client/package.json",
        json.dumps({"dependencies": {"react": "18.2.0"}}),
    )
    _write(repo / "src/main/java/com/example/petclinic/controller/OwnerController.java")
    _write(repo / "src/main/java/com/example/petclinic/service/OwnerService.java")
    _write(repo / "client/src/components/owners/EditOwnerPage.tsx")
    _write(repo / "src/main/resources/openapi.yaml", "openapi: 3.0.3\n")

    snapshot = ArchitectureDiscoveryService().discover(DiscoveryTarget.local_path(tmp_path))
    repo_discovery = snapshot.report.repos[0]

    assert set(repo_discovery.detected_frameworks) == {"spring_boot", "react", "openapi"}
    assert set(repo_discovery.loaded_framework_packs) == {"spring_boot", "react", "openapi"}
    assert {item.name for item in repo_discovery.framework_detections} == {
        "spring_boot",
        "react",
        "openapi",
    }
    assert "client/src/components" in repo_discovery.likely_ui_locations
    assert "src/main/resources/openapi.yaml" in repo_discovery.likely_api_locations

    exit_code = run(["discover-architecture", "--scan-root", str(tmp_path)])
    captured = capsys.readouterr()

    assert exit_code == 0
    assert "framework detections:" in captured.out
    assert "spring_boot 3.2.1 (detected, high, pom.xml)" in captured.out
    assert "react 18.2.0 (detected, high, client/package.json)" in captured.out
    assert "openapi 3.0.3 (detected, high, src/main/resources/openapi.yaml)" in captured.out
    assert "framework packs loaded:" in captured.out
