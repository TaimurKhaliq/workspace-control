import argparse
import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.discovery import DiscoveryTarget, DiscoveryTargetRecord
from app.services.architecture_discovery import (
    ArchitectureDiscoveryService,
    format_discovery_snapshot,
)
from app.services.discovery_target_registry import (
    DEFAULT_REGISTRY_PATH,
    DiscoveryTargetRegistry,
    format_target_list,
    parse_hints,
)

from .analyze import analyze_feature, format_feature_analysis
from .inventory import format_inventory_table
from .manifests import build_inventory
from .plan import create_feature_plan, format_feature_plan
from .propose import create_change_proposal, format_change_proposal


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
    discover_parser = subparsers.add_parser(
        "discover-architecture",
        help="Discover framework and architecture locations across repositories",
    )
    discover_parser.add_argument(
        "--scan-root",
        type=Path,
        default=default_scan_root,
        help="Directory whose child folders are scanned when --target-id is not provided",
    )
    discover_parser.add_argument(
        "--target-id",
        help="Registered discovery target id to scan instead of --scan-root",
    )
    discover_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
    )
    register_target_parser = subparsers.add_parser(
        "register-discovery-target",
        help="Register or update a source-agnostic discovery target",
    )
    register_target_parser.add_argument("target_id", help="Stable discovery target id")
    register_target_parser.add_argument(
        "--source-type",
        required=True,
        choices=["local_path", "git_url", "remote_agent"],
        help="Discovery target source type",
    )
    register_target_parser.add_argument(
        "--locator",
        required=True,
        help="Source locator, such as a local path or repository URL",
    )
    register_target_parser.add_argument(
        "--ref",
        default=None,
        help="Optional source ref, branch, tag, or version",
    )
    register_target_parser.add_argument(
        "--hint",
        action="append",
        default=[],
        help="Optional target hint in key=value form; can be repeated",
    )
    register_target_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
    )
    list_targets_parser = subparsers.add_parser(
        "list-discovery-targets",
        help="List registered discovery targets",
    )
    list_targets_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
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
        help="Directory whose child folders are scanned when --target-id is not provided",
    )
    analyze_parser.add_argument(
        "--target-id",
        help="Registered discovery target id to analyze instead of --scan-root",
    )
    analyze_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
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
        help="Directory whose child folders are scanned when --target-id is not provided",
    )
    plan_parser.add_argument(
        "--target-id",
        help="Registered discovery target id to plan against instead of --scan-root",
    )
    plan_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
    )
    propose_parser = subparsers.add_parser(
        "propose-changes",
        help="Suggest deterministic read-only change hints for a feature request",
    )
    propose_parser.add_argument(
        "feature_description",
        help='Feature description, for example: "Allow users to update phone number"',
    )
    propose_parser.add_argument(
        "--scan-root",
        type=Path,
        default=default_scan_root,
        help="Directory whose child folders are scanned when --target-id is not provided",
    )
    propose_parser.add_argument(
        "--target-id",
        help="Registered discovery target id to propose against instead of --scan-root",
    )
    propose_parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to the discovery target registry JSON file",
    )

    args = parser.parse_args(argv)

    if args.command not in {
        "inventory",
        "discover-architecture",
        "register-discovery-target",
        "list-discovery-targets",
        "analyze-feature",
        "plan-feature",
        "propose-changes",
    }:
        parser.print_help()
        return 1

    if args.command == "register-discovery-target":
        try:
            target = DiscoveryTargetRecord(
                id=args.target_id,
                source_type=args.source_type,
                locator=args.locator,
                ref=args.ref,
                hints=parse_hints(args.hint),
            )
            DiscoveryTargetRegistry(args.registry_path).register(target)
        except (OSError, ValidationError, ValueError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

        print(f"Registered discovery target: {target.id}")
        return 0

    if args.command == "list-discovery-targets":
        try:
            targets = DiscoveryTargetRegistry(args.registry_path).list_targets()
        except (OSError, ValidationError, ValueError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

        print(format_target_list(targets))
        return 0

    if args.command == "discover-architecture":
        try:
            snapshot = _discover_snapshot_for_args(args)
        except (
            NotImplementedError,
            OSError,
            yaml.YAMLError,
            ValidationError,
            ValueError,
        ) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

        print(format_discovery_snapshot(snapshot))
        return 0

    discovery_snapshot = None
    effective_scan_root = args.scan_root
    if args.command in {"analyze-feature", "plan-feature", "propose-changes"}:
        try:
            discovery_snapshot = _discover_snapshot_for_args(args)
            effective_scan_root = discovery_snapshot.workspace.root_path
        except (
            NotImplementedError,
            OSError,
            yaml.YAMLError,
            ValidationError,
            ValueError,
        ) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    try:
        rows = build_inventory(effective_scan_root)
    except (OSError, yaml.YAMLError, ValidationError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.command == "inventory":
        print(format_inventory_table(rows))
        return 0

    impacts = analyze_feature(
        args.feature_description,
        rows,
        scan_root=effective_scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    if args.command == "analyze-feature":
        print(format_feature_analysis(args.feature_description, impacts))
        return 0

    if args.command == "propose-changes":
        proposal = create_change_proposal(
            args.feature_description,
            rows,
            impacts=impacts,
            scan_root=effective_scan_root,
            discovery_snapshot=discovery_snapshot,
        )
        print(format_change_proposal(proposal))
        return 0

    plan = create_feature_plan(
        args.feature_description,
        rows,
        impacts=impacts,
        scan_root=effective_scan_root,
        discovery_snapshot=discovery_snapshot,
    )
    print(format_feature_plan(plan))
    return 0


def _discover_snapshot_for_args(args):
    if getattr(args, "target_id", None):
        record = DiscoveryTargetRegistry(args.registry_path).get(args.target_id)
        target = record.to_target()
    else:
        target = DiscoveryTarget.local_path(args.scan_root)
    return ArchitectureDiscoveryService().discover(target)
