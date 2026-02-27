#!/usr/bin/env python3
"""
Main Orchestration Script for Clone Detection System.

This script provides a unified interface for:
1. Environment setup verification
2. Training Type-3 and Type-4 models
3. Evaluating on BigCloneBench
4. Running the complete pipeline

Usage:
    python run_pipeline.py [--setup] [--train-type3] [--train-type4] [--evaluate] [--all]
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from clone_detection.utils.common_setup import (
    get_models_dir,
    model_exists,
    set_random_seed,
    setup_logging,
)

logger = setup_logging("pipeline")


def check_environment() -> bool:
    """
    Check if the environment is properly set up.

    Returns:
        True if all dependencies are available
    """
    logger.info("Checking environment setup...")

    required_packages = [
        "tree_sitter",
        "tree_sitter_java",
        "tree_sitter_c",
        "tree_sitter_python",
        "sklearn",
        "xgboost",
        "pandas",
        "numpy",
        "rapidfuzz",
    ]

    missing = []
    for package in required_packages:
        try:
            __import__(package)
            logger.debug(f"  ✓ {package}")
        except ImportError:
            missing.append(package)
            logger.debug(f"  ✗ {package}")

    if missing:
        logger.error(f"Missing packages: {missing}")
        logger.error("Run: poetry install")
        return False

    logger.info("Environment check passed!")
    return True


def run_script(script_name: str, args: list[str] = None) -> int:
    """
    Run a Python script in the same directory.

    Args:
        script_name: Name of the script to run
        args: Additional command-line arguments

    Returns:
        Exit code from the script
    """
    script_path = Path(__file__).parent / script_name

    if not script_path.exists():
        logger.error(f"Script not found: {script_path}")
        return 1

    cmd = [sys.executable, str(script_path)]
    if args:
        cmd.extend(args)

    logger.info(f"Running: {' '.join(cmd)}")

    result = subprocess.run(cmd)
    return result.returncode


def train_type3(sample_size: int = 10000) -> int:
    """
    Train the Type-3 clone detection model.

    Args:
        sample_size: Number of training samples

    Returns:
        Exit code
    """
    logger.info("=" * 60)
    logger.info("Training Type-3 Clone Detection Model")
    logger.info("=" * 60)

    return run_script("train_type3.py", ["--sample-size", str(sample_size), "--test"])


def train_type4(sample_size: int = 15000) -> int:
    """
    Train the Type-4 clone detection model.

    Args:
        sample_size: Number of training samples

    Returns:
        Exit code
    """
    logger.info("=" * 60)
    logger.info("Training Type-4 Clone Detection Model")
    logger.info("=" * 60)

    return run_script("train_type4.py", ["--sample-size", str(sample_size), "--test"])


def evaluate_bcb(sample_size: int = 5000) -> int:
    """
    Evaluate models on BigCloneBench.

    Args:
        sample_size: Number of evaluation samples

    Returns:
        Exit code
    """
    logger.info("=" * 60)
    logger.info("Evaluating on BigCloneBench")
    logger.info("=" * 60)

    return run_script("evaluate_bcb.py", ["--sample-size", str(sample_size)])


def run_full_pipeline(
    train_type3_samples: int = 10000,
    train_type4_samples: int = 15000,
    eval_samples: int = 5000,
) -> dict:
    """
    Run the complete training and evaluation pipeline.

    Args:
        train_type3_samples: Samples for Type-3 training
        train_type4_samples: Samples for Type-4 training
        eval_samples: Samples for evaluation

    Returns:
        Dictionary with success status for each step
    """
    results = {}
    start_time = time.time()

    # Check environment
    logger.info("\n" + "=" * 60)
    logger.info("CLONE DETECTION SYSTEM - FULL PIPELINE")
    logger.info("=" * 60)

    if not check_environment():
        results["environment"] = False
        return results
    results["environment"] = True

    # Train Type-3 model
    exit_code = train_type3(train_type3_samples)
    results["train_type3"] = exit_code == 0

    if not results["train_type3"]:
        logger.error("Type-3 training failed!")

    # Train Type-4 model
    exit_code = train_type4(train_type4_samples)
    results["train_type4"] = exit_code == 0

    if not results["train_type4"]:
        logger.error("Type-4 training failed!")

    # Evaluate on BigCloneBench
    if results["train_type3"] or results["train_type4"]:
        exit_code = evaluate_bcb(eval_samples)
        results["evaluate_bcb"] = exit_code == 0
    else:
        logger.warning("Skipping evaluation - no models trained")
        results["evaluate_bcb"] = False

    # Summary
    total_time = time.time() - start_time

    logger.info("\n" + "=" * 60)
    logger.info("PIPELINE SUMMARY")
    logger.info("=" * 60)
    logger.info(
        f"Environment Check:     {'✓ PASS' if results.get('environment') else '✗ FAIL'}"
    )
    logger.info(
        f"Type-3 Training:       {'✓ PASS' if results.get('train_type3') else '✗ FAIL'}"
    )
    logger.info(
        f"Type-4 Training:       {'✓ PASS' if results.get('train_type4') else '✗ FAIL'}"
    )
    logger.info(
        f"BigCloneBench Eval:    {'✓ PASS' if results.get('evaluate_bcb') else '✗ FAIL'}"
    )
    logger.info(f"Total Time:            {total_time:.2f} seconds")
    logger.info("=" * 60)

    # Check if all passed
    all_passed = all(results.values())

    if all_passed:
        logger.info("\n✓ All pipeline steps completed successfully!")
    else:
        logger.warning("\n✗ Some pipeline steps failed. Check logs above.")

    return results


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Clone Detection System - Main Pipeline Orchestrator"
    )

    parser.add_argument("--setup", action="store_true", help="Check environment setup")
    parser.add_argument(
        "--train-type3", action="store_true", help="Train Type-3 clone detection model"
    )
    parser.add_argument(
        "--train-type4", action="store_true", help="Train Type-4 clone detection model"
    )
    parser.add_argument(
        "--evaluate", action="store_true", help="Evaluate on BigCloneBench"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run complete pipeline (setup + train + evaluate)",
    )
    parser.add_argument(
        "--type3-samples",
        type=int,
        default=10000,
        help="Number of samples for Type-3 training (default: 10000)",
    )
    parser.add_argument(
        "--type4-samples",
        type=int,
        default=15000,
        help="Number of samples for Type-4 training (default: 15000)",
    )
    parser.add_argument(
        "--eval-samples",
        type=int,
        default=5000,
        help="Number of samples for evaluation (default: 5000)",
    )
    parser.add_argument("--quiet", action="store_true", help="Reduce output verbosity")

    args = parser.parse_args()

    # Set random seed
    set_random_seed(42)

    # Default to showing help if no arguments
    if len(sys.argv) == 1:
        parser.print_help()
        return 0

    # Run requested operations
    exit_code = 0

    if args.setup or args.all:
        if not check_environment():
            return 1

    if args.train_type3 or args.all:
        code = train_type3(args.type3_samples)
        if code != 0:
            exit_code = code

    if args.train_type4 or args.all:
        code = train_type4(args.type4_samples)
        if code != 0:
            exit_code = code

    if args.evaluate or args.all:
        code = evaluate_bcb(args.eval_samples)
        if code != 0:
            exit_code = code

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
