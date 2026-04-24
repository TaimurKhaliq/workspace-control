"""Angular adapter for frontend repository hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class AngularAdapter(ArchitectureAdapter):
    """Detects repositories likely using Angular conventions."""

    name = "angular"

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
        frontend_type = any(token in normalize_text([manifest.type]) for token in ("frontend", "web", "ui", "client"))
        angular_signals = any(token in normalized for token in ("angular", "ng", "typescript"))
        if not (frontend_type and angular_signals):
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="angular-frontend",
                weight=2,
                details={"language": manifest.language},
            )
        ]
