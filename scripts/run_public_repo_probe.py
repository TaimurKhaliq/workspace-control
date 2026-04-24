#!/usr/bin/env python3
"""Run read-only public repository probes through workspace-control CLI commands."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = REPO_ROOT / "configs" / "public_repo_probe.json"
DEFAULT_EVAL_ROOT = REPO_ROOT / "eval_repos"
DEFAULT_REPORT_ROOT = REPO_ROOT / "reports" / "public_repo_probes"
DEFAULT_REGISTRY_PATH = (
    DEFAULT_EVAL_ROOT / ".workspace-control" / "public_repo_targets.json"
)


class ProbeError(RuntimeError):
    """Raised when the public repository probe cannot continue safely."""


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for the public repository probe harness."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "repo_urls",
        nargs="*",
        help="Public repository URLs to probe. Defaults to configs/public_repo_probe.json.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="JSON config containing default repos and starter prompts.",
    )
    parser.add_argument(
        "--eval-root",
        type=Path,
        default=DEFAULT_EVAL_ROOT,
        help="Local workspace where public repos are cloned.",
    )
    parser.add_argument(
        "--report-root",
        type=Path,
        default=DEFAULT_REPORT_ROOT,
        help="Directory where probe reports are saved.",
    )
    parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Discovery target registry used by the probe.",
    )
    parser.add_argument(
        "--prompt",
        action="append",
        default=[],
        help="Starter prompt to run. Can be repeated; defaults to config prompts.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of repositories to probe from the selected set.",
    )
    parser.add_argument(
        "--python-executable",
        default=None,
        help="Python executable for main.py. Defaults to .venv/bin/python when present.",
    )
    args = parser.parse_args(argv)

    try:
        config = load_probe_config(args.config)
        repo_urls = list(args.repo_urls) if args.repo_urls else list(config["repos"])
        prompts = list(args.prompt) if args.prompt else list(config["prompts"])
        if args.limit is not None:
            repo_urls = repo_urls[: max(args.limit, 0)]
        report = run_public_repo_probe(
            repo_urls=repo_urls,
            prompts=prompts,
            eval_root=args.eval_root,
            report_root=args.report_root,
            registry_path=args.registry_path,
            python_executable=args.python_executable,
        )
    except (OSError, ProbeError, subprocess.SubprocessError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print_probe_summary(report)
    return 1 if report["summary"]["failed_repos"] else 0


def load_probe_config(path: Path = DEFAULT_CONFIG_PATH) -> dict[str, list[str]]:
    """Load the public probe config with deterministic validation."""

    payload = json.loads(path.read_text(encoding="utf-8"))
    repos = payload.get("repos", [])
    prompts = payload.get("prompts", [])
    if not isinstance(repos, list) or not all(isinstance(item, str) for item in repos):
        raise ValueError("Probe config field 'repos' must be a list of strings")
    if not isinstance(prompts, list) or not all(
        isinstance(item, str) for item in prompts
    ):
        raise ValueError("Probe config field 'prompts' must be a list of strings")
    if not repos:
        raise ValueError("Probe config must include at least one repository URL")
    if not prompts:
        raise ValueError("Probe config must include at least one starter prompt")
    return {"repos": repos, "prompts": prompts}


def run_public_repo_probe(
    *,
    repo_urls: Sequence[str],
    prompts: Sequence[str],
    eval_root: Path = DEFAULT_EVAL_ROOT,
    report_root: Path = DEFAULT_REPORT_ROOT,
    registry_path: Path = DEFAULT_REGISTRY_PATH,
    python_executable: str | None = None,
) -> dict[str, Any]:
    """Clone public repos, register local targets, and run CLI probe commands."""

    if not repo_urls:
        raise ValueError("At least one repository URL is required")
    if not prompts:
        raise ValueError("At least one starter prompt is required")

    resolved_python = python_executable or default_python_executable()
    eval_root = eval_root.resolve()
    report_root = report_root.resolve()
    registry_path = registry_path.resolve()
    eval_root.mkdir(parents=True, exist_ok=True)
    report_root.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    for repo_url in repo_urls:
        repo_result = run_repo_probe(
            repo_url=repo_url,
            prompts=prompts,
            eval_root=eval_root,
            report_root=report_root,
            registry_path=registry_path,
            python_executable=resolved_python,
        )
        results.append(repo_result)

    failed_repos = [item["repo_name"] for item in results if not item["success"]]
    report = {
        "summary": {
            "total_repos": len(results),
            "passed_repos": len(results) - len(failed_repos),
            "failed_repos": failed_repos,
        },
        "repos": results,
    }
    return report


def run_repo_probe(
    *,
    repo_url: str,
    prompts: Sequence[str],
    eval_root: Path,
    report_root: Path,
    registry_path: Path,
    python_executable: str,
) -> dict[str, Any]:
    """Run the full probe flow for one public repository."""

    repo_name = repo_name_from_url(repo_url)
    workspace_dir = eval_root / repo_name
    clone_dir = workspace_dir / repo_name
    report_dir = report_root / repo_name
    target_id = f"public-{repo_name}"

    workspace_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    clone_status = clone_or_reuse_repo(repo_url, clone_dir)
    register_local_target(
        registry_path,
        target_id=target_id,
        locator=workspace_dir,
        ref=None,
        hints={
            "repo_url": repo_url,
            "shadow_mode": "true",
            "workspace_layout": "single_clone_child",
        },
    )

    command_results: list[dict[str, Any]] = []
    discovery_result = run_cli_command(
        [
            "discover-architecture",
            "--target-id",
            target_id,
            "--registry-path",
            str(registry_path),
        ],
        python_executable=python_executable,
    )
    write_text_output(report_dir / "discovery.txt", discovery_result)
    command_results.append({"id": "discovery", **discovery_result})

    bootstrap_result = run_cli_command(
        [
            "bootstrap-repo-profile",
            "--target-id",
            target_id,
            "--registry-path",
            str(registry_path),
        ],
        python_executable=python_executable,
    )
    write_json_output(report_dir / "bootstrap_profile.json", bootstrap_result)
    command_results.append({"id": "bootstrap_profile", **bootstrap_result})

    for prompt in prompts:
        slug = prompt_slug(prompt)
        analyze_result = run_cli_command(
            [
                "analyze-feature",
                prompt,
                "--target-id",
                target_id,
                "--registry-path",
                str(registry_path),
            ],
            python_executable=python_executable,
        )
        write_text_output(report_dir / f"analyze_{slug}.txt", analyze_result)
        command_results.append({"id": f"analyze_{slug}", **analyze_result})

        plan_result = run_cli_command(
            [
                "plan-feature",
                prompt,
                "--target-id",
                target_id,
                "--registry-path",
                str(registry_path),
            ],
            python_executable=python_executable,
        )
        write_json_output(report_dir / f"plan_{slug}.json", plan_result)
        command_results.append({"id": f"plan_{slug}", **plan_result})

        propose_result = run_cli_command(
            [
                "propose-changes",
                prompt,
                "--target-id",
                target_id,
                "--registry-path",
                str(registry_path),
            ],
            python_executable=python_executable,
        )
        write_json_output(report_dir / f"propose_{slug}.json", propose_result)
        command_results.append({"id": f"propose_{slug}", **propose_result})

    success = all(item["exit_code"] == 0 for item in command_results)
    metadata_modes = metadata_modes_from_bootstrap(bootstrap_result)
    repo_result = {
        "repo_name": repo_name,
        "repo_url": repo_url,
        "target_id": target_id,
        "workspace_dir": display_path(workspace_dir),
        "clone_dir": display_path(clone_dir),
        "report_dir": display_path(report_dir),
        "clone_status": clone_status,
        "metadata_modes": metadata_modes,
        "success": success,
        "commands": command_results,
    }
    (report_dir / "summary.json").write_text(
        json.dumps(repo_result, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    (report_dir / "summary.md").write_text(
        format_repo_summary(repo_result, prompts),
        encoding="utf-8",
    )
    return repo_result


def clone_or_reuse_repo(repo_url: str, clone_dir: Path) -> str:
    """Clone a public repository if absent; otherwise reuse the existing clone."""

    if clone_dir.exists():
        if (clone_dir / ".git").is_dir():
            return "reused-existing-clone"
        raise ProbeError(f"Clone path exists but is not a git repo: {clone_dir}")

    completed = subprocess.run(
        ["git", "clone", "--depth", "1", repo_url, str(clone_dir)],
        cwd=clone_dir.parent,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise ProbeError(completed.stderr.strip() or completed.stdout.strip())
    return "cloned-depth-1"


def register_local_target(
    registry_path: Path,
    *,
    target_id: str,
    locator: Path,
    ref: str | None,
    hints: dict[str, str],
) -> None:
    """Add or replace a local_path discovery target in a JSON registry file."""

    state = load_registry_state(registry_path)
    record = {
        "id": target_id,
        "source_type": "local_path",
        "locator": str(locator.resolve()),
        "ref": ref,
        "hints": dict(sorted(hints.items())),
    }
    targets = [target for target in state["targets"] if target.get("id") != target_id]
    targets.append(record)
    targets.sort(key=lambda item: str(item.get("id", "")))
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps({"targets": targets}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def load_registry_state(registry_path: Path) -> dict[str, list[dict[str, Any]]]:
    """Load a registry file, returning an empty deterministic state if missing."""

    if not registry_path.is_file():
        return {"targets": []}
    payload = json.loads(registry_path.read_text(encoding="utf-8"))
    targets = payload.get("targets", [])
    if not isinstance(targets, list):
        raise ValueError("Discovery target registry must contain a targets list")
    return {"targets": [target for target in targets if isinstance(target, dict)]}


def run_cli_command(args: Sequence[str], *, python_executable: str) -> dict[str, Any]:
    """Run one workspace-control CLI command and capture deterministic metadata."""

    command = [python_executable, str(REPO_ROOT / "main.py"), *args]
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "command": display_command(args),
        "exit_code": completed.returncode,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }


def write_text_output(path: Path, result: dict[str, Any]) -> None:
    """Write text output, including errors when the command failed."""

    path.write_text(format_command_output(result), encoding="utf-8")


def write_json_output(path: Path, result: dict[str, Any]) -> None:
    """Write JSON command output when valid, otherwise a structured error payload."""

    if result["exit_code"] == 0:
        try:
            parsed = json.loads(result["stdout"])
        except json.JSONDecodeError:
            parsed = {
                "error": "command did not return valid JSON",
                "stdout": result["stdout"],
            }
    else:
        parsed = {
            "error": result["stderr"].strip() or result["stdout"].strip(),
            "exit_code": result["exit_code"],
            "command": result["command"],
        }
    path.write_text(json.dumps(parsed, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def format_command_output(result: dict[str, Any]) -> str:
    """Format captured command output for text artifacts."""

    if result["exit_code"] == 0:
        return result["stdout"]
    return (
        f"Command failed: {result['command']}\n"
        f"Exit code: {result['exit_code']}\n\n"
        f"STDOUT:\n{result['stdout']}\n"
        f"STDERR:\n{result['stderr']}\n"
    )


def format_repo_summary(repo_result: dict[str, Any], prompts: Sequence[str]) -> str:
    """Render a compact per-repo Markdown summary."""

    failed = [item for item in repo_result["commands"] if item["exit_code"] != 0]
    lines = [
        f"# Public Repo Probe: {repo_result['repo_name']}",
        "",
        f"- repo url: {repo_result['repo_url']}",
        f"- target id: {repo_result['target_id']}",
        f"- clone dir: {repo_result['clone_dir']}",
        f"- clone status: {repo_result['clone_status']}",
        f"- metadata modes: {_format_list(repo_result['metadata_modes'])}",
        f"- report dir: {repo_result['report_dir']}",
        "- shadow mode: read-only planner/proposal commands; no target repo edits attempted",
        f"- status: {'passed' if repo_result['success'] else 'failed'}",
        "",
        "## Starter Prompts",
        "",
    ]
    lines.extend(f"- {prompt}" for prompt in prompts)
    lines.extend(
        [
            "",
            "## Command Results",
            "",
            "| command | exit code |",
            "|---|---:|",
        ]
    )
    for command in repo_result["commands"]:
        lines.append(f"| `{command['id']}` | {command['exit_code']} |")

    if failed:
        lines.extend(["", "## Failures", ""])
        for command in failed:
            error = (command["stderr"] or command["stdout"]).strip().splitlines()
            lines.append(f"- `{command['id']}`: {error[0] if error else 'unknown error'}")

    lines.append("")
    return "\n".join(lines)


def metadata_modes_from_bootstrap(result: dict[str, Any]) -> list[str]:
    """Extract metadata-mode labels from bootstrap output for summaries."""

    if result["exit_code"] != 0:
        return []
    try:
        payload = json.loads(result["stdout"])
    except json.JSONDecodeError:
        return []
    profiles = payload.get("profiles", []) if isinstance(payload, dict) else []
    if not isinstance(profiles, list):
        return []
    modes = [
        profile.get("metadata_mode")
        for profile in profiles
        if isinstance(profile, dict) and isinstance(profile.get("metadata_mode"), str)
    ]
    return sorted(set(modes))


def _format_list(values: Sequence[str]) -> str:
    if not values:
        return "-"
    return ", ".join(values)


def print_probe_summary(report: dict[str, Any]) -> None:
    """Print a concise terminal summary for the probe run."""

    summary = report["summary"]
    print("Public repo probe summary")
    print(f"total repos: {summary['total_repos']}")
    print(f"passed repos: {summary['passed_repos']}")
    failed = summary["failed_repos"]
    print(f"failed repos: {', '.join(failed) if failed else '-'}")
    for repo in report["repos"]:
        print(f"- {repo['repo_name']}: {repo['report_dir']}/summary.md")


def repo_name_from_url(repo_url: str) -> str:
    """Return a stable filesystem-safe name from a repository URL."""

    parsed = urlparse(repo_url)
    raw_name = Path(parsed.path).name or repo_url.rstrip("/").rsplit("/", 1)[-1]
    if raw_name.endswith(".git"):
        raw_name = raw_name[:-4]
    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "-", raw_name).strip(".-_")
    if not safe_name:
        raise ValueError(f"Could not derive repository name from URL: {repo_url}")
    return safe_name


def prompt_slug(prompt: str, *, max_length: int = 72) -> str:
    """Return a stable filename-safe slug for a feature prompt."""

    words = re.findall(r"[a-z0-9]+", prompt.lower())
    slug = "_".join(words[:10]) or "prompt"
    return slug[:max_length].rstrip("_")


def display_command(args: Sequence[str]) -> str:
    """Render a command using python3/main.py for readable reports."""

    rendered = ["python3", "main.py", *args]
    return " ".join(quote_command_part(part) for part in rendered)


def quote_command_part(value: str) -> str:
    """Quote command parts containing whitespace for display only."""

    if re.search(r"\s", value):
        return json.dumps(value)
    return value


def default_python_executable() -> str:
    """Prefer the project virtualenv while still supporting plain python3 usage."""

    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.is_file():
        return str(venv_python)
    return sys.executable


def display_path(path: Path) -> str:
    """Return a compact path relative to the repo root when possible."""

    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.resolve().as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
