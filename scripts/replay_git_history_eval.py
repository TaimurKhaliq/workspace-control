#!/usr/bin/env python3
"""Placeholder for a future git-history replay evaluation harness.

Intended future flow:
1. Clone a repository into an isolated eval workspace.
2. Select a historical change and identify the parent commit.
3. Checkout the parent commit in a disposable copy or worktree.
4. Run workspace-control planner/proposal commands for a human-written prompt.
5. Compare predicted impacted repos/files against the actual diff from the change.
6. Save deterministic precision/recall-style reports.

This script is intentionally non-destructive today: it does not checkout commits,
modify worktrees, or run planner commands.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence


PLACEHOLDER_TEXT = """Git-history replay eval is not implemented yet.

Planned read-only/shadow-mode flow:
- checkout a parent commit in an isolated disposable worktree
- run planner/proposal commands on a feature prompt
- compare predicted repos/files against the actual diff
- write JSON and Markdown reports

No repository changes were made.
"""


def main(argv: Sequence[str] | None = None) -> int:
    """Print the future replay flow without performing any git operations."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)
    print(PLACEHOLDER_TEXT, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
