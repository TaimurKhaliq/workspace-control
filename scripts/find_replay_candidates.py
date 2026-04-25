#!/usr/bin/env python3
"""Find deterministic historical replay candidates and optionally write replay cases."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "reports" / "replay" / "candidates"
DEFAULT_CASES_OUTPUT = REPO_ROOT / "tests" / "replay_cases" / "auto_replay_cases.json"
USEFUL_ARCHETYPES = (
    "ui_shell",
    "ui_only",
    "backend_api_only",
    "persistence_or_data",
    "full_stack",
    "mixed_other",
)
SKIPPED_ARCHETYPES = {
    "docs_only",
    "test_only",
    "config_or_dependency",
    "too_large",
    "asset_only",
}
FEATURE_WORDS = {
    "add",
    "update",
    "edit",
    "create",
    "implement",
    "expose",
    "support",
    "search",
    "filter",
    "page",
    "layout",
    "api",
}
VAGUE_SUBJECTS = {
    "cleanup",
    "clean up",
    "misc",
    "fix",
    "fixes",
    "wip",
    "update",
    "changes",
    "refactor",
}
LOW_VALUE_SUBJECT_WORDS = {
    "comment",
    "docs",
    "documentation",
    "enzyme",
    "javadoc",
    "jest",
    "minor",
    "readme",
    "test",
    "tests",
}
UI_SHELL_SUBJECT_WORDS = {
    "home",
    "landing",
    "layout",
    "shell",
    "welcome",
}
LOCK_FILE_NAMES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "poetry.lock",
    "requirements.lock",
    "gradle.lockfile",
}
STATIC_ASSET_EXTENSIONS = {
    ".avif",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".png",
    ".svg",
    ".webp",
}


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-path", type=Path, required=True, help="Path to a local git repository.")
    parser.add_argument("--limit", type=int, default=300, help="Recent non-merge commits to inspect.")
    parser.add_argument("--max-files", type=int, default=25, help="Changed-file threshold for too_large.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Candidate report directory.")
    parser.add_argument("--write-cases", action="store_true", help="Write a replay cases JSON file.")
    parser.add_argument("--cases-output", type=Path, default=DEFAULT_CASES_OUTPUT, help="Replay cases JSON path.")
    parser.add_argument("--per-archetype", type=int, default=2, help="Cases to select per useful archetype.")
    parser.add_argument("--include-archetypes", help="Comma-separated archetypes to include for case writing.")
    parser.add_argument("--exclude-archetypes", help="Comma-separated archetypes to exclude for case writing.")
    args = parser.parse_args(argv)

    repo_path = resolve_git_root(args.repo_path)
    candidates = find_candidates(repo_path, limit=args.limit, max_files=args.max_files)
    report = build_candidate_report(repo_path, candidates, max_files=args.max_files)
    output_dir = args.output_dir.resolve()
    write_candidate_reports(report, output_dir)

    cases: list[dict[str, Any]] = []
    if args.write_cases:
        cases = select_replay_cases(
            candidates,
            repo_path=repo_path,
            per_archetype=args.per_archetype,
            include_archetypes=parse_archetype_list(args.include_archetypes),
            exclude_archetypes=parse_archetype_list(args.exclude_archetypes),
        )
        write_cases(cases, args.cases_output.resolve())

    print("Replay candidate summary")
    print(f"repo: {display_path(repo_path)}")
    print(f"candidates found: {len(candidates)}")
    print(f"candidate json: {display_path(output_dir / 'latest_candidates.json')}")
    print(f"candidate md: {display_path(output_dir / 'latest_candidates.md')}")
    if args.write_cases:
        print(f"replay cases written: {len(cases)}")
        print(f"cases json: {display_path(args.cases_output.resolve())}")
    return 0


def find_candidates(repo_path: Path, *, limit: int = 300, max_files: int = 25) -> list[dict[str, Any]]:
    """Inspect recent non-merge commits and return ranked replay candidates."""

    commits = recent_non_merge_commits(repo_path, limit=limit)
    candidates = [build_candidate(repo_path, commit, max_files=max_files) for commit in commits]
    return sorted(candidates, key=candidate_sort_key)


def recent_non_merge_commits(repo_path: Path, *, limit: int) -> list[dict[str, str]]:
    """Return recent non-merge commit metadata."""

    output = git_output(
        repo_path,
        [
            "log",
            "--no-merges",
            f"--max-count={limit}",
            "--pretty=format:%H%x01%P%x01%s",
        ],
    )
    commits: list[dict[str, str]] = []
    for line in output.splitlines():
        parts = line.split("\x01")
        if len(parts) != 3:
            continue
        sha, parents, subject = parts
        parent_sha = parents.split()[0] if parents.split() else ""
        if not parent_sha:
            continue
        commits.append(
            {
                "sha": sha,
                "short_sha": sha[:7],
                "parent_sha": parent_sha,
                "subject": subject.strip(),
            }
        )
    return commits


def build_candidate(repo_path: Path, commit: dict[str, str], *, max_files: int) -> dict[str, Any]:
    """Build one candidate record from commit metadata and changed files."""

    changed_files = changed_files_for_commit(repo_path, commit["parent_sha"], commit["sha"])
    categories = sorted({category for path in changed_files for category in classify_file_categories(path)})
    flags = candidate_flags(changed_files, categories, max_files=max_files)
    archetype = classify_archetype(changed_files, categories, flags)
    prompt, needs_manual_prompt = generate_prompt(commit["subject"])
    needs_manual_prompt = needs_manual_prompt or flags["too_large"]
    candidate: dict[str, Any] = {
        "sha": commit["sha"],
        "short_sha": commit["short_sha"],
        "subject": commit["subject"],
        "parent_sha": commit["parent_sha"],
        "changed_files": changed_files,
        "changed_file_count": len(changed_files),
        "categories": categories,
        "archetype": archetype,
        "too_large": flags["too_large"],
        "dependency_only": flags["dependency_only"],
        "docs_only": flags["docs_only"],
        "test_only": flags["test_only"],
        "asset_only": flags["asset_only"],
        "needs_manual_prompt": needs_manual_prompt,
        "prompt": prompt,
    }
    candidate["score"] = score_candidate(candidate)
    candidate["case_id"] = stable_case_id(candidate)
    return candidate


def changed_files_for_commit(repo_path: Path, parent_sha: str, sha: str) -> list[str]:
    """Return deterministic changed files for a commit."""

    output = git_output(repo_path, ["diff", "--name-only", "--diff-filter=ACMRT", parent_sha, sha])
    return sorted(line.strip() for line in output.splitlines() if line.strip())


def classify_file_categories(path: str) -> set[str]:
    """Classify a changed file into replay candidate categories."""

    normalized = path.replace("\\", "/")
    lowered = normalized.lower()
    name = Path(lowered).name
    parts = set(re.findall(r"[a-z0-9]+", lowered))
    categories: set[str] = set()

    if is_docs_path(lowered):
        categories.add("docs")
    if is_test_path(lowered, parts):
        categories.add("tests")
    if is_config_build_path(lowered, name):
        categories.add("config_build")
    if is_frontend_ui_path(lowered):
        categories.add("frontend_ui")
    if is_frontend_public_path(lowered):
        categories.add("frontend_public")
    if is_backend_api_path(lowered, parts):
        categories.add("backend_api")
    if "service" in parts or "services" in parts:
        categories.add("backend_service")
    if is_persistence_path(lowered, parts):
        categories.add("persistence")
    if not categories:
        categories.add("other")
    return categories


def is_frontend_ui_path(lowered: str) -> bool:
    return any(
        marker in lowered
        for marker in (
            "client/src/",
            "frontend/src/",
            "web/src/",
            "ui/src/",
            "src/components/",
            "src/pages/",
            "src/views/",
            "src/routes/",
        )
    )


def is_frontend_public_path(lowered: str) -> bool:
    return any(
        marker in lowered
        for marker in (
            "client/public/",
            "frontend/public/",
            "web/public/",
            "ui/public/",
            "public/",
        )
    )


def is_backend_api_path(lowered: str, parts: set[str]) -> bool:
    return any(token in parts for token in ("controller", "controllers", "rest", "api", "openapi", "swagger")) or any(
        marker in lowered for marker in ("openapi.yaml", "openapi.yml", "swagger.yaml", "swagger.yml")
    )


def is_persistence_path(lowered: str, parts: set[str]) -> bool:
    return any(
        token in parts
        for token in (
            "model",
            "models",
            "entity",
            "entities",
            "repository",
            "repositories",
            "migration",
            "migrations",
            "changelog",
            "db",
        )
    )


def is_config_build_path(lowered: str, name: str) -> bool:
    return name in LOCK_FILE_NAMES or name in {"pom.xml", "build.gradle", "settings.gradle", "package.json", "gradlew", "mvnw"}


def is_docs_path(lowered: str) -> bool:
    return Path(lowered).name.startswith("readme") or lowered.startswith("docs/") or "/docs/" in lowered or lowered.endswith(('.md', '.adoc', '.rst'))


def is_test_path(lowered: str, parts: set[str]) -> bool:
    return "test" in parts or "tests" in parts or "spec" in parts or lowered.endswith(('.spec.ts', '.spec.tsx', '.test.ts', '.test.tsx'))


def is_static_asset(path: str) -> bool:
    return Path(path).suffix.lower() in STATIC_ASSET_EXTENSIONS


def candidate_flags(changed_files: Sequence[str], categories: Sequence[str], *, max_files: int) -> dict[str, bool]:
    """Compute deterministic boolean flags for a candidate."""

    category_set = set(categories)
    changed_count = len(changed_files)
    docs_only = bool(category_set) and category_set <= {"docs"}
    test_only = bool(category_set) and category_set <= {"tests"}
    dependency_only = bool(category_set) and category_set <= {"config_build"}
    asset_only = bool(changed_files) and all(is_static_asset(path) for path in changed_files)
    return {
        "too_large": changed_count > max_files,
        "dependency_only": dependency_only,
        "docs_only": docs_only,
        "test_only": test_only,
        "asset_only": asset_only,
    }


def classify_archetype(changed_files: Sequence[str], categories: Sequence[str], flags: dict[str, bool]) -> str:
    """Classify a candidate into a replay archetype."""

    category_set = set(categories)
    if flags["too_large"]:
        return "too_large"
    if flags["docs_only"]:
        return "docs_only"
    if flags["test_only"]:
        return "test_only"
    if flags["asset_only"]:
        return "asset_only"
    if flags["dependency_only"]:
        return "config_or_dependency"

    frontend = bool(category_set & {"frontend_ui", "frontend_public"})
    backend = bool(category_set & {"backend_api", "backend_service", "persistence"})
    if is_ui_shell_change(changed_files) and frontend and not backend:
        return "ui_shell"
    if frontend and backend:
        return "full_stack"
    if frontend and not backend:
        return "ui_only"
    if category_set & {"persistence"} and not frontend:
        return "persistence_or_data"
    if category_set & {"backend_api", "backend_service"} and not frontend:
        return "backend_api_only"
    if category_set and category_set <= {"config_build", "other"}:
        return "config_or_dependency"
    return "mixed_other"


def is_ui_shell_change(changed_files: Sequence[str]) -> bool:
    """Return whether paths suggest UI shell, landing, or public-entry work."""

    shell_terms = ("layout", "welcome", "home", "landing")
    for path in changed_files:
        lowered = path.lower()
        name = Path(lowered).name
        if name in {"app.tsx", "app.jsx", "main.tsx", "main.jsx", "index.tsx", "index.jsx", "index.html"}:
            return True
        if any(term in lowered for term in shell_terms):
            return True
        if is_static_asset(path) and is_frontend_public_path(lowered):
            return True
    return False


def score_candidate(candidate: dict[str, Any]) -> int:
    """Rank replay candidates with deterministic feature-oriented heuristics."""

    score = 0
    changed_count = int(candidate["changed_file_count"])
    subject = str(candidate["subject"])
    normalized_subject = normalize_subject(subject).lower()
    archetype = str(candidate["archetype"])

    score += 10
    if 2 <= changed_count <= 15:
        score += 25
    elif changed_count == 1:
        score += 5
    elif 16 <= changed_count <= 25:
        score += 10
    else:
        score -= 20

    if has_feature_word(normalized_subject):
        score += 20
    if len(re.findall(r"[a-z0-9]+", normalized_subject)) >= 3:
        score += 10
    if archetype in USEFUL_ARCHETYPES:
        score += 15
    if archetype == "ui_shell":
        score += 5
    if archetype == "ui_shell" and category_set(candidate) >= {"frontend_public", "frontend_ui"}:
        score += 8
    if archetype == "ui_shell" and subject_words(normalized_subject) & UI_SHELL_SUBJECT_WORDS:
        score += 12

    if candidate["too_large"]:
        score -= 35
    if candidate["dependency_only"]:
        score -= 25
    if candidate["docs_only"]:
        score -= 30
    if candidate["test_only"]:
        score -= 25
    if candidate["asset_only"]:
        score -= 20
    if "tests" in category_set(candidate):
        score -= 10
    if "config_build" in category_set(candidate):
        score -= 8
    if subject_words(normalized_subject) & LOW_VALUE_SUBJECT_WORDS:
        score -= 15
    if is_vague_subject(normalized_subject):
        score -= 20
    return score


def has_feature_word(subject: str) -> bool:
    return bool(subject_words(subject) & FEATURE_WORDS)


def subject_words(subject: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", subject.lower()))


def category_set(candidate: dict[str, Any]) -> set[str]:
    return set(candidate.get("categories", []))


def generate_prompt(subject: str) -> tuple[str, bool]:
    """Generate a conservative replay prompt from a commit subject."""

    prompt = normalize_subject(subject)
    return prompt, is_vague_subject(prompt.lower())


def normalize_subject(subject: str) -> str:
    """Lightly normalize conventional commit prefixes without inventing meaning."""

    value = subject.strip()
    value = re.sub(r"^\[[^\]]+\]\s*", "", value)
    value = re.sub(r"^(feat|fix|chore|docs|test|tests|refactor|style|build|ci|perf)(\([^)]+\))?!?:\s*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value).strip()
    return value or subject.strip()


def is_vague_subject(subject: str) -> bool:
    normalized = normalize_subject(subject).strip().lower()
    words = re.findall(r"[a-z0-9]+", normalized)
    if normalized in VAGUE_SUBJECTS:
        return True
    if len(words) <= 1 and not has_feature_word(normalized):
        return True
    return False


def stable_case_id(candidate: dict[str, Any]) -> str:
    """Build a stable replay case id."""

    return f"{candidate['archetype']}_{candidate['short_sha']}_{slugify(normalize_subject(str(candidate['subject'])))}"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug[:80] or "commit"


def candidate_sort_key(candidate: dict[str, Any]) -> tuple[int, int, str, str]:
    return (-int(candidate["score"]), int(candidate["changed_file_count"]), str(candidate["archetype"]), str(candidate["short_sha"]))


def select_replay_cases(
    candidates: Sequence[dict[str, Any]],
    *,
    repo_path: Path,
    per_archetype: int = 2,
    include_archetypes: set[str] | None = None,
    exclude_archetypes: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Select top replay cases per archetype and return matrix-compatible records."""

    allowed = set(include_archetypes) if include_archetypes else set(USEFUL_ARCHETYPES)
    excluded = set(exclude_archetypes or set())
    if include_archetypes is None:
        excluded |= SKIPPED_ARCHETYPES
    allowed -= excluded

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in sorted(candidates, key=candidate_sort_key):
        if candidate["archetype"] not in allowed:
            continue
        grouped[candidate["archetype"]].append(candidate)

    cases: list[dict[str, Any]] = []
    for archetype in sorted(grouped):
        for candidate in grouped[archetype][: max(per_archetype, 0)]:
            cases.append(candidate_to_case(candidate, repo_path=repo_path))
    return sorted(cases, key=lambda item: (item["archetype"], item["id"]))


def candidate_to_case(candidate: dict[str, Any], *, repo_path: Path) -> dict[str, Any]:
    """Convert one candidate to a replay matrix case."""

    return {
        "id": candidate["case_id"],
        "repo_path": display_path(repo_path),
        "commit": candidate["short_sha"],
        "prompt": candidate["prompt"],
        "archetype": candidate["archetype"],
        "source": "auto_candidate_finder",
        "changed_file_count": candidate["changed_file_count"],
        "categories": candidate["categories"],
        "needs_manual_prompt": candidate["needs_manual_prompt"],
    }


def build_candidate_report(repo_path: Path, candidates: Sequence[dict[str, Any]], *, max_files: int) -> dict[str, Any]:
    """Build a deterministic candidate report payload."""

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate["archetype"]].append(candidate)
    return {
        "repo_path": display_path(repo_path),
        "limit_note": "Recent non-merge commits; deterministic git log order before scoring.",
        "max_files": max_files,
        "candidate_count": len(candidates),
        "archetype_counts": {key: len(grouped[key]) for key in sorted(grouped)},
        "candidates": list(candidates),
    }


def write_candidate_reports(report: dict[str, Any], output_dir: Path) -> None:
    """Write JSON and Markdown candidate reports."""

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "latest_candidates.json").write_text(
        json.dumps(report, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    (output_dir / "latest_candidates.md").write_text(format_candidate_markdown(report), encoding="utf-8")


def format_candidate_markdown(report: dict[str, Any]) -> str:
    """Render candidate report as Markdown."""

    candidates = list(report["candidates"])
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate["archetype"]].append(candidate)

    lines = [
        "# Replay Candidates",
        "",
        f"- repo: `{report['repo_path']}`",
        f"- candidates found: {report['candidate_count']}",
        f"- max files: {report['max_files']}",
        "",
        "## Archetype Counts",
        "",
    ]
    for archetype, count in report["archetype_counts"].items():
        lines.append(f"- {archetype}: {count}")

    for archetype in sorted(grouped):
        lines.extend(["", f"## {archetype}", ""])
        for candidate in sorted(grouped[archetype], key=candidate_sort_key):
            lines.extend(candidate_markdown_block(candidate, repo_path=str(report["repo_path"])))
    return "\n".join(lines) + "\n"


def candidate_markdown_block(candidate: dict[str, Any], *, repo_path: str) -> list[str]:
    """Render one candidate block."""

    lines = [
        f"### `{candidate['short_sha']}` {candidate['subject']}",
        "",
        f"- score: {candidate['score']}",
        f"- changed files: {candidate['changed_file_count']}",
        f"- categories: {', '.join(candidate['categories']) or '-'}",
        f"- prompt: {candidate['prompt']}",
        f"- needs manual prompt: {candidate['needs_manual_prompt']}",
        f"- suggested matrix case id: `{candidate['case_id']}`",
        f"- suggested replay command: `python3 scripts/replay_git_history_eval.py --repo-path {repo_path} --commit {candidate['short_sha']} --prompt {json.dumps(candidate['prompt'])}`",
        "- first changed files:",
    ]
    lines.extend(f"  - `{path}`" for path in candidate["changed_files"][:10])
    if not candidate["changed_files"]:
        lines.append("  - -")
    lines.append("")
    return lines


def write_cases(cases: Sequence[dict[str, Any]], cases_output: Path) -> None:
    """Write replay cases JSON."""

    cases_output.parent.mkdir(parents=True, exist_ok=True)
    cases_output.write_text(json.dumps(list(cases), indent=2, sort_keys=False) + "\n", encoding="utf-8")


def parse_archetype_list(value: str | None) -> set[str] | None:
    if not value:
        return None
    return {item.strip() for item in value.split(",") if item.strip()}


def resolve_git_root(repo_path: Path) -> Path:
    if not repo_path.exists():
        raise FileNotFoundError(f"Repository path does not exist: {repo_path}")
    output = git_output(repo_path, ["rev-parse", "--show-toplevel"])
    return Path(output).resolve()


def git_output(repo_path: Path, args: Sequence[str]) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or f"git {' '.join(args)} failed")
    return completed.stdout.strip()


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
