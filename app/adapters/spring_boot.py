"""Spring Boot adapter for Java backend service architecture discovery."""

from pathlib import Path

from app.adapters.base import (
    RepoAdapter,
    first_existing_paths,
    manifest_hint_text,
    matching_directory_paths,
    matching_file_parent_paths,
    merge_paths,
    read_text_if_exists,
)
from app.models.discovery import AdapterDiscovery
from app.models.repo_manifest import RepoManifest


class SpringBootAdapter(RepoAdapter):
    """Detects Spring Boot-style services and common Java source locations."""

    name = "spring_boot"

    def detect(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> bool:
        hints = manifest_hint_text(manifest, agents_text)
        build_text = " ".join(
            read_text_if_exists(repo_path / path)
            for path in ("pom.xml", "build.gradle", "build.gradle.kts")
        ).lower()

        has_java_sources = (repo_path / "src/main/java").is_dir()
        has_spring_build = "spring-boot" in build_text or "org.springframework.boot" in build_text
        has_spring_hint = "spring boot" in hints or "springboot" in hints
        java_backend_hint = manifest.language.lower() == "java" and any(
            token in hints for token in ("backend", "service", "api", "gradle", "maven")
        )

        gradle_java_hint = manifest.language.lower() == "java" and "gradlew" in hints

        return (
            has_spring_build
            or has_spring_hint
            or (has_java_sources and java_backend_hint)
            or gradle_java_hint
        )

    def discover(
        self, repo_path: Path, manifest: RepoManifest, agents_text: str = ""
    ) -> AdapterDiscovery:
        api_locations = merge_paths(
            first_existing_paths(
                repo_path,
                [
                    "src/main/java/controller",
                    "src/main/java/controllers",
                    "src/main/java/api",
                    "src/main/java/rest",
                ],
            ),
            matching_file_parent_paths(
                repo_path, ["*Controller.java", "*Resource.java"], ["src/main/java"]
            ),
            matching_directory_paths(
                repo_path,
                ["controller", "controllers", "api", "rest", "dto", "dtos"],
                ["src/main/java"],
            ),
            matching_file_parent_paths(
                repo_path,
                ["*Dto.java", "*DTO.java", "*Request.java", "*Response.java"],
                ["src/main/java"],
            ),
        )
        service_locations = merge_paths(
            first_existing_paths(
                repo_path,
                [
                    "src/main/java/service",
                    "src/main/java/services",
                    "src/main/java/domain",
                    "src/main/java/application",
                ],
            ),
            matching_file_parent_paths(repo_path, ["*Service.java"], ["src/main/java"]),
            matching_directory_paths(
                repo_path,
                ["service", "services", "domain", "application"],
                ["src/main/java"],
            ),
        )
        persistence_locations = merge_paths(
            first_existing_paths(
                repo_path,
                [
                    "src/main/java/repository",
                    "src/main/java/repositories",
                    "src/main/java/entity",
                    "src/main/java/entities",
                ],
            ),
            matching_file_parent_paths(
                repo_path,
                ["*Repository.java", "*Entity.java"],
                ["src/main/java"],
            ),
            matching_directory_paths(
                repo_path,
                ["entity", "entities", "repository", "repositories"],
                ["src/main/java"],
            ),
        )
        event_locations = merge_paths(
            first_existing_paths(
                repo_path,
                [
                    "src/main/java/events",
                    "src/main/java/event",
                    "src/main/java/integration",
                    "src/main/java/integrations",
                ],
            ),
            matching_file_parent_paths(
                repo_path,
                ["*Event*.java", "*Listener.java", "*Producer.java", "*Consumer.java"],
                ["src/main/java"],
            ),
            matching_directory_paths(
                repo_path,
                ["event", "events", "integration", "integrations"],
                ["src/main/java"],
            ),
        )

        return AdapterDiscovery(
            adapter=self.name,
            frameworks=["spring_boot"],
            api_locations=api_locations,
            service_locations=service_locations,
            persistence_locations=persistence_locations,
            event_locations=event_locations,
        )
