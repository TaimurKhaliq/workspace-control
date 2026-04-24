import subprocess
import sys
from pathlib import Path

from scripts.run_demo import DEMO_PROMPT, run_demo

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_run_demo_writes_sectioned_output(tmp_path: Path) -> None:
    output_path = tmp_path / "latest_demo.md"

    output = run_demo(output_path=output_path, python_executable=sys.executable)

    assert output_path.read_text(encoding="utf-8") == output
    assert "# Workspace-Control Planner Demo" in output
    assert DEMO_PROMPT in output
    assert "## 1. Discover Architecture" in output
    assert "## 2. Analyze Feature" in output
    assert "## 3. Plan Feature" in output
    assert "## 4. Propose Changes" in output
    assert "Command: `python3 main.py discover-architecture --target-id mixed-source-demo`" in output
    assert "service-a" in output
    assert "web-ui" in output


def test_run_demo_script_command_works(tmp_path: Path) -> None:
    output_path = tmp_path / "latest_demo.md"

    completed = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "scripts" / "run_demo.py"),
            "--output",
            str(output_path),
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0
    assert completed.stderr == ""
    assert "# Workspace-Control Planner Demo" in completed.stdout
    assert output_path.read_text(encoding="utf-8") == completed.stdout
