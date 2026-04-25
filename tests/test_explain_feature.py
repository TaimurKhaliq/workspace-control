import json
from pathlib import Path

from app.models.discovery import DiscoveryTargetRecord
from app.services.discovery_target_registry import DiscoveryTargetRegistry
from workspace_control.cli import run


def _write(path: Path, text: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _seed_petclinic_like_workspace(root: Path) -> None:
    repo = root / "spring-petclinic-fullstack"
    _write(
        repo / "pom.xml",
        """
        <project>
          <parent>
            <artifactId>spring-boot-starter-parent</artifactId>
            <version>3.2.0</version>
          </parent>
          <dependencies>
            <dependency><artifactId>spring-boot-starter-web</artifactId></dependency>
          </dependencies>
        </project>
        """,
    )
    _write(
        repo / "client/package.json",
        json.dumps(
            {
                "name": "petclinic-client",
                "dependencies": {"react": "18.2.0", "typescript": "5.0.0"},
                "scripts": {"test": "vitest", "build": "vite build"},
            }
        ),
    )
    _write(
        repo / "src/main/resources/openapi.yaml",
        "openapi: 3.0.0\npaths:\n  /owners/{ownerId}: {}\n",
    )
    _write(
        repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java",
        "class OwnerRestController { String telephone; }\n",
    )
    _write(
        repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerService.java",
        "class OwnerService { String telephone; }\n",
    )
    _write(
        repo / "src/main/java/org/springframework/samples/petclinic/owner/Owner.java",
        "class Owner { String telephone; }\n",
    )
    _write(
        repo / "src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java",
        "class OwnerRepository {}\n",
    )
    _write(
        repo / "client/src/components/owners/EditOwnerPage.tsx",
        "export function EditOwnerPage() { const telephone = ''; return null; }\n",
    )
    _write(
        repo / "client/src/components/owners/OwnerEditor.tsx",
        "export const OwnerEditor = ({ telephone }: { telephone: string }) => null;\n",
    )
    _write(
        repo / "client/src/types/index.ts",
        "export interface Owner { telephone?: string }\n",
    )


def test_explain_feature_target_id_reports_pipeline_evidence_for_petclinic_like_fixture(
    tmp_path: Path,
    capsys,
) -> None:
    workspace = tmp_path / "workspace"
    _seed_petclinic_like_workspace(workspace)
    registry_path = tmp_path / "registry.json"
    DiscoveryTargetRegistry(registry_path).register(
        DiscoveryTargetRecord(
            id="petclinic",
            source_type="local_path",
            locator=str(workspace),
        )
    )

    feature_request = "Allow users to update the owner's telephone on the owner edit screen"
    exit_code = run(
        [
            "explain-feature",
            "--target-id",
            "petclinic",
            "--registry-path",
            str(registry_path),
            feature_request,
        ]
    )
    captured = capsys.readouterr()
    explanation = json.loads(captured.out)
    repo = explanation["repositories"][0]
    grounding = {item["concept"]: item for item in explanation["feature_understanding"]["concept_grounding"]}
    proposed_paths = {item["path"] for item in explanation["top_proposed_files"]}

    assert exit_code == 0
    assert repo["repo_name"] == "spring-petclinic-fullstack"
    assert set(repo["detected_frameworks"]).issuperset({"spring_boot", "react", "openapi"})
    assert set(repo["framework_packs"]).issuperset({"spring_boot", "react", "openapi"})
    assert "client/src/components" in repo["discovered_paths"]["frontend"]
    assert "src/main/resources/openapi.yaml" in repo["discovered_paths"]["api"]
    assert "src/main/java/org/springframework/samples/petclinic/owner" in repo["discovered_paths"]["api"]
    assert set(explanation["feature_understanding"]["feature_intents"]).issuperset({"ui", "api"})
    assert grounding["owner"]["status"] == "direct_match"
    assert grounding["telephone"]["status"] == "direct_match"
    assert all(len(term) <= 120 for item in grounding.values() for term in item["matched_terms"])
    assert explanation["feature_understanding"]["unsupported_intents"] == []
    assert explanation["owner_decisions"] == {
        "primary_owner": "spring-petclinic-fullstack",
        "implementation_owner": "spring-petclinic-fullstack",
        "domain_owner": "spring-petclinic-fullstack",
    }
    assert "client/src/components/owners/EditOwnerPage.tsx" in proposed_paths
    assert "client/src/components/owners/OwnerEditor.tsx" in proposed_paths
    assert (
        "src/main/java/org/springframework/samples/petclinic/owner/OwnerRestController.java"
        in proposed_paths
    )
    assert any(
        item["action"] == "modify"
        and item["confidence"] == "high"
        and item["reason"]
        for item in explanation["top_proposed_files"]
    )
    assert isinstance(explanation["missing_evidence"], list)
    assert explanation["evidence_sources"]["explicit_metadata"] == []
    assert explanation["evidence_sources"]["inferred_metadata"] == [
        "spring-petclinic-fullstack"
    ]
    assert explanation["evidence_sources"]["source_discovery"] == [
        "spring-petclinic-fullstack"
    ]
    assert explanation["evidence_sources"]["framework_pack"][
        "spring-petclinic-fullstack"
    ]
    assert explanation["evidence_sources"]["concept_grounding"]
