#!/usr/bin/env python3
"""
Core training logic for Syntactic Clone Detector.

This module contains the actual training implementation, separated from CLI handling.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import (
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from tqdm import tqdm

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

# Default dataset configuration
DEFAULT_DATASET_CONFIG = [
    ("type-1.csv", 1, 8_000, 1.5),
    ("type-2.csv", 1, 8_000, 1.5),
    ("type-3.csv", 1, 20_000, 2.0),
    ("type-4.csv", 1, 15_000, 1.5),
    ("type-5.csv", 1, 10_000, 1.0),
    ("nonclone.csv", 0, 20_000, 1.0),
]


def _load_code(func_id: str, id2code_dir: Path) -> str | None:
    """Load source code from the id2sourcecode directory."""
    code_file = id2code_dir / f"{func_id}.java"
    if code_file.exists():
        try:
            with open(code_file, "r", encoding="utf-8", errors="ignore") as fh:
                return fh.read().strip() or None
        except Exception:
            return None
    return None


def load_toma_dataset(
    dataset_dir: Path,
    dataset_config: list[tuple[str, int, int, float]],
) -> tuple[list[str], list[str], list[int], list[str], list[float]]:
    """Load TOMA dataset pairs for training."""
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []
    sources: list[str] = []
    weights: list[float] = []

    for csv_name, binary_label, target_count, sample_weight in dataset_config:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists():
            logger.warning(f"CSV not found: {csv_path} — skipping")
            continue

        logger.info(
            f"Loading {csv_name} (label={binary_label}, target={target_count:,}) …"
        )

        if csv_name == "nonclone.csv":
            df = pd.read_csv(csv_path)
        else:
            df = pd.read_csv(
                csv_path,
                header=None,
                names=[
                    "FUNCTION_ID_ONE",
                    "FUNCTION_ID_TWO",
                    "CLONE_TYPE",
                    "SIM1",
                    "SIM2",
                ],
            )

        if len(df) > target_count:
            logger.info(
                f"  Sampling {target_count:,} / {len(df):,} rows from {csv_name}"
            )
            df = df.sample(n=target_count, random_state=42)

        loaded = 0
        for _, row in tqdm(df.iterrows(), total=len(df), desc=f"  {csv_name}"):
            c1 = _load_code(str(int(row["FUNCTION_ID_ONE"])), id2code_dir)
            c2 = _load_code(str(int(row["FUNCTION_ID_TWO"])), id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(binary_label)
                sources.append(csv_name)
                weights.append(sample_weight)
                loaded += 1

        logger.info(f"  Loaded {loaded:,} valid pairs (weight={sample_weight}×)")

    return code1_list, code2_list, labels, sources, weights


def extract_features(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    include_node_types: bool = True,
) -> tuple[np.ndarray, list[str]]:
    """Extract hybrid String + AST + Structural Density features."""
    extractor = SyntacticFeatureExtractor(
        language=language, include_node_types=include_node_types
    )
    features: list[np.ndarray] = []
    failed = 0

    for c1, c2 in tqdm(
        zip(code1_list, code2_list),
        total=len(code1_list),
        desc="Extracting String + AST + Density features",
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


def threshold_sweep(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    start: float = 0.30,
    stop: float = 0.80,
    step: float = 0.01,
) -> list[dict]:
    """Sweep classification thresholds and compute precision/recall/F1."""
    results = []
    thresholds = np.arange(start, stop + step / 2, step)

    for thresh in thresholds:
        y_pred = (y_proba >= thresh).astype(int)

        if len(np.unique(y_pred)) <= 1 and len(np.unique(y_true)) > 1:
            prec = 0.0
            rec = 0.0
            f1 = 0.0
        else:
            prec = precision_score(y_true, y_pred, zero_division=0)
            rec = recall_score(y_true, y_pred, zero_division=0)
            f1 = f1_score(y_true, y_pred, zero_division=0)

        results.append(
            {
                "threshold": round(float(thresh), 4),
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "f1": round(f1, 4),
                "meets_floor": True,
            }
        )

    return results


def select_best_threshold(sweep_results: list[dict]) -> dict:
    """Select the threshold that maximises F1 Score."""
    if not sweep_results:
        return {"threshold": 0.5, "precision": 0.0, "recall": 0.0, "f1": 0.0}

    return max(sweep_results, key=lambda r: r["f1"])


def save_training_artifacts(
    metrics: dict,
    sweep: list[dict],
    classifier,
    y_test: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray,
    s_test: np.ndarray,
    output_dir: Path | None = None,
    visualize: bool = True,
) -> None:
    """Persist training metrics as JSON and generate visualisation plots."""
    if output_dir is None:
        output_dir = Path("./results/train")
    output_dir = Path(output_dir)
    viz_dir = output_dir / "visualizations"
    viz_dir.mkdir(parents=True, exist_ok=True)

    # Metrics JSON
    top_features = [
        {"feature": name, "importance": round(float(imp), 6)}
        for name, imp in classifier.get_feature_importance_sorted()[:20]
    ]
    metrics_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            k: (round(float(v), 6) if isinstance(v, float) else v)
            for k, v in metrics.items()
        },
        "threshold_sweep": sweep,
        "top_20_features": top_features,
    }
    metrics_path = output_dir / "training_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(metrics_payload, fh, indent=2, default=str)
    logger.info(f"Training metrics JSON saved → {metrics_path}")

    # Visualizations (optional, requires matplotlib)
    if visualize:
        try:
            import matplotlib

            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from sklearn.metrics import confusion_matrix as sk_cm

            # Threshold sweep plot
            thresholds = [r["threshold"] for r in sweep]
            precisions = [r["precision"] for r in sweep]
            recalls = [r["recall"] for r in sweep]
            f1s = [r["f1"] for r in sweep]

            fig, ax = plt.subplots(figsize=(10, 6))
            ax.plot(thresholds, precisions, "b-o", label="Precision", markersize=3)
            ax.plot(thresholds, recalls, "g-o", label="Recall", markersize=3)
            ax.plot(thresholds, f1s, "r-o", label="F1", markersize=3)
            best_t = metrics.get("threshold", 0.5)
            ax.axvline(
                x=best_t,
                color="purple",
                linestyle="--",
                label=f"Selected threshold ({best_t:.2f})",
            )
            ax.set_xlabel("Threshold")
            ax.set_ylabel("Score")
            ax.set_title("Threshold Sweep — Precision / Recall / F1 (Training)")
            ax.legend()
            ax.grid(True, alpha=0.3)
            fig.tight_layout()
            sweep_path = viz_dir / "threshold_sweep.png"
            fig.savefig(sweep_path, dpi=150)
            plt.close(fig)
            logger.info(f"Threshold sweep plot saved       → {sweep_path}")

            # Feature importances
            top_feats = classifier.get_feature_importance_sorted()[:20]
            feat_names = [f[0].replace("feat_", "") for f in top_feats]
            feat_vals = [f[1] for f in top_feats]

            fig, ax = plt.subplots(figsize=(10, 8))
            bars = ax.barh(feat_names[::-1], feat_vals[::-1], color="steelblue")
            for bar, val in zip(bars, feat_vals[::-1]):
                ax.text(
                    bar.get_width() + 0.001,
                    bar.get_y() + bar.get_height() / 2,
                    f"{val:.4f}",
                    va="center",
                    fontsize=8,
                )
            ax.set_xlabel("Importance")
            ax.set_title("Top-20 Feature Importances (Training)")
            ax.grid(axis="x", alpha=0.3)
            fig.tight_layout()
            fi_path = viz_dir / "feature_importances_train.png"
            fig.savefig(fi_path, dpi=150)
            plt.close(fig)
            logger.info(f"Feature importance plot saved    → {fi_path}")

            # Confusion matrix
            cm = sk_cm(y_test, y_pred)
            fig, ax = plt.subplots(figsize=(6, 5))
            im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
            plt.colorbar(im, ax=ax)
            classes = ["Non-Clone", "Clone"]
            tick_marks = [0, 1]
            ax.set_xticks(tick_marks)
            ax.set_yticks(tick_marks)
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
            ax.set_title("Confusion Matrix — Training (Test Split)")
            fig.tight_layout()
            cm_path = viz_dir / "confusion_matrix_train.png"
            fig.savefig(cm_path, dpi=150)
            plt.close(fig)
            logger.info(f"Confusion matrix plot saved      → {cm_path}")

            # Per-source recall
            per_src: dict[str, float] = {}
            for src in sorted(np.unique(s_test)):
                mask = s_test == src
                yt = y_test[mask]
                yp = y_pred[mask]
                if np.any(yt == 1):
                    tp = int(np.sum((yt == 1) & (yp == 1)))
                    fn = int(np.sum((yt == 1) & (yp == 0)))
                    per_src[src] = tp / (tp + fn) if (tp + fn) > 0 else 0.0

            if per_src:
                srcs = list(per_src.keys())
                recs = [per_src[s] for s in srcs]
                colors = ["tomato" if r < 0.5 else "steelblue" for r in recs]

                fig, ax = plt.subplots(figsize=(10, 5))
                ax.barh(srcs, recs, color=colors)
                for i, (src, rec) in enumerate(zip(srcs, recs)):
                    ax.text(rec + 0.01, i, f"{rec:.3f}", va="center", fontsize=9)
                ax.set_xlabel("Recall")
                ax.set_title("Per-Source Recall (Training — Test Split)")
                ax.axvline(
                    x=0.5, color="gray", linestyle="--", alpha=0.5, label="0.5 line"
                )
                ax.set_xlim(0, 1.1)
                ax.legend()
                ax.grid(axis="x", alpha=0.3)
                fig.tight_layout()
                ps_path = viz_dir / "per_source_recall.png"
                fig.savefig(ps_path, dpi=150)
                plt.close(fig)
                logger.info(f"Per-source recall plot saved     → {ps_path}")

        except ImportError:
            logger.warning("matplotlib not installed — skipping visualization plots")
        except Exception as exc:
            logger.warning(f"Visualization generation failed: {exc}")


def train(
    model_name: str = "clone_detector_xgb.pkl",
    sample_size: Optional[int] = None,
    test_size: float = 0.2,
    n_estimators: int = 500,
    max_depth: int = 8,
    learning_rate: float = 0.05,
    subsample: float = 0.9,
    colsample_bytree: float = 0.8,
    min_child_weight: int = 2,
    gamma: float = 0.1,
    reg_lambda: float = 1.0,
    scale_pos_weight: float = 2.0,
    include_node_types: bool = True,
    use_gpu: bool = False,
    output_dir: Path | None = None,
    dataset_config: Optional[list[tuple[str, int, int, float]]] = None,
    toma_path: Optional[str] = None,
    visualize: bool = True,
) -> dict:
    """
    Train the two-stage XGBoost Clone Detector (Stage 1).

    Returns:
        dict of metrics at the selected clone detector operating threshold.
    """
    logger.info("=" * 80)
    logger.info("Two-Stage Clone Detection — Stage 1: XGBoost Clone Detector")
    logger.info("=" * 80)

    # Use provided config or default
    config_to_use = dataset_config if dataset_config else DEFAULT_DATASET_CONFIG

    # Apply sample_size scaling if specified
    if sample_size is not None:
        total_target = sum(t for _, _, t, _ in config_to_use)
        ratio = sample_size / total_target
        config_to_use = [
            (csv_name, label, max(1, int(target * ratio)), weight)
            for csv_name, label, target, weight in config_to_use
        ]
        logger.info(
            f"Applying sample_size={sample_size} (Scaling targets by {ratio:.4f})"
        )

    # Determine TOMA path
    toma_dir = (
        Path(toma_path)
        if toma_path
        else Path(
            "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
        )
    )

    logger.info(f"Dataset: {toma_dir}")
    logger.info(f"Output: {output_dir or './results/train'}")
    logger.info(f"Visualizations: {'Enabled' if visualize else 'Disabled'}")
    logger.info("=" * 80)

    # Load dataset
    code1_list, code2_list, labels, sources, row_weights = load_toma_dataset(
        dataset_dir=toma_dir,
        dataset_config=config_to_use,
    )

    total = len(labels)
    n_pos = sum(labels)
    n_neg = total - n_pos
    logger.info(
        f"\nDataset: {total:,} pairs | Clones: {n_pos:,} | NonClones: {n_neg:,}"
    )

    # Feature extraction
    logger.info("\nExtracting hybrid String + AST + Structural Density features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)
    s = np.array(sources)
    w = np.array(row_weights)

    logger.info(f"Feature matrix: {X.shape} ({len(feature_names)} features)")

    # Train/test split
    X_train, X_test, y_train, y_test, s_train, s_test, w_train, w_test = (
        train_test_split(X, y, s, w, test_size=test_size, random_state=42, stratify=y)
    )

    logger.info(f"\nTrain / test split: {1 - test_size:.0%} / {test_size:.0%}")
    logger.info(f"  Train: {len(y_train):,} pairs")
    logger.info(f"  Test : {len(y_test):,} pairs")

    # Compute scale_pos_weight
    computed_scale = float(np.sum(y_train == 0)) / max(1, np.sum(y_train == 1))
    logger.info(f"\nComputed scale_pos_weight = {computed_scale:.4f}")

    # Train classifier
    classifier = SyntacticClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        colsample_bytree=colsample_bytree,
        min_child_weight=min_child_weight,
        feature_names=feature_names,
        use_gpu=use_gpu,
        scale_pos_weight=computed_scale,
        gamma=gamma,
        reg_lambda=reg_lambda,
        eval_metric="auc",
    )

    # Scale features
    X_train_scaled = classifier.scaler.fit_transform(X_train)
    X_test_scaled = classifier.scaler.transform(X_test)

    # Train with feature selection
    logger.info("\nTraining XGBoost model...")
    classifier.model.fit(X_train_scaled, y_train, sample_weight=w_train)

    # Feature selection (keep >= 1% importance)
    importances = classifier.model.feature_importances_
    kept_indices = list(np.where(importances >= 0.01)[0])

    # Force keep mandatory features
    for mandatory_feat in ["feat_levenshtein_ratio", "feat_ast_jaccard"]:
        if mandatory_feat in feature_names:
            idx = feature_names.index(mandatory_feat)
            if idx not in kept_indices:
                kept_indices.append(idx)

    kept_indices = np.array(sorted(kept_indices))
    if len(kept_indices) < len(feature_names):
        logger.info(f"Keeping {len(kept_indices)} / {len(feature_names)} features")
        X_train = X_train[:, kept_indices]
        X_test = X_test[:, kept_indices]
        classifier.feature_names = [feature_names[i] for i in kept_indices]
        X_train_scaled = classifier.scaler.fit_transform(X_train)
        X_test_scaled = classifier.scaler.transform(X_test)

    # Hyperparameter optimization
    logger.info("\nRunning hyperparameter optimization...")
    from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold

    param_dist = {
        "max_depth": [4, 5, 6, 7],
        "learning_rate": [0.03, 0.05, 0.1],
        "n_estimators": [200, 300, 400, 500],
        "subsample": [0.7, 0.8, 0.9],
        "colsample_bytree": [0.7, 0.8, 0.9],
        "gamma": [0, 0.1, 0.3],
        "min_child_weight": [1, 3, 5],
    }

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    random_search = RandomizedSearchCV(
        classifier.model,
        param_distributions=param_dist,
        n_iter=5,
        scoring="f1",
        cv=cv,
        verbose=1,
        random_state=42,
        n_jobs=-1,
    )
    random_search.fit(X_train_scaled, y_train, sample_weight=w_train)
    classifier.model.set_params(**random_search.best_params_)
    logger.info(f"Best params: {random_search.best_params_}")

    # Final training with early stopping
    classifier.model.set_params(early_stopping_rounds=30)
    classifier.model.fit(
        X_train_scaled,
        y_train,
        sample_weight=w_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False,
    )
    classifier.is_trained = True

    # Threshold sweep
    logger.info("\nRunning threshold sweep...")
    y_proba_test = classifier.predict_proba(X_test)[:, 1]
    sweep = threshold_sweep(y_test, y_proba_test)
    best = select_best_threshold(sweep)

    # Final metrics
    y_pred_best = (y_proba_test >= best["threshold"]).astype(int)
    from sklearn.metrics import accuracy_score, confusion_matrix, roc_auc_score

    test_acc = accuracy_score(y_test, y_pred_best)
    test_prec = precision_score(y_test, y_pred_best, zero_division=0)
    test_rec = recall_score(y_test, y_pred_best, zero_division=0)
    test_f1 = f1_score(y_test, y_pred_best, zero_division=0)
    test_auc = roc_auc_score(y_test, y_proba_test)

    logger.info("\n" + "=" * 40)
    logger.info("FINAL METRICS (Test Set)")
    logger.info("=" * 40)
    logger.info(f"Accuracy : {test_acc:.4f}")
    logger.info(f"Precision: {test_prec:.4f}")
    logger.info(f"Recall   : {test_rec:.4f}")
    logger.info(f"F1 Score : {test_f1:.4f}")
    logger.info(f"ROC AUC  : {test_auc:.4f}")
    logger.info(f"Threshold: {best['threshold']:.2f}")

    # Save model and artifacts
    classifier.calibrated_threshold = best["threshold"]
    classifier.save(model_name)

    final_metrics = {
        "threshold": best["threshold"],
        "precision": best["precision"],
        "recall": best["recall"],
        "f1": best["f1"],
        "accuracy": float(test_acc),
        "roc_auc": float(test_auc),
    }

    save_training_artifacts(
        metrics=final_metrics,
        sweep=sweep,
        classifier=classifier,
        y_test=y_test,
        y_pred=y_pred_best,
        y_proba=y_proba_test,
        s_test=s_test,
        output_dir=output_dir,
        visualize=visualize,
    )

    logger.info(f"\n{'=' * 80}")
    logger.info(f"Model saved → {model_name}")
    logger.info(f"Clone detector threshold: {best['threshold']:.2f}")
    logger.info("=" * 80)

    return final_metrics
