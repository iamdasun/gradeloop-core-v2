#!/usr/bin/env python3
"""
Evaluate Syntactic Clone Detector on BigCloneBench Balanced.

Usage:
    python evaluate.py                          # Use config.yaml defaults
    python evaluate.py --config config.yaml     # Specify custom config
    python evaluate.py --sample-size 2000       # Override specific values
"""

import argparse
import logging
from pathlib import Path

import yaml
from evaluate_core import evaluate

from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config(config_path: Path) -> dict:
    """Load configuration from YAML file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    """Main evaluation entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate Syntactic Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Evaluate with default config
  python evaluate.py

  # Evaluate with custom config
  python evaluate.py --config /path/to/config.yaml

  # Override specific parameters
  python evaluate.py --sample-size 2000 --threshold 0.35
        """,
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to YAML config file (default: config.yaml)",
    )

    # Override arguments
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override model path",
    )
    parser.add_argument(
        "--clone-types",
        type=int,
        nargs="+",
        default=None,
        help="Override clone types to evaluate",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Override sample size",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Override decision threshold",
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable AST node type features",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Override output directory",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Load config
    if not args.config.exists():
        logger.error(f"Config file not found: {args.config}")
        logger.info("Using default configuration")
        config = {}
    else:
        config = load_config(args.config)

    # Get evaluation config
    eval_config = config.get("evaluation", {})
    model_config = eval_config.get("model", {})
    features_config = eval_config.get("features", {})

    # Build parameters (CLI overrides config)
    params = {
        "model_name": args.model or model_config.get("path", "clone_detector_xgb.pkl"),
        "clone_types": set(args.clone_types)
        if args.clone_types
        else set(eval_config.get("clone_types", [1, 2, 3])),
        "sample_size": args.sample_size or eval_config.get("sample_size"),
        "include_node_types": not args.no_node_types
        and features_config.get("include_node_types", True),
        "threshold": args.threshold or eval_config.get("threshold"),
        "log_type3_similarity": eval_config.get("log_type3_similarity", False),
        "output_dir": args.output_dir
        or Path(model_config.get("output_dir", "./results/evaluate")),
        "bcb_path": config.get("datasets", {})
        .get("bigclonebench_balanced", {})
        .get("path"),
    }

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Run evaluation
    evaluate(**params)


if __name__ == "__main__":
    main()
