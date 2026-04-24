"""React adapter for frontend repository hints."""

from app.adapters.base import ArchitectureAdapter, normalize_text
from app.models.evidence import Evidence
from app.models.repo_manifest import RepoManifest


class ReactAdapter(ArchitectureAdapter):
    """Detects repositories likely using React-style frontend conventions."""

    name = "react"

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
        react_signals = any(token in normalized for token in ("react", "jsx", "tsx", "npm", "yarn"))
        if not (frontend_type and react_signals):
            return []

        return [
            Evidence(
                repo_name=repo_name,
                adapter=self.name,
                signal="react-frontend",
                weight=2,
                details={"language": manifest.language},
            )
        ]
