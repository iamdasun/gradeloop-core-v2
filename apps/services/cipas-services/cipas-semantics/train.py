#!/usr/bin/env python3
"""
Simple Training Script for Type-IV Code Clone Detector.

Train the Sheneamer et al. (2021) based Type-IV clone detector using
Project CodeNet dataset.

Quick Start:
    # Basic training (10k samples)
    poetry run python train.py

    # Train with more data
    poetry run python train.py --sample-size 20000

    # Multi-language training
    poetry run python train.py --languages java python csharp

    # Quick test (1k samples)
    poetry run python train.py --sample-size 1000 --model-name type4_xgb_test.pkl
"""

import argparse
import logging
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from clone_detection.utils.common_setup import setup_logging
from train_codenet import train_codenet

logger = setup_logging(__name__)


def main():
    """Main training entry point."""
    parser = argparse.ArgumentParser(
        description="Train Type-IV Code Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full dataset training (all 4 languages, ~500k pairs, several hours)
  poetry run python train.py --full-dataset --all-languages

  # Full dataset training (Java only, ~100k pairs)
  poetry run python train.py --full-dataset --language java

  # Large sample training (100k pairs, recommended for production)
  poetry run python train.py --all-languages --sample-size 100000

  # Medium sample training (10k pairs, ~15-30 minutes)
  poetry run python train.py --all-languages --sample-size 10000

  # Quick test (1k samples, ~2-3 minutes)
  poetry run python train.py --sample-size 1000 --model-name type4_xgb_test.pkl

  # Train without visualizations (faster)
  poetry run python train.py --full-dataset --no-visualize

  # Custom output directory
  poetry run python train.py --full-dataset --output-dir ./full_training_output
        """,
    )

    # Dataset arguments
    parser.add_argument(
        "--dataset",
        type=str,
        default="../../../../datasets/project-codenet",
        help="Path to Project CodeNet dataset (default: ../../../../datasets/project-codenet)",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "python", "c", "csharp"],
        help="Programming language to train on (default: java)",
    )
    parser.add_argument(
        "--languages",
        type=str,
        nargs="+",
        default=None,
        help="Multiple languages for multi-language training (e.g., --languages java python c csharp). If not specified, uses --language value.",
    )
    parser.add_argument(
        "--all-languages",
        action="store_true",
        help="Train on all 4 languages (java, python, c, csharp). Overrides --language and --languages",
    )

    # Model arguments
    parser.add_argument(
        "--model-name",
        type=str,
        default="type4_xgb_codenet.pkl",
        help="Name for the saved model file (default: type4_xgb_codenet.pkl)",
    )
    parser.add_argument(
        "--model-dir",
        type=str,
        default="./models",
        help="Directory to save trained model (default: ./models)",
    )

    # Training arguments
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Number of training pairs to sample (default: None = use full dataset)",
    )
    parser.add_argument(
        "--full-dataset",
        action="store_true",
        help="Use full CodeNet dataset without sampling. Overrides --sample-size",
    )
    parser.add_argument(
        "--clone-ratio",
        type=float,
        default=0.5,
        help="Ratio of clone pairs in training data (default: 0.5)",
    )
    parser.add_argument(
        "--hard-negative-ratio",
        type=float,
        default=0.20,
        help="Ratio of hard negative pairs in training data (default: 0.20)",
    )
    parser.add_argument(
        "--include-gptclonebench",
        action="store_true",
        help="Include GPTCloneBench samples for domain adaptation",
    )
    parser.add_argument(
        "--gptclonebench-path",
        type=str,
        default="../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl",
        help="Path to GPTCloneBench dataset (default: ../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl)",
    )
    parser.add_argument(
        "--gptclonebench-ratio",
        type=float,
        default=0.10,
        help="Ratio of GPTCloneBench samples in training data (default: 0.10 = 10%%)",
    )
    parser.add_argument(
        "--max-problems",
        type=int,
        default=None,
        help="Maximum number of problems to use per language (speeds up training)",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of data to use for testing (default: 0.2)",
    )

    # Output arguments
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./results/train",
        help="Directory for visualization output (default: ./results/train)",
    )
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualization generation (faster training)",
    )
    parser.add_argument(
        "--no-cv",
        action="store_true",
        help="Disable cross-validation during training (faster)",
    )

    # Logging
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )

    args = parser.parse_args()

    # Set logging level
    logging.getLogger().setLevel(getattr(logging, args.log_level))

    # Handle --all-languages flag
    if args.all_languages:
        args.languages = ["java", "python", "c", "csharp"]
        logger.info("Training on all 4 languages: java, python, c, csharp")
    elif args.languages is None:
        args.languages = [args.language]

    # Handle --full-dataset flag
    if args.full_dataset:
        args.sample_size = None
        logger.info("Using FULL CodeNet dataset (no sampling)")
    elif args.sample_size is None:
        # Default sample size for quick testing
        logger.info("No sample size specified. Use --sample-size or --full-dataset")
        logger.info(
            "For production training, use: --full-dataset or --sample-size 100000"
        )

    # Create model directory
    model_dir = Path(args.model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    # Model name only (the function handles the path)
    model_name = args.model_name

    logger.info("=" * 70)
    logger.info("TYPE-IV CODE CLONE DETECTOR - TRAINING")
    logger.info("=" * 70)
    logger.info(f"Dataset: {args.dataset}")
    logger.info(f"Language(s): {args.languages or [args.language]}")
    sample_size_str = (
        f"{args.sample_size:,}" if args.sample_size else "Full dataset (capped at 500k)"
    )
    logger.info(f"Sample size: {sample_size_str}")
    logger.info(f"Clone ratio: {args.clone_ratio}")
    logger.info(f"Hard negative ratio: {args.hard_negative_ratio}")
    if args.include_gptclonebench:
        logger.info(
            f"GPTCloneBench: {args.gptclonebench_path} ({args.gptclonebench_ratio * 100:.0f}%)"
        )
    else:
        logger.info(
            "GPTCloneBench: Not included (use --include-gptclonebench to enable)"
        )
    logger.info(f"Model output: {model_dir / model_name}")
    logger.info(f"Visualizations: {'Enabled' if not args.no_visualize else 'Disabled'}")
    logger.info("=" * 70)

    # Verify dataset exists
    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        logger.error(f"Dataset not found: {dataset_path}")
        logger.info(
            "Please ensure the CodeNet dataset is available at the specified path."
        )
        sys.exit(1)

    # Train model
    try:
        metrics = train_codenet(
            dataset_path=args.dataset,
            language=args.language,
            languages=args.languages,
            model_name=model_name,
            sample_size=args.sample_size,
            clone_ratio=args.clone_ratio,
            hard_negative_ratio=args.hard_negative_ratio,
            include_gptclonebench=args.include_gptclonebench,
            gptclonebench_path=args.gptclonebench_path,
            gptclonebench_ratio=args.gptclonebench_ratio,
            test_size=args.test_size,
            cross_validation=not args.no_cv,
            visualize=not args.no_visualize,
            output_dir=args.output_dir,
            max_problems=args.max_problems,
        )

        # Print results
        logger.info("\n" + "=" * 70)
        logger.info("TRAINING COMPLETE")
        logger.info("=" * 70)
        logger.info(f"\nModel saved to: {(model_dir / model_name).absolute()}")

        logger.info("\nPerformance Metrics:")
        for key, value in metrics.items():
            if isinstance(value, float):
                logger.info(f"  {key.replace('_', ' ').title()}: {value:.4f}")
            elif key == "visualization_path":
                logger.info(f"  Visualizations: {value}")

        logger.info("\n" + "=" * 70)
        logger.info("Next Steps:")
        logger.info("  1. Evaluate the model:")
        logger.info("     poetry run python evaluate.py \\")
        logger.info(f"       --model {model_dir / model_name} \\")
        logger.info(
            "       --dataset ../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl \\"
        )
        logger.info("       --dataset-format gptclonebench \\")
        logger.info("       --visualize")
        logger.info("\n  2. Or use the pipeline script:")
        logger.info("     poetry run python run_pipeline.py --evaluate \\")
        logger.info(f"       --model {model_dir / model_name} \\")
        logger.info("       --eval-datasets gptclonebench")
        logger.info("=" * 70)

    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
