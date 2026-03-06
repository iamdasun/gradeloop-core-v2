#!/usr/bin/env python3
"""
Unified Evaluation Script for CIPAS Semantics - Type-4 Clone Detector.

Evaluates trained models on benchmark datasets with comprehensive metrics.

Usage:
    # Quick evaluation (default: GPTCloneBench, Java, 1000 samples)
    poetry run python evaluate.py

    # Evaluate specific model and language
    poetry run python evaluate.py \\
        --model models/type4_xgb_java.pkl \\
        --language java \\
        --sample-size 2000

    # Evaluate on all languages
    poetry run python evaluate.py \\
        --model models/type4_xgb_java.pkl \\
        --all-languages \\
        --sample-size 1000

    # Full evaluation with visualizations
    poetry run python evaluate.py \\
        --model models/type4_xgb_java.pkl \\
        --visualize \\
        --output-dir ./evaluation_results
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import setup_logging
from clone_detection.utils.metrics_visualization import MetricsVisualizer
from evaluate_gptclonebench import load_gptclonebench_dataset

logger = setup_logging(__name__)


def evaluate_model(
    model_path: str,
    dataset_path: str = "../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl",
    language: str = "java",
    sample_size: Optional[int] = 1000,
    threshold: Optional[float] = None,
    threshold_sweep: bool = True,
    visualize: bool = True,
    output_dir: str = "./evaluation_output",
) -> Dict:
    """
    Evaluate a trained model on a dataset.

    Args:
        model_path: Path to trained model (.pkl file)
        dataset_path: Path to evaluation dataset
        language: Programming language
        sample_size: Number of samples to evaluate (None = full dataset)
        threshold: Custom decision threshold (default: use calibrated threshold)
        threshold_sweep: Perform threshold analysis
        visualize: Generate visualizations
        output_dir: Output directory for results

    Returns:
        Evaluation metrics dictionary
    """
    logger.info("=" * 80)
    logger.info("CIPAS SEMANTICS - MODEL EVALUATION")
    logger.info("=" * 80)
    logger.info(f"Model: {model_path}")
    logger.info(f"Dataset: {dataset_path}")
    logger.info(f"Language: {language}")
    logger.info(f"Sample size: {sample_size or 'full dataset'}")
    logger.info("=" * 80)

    # Load model
    logger.info(f"\nLoading model from {model_path}...")
    model = SemanticClassifier.load(Path(model_path).name)
    logger.info(f"Model threshold: {model.get_threshold():.3f}")

    # Set custom threshold if provided
    if threshold is not None:
        model.set_threshold(threshold)
        logger.info(f"Using custom threshold: {threshold:.3f}")

    # Load dataset
    logger.info(f"\nLoading dataset from {dataset_path}...")
    code1_list, code2_list, labels, metadata = load_gptclonebench_dataset(
        dataset_path, sample_size=sample_size
    )
    logger.info(f"Loaded {len(code1_list)} code pairs")

    # Extract features
    logger.info("Extracting features...")
    extractor = SheneamerFeatureExtractor()
    features = []
    for code1, code2 in zip(code1_list, code2_list):
        fused = extractor.extract_fused_features(code1, code2, language)
        features.append(fused)

    X_test = np.array(features)
    y_test = np.array(labels)
    logger.info(f"Feature matrix shape: {X_test.shape}")

    # Make predictions
    logger.info("Making predictions...")
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    # Calculate metrics
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba) if len(set(y_test)) > 1 else 0.5,
        "macro_f1": (
            f1_score(y_test, y_pred, pos_label=0, zero_division=0)
            + f1_score(y_test, y_pred, pos_label=1, zero_division=0)
        )
        / 2,
        "threshold_used": model.get_threshold(),
    }

    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    metrics["confusion_matrix"] = cm.tolist()
    metrics["true_negatives"] = int(cm[0][0])
    metrics["false_positives"] = int(cm[0][1])
    metrics["false_negatives"] = int(cm[1][0])
    metrics["true_positives"] = int(cm[1][1])

    # Print results
    print_evaluation_report(metrics, y_test, y_pred)

    # Threshold sweep
    if threshold_sweep:
        logger.info("\nPerforming threshold sweep analysis...")
        sweep_results = model.threshold_sweep(X_test, y_test)

        optimal_f1 = model.find_optimal_threshold(X_test, y_test, metric="f1")
        optimal_macro_f1 = model.find_optimal_threshold(
            X_test, y_test, metric="f1_macro"
        )

        metrics["optimal_threshold_f1"] = float(optimal_f1)
        metrics["optimal_threshold_macro_f1"] = float(optimal_macro_f1)

        # Save sweep results
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        sweep_csv = output_path / "threshold_sweep_results.csv"
        sweep_results.to_csv(sweep_csv, index=False)
        logger.info(f"Threshold sweep saved to: {sweep_csv}")

        logger.info(f"\nOptimal threshold for F1: {optimal_f1:.3f}")
        logger.info(f"Optimal threshold for Macro-F1: {optimal_macro_f1:.3f}")

    # Generate visualizations
    if visualize:
        logger.info("\nGenerating visualizations...")
        visualizer = MetricsVisualizer(output_dir=output_dir)

        feature_names = extractor.get_feature_names(fused=True)
        if hasattr(model, "feature_names") and model.feature_names:
            feature_names = model.feature_names

        extra_info = {
            "dataset": "GPTCloneBench",
            "language": language,
            "model": model_path,
            "total_samples": len(y_test),
            "feature_count": X_test.shape[1],
        }

        report_files = visualizer.create_complete_report(
            y_true=y_test,
            y_pred=y_pred,
            y_scores=y_proba,
            metrics=metrics,
            feature_names=feature_names,
            importances=model.base_model.feature_importances_,
            extra_info=extra_info,
            report_name=f"evaluation_report_{language}.html",
        )

        logger.info(f"Visualizations saved to: {report_files['html_report']}")
        metrics["visualization_path"] = str(report_files["html_report"])

    # Save metrics
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    metrics_file = output_path / f"metrics_{language}.json"
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    logger.info(f"Metrics saved to: {metrics_file}")

    return metrics


def print_evaluation_report(metrics: Dict, y_test: np.ndarray, y_pred: np.ndarray):
    """Print formatted evaluation report."""
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION RESULTS")
    logger.info("=" * 80)

    logger.info(f"\nDataset Statistics:")
    logger.info(f"  Total samples: {len(y_test):,}")
    logger.info(f"  Clones: {sum(y_test):,} ({sum(y_test) / len(y_test) * 100:.1f}%)")
    logger.info(
        f"  Non-clones: {len(y_test) - sum(y_test):,} ({(len(y_test) - sum(y_test)) / len(y_test) * 100:.1f}%)"
    )

    logger.info(f"\nOverall Metrics:")
    logger.info(f"  Accuracy:     {metrics['accuracy']:.4f}")
    logger.info(f"  Precision:    {metrics['precision']:.4f}")
    logger.info(f"  Recall:       {metrics['recall']:.4f}")
    logger.info(f"  F1 Score:     {metrics['f1']:.4f}")
    logger.info(f"  Macro-F1:     {metrics['macro_f1']:.4f}")
    logger.info(f"  ROC AUC:      {metrics['roc_auc']:.4f}")

    logger.info(f"\nPer-Class F1 Scores:")
    logger.info(
        f"  Non-Clone F1: {metrics['f1'] - (metrics['f1'] - f1_score(y_test, y_pred, pos_label=0, zero_division=0)):.4f}"
    )
    logger.info(
        f"  Clone F1:     {f1_score(y_test, y_pred, pos_label=1, zero_division=0):.4f}"
    )

    logger.info(f"\nConfusion Matrix:")
    cm = np.array(metrics["confusion_matrix"])
    logger.info(f"  [[{cm[0][0]:5d}  {cm[0][1]:5d}]   [TN   FP]")
    logger.info(f"   [{cm[1][0]:5d}  {cm[1][1]:5d}]]  [FN   TP]")

    logger.info(f"\nThreshold: {metrics['threshold_used']:.3f}")


def main():
    """Main evaluation entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate CIPAS Semantics Type-4 Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Quick evaluation (default settings)
  poetry run python evaluate.py

  # Evaluate specific model
  poetry run python evaluate.py \\
    --model models/type4_xgb_java.pkl \\
    --language java \\
    --sample-size 2000

  # Evaluate on all languages
  poetry run python evaluate.py \\
    --model models/type4_xgb_java.pkl \\
    --all-languages

  # Full evaluation with visualizations
  poetry run python evaluate.py \\
    --model models/type4_xgb_java.pkl \\
    --visualize \\
    --output-dir ./my_evaluation
        """,
    )

    # Model arguments
    parser.add_argument(
        "--model",
        type=str,
        default="models/type4_xgb_java.pkl",
        help="Path to trained model (default: models/type4_xgb_java.pkl)",
    )

    # Dataset arguments
    parser.add_argument(
        "--dataset",
        type=str,
        default="../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl",
        help="Path to evaluation dataset (default: GPTCloneBench)",
    )
    parser.add_argument(
        "--language",
        type=str,
        default=None,
        choices=["java", "python", "c", "csharp"],
        help="Programming language (default: all 4 if not specified)",
    )
    parser.add_argument(
        "--all-languages",
        action="store_true",
        help="Evaluate on all 4 languages",
    )

    # Evaluation arguments
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Number of samples to evaluate (default: FULL dataset)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Custom decision threshold (default: use calibrated threshold)",
    )
    parser.add_argument(
        "--no-threshold-sweep",
        action="store_true",
        help="Disable threshold sweep analysis",
    )

    # Output arguments
    parser.add_argument(
        "--visualize",
        action="store_true",
        default=True,
        help="Generate visualizations (default: enabled)",
    )
    parser.add_argument(
        "--no-visualize",
        action="store_true",
        help="Disable visualizations",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./results/evaluate",
        help="Output directory (default: ./results/evaluate)",
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

    # Configure logging
    logging.getLogger().setLevel(getattr(logging, args.log_level))

    # Determine languages
    if args.all_languages:
        # When --all-languages is specified, evaluate on all languages with the specified model
        languages = ["java", "python", "c", "csharp"]
        logger.info(f"Evaluating {args.model} on ALL 4 languages...")
    elif args.language is None:
        # Default to all 4 languages with language-specific models
        languages = ["java", "python", "c", "csharp"]
        logger.info("No language specified. Evaluating on ALL 4 languages by default.")
    else:
        languages = [args.language]

    # Run evaluation for each language
    all_results = {}
    for lang in languages:
        logger.info(f"\n{'=' * 80}")
        logger.info(f"EVALUATING LANGUAGE: {lang.upper()}")
        logger.info(f"{'=' * 80}\n")

        # Determine model path - use specified model for all languages
        model_path = args.model

        # Check if model exists
        if not Path(model_path).exists():
            logger.warning(f"Model not found: {model_path}. Skipping {lang}...")
            continue

        # Evaluate
        metrics = evaluate_model(
            model_path=model_path,
            dataset_path=args.dataset,
            language=lang,
            sample_size=args.sample_size,
            threshold=args.threshold,
            threshold_sweep=not args.no_threshold_sweep,
            visualize=args.visualize and not args.no_visualize,
            output_dir=args.output_dir,
        )

        all_results[lang] = metrics

    # Print summary
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION COMPLETE - SUMMARY")
    logger.info("=" * 80)

    if all_results:
        logger.info(
            f"\n{'Language':<12} {'Accuracy':<10} {'Precision':<10} {'Recall':<10} {'F1':<10} {'Macro-F1':<10}"
        )
        logger.info("-" * 62)
        for lang, metrics in all_results.items():
            logger.info(
                f"{lang:<12} {metrics['accuracy']:<10.4f} {metrics['precision']:<10.4f} "
                f"{metrics['recall']:<10.4f} {metrics['f1']:<10.4f} {metrics['macro_f1']:<10.4f}"
            )

    logger.info(f"\nOutputs saved to: {Path(args.output_dir).absolute()}")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
