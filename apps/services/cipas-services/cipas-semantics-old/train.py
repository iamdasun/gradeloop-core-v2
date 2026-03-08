#!/usr/bin/env python3
"""
Train Type-IV Semantic Clone Detector.

Usage:
    python train.py                          # Use config.yaml defaults
    python train.py --config config.yaml     # Specify custom config
    python train.py --sample-size 20000      # Override specific values
"""

import argparse
import logging
import sys
from pathlib import Path

import yaml

from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.yaml"


def load_config(config_path: Path) -> dict:
    """Load configuration from YAML file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def main():
    """Main training entry point."""
    parser = argparse.ArgumentParser(
        description="Train Type-IV Semantic Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train with default config (Java, 10k samples)
  python train.py

  # Train with custom config
  python train.py --config /path/to/config.yaml

  # Full dataset training
  python train.py --full-dataset --language java

  # Multi-language training
  python train.py --all-languages --sample-size 50000

  # Quick test
  python train.py --sample-size 1000
        """,
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to YAML config file (default: config.yaml)",
    )

    # Dataset arguments
    parser.add_argument(
        "--dataset",
        type=str,
        default=None,
        help="Override dataset path",
    )
    parser.add_argument(
        "--language",
        type=str,
        default=None,
        choices=["java", "python", "c", "csharp"],
        help="Override programming language",
    )
    parser.add_argument(
        "--languages",
        type=str,
        nargs="+",
        default=None,
        help="Override multiple languages",
    )
    parser.add_argument(
        "--all-languages",
        action="store_true",
        default=None,
        help="Override: train on all 4 languages",
    )

    # Model arguments
    parser.add_argument(
        "--model-name",
        type=str,
        default=None,
        help="Override model filename",
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default=None,
        help="Override model directory",
    )

    # Training arguments
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Override sample size",
    )
    parser.add_argument(
        "--full-dataset",
        action="store_true",
        default=None,
        help="Override: use full dataset",
    )
    parser.add_argument(
        "--clone-ratio",
        type=float,
        default=None,
        help="Override clone ratio",
    )
    parser.add_argument(
        "--hard-negative-ratio",
        type=float,
        default=None,
        help="Override hard negative ratio",
    )
    parser.add_argument(
        "--include-gptclonebench",
        action="store_true",
        default=None,
        help="Override: include GPTCloneBench",
    )
    parser.add_argument(
        "--max-problems",
        type=int,
        default=None,
        help="Override max problems",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=None,
        help="Override test size",
    )

    # Output arguments
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override output directory",
    )
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualizations",
    )
    parser.add_argument(
        "--no-cv",
        action="store_true",
        help="Disable cross-validation",
    )

    # Logging
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    args = parser.parse_args()

    # Load config
    if not args.config.exists():
        logger.error(f"Config file not found: {args.config}")
        logger.info("Using default configuration")
        config = {}
    else:
        config = load_config(args.config)

    # Get training config
    training_config = config.get("training", {})
    model_config = training_config.get("model", {})
    dataset_config = training_config.get("dataset", {})
    gptclonebench_config = training_config.get("gptclonebench", {})
    xgboost_config = training_config.get("xgboost", {})

    # Build parameters (CLI overrides config)
    params = {
        "dataset_path": args.dataset
        or dataset_config.get("path")
        or config.get("datasets", {}).get("codenet", {}).get("path"),
        "language": args.language or dataset_config.get("language", "java"),
        "languages": (
            args.languages
            or (
                ["java", "python", "c", "csharp"]
                if (args.all_languages or dataset_config.get("all_languages"))
                else dataset_config.get("languages")
            )
        ),
        "model_name": args.model_name
        or model_config.get("name", "type4_xgb_codenet.pkl"),
        "model_dir": args.model_dir or model_config.get("dir", "./models"),
        "sample_size": args.sample_size or training_config.get("sample_size"),
        "clone_ratio": args.clone_ratio or training_config.get("clone_ratio", 0.5),
        "hard_negative_ratio": args.hard_negative_ratio
        or training_config.get("hard_negative_ratio", 0.20),
        "include_gptclonebench": (
            args.include_gptclonebench
            if args.include_gptclonebench is not None
            else training_config.get("include_gptclonebench", False)
        ),
        "gptclonebench_path": gptclonebench_config.get("path")
        or config.get("datasets", {}).get("gptclonebench", {}).get("path"),
        "gptclonebench_ratio": gptclonebench_config.get("ratio", 0.10),
        "max_problems": args.max_problems or training_config.get("max_problems"),
        "test_size": args.test_size or training_config.get("test_size", 0.2),
        "output_dir": args.output_dir
        or model_config.get("output_dir", "./results/train"),
        "visualize": not args.no_visualize and training_config.get("visualize", True),
        "cross_validation": not args.no_cv
        and training_config.get("cross_validation", True),
        "xgboost_params": xgboost_config if xgboost_config else None,
    }

    # Set logging level
    log_level = args.log_level or training_config.get("log_level", "INFO")
    logging.getLogger().setLevel(getattr(logging, log_level))

    # Handle full_dataset flag
    if args.full_dataset:
        params["sample_size"] = None
        logger.info("Using FULL dataset (no sampling)")

    # Create model directory
    model_dir = Path(params["model_dir"])
    model_dir.mkdir(parents=True, exist_ok=True)

    # Verify dataset exists
    dataset_path = Path(params["dataset_path"])
    if not dataset_path.exists():
        logger.error(f"Dataset not found: {dataset_path}")
        sys.exit(1)

    logger.info("=" * 70)
    logger.info("TYPE-IV CODE CLONE DETECTOR - TRAINING")
    logger.info("=" * 70)
    logger.info(f"Dataset: {dataset_path}")
    logger.info(f"Language(s): {params['languages'] or [params['language']]}")
    logger.info(f"Sample size: {params['sample_size'] or 'Full dataset'}")
    logger.info(f"Model output: {model_dir / params['model_name']}")
    logger.info("=" * 70)

    # Import and run training
    from train_codenet_core import train_codenet

    try:
        metrics = train_codenet(**params)

        logger.info("\n" + "=" * 70)
        logger.info("TRAINING COMPLETE")
        logger.info("=" * 70)
        logger.info(f"Model saved to: {(model_dir / params['model_name']).absolute()}")

        if metrics:
            logger.info("\nPerformance Metrics:")
            for key, value in metrics.items():
                if isinstance(value, float):
                    logger.info(f"  {key.replace('_', ' ').title()}: {value:.4f}")

        logger.info("\nNext step: Evaluate the model")
        logger.info("  python evaluate.py")
        logger.info("=" * 70)

    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
