#!/usr/bin/env python3
"""
Evaluate Type-IV Semantic Clone Detector.

Usage:
    python evaluate.py                          # Use config.yaml defaults
    python evaluate.py --config config.yaml     # Specify custom config
    python evaluate.py --sample-size 2000       # Override specific values
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
    """Main evaluation entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate Type-IV Semantic Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Evaluate with default config
  python evaluate.py

  # Evaluate with custom config
  python evaluate.py --config /path/to/config.yaml

  # Evaluate specific model
  python evaluate.py --model models/type4_xgb_java.pkl --language java

  # Quick evaluation
  python evaluate.py --sample-size 1000
        """,
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to YAML config file (default: config.yaml)",
    )

    # Model arguments
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override model path",
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
        "--all-languages",
        action="store_true",
        default=None,
        help="Override: evaluate on all 4 languages",
    )

    # Evaluation arguments
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
        "--no-threshold-sweep",
        action="store_true",
        help="Disable threshold sweep",
    )

    # Output arguments
    parser.add_argument(
        "--visualize",
        action="store_true",
        default=None,
        help="Enable visualizations",
    )
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualizations",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Override output directory",
    )

    # Logging
    parser.add_argument(
        "--log-level",
        type=str,
        default=None,
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

    # Get evaluation config
    eval_config = config.get("evaluation", {})
    model_config = eval_config.get("model", {})
    dataset_config = eval_config.get("dataset", {})

    # Build parameters (CLI overrides config)
    params = {
        "model_path": args.model
        or model_config.get("path", "models/type4_xgb_java.pkl"),
        "dataset_path": args.dataset
        or dataset_config.get("path")
        or config.get("datasets", {}).get("gptclonebench", {}).get("path"),
        "language": args.language or eval_config.get("language"),
        "all_languages": (
            args.all_languages
            if args.all_languages is not None
            else eval_config.get("all_languages", False)
        ),
        "sample_size": args.sample_size or eval_config.get("sample_size"),
        "threshold": args.threshold or eval_config.get("threshold"),
        "threshold_sweep": not args.no_threshold_sweep
        and eval_config.get("threshold_sweep", True),
        "visualize": (
            args.visualize
            if args.visualize is not None
            else (not args.no_visualize and eval_config.get("visualize", True))
        ),
        "output_dir": args.output_dir
        or eval_config.get("output_dir", "./results/evaluate"),
        "log_level": args.log_level or eval_config.get("log_level", "INFO"),
    }

    # Set logging level
    logging.getLogger().setLevel(getattr(logging, params["log_level"]))

    # Determine languages
    if params["all_languages"]:
        params["languages"] = ["java", "python", "c", "csharp"]
        logger.info("Evaluating on ALL 4 languages...")
    elif params["language"] is None:
        params["languages"] = ["java", "python", "c", "csharp"]
        logger.info("No language specified. Evaluating on ALL 4 languages by default.")
    else:
        params["languages"] = [params["language"]]

    # Check model exists
    if not Path(params["model_path"]).exists():
        logger.error(f"Model not found: {params['model_path']}")
        logger.info("Train a model first: python train.py")
        sys.exit(1)

    logger.info("=" * 70)
    logger.info("TYPE-IV CODE CLONE DETECTOR - EVALUATION")
    logger.info("=" * 70)
    logger.info(f"Model: {params['model_path']}")
    logger.info(f"Dataset: {params['dataset_path']}")
    logger.info(f"Language(s): {params['languages']}")
    logger.info(f"Sample size: {params['sample_size'] or 'full dataset'}")
    logger.info("=" * 70)

    # Import and run evaluation
    from evaluate_core import evaluate_model

    try:
        all_results = {}
        for lang in params["languages"]:
            logger.info(f"\n{'=' * 70}")
            logger.info(f"EVALUATING LANGUAGE: {lang.upper()}")
            logger.info(f"{'=' * 70}\n")

            metrics = evaluate_model(
                model_path=params["model_path"],
                dataset_path=params["dataset_path"],
                language=lang,
                sample_size=params["sample_size"],
                threshold=params["threshold"],
                threshold_sweep=params["threshold_sweep"],
                visualize=params["visualize"],
                output_dir=params["output_dir"],
            )
            all_results[lang] = metrics

        # Print summary
        logger.info("\n" + "=" * 70)
        logger.info("EVALUATION COMPLETE - SUMMARY")
        logger.info("=" * 70)

        if all_results:
            logger.info(
                f"\n{'Language':<12} {'Accuracy':<10} {'Precision':<10} {'Recall':<10} {'F1':<10}"
            )
            logger.info("-" * 52)
            for lang, metrics in all_results.items():
                m = metrics.get("metrics", metrics) if isinstance(metrics, dict) else {}
                logger.info(
                    f"{lang:<12} {m.get('accuracy', 0):<10.4f} {m.get('precision', 0):<10.4f} "
                    f"{m.get('recall', 0):<10.4f} {m.get('f1', 0):<10.4f}"
                )

        logger.info(f"\nOutputs saved to: {Path(params['output_dir']).absolute()}")
        logger.info("=" * 70)

    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
