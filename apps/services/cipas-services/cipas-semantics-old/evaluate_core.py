#!/usr/bin/env python3
"""
Core evaluation logic for Type-IV Semantic Clone Detector.

This module contains the actual evaluation implementation.
"""

import json
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from tqdm import tqdm

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)


# =============================================================================
# Parallel Feature Extraction Worker
# =============================================================================

def extract_features_worker(args):
    """
    Worker function for parallel feature extraction.
    
    Args:
        args: Tuple of (code1, code2, language, index)
        
    Returns:
        Tuple of (index, features_array) or (index, None) on error
    """
    code1, code2, language, idx = args
    try:
        extractor = SheneamerFeatureExtractor()
        fused = extractor.extract_fused_features(code1, code2, language)
        return (idx, fused)
    except Exception:
        # Return None for failed extractions
        return (idx, None)


def extract_features_parallel(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    workers: Optional[int] = None,
) -> np.ndarray:
    """
    Extract features in parallel using multiprocessing.
    
    Args:
        code1_list: List of first code samples
        code2_list: List of second code samples
        language: Programming language
        workers: Number of worker processes (default: CPU count)
        
    Returns:
        Feature matrix as numpy array
    """
    if workers is None:
        workers = min(mp.cpu_count(), 16)
    
    logger.info(f"Extracting features with {workers} workers...")
    
    # Prepare work items
    work_items = [
        (code1, code2, language, idx)
        for idx, (code1, code2) in enumerate(zip(code1_list, code2_list))
    ]
    
    features = [None] * len(work_items)
    failed_count = 0
    
    # Process in parallel with progress bar
    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(extract_features_worker, item): item
            for item in work_items
        }
        
        with tqdm(total=len(futures), desc="Extracting features") as pbar:
            for future in as_completed(futures):
                idx, result = future.result()
                if result is not None:
                    features[idx] = result
                else:
                    failed_count += 1
                    features[idx] = None
                pbar.update(1)
    
    # Fill None values with zeros
    if failed_count > 0:
        logger.warning(f"Failed to extract features for {failed_count} pairs")
        feature_dim = next((f.shape[0] for f in features if f is not None), 0)
        features = [f if f is not None else np.zeros(feature_dim) for f in features]
    
    return np.array(features)


def load_gptclonebench_dataset(
    dataset_path: str,
    sample_size: Optional[int] = None,
) -> tuple[list[str], list[str], list[int], list[dict]]:
    """Load GPTCloneBench dataset."""
    code1_list, code2_list, labels, metadata = [], [], [], []

    logger.info(f"Loading GPTCloneBench from {dataset_path}...")

    with open(dataset_path, "r", encoding="utf-8") as f:
        total_lines = sum(1 for _ in f)

    logger.info(f"Found {total_lines} entries")

    with open(dataset_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if sample_size and i >= sample_size:
                break

            try:
                data = json.loads(line)
                code1 = data.get("code1", "")
                code2 = data.get("code2", "")
                label = 1 if data.get("semantic", False) else 0
                meta = data.get("metadata", {})

                if code1 and code2:
                    code1_list.append(code1)
                    code2_list.append(code2)
                    labels.append(label)
                    metadata.append(meta)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse line {i}: {e}")

    logger.info(f"Loaded {len(code1_list)} code pairs")
    return code1_list, code2_list, labels, metadata


def evaluate_model(
    model_path: str,
    dataset_path: str = "../../../../datasets/gptclonebench/gptclonebench_dataset.jsonl",
    language: str = "java",
    sample_size: Optional[int] = 1000,
    threshold: Optional[float] = None,
    threshold_sweep: bool = True,
    visualize: bool = True,
    output_dir: str = "./evaluation_output",
) -> dict:
    """
    Evaluate a trained model on a dataset.

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

    # Extract features in parallel
    logger.info("Extracting features in parallel...")
    n_workers = min(mp.cpu_count(), 16)  # Cap at 16 workers
    logger.info(f"Using {n_workers} parallel workers")
    
    X_test = extract_features_parallel(
        code1_list=code1_list,
        code2_list=code2_list,
        language=language,
        workers=n_workers,
    )
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
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION RESULTS")
    logger.info("=" * 80)
    logger.info("\nDataset Statistics:")
    logger.info(f"  Total samples: {len(y_test):,}")
    logger.info(f"  Clones: {sum(y_test):,} ({sum(y_test) / len(y_test) * 100:.1f}%)")
    logger.info(
        f"  Non-clones: {len(y_test) - sum(y_test):,} ({(len(y_test) - sum(y_test)) / len(y_test) * 100:.1f}%)"
    )

    logger.info("\nOverall Metrics:")
    logger.info(f"  Accuracy:     {metrics['accuracy']:.4f}")
    logger.info(f"  Precision:    {metrics['precision']:.4f}")
    logger.info(f"  Recall:       {metrics['recall']:.4f}")
    logger.info(f"  F1 Score:     {metrics['f1']:.4f}")
    logger.info(f"  Macro-F1:     {metrics['macro_f1']:.4f}")
    logger.info(f"  ROC AUC:      {metrics['roc_auc']:.4f}")

    logger.info("\nConfusion Matrix:")
    logger.info(f"  [[{cm[0][0]:5d}  {cm[0][1]:5d}]   [TN   FP]")
    logger.info(f"   [{cm[1][0]:5d}  {cm[1][1]:5d}]]  [FN   TP]")

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
        try:
            from clone_detection.utils.metrics_visualization import MetricsVisualizer

            visualizer = MetricsVisualizer(output_dir=output_dir)

            # Get feature names (create extractor instance for metadata)
            extractor = SheneamerFeatureExtractor()
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
        except Exception as e:
            logger.warning(f"Visualization failed: {e}")

    # Save metrics
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    metrics_file = output_path / f"metrics_{language}.json"
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    logger.info(f"Metrics saved to: {metrics_file}")

    return {"metrics": metrics, "language": language}
