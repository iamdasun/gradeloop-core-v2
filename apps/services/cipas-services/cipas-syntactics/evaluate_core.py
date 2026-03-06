#!/usr/bin/env python3
"""
Core evaluation logic for Syntactic Clone Detector.

This module contains the actual evaluation implementation.
"""

import json
import logging
import random
from datetime import datetime, timezone
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

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.pipelines import TieredPipeline
from clone_detection.type3_filter import is_type3_clone
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

DEFAULT_BCB_PATH = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/"
    "bigclonebench_balanced.json"
)
SYNTACTIC_CLONE_TYPES = {1, 2, 3}


def load_bcb_dataset(
    bcb_path: Path,
    clone_types: set[int] | None = None,
    sample_size: int | None = None,
) -> tuple[list[str], list[str], list[int], list[dict]]:
    """Load BigCloneBench Balanced dataset."""
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info(f"Loading BigCloneBench from {bcb_path} …")
    with open(bcb_path, "r", encoding="utf-8") as fh:
        records = json.load(fh)
    logger.info(f"  Loaded {len(records):,} total records")

    clones: list[dict] = []
    non_clones: list[dict] = []

    for rec in records:
        label = int(rec["label"])
        ct = int(rec.get("clone_type", 0))

        if label == 1:
            if ct in clone_types:
                clones.append(rec)
        else:
            non_clones.append(rec)

    logger.info(f"  Clones (Type-{sorted(clone_types)}): {len(clones):,}")
    logger.info(f"  Non-clones: {len(non_clones):,}")

    # Sample if requested
    if sample_size:
        if len(clones) > sample_size:
            clones = random.sample(clones, sample_size)
        if len(non_clones) > sample_size:
            non_clones = random.sample(non_clones, sample_size)

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []
    meta_list: list[dict] = []

    for rec in clones + non_clones:
        c1 = rec.get("code1", "").strip()
        c2 = rec.get("code2", "").strip()
        if c1 and c2:
            code1_list.append(c1)
            code2_list.append(c2)
            labels.append(int(rec["label"]))
            meta_list.append(rec)

    return code1_list, code2_list, labels, meta_list


def extract_features(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    include_node_types: bool = True,
) -> tuple[np.ndarray, list[str]]:
    """Extract hybrid String + AST features."""
    extractor = SyntacticFeatureExtractor(
        language=language, include_node_types=include_node_types
    )
    features: list[np.ndarray] = []
    failed = 0

    for c1, c2 in tqdm(
        zip(code1_list, code2_list),
        total=len(code1_list),
        desc="Extracting String + AST features",
    ):
        try:
            feat = extractor.extract_features_from_code(c1, c2, language)
            features.append(feat)
        except Exception as exc:
            logger.debug(f"Feature extraction failed: {exc}")
            failed += 1
            features.append(np.zeros(len(extractor.feature_names)))

    if failed:
        logger.warning(f"Feature extraction failed for {failed} pairs (zero-padded)")

    return np.array(features), extractor.get_feature_names()


def save_evaluation_artifacts(
    metrics: dict,
    clone_type_metrics: dict,
    y: np.ndarray,
    y_pred: np.ndarray,
    model,
    output_dir: Optional[Path] = None,
) -> None:
    """Persist evaluation metrics as JSON and generate visualisation plots."""
    if output_dir is None:
        output_dir = Path("./results/evaluate")
    output_dir = Path(output_dir)
    viz_dir = output_dir / "visualizations"
    viz_dir.mkdir(parents=True, exist_ok=True)

    # Metrics JSON
    serialisable_per_type = {
        str(ct): {
            k: (round(float(v), 6) if isinstance(v, float) else v) for k, v in m.items()
        }
        for ct, m in clone_type_metrics.items()
    }
    metrics_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            k: (round(float(v), 6) if isinstance(v, float) else v)
            for k, v in metrics.items()
        },
        "per_clone_type": serialisable_per_type,
    }
    metrics_path = output_dir / "evaluation_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(metrics_payload, fh, indent=2, default=str)
    logger.info(f"Evaluation metrics JSON saved  → {metrics_path}")

    # Visualizations (optional)
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import confusion_matrix as sk_cm

        # Confusion matrix
        cm = sk_cm(y, y_pred)
        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
        plt.colorbar(im, ax=ax)
        classes = ["Non-Clone", "Clone"]
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(classes)
        ax.set_yticklabels(classes)
        threshold_color = cm.max() / 2.0
        for i in range(2):
            for j in range(2):
                ax.text(
                    j,
                    i,
                    str(cm[i, j]),
                    ha="center",
                    va="center",
                    color="white" if cm[i, j] > threshold_color else "black",
                    fontsize=14,
                    fontweight="bold",
                )
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title("Confusion Matrix — Evaluation")
        fig.tight_layout()
        cm_path = viz_dir / "confusion_matrix_eval.png"
        fig.savefig(cm_path, dpi=150)
        plt.close(fig)
        logger.info(f"Confusion matrix plot saved     → {cm_path}")

        # Per-clone-type recall
        if clone_type_metrics:
            ct_labels = [f"Type-{ct}" for ct in sorted(clone_type_metrics)]
            ct_recalls = [
                clone_type_metrics[ct]["recall"] for ct in sorted(clone_type_metrics)
            ]
            colors = ["tomato" if r < 0.4 else "steelblue" for r in ct_recalls]

            fig, ax = plt.subplots(figsize=(8, 5))
            ax.barh(ct_labels, ct_recalls, color=colors)
            for i, rec in enumerate(ct_recalls):
                ax.text(rec + 0.01, i, f"{rec:.3f}", va="center", fontsize=9)
            ax.axhline(
                y=0.40, color="red", linestyle="--", alpha=0.7, label="Type-3 target"
            )
            ax.set_xlabel("Recall")
            ax.set_title("Per-Clone-Type Recall")
            ax.legend()
            ax.grid(axis="x", alpha=0.3)
            fig.tight_layout()
            ctr_path = viz_dir / "per_clone_type_recall.png"
            fig.savefig(ctr_path, dpi=150)
            plt.close(fig)
            logger.info(f"Per-clone-type recall plot saved → {ctr_path}")

    except ImportError:
        logger.warning("matplotlib not installed — skipping visualization plots")
    except Exception as exc:
        logger.warning(f"Visualization generation failed: {exc}")


def evaluate(
    model_name: str = "clone_detector_xgb.pkl",
    clone_types: Optional[set[int]] = None,
    sample_size: Optional[int] = None,
    include_node_types: bool = True,
    threshold: Optional[float] = None,
    log_type3_similarity: bool = False,
    output_dir: Optional[Path] = None,
    bcb_path: Optional[str] = None,
) -> dict:
    """
    Evaluate the two-stage clone detection pipeline on BigCloneBench Balanced.

    Returns:
        Dictionary containing evaluation metrics.
    """
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info("=" * 80)
    logger.info("Two-Stage Clone Detection — Pipeline Evaluation")
    logger.info("=" * 80)

    bcb_path = Path(bcb_path) if bcb_path else DEFAULT_BCB_PATH

    logger.info(f"Dataset: {bcb_path}")
    logger.info(f"Model: {model_name}")
    logger.info(f"Clone types: {sorted(clone_types)}")
    logger.info("=" * 80)

    # Load model
    logger.info(f"\nLoading model '{model_name}' …")
    try:
        model = SyntacticClassifier.load(model_name)
    except FileNotFoundError:
        logger.error("Model not found. Train first: python train.py")
        raise

    # Build NiCAD pipeline
    nicad_pipeline = TieredPipeline(classifier=None)

    # Load data
    logger.info("\nLoading evaluation dataset …")
    code1_list, code2_list, labels, meta_list = load_bcb_dataset(
        bcb_path=bcb_path,
        clone_types=clone_types,
        sample_size=sample_size,
    )

    total = len(labels)
    n_clones = sum(labels)
    n_nonclones = total - n_clones
    logger.info(
        f"\nTotal: {total:,} | Clones: {n_clones:,} | Non-clones: {n_nonclones:,}"
    )

    # Extract features
    logger.info("\nExtracting features …")
    X, raw_feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    # Filter features
    kept_indices = [raw_feature_names.index(f) for f in model.feature_names]
    X_filtered = X[:, kept_indices]
    feature_names = model.feature_names

    # Compute probabilities
    logger.info("\nComputing XGBoost probabilities …")
    y_proba_xgb = model.predict_proba(X_filtered)[:, 1]

    # Resolve threshold
    effective_threshold = threshold
    if effective_threshold is None:
        effective_threshold = getattr(model, "calibrated_threshold", 0.5)
        logger.info(f"Using threshold: {effective_threshold:.2f}")

    # Evaluate pairs
    logger.info("\nEvaluating pairs …")
    y_pred: list[int] = []
    y_proba_final: list[float] = []

    for i in tqdm(range(total), desc="Evaluating"):
        meta = meta_list[i]
        label = int(meta["label"])
        clone_type = int(meta.get("clone_type", 0))
        c1, c2 = code1_list[i], code2_list[i]
        prob_xgb = float(y_proba_xgb[i])

        if label == 1 and clone_type in {1, 2}:
            # NiCAD path
            try:
                result = nicad_pipeline._phase_one_nicad(c1, c2, "java")
                nicad_fired = result.clone_type in ("Type-1", "Type-2")
            except Exception:
                nicad_fired = False
            y_pred.append(1 if nicad_fired else 0)
            y_proba_final.append(prob_xgb)

        elif label == 1 and clone_type == 3:
            # XGBoost + Type-3 Filter
            if prob_xgb > effective_threshold:
                pred = int(is_type3_clone(X_filtered[i], feature_names, prob_xgb))
            else:
                pred = 0
            y_pred.append(pred)
            y_proba_final.append(prob_xgb)

        else:
            # Non-clones
            try:
                result = nicad_pipeline._phase_one_nicad(c1, c2, "java")
                nicad_fired = result.clone_type in ("Type-1", "Type-2")
            except Exception:
                nicad_fired = False
            if nicad_fired:
                pred = 1
            elif prob_xgb > effective_threshold:
                pred = int(is_type3_clone(X_filtered[i], feature_names, prob_xgb))
            else:
                pred = 0
            y_pred.append(pred)
            y_proba_final.append(prob_xgb)

    y_pred_arr = np.array(y_pred)
    y_proba_arr = np.array(y_proba_final)

    # Calculate metrics
    metrics = {
        "accuracy": accuracy_score(y, y_pred_arr),
        "precision": precision_score(y, y_pred_arr, zero_division=0),
        "recall": recall_score(y, y_pred_arr, zero_division=0),
        "f1": f1_score(y, y_pred_arr, zero_division=0),
        "roc_auc": roc_auc_score(y, y_proba_arr),
        "threshold": effective_threshold,
    }

    # Per-clone-type breakdown
    clone_type_metrics: dict[int, dict] = {}
    for ct in sorted(clone_types):
        ct_idx = [
            i
            for i, m in enumerate(meta_list)
            if int(m["label"]) == 1 and int(m.get("clone_type", 0)) == ct
        ]
        if not ct_idx:
            continue

        ct_y = y[ct_idx]
        ct_pred = y_pred_arr[ct_idx]
        tp = int(np.sum((ct_y == 1) & (ct_pred == 1)))
        fn = int(np.sum((ct_y == 1) & (ct_pred == 0)))
        recall_ct = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        clone_type_metrics[ct] = {
            "count": len(ct_idx),
            "tp": tp,
            "fn": fn,
            "recall": recall_ct,
        }

    # Print report
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT")
    logger.info("=" * 80)
    logger.info(f"Accuracy : {metrics['accuracy']:.4f}")
    logger.info(f"Precision: {metrics['precision']:.4f}")
    logger.info(f"Recall   : {metrics['recall']:.4f}")
    logger.info(f"F1 Score : {metrics['f1']:.4f}")
    logger.info(f"ROC AUC  : {metrics['roc_auc']:.4f}")
    logger.info(f"Threshold: {metrics['threshold']:.2f}")

    if clone_type_metrics:
        logger.info("\nPer-Clone-Type Recall:")
        for ct, m in sorted(clone_type_metrics.items()):
            logger.info(f"  Type-{ct}: {m['recall']:.4f} (n={m['count']})")

    # Save artifacts
    save_evaluation_artifacts(
        metrics=metrics,
        clone_type_metrics=clone_type_metrics,
        y=y,
        y_pred=y_pred_arr,
        model=model,
        output_dir=output_dir,
    )

    logger.info(f"\n{'=' * 80}")
    logger.info(f"Results saved to: {output_dir or './results/evaluate'}")
    logger.info("=" * 80)

    return {
        "metrics": metrics,
        "per_clone_type": clone_type_metrics,
    }
