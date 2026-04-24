import argparse
import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

from .analyze import analyze_feature, format_feature_analysis
from .inventory import format_inventory_table
from .manifests import build_inventory
from .plan import create_feature_plan, format_feature_plan


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Workspace inventory for stackpilot manifests")
    subparsers = parser.add_subparsers(dest="command")

    default_scan_root = Path.cwd().resolve().parent
    inventory_parser = subparsers.add_parser("inventory", help="Print workspace inventory")
    inventory_parser.add_argument(
        "--scan-root",
        type=Path,
        default=default_scan_root,
        help="Directory whose child folders are scanned for stackpilot.yml",
    )
    analyze_parser = subparsers.add_parser(
        "analyze-feature",
        help="Analyze likely impacted repos for a feature request",
    )
    analyze_parser.add_argument(
        "feature_description",
        help='Feature description, for example: "Add marketing opt-in to customer profile"',
    )
    analyze_parser.add_argument(
        "--scan-root",
        type=Path,
        default=default_scan_root,
        help="Directory whose child folders are scanned for stackpilot.yml",
    )
    plan_parser = subparsers.add_parser(
        "plan-feature",
        help="Create a deterministic execution plan for a feature request",
    )
    plan_parser.add_argument(
        "feature_description",
        help='Feature description, for example: "Allow users to update phone number"',
    )
    plan_parser.add_argument(
        "--scan-root",
        type=Path,
        default=default_scan_root,
        help="Directory whose child folders are scanned for stackpilot.yml",
    )

    args = parser.parse_args(argv)

    if args.command not in {"inventory", "analyze-feature", "plan-feature"}:
        parser.print_help()
        return 1

    try:
        rows = build_inventory(args.scan_root)
    except (OSError, yaml.YAMLError, ValidationError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.command == "inventory":
        print(format_inventory_table(rows))
        return 0

    impacts = analyze_feature(args.feature_description, rows)
    if args.command == "analyze-feature":
        print(format_feature_analysis(args.feature_description, impacts))
        return 0

    plan = create_feature_plan(
        args.feature_description,
        rows,
        impacts=impacts,
        scan_root=args.scan_root,
    )
    print(format_feature_plan(plan))
    return 0
