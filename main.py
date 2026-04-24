import os
import sys
from pathlib import Path


def _reexec_with_project_venv() -> None:
    """Use the local virtualenv when main.py is invoked with system Python."""

    project_root = Path(__file__).resolve().parent
    venv_root = project_root / ".venv"
    venv_python = project_root / ".venv" / "bin" / "python"
    if not venv_python.exists() or Path(sys.prefix).resolve() == venv_root.resolve():
        return

    os.execv(str(venv_python), [str(venv_python), *sys.argv])


if __name__ == "__main__":
    _reexec_with_project_venv()
    from workspace_control.cli import run

    raise SystemExit(run())
