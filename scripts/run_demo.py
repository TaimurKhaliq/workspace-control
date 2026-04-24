#!/usr/bin/env python3
"""Run a deterministic end-to-end planner/proposal demo."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

DEFAULT_SCAN_ROOT = REPO_ROOT / "tests" / "fixtures" / "mixed_source_stack"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "reports" / "demo" / "latest_demo.md"
DEMO_TARGET_ID = "mixed-source-demo"
DEMO_PROMPT = "Add a phone number field to the profile screen and persist it for each customer"

DEMO_STEPS = (
    ("1. Discover Architecture", "discover-architecture", False, "text"),
    ("2. Analyze Feature", "analyze-feature", True, "text"),
    ("3. Plan Feature", "plan-feature", True, "json"),
    ("4. Propose Changes", "propose-changes", True, "json"),
)


def main(argv: Sequence[str] | None = None) -> int:
    """CLI entry point for the repeatable demo flow."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scan-root",
        type=Path,
        default=DEFAULT_SCAN_ROOT,
        help="Fixture/workspace path used by the demo target.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Markdown file to write with the demo output.",
    )
    args = parser.parse_args(argv)

    try:
        output = run_demo(scan_root=args.scan_root, output_path=args.output)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(output, end="")
    return 0


def run_demo(
    *,
    scan_root: Path = DEFAULT_SCAN_ROOT,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    python_executable: str | None = None,
) -> str:
    """Run the demo commands through a temporary target registry."""

    resolved_scan_root = scan_root.resolve()
    if not resolved_scan_root.is_dir():
        raise ValueError(f"Demo scan root does not exist: {resolved_scan_root}")
    resolved_python = python_executable or _default_python_executable()

    with tempfile.TemporaryDirectory(prefix="workspace-control-demo-") as temp_dir:
        registry_path = Path(temp_dir) / "discovery_targets.json"
        _register_demo_target(registry_path, resolved_scan_root)
        output = _render_demo_output(
            registry_path=registry_path,
            scan_root=resolved_scan_root,
            python_executable=resolved_python,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output, encoding="utf-8")
    return output


def _register_demo_target(registry_path: Path, scan_root: Path) -> None:
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps(
            {
                "targets": [
                    {
                        "id": DEMO_TARGET_ID,
                        "source_type": "local_path",
                        "locator": str(scan_root),
                        "ref": None,
                        "hints": {
                            "fixture": "mixed_source_stack",
                            "purpose": "demo",
                        },
                    }
                ]
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def _render_demo_output(
    *,
    registry_path: Path,
    scan_root: Path,
    python_executable: str,
) -> str:
    lines = [
        "# Workspace-Control Planner Demo",
        "",
        f'Prompt: "{DEMO_PROMPT}"',
        f"Fixture: {_display_path(scan_root)}",
        f"Discovery target: {DEMO_TARGET_ID}",
        "",
    ]

    for title, command, include_prompt, fence_type in DEMO_STEPS:
        lines.extend(
            [
                f"## {title}",
                "",
                f"Command: `{_display_command(command, include_prompt)}`",
                "",
                f"```{fence_type}",
                _run_cli_command(
                    command,
                    include_prompt=include_prompt,
                    registry_path=registry_path,
                    python_executable=python_executable,
                ).rstrip(),
                "```",
                "",
            ]
        )

    return "\n".join(lines)


def _run_cli_command(
    command: str,
    *,
    include_prompt: bool,
    registry_path: Path,
    python_executable: str,
) -> str:
    args = [python_executable, str(REPO_ROOT / "main.py"), command]
    if include_prompt:
        args.append(DEMO_PROMPT)
    args.extend(
        [
            "--target-id",
            DEMO_TARGET_ID,
            "--registry-path",
            str(registry_path),
        ]
    )
    completed = subprocess.run(
        args,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    return completed.stdout


def _display_command(command: str, include_prompt: bool) -> str:
    parts = ["python3", "main.py", command]
    if include_prompt:
        parts.append(f'"{DEMO_PROMPT}"')
    parts.extend(["--target-id", DEMO_TARGET_ID])
    return " ".join(parts)


def _default_python_executable() -> str:
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.is_file():
        return str(venv_python)
    return sys.executable


def _display_path(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


if __name__ == "__main__":
    raise SystemExit(main())
