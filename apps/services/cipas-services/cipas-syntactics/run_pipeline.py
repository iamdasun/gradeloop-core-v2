#!/usr/bin/env python3
"""
CIPAS Syntactics - Training and Evaluation Runner

Simple Python script to train and evaluate the clone detection model.

Usage:
    # Quick test (5-10 minutes)
    poetry run python run_pipeline.py --quick

    # Standard training and evaluation (30-60 minutes)
    poetry run python run_pipeline.py

    # Full evaluation with parallel processing (2-4 hours)
    poetry run python run_pipeline.py --full --workers 16

    # Custom configuration
    poetry run python run_pipeline.py --train-sample 30000 --workers 8 --threshold 0.35
"""

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def print_header(text: str):
    """Print formatted header."""
    print("\n" + "=" * 80)
    print(text)
    print("=" * 80 + "\n")


def run_command(cmd: list, description: str) -> bool:
    """Run a command and return success status."""
    logger.info(f"Running: {description}")
    logger.info(f"Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, check=True, capture_output=False)
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {e}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return False


def check_prerequisites():
    """Check if all required files and dependencies are available."""
    logger.info("Checking prerequisites...")

    # Check TOMA dataset
    toma_path = Path(
        "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
    )
    if not toma_path.exists():
        logger.error(f"TOMA dataset not found at {toma_path}")
        return False
    logger.info("✓ TOMA dataset found")

    # Check BigCloneBench Balanced
    bcb_balanced = Path(
        "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/bigclonebench_balanced.json"
    )
    if not bcb_balanced.exists():
        logger.error(f"BigCloneBench Balanced not found at {bcb_balanced}")
        return False
    logger.info("✓ BigCloneBench Balanced found")

    # Check poetry
    try:
        subprocess.run(["poetry", "--version"], check=True, capture_output=True)
        logger.info("✓ Poetry is available")
    except Exception:
        logger.error("Poetry is not installed or not in PATH")
        return False

    return True


def train_model(sample_size: int, workers: int, output_dir: Path = None) -> dict:
    """
    Train the XGBoost clone detector model.

    Returns:
        Training metrics dictionary
    """
    print_header("Step 1: Training XGBoost Clone Detector")

    cmd = [
        "poetry",
        "run",
        "python",
        "train.py",
        "--sample-size",
        str(sample_size),
    ]

    if output_dir:
        cmd.extend(["--output-dir", str(output_dir)])

    success = run_command(cmd, "Training model")

    if not success:
        raise RuntimeError("Training failed!")

    # Load training metrics
    metrics_file = Path("results/train/training_metrics.json")
    if metrics_file.exists():
        with open(metrics_file) as f:
            return json.load(f)

    return {}


def evaluate_balanced(
    model_name: str,
    threshold: float = None,
    sample_size: int = None,
    output_dir: Path = None,
) -> dict:
    """
    Evaluate on BigCloneBench Balanced.

    Returns:
        Evaluation metrics dictionary
    """
    print_header("Step 2: Evaluation on BigCloneBench Balanced")

    # Extract just the filename if a path is provided
    # evaluate.py handles path resolution internally
    model_file = Path(model_name).name if "/" in str(model_name) else model_name

    cmd = [
        "poetry",
        "run",
        "python",
        "evaluate.py",
        "--model",
        model_file,
    ]

    if threshold:
        cmd.extend(["--threshold", str(threshold)])

    if sample_size:
        cmd.extend(["--sample-size", str(sample_size)])

    if output_dir:
        cmd.extend(["--output-dir", str(output_dir)])

    success = run_command(cmd, "Evaluating on BigCloneBench Balanced")

    if not success:
        logger.warning("Evaluation may have encountered issues")

    # Load evaluation metrics
    metrics_file = Path("results/evaluate/evaluation_metrics.json")
    if metrics_file.exists():
        with open(metrics_file) as f:
            return json.load(f)

    return {}


def evaluate_full(
    model_name: str, workers: int, threshold: float = None, output_dir: Path = None
) -> dict:
    """
    Evaluate on full BigCloneBench dataset (parallel).

    Returns:
        Evaluation metrics dictionary
    """
    print_header("Step 3: Full Evaluation on BigCloneBench (Parallel)")

    # Extract just the filename if a path is provided
    model_file = Path(model_name).name if "/" in str(model_name) else model_name

    cmd = [
        "poetry",
        "run",
        "python",
        "evaluate_parallel.py",
        "--dataset",
        "full",
        "--model",
        model_file,
        "--workers",
        str(workers),
    ]

    if threshold:
        cmd.extend(["--threshold", str(threshold)])

    if output_dir:
        cmd.extend(["--output-dir", str(output_dir)])

    logger.info("⚠ This may take several hours depending on worker count...")

    success = run_command(cmd, "Full evaluation on BigCloneBench")

    if not success:
        logger.warning("Full evaluation may have encountered issues")

    # Find and load latest metrics file
    results_dir = output_dir or Path("results/evaluate")
    metrics_files = list(results_dir.glob("bcb_parallel_metrics_full_*.json"))

    if metrics_files:
        latest = max(metrics_files, key=lambda p: p.stat().st_mtime)
        with open(latest) as f:
            return json.load(f)

    return {}


def generate_summary(
    train_metrics: dict, eval_metrics: dict, full_eval_metrics: dict = None
):
    """Generate a summary report."""
    print_header("Step 4: Generating Summary Report")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    summary_file = Path(f"results/evaluate/summary_{timestamp}.md")
    summary_file.parent.mkdir(parents=True, exist_ok=True)

    with open(summary_file, "w") as f:
        f.write("# CIPAS Syntactics - Training & Evaluation Summary\n\n")
        f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        f.write("## Training Results\n\n")
        if train_metrics:
            f.write("```json\n")
            f.write(json.dumps(train_metrics.get("metrics", {}), indent=2))
            f.write("\n```\n\n")
        else:
            f.write("*Training metrics not available*\n\n")

        f.write("## Evaluation Results (BigCloneBench Balanced)\n\n")
        if eval_metrics:
            f.write("```json\n")
            f.write(json.dumps(eval_metrics.get("metrics", {}), indent=2))
            f.write("\n```\n\n")
        else:
            f.write("*Evaluation metrics not available*\n\n")

        if full_eval_metrics:
            f.write("## Full Evaluation Results (BigCloneBench)\n\n")
            f.write("```json\n")
            f.write(json.dumps(full_eval_metrics.get("metrics", {}), indent=2))
            f.write("\n```\n\n")

        f.write("## Output Files\n\n")
        f.write("- **Model:** `models/clone_detector_xgb.pkl`\n")
        f.write("- **Training Metrics:** `results/train/training_metrics.json`\n")
        f.write("- **Training Visualizations:** `results/train/visualizations/`\n")
        f.write(
            "- **Evaluation Metrics:** `results/evaluate/evaluation_metrics.json`\n"
        )
        f.write("- **Evaluation Visualizations:** `results/evaluate/visualizations/`\n")

        if full_eval_metrics:
            f.write(
                "- **Full Evaluation:** `results/evaluate/bcb_parallel_metrics_full_*.json`\n"
            )

    logger.info(f"Summary saved to: {summary_file}")
    return summary_file


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="CIPAS Syntactics - Training and Evaluation Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick test (5-10 minutes)
  poetry run python run_pipeline.py --quick

  # Standard training and evaluation (30-60 minutes)
  poetry run python run_pipeline.py

  # Full evaluation with parallel processing (2-4 hours)
  poetry run python run_pipeline.py --full --workers 16

  # Custom configuration
  poetry run python run_pipeline.py --train-sample 30000 --workers 8 --threshold 0.35
        """,
    )

    # Mode options
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick test mode (small sample, fast evaluation)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run full evaluation on complete BigCloneBench dataset",
    )

    # Training options
    parser.add_argument(
        "--train-sample",
        type=int,
        default=None,
        help="Training sample size (default: 20000, or 5000 in quick mode)",
    )

    # Evaluation options
    parser.add_argument(
        "--eval-sample",
        type=int,
        default=None,
        help="Evaluation sample size for quick validation",
    )
    parser.add_argument(
        "--threshold", type=float, default=None, help="Custom decision threshold"
    )

    # Performance options
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Number of parallel workers (default: 8)",
    )

    # Output options
    parser.add_argument(
        "--output-dir", type=Path, default=None, help="Custom output directory"
    )

    args = parser.parse_args()

    # Set defaults based on mode
    if args.quick:
        train_sample = args.train_sample or 5000
        eval_sample = args.eval_sample or 2000
        workers = args.workers or 4
    else:
        train_sample = args.train_sample or 20000
        eval_sample = args.eval_sample
        workers = args.workers or 8

    print_header("CIPAS Syntactics - Training & Evaluation Pipeline")

    logger.info("Configuration:")
    logger.info(f"  Training Sample:  {train_sample:,}")
    logger.info(f"  Evaluation Sample: {eval_sample or 'full'}")
    logger.info(f"  Workers:          {workers}")
    logger.info(f"  Full Evaluation:  {args.full}")
    logger.info(f"  Custom Threshold: {args.threshold or 'default'}")
    logger.info("")

    # Check prerequisites
    if not check_prerequisites():
        logger.error("Prerequisites check failed!")
        sys.exit(1)

    print_header("Starting Pipeline")

    try:
        # Step 1: Training
        train_metrics = train_model(
            sample_size=train_sample, workers=workers, output_dir=args.output_dir
        )
        logger.info("✓ Training complete")

        # Step 2: Quick Evaluation
        eval_metrics = evaluate_balanced(
            model_name="models/clone_detector_xgb.pkl",
            threshold=args.threshold,
            sample_size=eval_sample,
            output_dir=args.output_dir,
        )
        logger.info("✓ Quick evaluation complete")

        # Step 3: Full Evaluation (optional)
        full_eval_metrics = None
        if args.full:
            full_eval_metrics = evaluate_full(
                model_name="models/clone_detector_xgb.pkl",
                workers=workers,
                threshold=args.threshold,
                output_dir=args.output_dir,
            )
            logger.info("✓ Full evaluation complete")

        # Step 4: Generate Summary
        summary_file = generate_summary(
            train_metrics=train_metrics,
            eval_metrics=eval_metrics,
            full_eval_metrics=full_eval_metrics,
        )
        logger.info("✓ Summary generated")

        # Complete
        print_header("Pipeline Complete!")

        logger.info("Output Files:")
        logger.info("  - models/clone_detector_xgb.pkl")
        logger.info("  - results/train/training_metrics.json")
        logger.info("  - results/evaluate/evaluation_metrics.json")
        if full_eval_metrics:
            logger.info("  - results/evaluate/bcb_parallel_metrics_full_*.json")
        logger.info(f"  - {summary_file}")

        logger.info("")
        logger.info("To view results:")
        logger.info("  cat results/train/training_metrics.json | python -m json.tool")
        logger.info(
            "  cat results/evaluate/evaluation_metrics.json | python -m json.tool"
        )
        logger.info("")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
