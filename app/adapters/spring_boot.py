"""Spring Boot adapter for backend Java service hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class SpringBootAdapter(ArchitectureAdapter):
    """Detects repositories likely built with Spring Boot conventions."""

    name = "spring_boot"

    def collect(self, repo_name: str, manifest: RepoManifest) -> list[Evidence]:
        normalized = normalize_text(
            [
                manifest.type,
                manifest.language,
                *manifest.build_commands,
                *manifest.test_commands,
                *manifest.api_keywords,
            ]
        )
        looks_java = manifest.language.lower() == "java"
        spring_signals = any(token in normalized for token in ("spring", "gradle", "maven", "boot"))
        if not (looks_java and spring_signals):
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="spring-boot-service",
                weight=3,
                details={"language": manifest.language},
            )
        ]
