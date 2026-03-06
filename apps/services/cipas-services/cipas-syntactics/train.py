#!/usr/bin/env python3
"""
Train Syntactic Clone Detector (Type-1/2/3).

Usage:
    python train.py                          # Use config.yaml defaults
    python train.py --config config.yaml     # Specify custom config
    python train.py --sample-size 10000      # Override specific values
"""

import argparse
import logging
from pathlib import Path

import yaml

from clone_detection.utils.common_setup import setup_logging
from train_core import train

logger = setup_logging(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config(config_path: Path) -> dict:
    """Load configuration from YAML file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    """Main training entry point."""
    parser = argparse.ArgumentParser(
        description="Train Syntactic Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with default config
  python train.py

  # Train with custom config
  python train.py --config /path/to/config.yaml

  # Override specific parameters
  python train.py --sample-size 10000 --n-estimators 300
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
        "--model-name",
        type=str,
        default=None,
        help="Override model name",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Override sample size",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=None,
        help="Override XGBoost n_estimators",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=None,
        help="Override XGBoost max_depth",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=None,
        help="Override XGBoost learning_rate",
    )
    parser.add_argument(
        "--scale-pos-weight",
        type=float,
        default=None,
        help="Override XGBoost scale_pos_weight",
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable AST node type features",
    )
    parser.add_argument(
        "--use-gpu",
        action="store_true",
        help="Enable GPU acceleration",
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
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualization generation (faster)",
    )

    args = parser.parse_args()

    # Load config
    if not args.config.exists():
        logger.error(f"Config file not found: {args.config}")
        logger.info("Using default configuration")
        config = {}
    else:
        config = load_config(args.config)

    # Get training config with defaults
    training_config = config.get("training", {})
    model_config = training_config.get("model", {})
    xgboost_config = training_config.get("xgboost", {})
    features_config = training_config.get("features", {})

    # Build parameters (CLI overrides config)
    params = {
        "model_name": args.model_name
        or model_config.get("name", "clone_detector_xgb.pkl"),
        "sample_size": args.sample_size or training_config.get("sample_size"),
        "n_estimators": args.n_estimators or xgboost_config.get("n_estimators", 500),
        "max_depth": args.max_depth or xgboost_config.get("max_depth", 8),
        "learning_rate": args.learning_rate
        or xgboost_config.get("learning_rate", 0.05),
        "subsample": xgboost_config.get("subsample", 0.9),
        "colsample_bytree": xgboost_config.get("colsample_bytree", 0.8),
        "min_child_weight": xgboost_config.get("min_child_weight", 2),
        "gamma": xgboost_config.get("gamma", 0.1),
        "reg_lambda": xgboost_config.get("reg_lambda", 1.0),
        "scale_pos_weight": (
            args.scale_pos_weight or xgboost_config.get("scale_pos_weight", 2.0)
        ),
        "include_node_types": not args.no_node_types
        and features_config.get("include_node_types", True),
        "use_gpu": args.use_gpu or xgboost_config.get("use_gpu", False),
        "output_dir": args.output_dir
        or Path(model_config.get("output_dir", "./results/train")),
        "test_size": training_config.get("test_size", 0.2),
        "dataset_config": training_config.get("dataset_config"),
        "toma_path": config.get("datasets", {}).get("toma", {}).get("path"),
        "visualize": not args.no_visualize and training_config.get("visualize", True),
    }

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Run training
    train(**params)


if __name__ == "__main__":
    main()
