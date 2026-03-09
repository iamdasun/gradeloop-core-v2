#!/usr/bin/env python3
"""
Evaluate Syntactic Clone Detector on BigCloneBench Balanced.

Usage:
    python evaluate.py                          # Use config.yaml defaults
    python evaluate.py --config config.yaml     # Specify custom config
    python evaluate.py --sample-size 2000       # Override specific values
"""

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from tqdm import tqdm
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
)

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.pipelines import TieredPipeline
from clone_detection.utils.common_setup import setup_logging, load_config
from clone_detection.utils.type3_filter import is_type3_clone

logger = setup_logging(__name__)

# ---------------------------------------------------------------------------
# Hardcoded evaluation dataset path
# ---------------------------------------------------------------------------
BCB_BALANCED_PATH = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/"
    "bigclonebench_balanced.json"
)

# Default output model (must match what train.py produced)
DEFAULT_MODEL_NAME = "clone_detector_xgb.pkl"

# Default config file path
DEFAULT_CONFIG_PATH = Path("config.yaml")

# Clone types that the SYNTACTIC model should predict as clones (label = 1)
# Type-4 (semantic) is excluded by default because this model is not trained
# to detect semantic clones.
SYNTACTIC_CLONE_TYPES = {1, 2, 3}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_bcb_dataset(
    bcb_path: Path,
    clone_types: set[int] | None = None,
    sample_size: int | None = None,
) -> tuple[list[str], list[str], list[int], list[dict]]:
    """
    Load code pairs from BigCloneBench Balanced JSON for binary evaluation.

    Args:
        bcb_path: Path to bigclonebench_balanced.json.
        clone_types: If set, only evaluate on pairs whose clone_type is in this
                     set (for clones) or all non-clones.  Default: {1, 2, 3}.
        sample_size: If set, sample at most this many pairs from each class.

    Returns:
        (code1_list, code2_list, labels, meta_list)
        meta_list: list of dicts with original record metadata for reporting.
    """
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info(f"Loading BigCloneBench Balanced from {bcb_path} …")
    with open(bcb_path, "r", encoding="utf-8") as fh:
        records = json.load(fh)
    logger.info(f"  Loaded {len(records):,} total records")

    clones: list[dict] = []
    non_clones: list[dict] = []
    skipped_type4 = 0

    for rec in records:
        label = int(rec["label"])
        ct = int(rec.get("clone_type", 0))

        if label == 1:
            if ct in clone_types:
                clones.append(rec)
            elif ct == 4:
                skipped_type4 += 1
        else:
            non_clones.append(rec)

    logger.info(
        f"  Syntactic clones (Type-{{{','.join(str(t) for t in sorted(clone_types))}}}): {len(clones):,}"
    )
    logger.info(
        f"  Non-clones                                      : {len(non_clones):,}"
    )
    if skipped_type4:
        logger.info(
            f"  Type-4 semantic clones skipped (excluded)       : {skipped_type4:,}"
        )

    # Sample if requested (independently per class)
    if sample_size:
        if len(clones) > sample_size:
            import random

            random.seed(0)
            clones = random.sample(clones, sample_size)
            logger.info(f"  Sampled {sample_size} clone pairs")
        if len(non_clones) > sample_size:
            import random

            random.seed(0)
            non_clones = random.sample(non_clones, sample_size)
            logger.info(f"  Sampled {sample_size} non-clone pairs")

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


# ---------------------------------------------------------------------------
# Feature extraction (used only for XGBoost / Type-3 path)
# ---------------------------------------------------------------------------


def extract_features(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    include_node_types: bool = True,
) -> tuple[np.ndarray, list[str]]:
    """Extract the same hybrid String + AST features used during training."""
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


# ---------------------------------------------------------------------------
# Artifact persistence — metrics JSON + visualizations
# ---------------------------------------------------------------------------


def save_evaluation_artifacts(
    metrics: dict,
    clone_type_metrics: dict,
    y: np.ndarray,
    y_pred: np.ndarray,
    model,
    output_dir: "Path | None" = None,
) -> None:
    """
    Persist evaluation metrics as JSON and generate visualisation plots.

    Outputs (all written to *output_dir*, default ``clone_detection/models/``):

    * ``evaluation_metrics.json``                         — overall + per-clone-type metrics
    * ``visualizations/confusion_matrix_eval.png``        — confusion matrix heatmap
    * ``visualizations/per_clone_type_recall.png``        — per-clone-type recall bar chart
    * ``visualizations/feature_importances_eval.png``     — top-20 XGBoost importances

    Args:
        metrics:            Dict with accuracy, precision, recall, f1, roc_auc, threshold.
        clone_type_metrics: Per-clone-type breakdown dict keyed by clone type integer.
        y:                  Ground-truth labels.
        y_pred:             Binary predictions.
        model:              Loaded ``SyntacticClassifier`` (for feature importances).
        output_dir:         Directory to write files into.  Defaults to
                            ``clone_detection/models/`` (resolved via ``get_models_dir()``).
    """
    from clone_detection.utils.common_setup import get_models_dir

    if output_dir is None:
        output_dir = get_models_dir()
    output_dir = Path(output_dir)
    viz_dir = output_dir / "visualizations"
    viz_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Metrics JSON ─────────────────────────────────────────────────────
    # Convert per-clone-type keys to strings for valid JSON.
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

    # ── 2. Visualizations ───────────────────────────────────────────────────
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import confusion_matrix as sk_cm

        # ── 2a. Confusion matrix ────────────────────────────────────────────
        cm = sk_cm(y, y_pred)
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
        ax.set_title("Confusion Matrix — Evaluation (BigCloneBench Balanced)")
        fig.tight_layout()
        cm_path = viz_dir / "confusion_matrix_eval.png"
        fig.savefig(cm_path, dpi=150)
        plt.close(fig)
        logger.info(f"Confusion matrix plot saved     → {cm_path}")

        # ── 2b. Per-clone-type recall ───────────────────────────────────────
        if clone_type_metrics:
            ct_labels = [f"Type-{ct}" for ct in sorted(clone_type_metrics)]
            ct_recalls = [
                clone_type_metrics[ct]["recall"] for ct in sorted(clone_type_metrics)
            ]
            ct_f1s = [clone_type_metrics[ct]["f1"] for ct in sorted(clone_type_metrics)]
            colors = ["tomato" if r < 0.4 else "steelblue" for r in ct_recalls]

            x = range(len(ct_labels))
            width = 0.35
            fig, ax = plt.subplots(figsize=(8, 5))
            bars_r = ax.bar(
                [i - width / 2 for i in x],
                ct_recalls,
                width,
                label="Recall",
                color=colors,
            )
            bars_f = ax.bar(
                [i + width / 2 for i in x],
                ct_f1s,
                width,
                label="F1",
                color="mediumseagreen",
                alpha=0.8,
            )
            ax.axhline(
                y=0.40,
                color="red",
                linestyle="--",
                alpha=0.7,
                label="Type-3 target (0.40)",
            )
            for bar in bars_r:
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 0.01,
                    f"{bar.get_height():.3f}",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                )
            for bar in bars_f:
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 0.01,
                    f"{bar.get_height():.3f}",
                    ha="center",
                    va="bottom",
                    fontsize=8,
                )
            ax.set_xticks(list(x))
            ax.set_xticklabels(ct_labels)
            ax.set_ylim(0, 1.15)
            ax.set_ylabel("Score")
            ax.set_title("Per-Clone-Type Recall & F1 (BigCloneBench Balanced)")
            ax.legend()
            ax.grid(axis="y", alpha=0.3)
            fig.tight_layout()
            ctr_path = viz_dir / "per_clone_type_recall.png"
            fig.savefig(ctr_path, dpi=150)
            plt.close(fig)
            logger.info(f"Per-clone-type recall plot saved → {ctr_path}")

        # ── 2c. Feature importances ─────────────────────────────────────────
        try:
            top_feats = model.get_feature_importance_sorted()[:20]
            feat_names = [f[0].replace("feat_", "") for f in top_feats]
            feat_vals = [f[1] for f in top_feats]

            fig, ax = plt.subplots(figsize=(10, 8))
            bars = ax.barh(feat_names[::-1], feat_vals[::-1], color="darkorange")
            for bar, val in zip(bars, feat_vals[::-1]):
                ax.text(
                    bar.get_width() + 0.001,
                    bar.get_y() + bar.get_height() / 2,
                    f"{val:.4f}",
                    va="center",
                    fontsize=8,
                )
            ax.set_xlabel("Importance")
            ax.set_title("Top-20 Feature Importances (Evaluation — XGBoost)")
            ax.grid(axis="x", alpha=0.3)
            fig.tight_layout()
            fi_path = viz_dir / "feature_importances_eval.png"
            fig.savefig(fi_path, dpi=150)
            plt.close(fig)
            logger.info(f"Feature importance plot saved   → {fi_path}")
        except Exception:
            pass  # feature importances are optional; don't fail the whole save

    except ImportError:
        logger.warning(
            "matplotlib not installed — skipping visualization plots (run: poetry add matplotlib)"
        )
    except Exception as exc:
        logger.warning(f"Visualization generation failed: {exc}")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------


def evaluate(
    model_name: str = DEFAULT_MODEL_NAME,
    clone_types: set[int] | None = None,
    sample_size: int | None = None,
    include_node_types: bool = True,
    threshold: float | None = None,
    log_type3_similarity: bool = False,
    output_dir: "Path | None" = None,
) -> dict:
    """
    Evaluate the two-stage clone detection pipeline on BigCloneBench Balanced.

    Routing logic per pair:
      ┌─ Type-1 / Type-2 ground-truth clones ──► NiCAD phase (Phase One)
      │                                           Prediction = 1 if NiCAD fires
      │
      ├─ Type-3 ground-truth clones          ──► XGBoost (Phase Two) + Type-3 Filter
      │                                           Prediction = 1 if XGBoost + filter fires
      │
      └─ Non-clones (label = 0)              ──► NiCAD first, then XGBoost
                                                  Prediction = 1 if either stage fires

    Per-clone-type recall is the PRIMARY KPI (target: Type-3 Recall ≥ 40 %).

    Args:
        model_name:            Filename for the trained clone detector pkl.
        clone_types:           Set of clone types to include as positives.
        sample_size:           Limit pairs per class for faster evaluation.
        include_node_types:    Whether to include node-type distribution features.
        threshold:             Override the model's calibrated clone probability
                               threshold (None → use model's calibrated value).
        log_type3_similarity:  If True, log lev/ast/prob for each correct Type-3
                               detection.

    Returns:
        Dictionary containing accuracy, precision, recall, F1, ROC-AUC,
        and per-clone-type recall.
    """
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info("=" * 80)
    logger.info(
        "Two-Stage Clone Detection — Pipeline Evaluation on BigCloneBench Balanced"
    )
    logger.info("=" * 80)
    logger.info("Stage 0 (NiCAD)  : Type-1 / Type-2 via StructuralNormalizer")
    logger.info(f"Stage 1 (XGBoost): Type-3 via {model_name}")
    logger.info("Stage 2          : Type-3 Filter (type3_filter.py)")
    logger.info(f"Dataset          : {BCB_BALANCED_PATH}")
    logger.info(f"Clone types      : {sorted(clone_types)}")
    logger.info(
        f"Threshold        : {threshold if threshold is not None else 'calibrated (from model)'}"
    )
    logger.info("=" * 80)

    # ---- Load XGBoost model -----------------------------------------------
    logger.info(f"\nLoading XGBoost clone detector model '{model_name}' …")
    try:
        model = SyntacticClassifier.load(model_name)
    except FileNotFoundError:
        logger.error(
            "Model file not found. Train the model first:\n"
            "  poetry run python train.py"
        )
        raise

    # ---- Build NiCAD pipeline (no XGBoost classifier) --------------------
    nicad_pipeline = TieredPipeline(classifier=None)

    # ---- Load evaluation data --------------------------------------------
    logger.info("\nLoading evaluation dataset …")
    code1_list, code2_list, labels, meta_list = load_bcb_dataset(
        bcb_path=BCB_BALANCED_PATH,
        clone_types=clone_types,
        sample_size=sample_size,
    )

    total = len(labels)
    n_clones = sum(labels)
    n_nonclones = total - n_clones
    logger.info(f"\nTotal pairs : {total:,}")
    logger.info(f"  Clones    : {n_clones:,}  ({n_clones / total * 100:.1f} %)")
    logger.info(f"  Non-clones: {n_nonclones:,}  ({n_nonclones / total * 100:.1f} %)")

    # ---- Extract features (XGBoost uses these for Type-3 + non-clones) ---
    logger.info("\nExtracting String + AST features (used for XGBoost / Type-3 path) …")
    X, raw_feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    # ---- Filter features to those kept during training -------------------
    missing_feats = [f for f in model.feature_names if f not in raw_feature_names]
    if missing_feats:
        logger.error(f"Missing features required by the model: {missing_feats}")
        raise ValueError("Feature mismatch between training and inference")

    kept_indices = [raw_feature_names.index(f) for f in model.feature_names]
    X_filtered = X[:, kept_indices]
    feature_names = model.feature_names

    # ---- XGBoost probabilities (computed once for all pairs) -------------
    logger.info("\nComputing XGBoost clone probabilities …")
    y_proba_xgb = model.predict_proba(X_filtered)[:, 1]

    # Resolve threshold: CLI arg → model's calibrated_threshold → default 0.5
    effective_threshold = threshold
    if effective_threshold is None:
        effective_threshold = getattr(model, "calibrated_threshold", None)
        if effective_threshold is not None:
            logger.info(
                f"Using calibrated threshold from model: {effective_threshold:.2f} "
                "(override with --threshold)"
            )
    if effective_threshold is None:
        logger.info("Using default threshold 0.5")
        effective_threshold = 0.5
    else:
        logger.info(f"Applying threshold {effective_threshold:.2f}")

    # ---- Per-pair prediction with type-routed logic ----------------------
    logger.info("\nRunning type-routed evaluation …")
    logger.info("  Type-1 / Type-2 pairs → NiCAD (Phase One)")
    logger.info("  Type-3 pairs          → XGBoost + Type-3 Filter (Phase Two)")
    logger.info("  Non-clones            → NiCAD first, then XGBoost")

    y_pred: list[int] = []
    # y_proba_final mirrors XGBoost probability for ROC-AUC; for NiCAD-confirmed
    # clones we set 1.0 (very high confidence) and for NiCAD-confirmed non-clones
    # we keep the XGBoost probability as a fallback score.
    y_proba_final: list[float] = []

    nicad_routes = 0  # pairs routed through NiCAD
    xgb_routes = 0  # pairs routed through XGBoost

    for i in tqdm(range(total), desc="Evaluating pairs"):
        meta = meta_list[i]
        label = int(meta["label"])
        clone_type = int(meta.get("clone_type", 0))
        c1 = code1_list[i]
        c2 = code2_list[i]
        prob_xgb = float(y_proba_xgb[i])

        # ── Type-1 / Type-2 ground-truth clones: NiCAD path ──────────────
        if label == 1 and clone_type in {1, 2}:
            nicad_routes += 1
            try:
                result = nicad_pipeline._phase_one_nicad(c1, c2, "java")
                nicad_fired = result.clone_type in ("Type-1", "Type-2")
            except Exception as exc:
                logger.debug(f"NiCAD phase failed for pair {i}: {exc}")
                nicad_fired = False

            pred = 1 if nicad_fired else 0
            # Confidence: NiCAD uses jaccard_similarity as the score
            try:
                score = result.jaccard_similarity if nicad_fired else prob_xgb
            except Exception:
                score = float(nicad_fired)
            y_pred.append(pred)
            y_proba_final.append(score)

        # ── Type-3 ground-truth clones: XGBoost + Type-3 Filter path ─────
        elif label == 1 and clone_type == 3:
            xgb_routes += 1
            if prob_xgb > effective_threshold:
                pred = int(is_type3_clone(X_filtered[i], feature_names, prob_xgb))
                if log_type3_similarity and pred == 1:
                    lev_idx = feature_names.index("feat_levenshtein_ratio")
                    ast_idx = feature_names.index("feat_ast_jaccard")
                    logger.info(
                        "Type3 TP: lev=%.3f, ast=%.3f, prob=%.3f",
                        X_filtered[i][lev_idx],
                        X_filtered[i][ast_idx],
                        prob_xgb,
                    )
            else:
                pred = 0
            y_pred.append(pred)
            y_proba_final.append(prob_xgb)

        # ── Non-clones (label = 0): NiCAD first, then XGBoost ────────────
        else:
            nicad_routes += 1
            xgb_routes += 1
            try:
                result = nicad_pipeline._phase_one_nicad(c1, c2, "java")
                nicad_fired = result.clone_type in ("Type-1", "Type-2")
            except Exception as exc:
                logger.debug(f"NiCAD phase failed for pair {i}: {exc}")
                nicad_fired = False

            if nicad_fired:
                # NiCAD falsely fires on a non-clone → FP
                pred = 1
            elif prob_xgb > effective_threshold:
                pred = int(is_type3_clone(X_filtered[i], feature_names, prob_xgb))
            else:
                pred = 0

            y_pred.append(pred)
            y_proba_final.append(prob_xgb)

    y_pred_arr = np.array(y_pred)
    y_proba_arr = np.array(y_proba_final)

    logger.info(f"\n  NiCAD route invocations : {nicad_routes:,}")
    logger.info(f"  XGBoost route invocations: {xgb_routes:,}")

    # ---- Overall metrics -------------------------------------------------
    metrics = {
        "accuracy": accuracy_score(y, y_pred_arr),
        "precision": precision_score(y, y_pred_arr, zero_division=0),
        "recall": recall_score(y, y_pred_arr, zero_division=0),
        "f1": f1_score(y, y_pred_arr, zero_division=0),
        "roc_auc": roc_auc_score(y, y_proba_arr),
        "threshold": effective_threshold,
    }

    # ---- Per-clone-type breakdown ----------------------------------------
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
        fp = int(np.sum((ct_y == 0) & (ct_pred == 1)))

        recall_ct = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        precision_ct = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        f1_ct = (
            2 * precision_ct * recall_ct / (precision_ct + recall_ct)
            if (precision_ct + recall_ct) > 0
            else 0.0
        )

        source = "NiCAD (Phase One)" if ct in {1, 2} else "XGBoost + Type-3 Filter"

        clone_type_metrics[ct] = {
            "count": len(ct_idx),
            "tp": tp,
            "fn": fn,
            "recall": recall_ct,
            "precision": precision_ct,
            "f1": f1_ct,
            "detector": source,
        }

    # ---- Report ----------------------------------------------------------
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT — BigCloneBench Balanced")
    logger.info("=" * 80)
    logger.info(f"Dataset     : {BCB_BALANCED_PATH}")
    logger.info(f"Total       : {total:,} pairs")
    logger.info(f"Clones      : {n_clones:,}  |  Non-clones: {n_nonclones:,}")
    logger.info(f"XGB Thresh  : {effective_threshold:.2f}  (Stage 1, Type-3 path only)")
    logger.info("-" * 80)
    logger.info(f"Accuracy    : {metrics['accuracy']:.4f}")
    logger.info(f"Precision   : {metrics['precision']:.4f}")
    logger.info(f"Recall      : {metrics['recall']:.4f}")
    logger.info(f"F1 Score    : {metrics['f1']:.4f}")
    logger.info(f"ROC AUC     : {metrics['roc_auc']:.4f}")

    logger.info("\nClassification Report:")
    logger.info(
        classification_report(y, y_pred_arr, target_names=["Non-Clone", "Clone"])
    )

    logger.info("Confusion Matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y, y_pred_arr)
    logger.info(f"  TN={cm[0,0]:>7}  FP={cm[0,1]:>7}")
    logger.info(f"  FN={cm[1,0]:>7}  TP={cm[1,1]:>7}")

    # Per-clone-type recall — PRIMARY KPI
    if clone_type_metrics:
        logger.info("\n" + "=" * 80)
        logger.info("Per-Clone-Type Metrics — Routed Evaluation  (PRIMARY KPI)")
        logger.info(
            "  Type-1/2 → NiCAD (Phase One)  |  Type-3 → XGBoost + Type-3 Filter"
        )
        logger.info("Target: Type-3 Recall ≥ 40%")
        logger.info("=" * 80)
        logger.info(
            f"  {'Type':<7} {'Recall':>7}  {'Precision':>9}  {'F1':>7}   bar (recall)             TP / (TP+FN)  n       Detector"
        )
        logger.info(
            f"  {'-'*7} {'-'*7}  {'-'*9}  {'-'*7}   {'-'*24}  {'-'*12}  {'-'*6}  {'-'*26}"
        )
        for ct, m in clone_type_metrics.items():
            bar_filled = int(m["recall"] * 20)
            bar = "█" * bar_filled + "░" * (20 - bar_filled)
            kpi = " ← TARGET" if ct == 3 else ""
            meet = (
                " ✓" if ct == 3 and m["recall"] >= 0.40 else (" ✗" if ct == 3 else "")
            )
            logger.info(
                f"  Type-{ct}  {m['recall']:>7.4f}  {m['precision']:>9.4f}  {m['f1']:>7.4f}   [{bar}]"
                f"  TP={m['tp']:>5} / {m['tp']+m['fn']:>5}  n={m['count']:>6}{kpi}{meet}"
                f"  {m['detector']}"
            )

    # Feature importance (XGBoost only)
    logger.info("\nTop-20 Feature Importances (XGBoost Clone Detector — Type-3 path):")
    logger.info("-" * 80)
    try:
        for feat_name, importance in model.get_feature_importance_sorted()[:20]:
            logger.info(f"  {feat_name:<50s}: {importance:.4f}")
    except Exception:
        pass

    # Boundary reminders
    logger.info("\nNiCAD Phase-One Thresholds (Type-1 / Type-2 path):")
    logger.info("  Type-1: Jaccard ≥ 0.98 AND Levenshtein ≥ 0.98 (literal CST)")
    logger.info(
        "  Type-2: max(Jaccard, Lev) ≥ 0.95, token-length delta ≤ 5 % (blinded CST)"
    )

    logger.info("\nType-3 Filter Boundaries Applied (XGBoost path — Stage 2):")
    logger.info("  prob_floor       : 0.35  (pairs below this are not clones)")
    logger.info(
        "  lev_ratio_upper  : 0.85  (above this = Type-1/2, excluded from Type-3)"
    )
    logger.info(
        "  ast_jaccard_upper: 0.90  (above this = Type-1/2, excluded from Type-3)"
    )

    # ---- Persist metrics + visualizations --------------------------------
    save_evaluation_artifacts(
        metrics=metrics,
        clone_type_metrics=clone_type_metrics,
        y=y,
        y_pred=y_pred_arr,
        model=model,
        output_dir=output_dir,
    )

    return {**metrics, "per_clone_type": clone_type_metrics}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate Syntactic Clone Detector",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Evaluate with default config
  python evaluate.py

  # Evaluate with custom config
  python evaluate.py --config /path/to/config.yaml

  # Override specific parameters
  python evaluate.py --sample-size 2000 --threshold 0.35
        """,
    )

    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to YAML config file (default: config.yaml)",
    )

    # Override arguments
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override model path",
    )
    parser.add_argument(
        "--clone-types",
        type=int,
        nargs="+",
        default=None,
        help="Override clone types to evaluate",
    )
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
        "--no-node-types",
        action="store_true",
        help="Disable AST node type features",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Override output directory",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="Directory to write evaluation_metrics.json and visualization plots "
        "(default: clone_detection/models/)",
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
    features_config = eval_config.get("features", {})

    # Build parameters (CLI overrides config)
    params = {
        "model_name": args.model or model_config.get("path", "clone_detector_xgb.pkl"),
        "clone_types": (
            set(args.clone_types)
            if args.clone_types
            else set(eval_config.get("clone_types", [1, 2, 3]))
        ),
        "sample_size": args.sample_size or eval_config.get("sample_size"),
        "include_node_types": not args.no_node_types
        and features_config.get("include_node_types", True),
        "threshold": args.threshold or eval_config.get("threshold"),
        "log_type3_similarity": eval_config.get("log_type3_similarity", False),
        "output_dir": args.output_dir
        or Path(model_config.get("output_dir", "./results/evaluate")),
        "bcb_path": config.get("datasets", {})
        .get("bigclonebench_balanced", {})
        .get("path"),
    }

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    evaluate(
        model_name=args.model,
        clone_types=set(args.clone_types),
        sample_size=args.sample_size,
        include_node_types=not args.no_node_types,
        threshold=args.threshold,
        log_type3_similarity=args.log_type3_similarity,
        output_dir=args.output_dir,
    )
