#!/usr/bin/env python3
"""
Simple Evaluation Script for Type-IV Code Clone Detector.

Evaluate a trained Type-IV clone detector on benchmark datasets.
Supports multi-language evaluation for Java, Python, C, and C#.

Quick Start:
    # Evaluate on GPTCloneBench (Java only)
    poetry run python evaluate.py

    # Evaluate on all 4 languages
    poetry run python evaluate.py --all-languages

    # Evaluate with custom model
    poetry run python evaluate.py --model models/type4_xgb_codenet.pkl

    # Evaluate on multiple datasets
    poetry run python evaluate.py --datasets gptclonebench bigclonebench --all-languages
"""

import argparse
import logging
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from clone_detection.utils.common_setup import setup_logging
from evaluate_gptclonebench import evaluate_gptclonebench
from evaluate_model import evaluate_model

logger = setup_logging(__name__)


def main():
    """Main evaluation entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate Type-IV Code Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Evaluate on GPTCloneBench (Java only)
  poetry run python evaluate.py

  # Evaluate on all 4 languages
  poetry run python evaluate.py --all-languages

  # Evaluate with custom model
  poetry run python evaluate.py --model models/type4_xgb_codenet.pkl

  # Evaluate on multiple datasets and all languages
  poetry run python evaluate.py --datasets gptclonebench bigclonebench --all-languages

  # Evaluate with sampling (faster)
  poetry run python evaluate.py --sample-size 500 --all-languages

  # Evaluate without visualizations (faster)
  poetry run python evaluate.py --no-visualize --all-languages
        """,
    )

    # Model arguments
    parser.add_argument(
        "--model",
        type=str,
        default="./models/type4_xgb_codenet.pkl",
        help="Path to trained model (default: ./models/type4_xgb_codenet.pkl)",
    )

    # Dataset arguments
    parser.add_argument(
        "--datasets",
        type=str,
        nargs="+",
        default=["gptclonebench"],
        choices=["gptclonebench", "bigclonebench", "toma"],
        help="Datasets to evaluate on (default: gptclonebench)",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "python", "c", "csharp"],
        help="Programming language of the code (default: java)",
    )
    parser.add_argument(
        "--all-languages",
        action="store_true",
        help="Evaluate on all 4 languages (java, python, c, csharp). Overrides --language",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Sample size for evaluation (default: full dataset)",
    )

    # Output arguments
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./evaluation_output",
        help="Directory for evaluation output (default: ./evaluation_output)",
    )
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualization generation",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Custom decision threshold (default: use model's calibrated threshold)",
    )
    parser.add_argument(
        "--threshold-sweep",
        action="store_true",
        help="Perform threshold sweep analysis",
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
        languages = ["java", "python", "c", "csharp"]
        logger.info("Evaluating on all 4 languages: java, python, c, csharp")
    else:
        languages = [args.language]

    # Verify model exists
    model_path = Path(args.model)
    if not model_path.exists():
        logger.error(f"Model not found: {model_path}")
        logger.info("\nPlease train a model first:")
        logger.info("  poetry run python train.py --all-languages --sample-size 10000")
        sys.exit(1)

    logger.info("=" * 70)
    logger.info("TYPE-IV CODE CLONE DETECTOR - EVALUATION")
    logger.info("=" * 70)
    logger.info(f"Model: {model_path}")
    logger.info(f"Datasets: {args.datasets}")
    logger.info(f"Languages: {languages}")
    logger.info(f"Sample size: {args.sample_size or 'full dataset'}")
    logger.info(f"Visualizations: {'Enabled' if not args.no_visualize else 'Disabled'}")
    logger.info("=" * 70)

    # Dataset configurations
    dataset_paths = {
        "gptclonebench": "../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl",
        "bigclonebench": "../../../../datasets/bigclonebench/bigclonebench.jsonl",
        "toma": "../../../../datasets/toma-dataset",
    }

    dataset_formats = {
        "gptclonebench": "gptclonebench",
        "bigclonebench": "bigclonebench",
        "toma": "toma",
    }

    # Evaluate on each dataset and language
    all_results = {}

    for dataset_name in args.datasets:
        dataset_path = Path(dataset_paths[dataset_name])

        if not dataset_path.exists():
            logger.warning(
                f"Dataset not found: {dataset_path}. Skipping {dataset_name}..."
            )
            continue

        for language in languages:
            logger.info(f"\n{'=' * 70}")
            logger.info(f"Evaluating on {dataset_name.upper()} ({language.upper()})")
            logger.info(f"{'=' * 70}")

            # Create output directory per dataset and language
            output_subdir = f"{args.output_dir}/{dataset_name}/{language}"

            try:
                if dataset_name == "gptclonebench":
                    # Use specialized GPTCloneBench evaluator
                    metrics = evaluate_gptclonebench(
                        model_path=str(model_path),
                        dataset_path=str(dataset_path),
                        language=language,
                        sample_size=args.sample_size,
                        visualize=not args.no_visualize,
                        output_dir=output_subdir,
                        threshold=args.threshold,
                        threshold_sweep=args.threshold_sweep,
                    )
                else:
                    # Use standard evaluator
                    metrics = evaluate_model(
                        model_path=str(model_path),
                        dataset_path=str(dataset_path),
                        dataset_format=dataset_formats[dataset_name],
                        language=language,
                        sample_size=args.sample_size,
                        visualize=not args.no_visualize,
                        output_dir=output_subdir,
                        threshold=args.threshold,
                        threshold_sweep=args.threshold_sweep,
                    )

                key = f"{dataset_name}_{language}"
                all_results[key] = metrics

                # Print results
                logger.info(f"\n{'=' * 70}")
                logger.info(f"{dataset_name.upper()} ({language.upper()}) RESULTS")
                logger.info(f"{'=' * 70}")
                for key_metric, value in metrics.items():
                    if isinstance(value, float):
                        logger.info(
                            f"  {key_metric.replace('_', ' ').title()}: {value:.4f}"
                        )
                    elif key_metric == "visualization_path":
                        logger.info(f"  Visualizations: {value}")

            except Exception as e:
                logger.error(
                    f"Evaluation failed for {dataset_name} ({language}): {e}",
                    exc_info=True,
                )
                all_results[f"{dataset_name}_{language}"] = {"error": str(e)}

    # Final summary
    logger.info("\n" + "=" * 70)
    logger.info("EVALUATION COMPLETE")
    logger.info("=" * 70)

    if all_results:
        logger.info("\nSummary:")
        for key, metrics in all_results.items():
            if "error" not in metrics:
                logger.info(f"\n  {key.upper()}:")
                logger.info(f"    F1 Score: {metrics.get('f1', 0):.4f}")
                logger.info(f"    Accuracy: {metrics.get('accuracy', 0):.4f}")
                logger.info(f"    Precision: {metrics.get('precision', 0):.4f}")
                logger.info(f"    Recall: {metrics.get('recall', 0):.4f}")
            else:
                logger.info(f"\n  {key.upper()}: FAILED - {metrics['error']}")

    logger.info(f"\nOutputs saved to: {Path(args.output_dir).absolute()}")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
