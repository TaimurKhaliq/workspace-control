from collections.abc import Sequence

from .models import InventoryRow


HEADERS = [
    "repo",
    "type",
    "language",
    "domain",
    "build_commands",
    "test_commands",
]


def _format_commands(commands: Sequence[str]) -> str:
    if not commands:
        return "-"
    return " ; ".join(commands)


def format_inventory_table(rows: Sequence[InventoryRow]) -> str:
    """Render a deterministic plain-text table."""

    if not rows:
        return "No stackpilot.yml manifests found."

    table_rows = [
        [
            row.repo_name,
            row.type,
            row.language,
            row.domain,
            _format_commands(row.build_commands),
            _format_commands(row.test_commands),
        ]
        for row in rows
    ]

    widths = [len(header) for header in HEADERS]

    for row in table_rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    header_line = " | ".join(
        header.ljust(widths[idx]) for idx, header in enumerate(HEADERS)
    )
    separator_line = "-+-".join("-" * width for width in widths)
    data_lines = [
        " | ".join(cell.ljust(widths[idx]) for idx, cell in enumerate(row))
        for row in table_rows
    ]

    return "\n".join([header_line, separator_line, *data_lines])
