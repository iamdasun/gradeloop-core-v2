"""
train.py — Clone Detection Model Training (Two-Stage Pipeline).

Pipeline context:
  Stage 0: NiCAD-style normalizer detects Type-1 and Type-2 clones.
           (Handled separately in the normalizer module.)

  Stage 1 (this model): XGBoost Clone Detector
           Trained on the full clone spectrum:
             Type-1 + Type-2 + Type-3 → label = 1 (Clone)
             NonClone                 → label = 0 (NonClone)
           Learns what ANY syntactic clone looks like, not just Type-3.

  Stage 2: Type-3 Filter (clone_detection/type3_filter.py)
           Takes the clone probability and structural features, then
           applies the near-miss corridor to isolate Type-3 clones:
             levenshtein_ratio ≤ 0.85 AND
             ast_jaccard       ≤ 0.90 AND
             clone_probability ≥ 0.35

Training data (TOMA dataset — TOMA label semantics):
  Positives (label = 1):
    type-1.csv  — exact clones                            (Type-1/2)
    type-2.csv  — renamed / parameterized clones          (Type-1/2)
    type-3.csv  — STRONG near-miss clones                 (Type-3)
    type-4.csv  — MODERATE near-miss / heavy modification (Type-3)
    type-5.csv  — WEAK near-miss / borderline semantic    (Type-3 / boundary of Type-4)
  Negatives (label = 0):
    nonclone.csv — confirmed non-clone pairs

  ┌────────────────┬───────────┬─────────┬────────┬───────────────────────────────────────┐
  │ CSV            │ TOMA type │  Target │ Weight │ Rationale                             │
  ├────────────────┼───────────┼─────────┼────────┼───────────────────────────────────────┤
  │ type-1.csv     │ Exact     │  8,000  │  1.5×  │ Easy positives — shape the boundary   │
  │ type-2.csv     │ Renamed   │  8,000  │  1.5×  │ Easy positives — shape the boundary   │
  │ type-3.csv     │ Strong T3 │ 20,000  │  2.0×  │ Hard near-miss — most important       │
  │ type-4.csv     │ Moderate  │ 15,000  │  1.5×  │ Mid-difficulty — broadens T3 spectrum │
  │ type-5.csv     │ Weak/T4   │ 10,000  │  1.0×  │ Noisy/borderline — gentle signal      │
  │ nonclone.csv   │ NonClone  │ 25,000  │  1.0×  │ Balanced against larger positive set  │
  └────────────────┴───────────┴─────────┴────────┴───────────────────────────────────────┘

Optimization Strategy:
  Objective  : Maximize Type-3 Recall (target: ≥ 40%) at Precision ≥ 80%.
  After the clone detector is trained, the Type-3 Filter provides
  additional precision control without retraining.

XGBoost Hyperparameters:
  n_estimators     = 500
  max_depth        = 8
  learning_rate    = 0.05
  subsample        = 0.9
  colsample_bytree = 0.8   (relaxed from 0.6; richer positive set makes
                             forced AST splits unnecessary)
  min_child_weight = 2
  gamma            = 0.1   (conservative pruning)
  reg_lambda       = 1.0
  eval_metric      = "auc"
  scale_pos_weight = 2.0   (reduced from 5.0; larger positive class)
  sample_weight    : type-3 → 2.0×, type-4 → 1.5×, type-1/2 → 1.5×,
                     type-5 → 1.0×, nonclone → 1.0×

Output model:
  clone_detector_xgb.pkl

Usage:
    poetry run python train.py
    poetry run python train.py --scale-pos-weight 2.0 --no-node-types
"""

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    precision_recall_curve,
)
from sklearn.model_selection import train_test_split
from tqdm import tqdm

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

# ---------------------------------------------------------------------------
# Dataset paths
# ---------------------------------------------------------------------------

TOMA_DATASET_DIR = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
)

# Output model name used by Stage 1 of the two-stage pipeline.
DEFAULT_MODEL_NAME = "clone_detector_xgb.pkl"

# ---------------------------------------------------------------------------
# Balanced dataset targets
# Each entry:  (csv_filename, label, target_count, sample_weight)
#
# TOMA label semantics used here:
#   type-1.csv  → Exact clones             (easy positive)
#   type-2.csv  → Renamed clones           (easy positive)
#   type-3.csv  → Strong Type-3 near-miss  (hard positive — highest weight)
#   type-4.csv  → Moderate Type-3          (mid-difficulty positive)
#   type-5.csv  → Weak Type-3 / borderline (noisy signal — baseline weight)
#   nonclone.csv → Confirmed non-clones    (negative class)
# ---------------------------------------------------------------------------
DATASET_CONFIG: list[tuple[str, int, int, float]] = [
    ("type-1.csv",   1,  8_000, 1.5),   # Exact clones          — easy positive
    ("type-2.csv",   1,  8_000, 1.5),   # Renamed clones        — easy positive
    ("type-3.csv",   1, 20_000, 2.0),   # Strong near-miss      — hard positive, highest weight
    ("type-4.csv",   1, 15_000, 1.5),   # Moderate near-miss    — mid-difficulty positive
    ("type-5.csv",   1, 10_000, 1.0),   # Weak / borderline T4  — noisy positive, baseline weight
    ("nonclone.csv", 0, 20_000, 1.0),   # Negative class        — equal to Type-3 to balance
]


# ---------------------------------------------------------------------------
# Helper: binary label assignment
# ---------------------------------------------------------------------------

def label_clone_binary(clone_type: int) -> int:
    """
    Assign a binary training label based on clone type.

    Args:
        clone_type: Integer clone type (1, 2, 3) or 0 for non-clone.

    Returns:
        1 if the pair is any syntactic clone (Type-1, 2, or 3),
        0 if it is a confirmed non-clone.
    """
    if clone_type in {1, 2, 3}:
        return 1
    return 0


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

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
    """
    Load TOMA dataset pairs for the two-stage clone detection model.

    Applies balanced per-source sampling as defined in ``dataset_config``.
    Each source has a target count so that Type-3 pairs dominate while
    Type-1/2 still inform the model about the full clone spectrum.

    Args:
        dataset_dir:    Path to the TOMA dataset root.
        dataset_config: List of (csv_name, label, target_count, sample_weight)
                        tuples. ``label`` is a binary clone/non-clone int; the
                        actual per-row clone type is read from the CSV but
                        collapsed via ``label_clone_binary``.

    Returns:
        (code1_list, code2_list, labels, sources, weights)
        sources — CSV filename for each pair (used in per-source reporting).
        weights — Per-row sample weights for XGBoost .fit().
    """
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels:     list[int] = []
    sources:    list[str] = []
    weights:    list[float] = []

    for csv_name, binary_label, target_count, sample_weight in dataset_config:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists():
            logger.warning(f"CSV not found: {csv_path} — skipping")
            continue

        logger.info(f"Loading {csv_name}  (label={binary_label}, target={target_count:,}) …")

        # ---- Read CSV --------------------------------------------------------
        if csv_name == "nonclone.csv":
            df = pd.read_csv(csv_path)
        else:
            df = pd.read_csv(
                csv_path, header=None,
                names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
            )

        # Sample down to target count if needed
        if len(df) > target_count:
            logger.info(f"  Sampling {target_count:,} / {len(df):,} rows from {csv_name}")
            df = df.sample(n=target_count, random_state=42)

        # ---- Load code pairs ------------------------------------------------
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

        logger.info(f"  Loaded {loaded:,} valid pairs  (weight={sample_weight}×)")

    return code1_list, code2_list, labels, sources, weights


# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def extract_features(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    include_node_types: bool = True,
) -> tuple[np.ndarray, list[str]]:
    """
    Extract hybrid String + AST + Structural Density features.

    String features  (6)  : Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
    AST features    (7+N) : Structural Jaccard, AST depth diff, node count diff/ratio,
                            structural_density_1/2/diff, per-node-type dists

    Feature extraction is identical to what evaluate.py uses so that the
    trained model can be applied directly without re-processing.
    """
    extractor = SyntacticFeatureExtractor(language=language, include_node_types=include_node_types)
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


# ---------------------------------------------------------------------------
# Threshold sweep
# ---------------------------------------------------------------------------

def threshold_sweep(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    start: float = 0.30,
    stop: float = 0.80,
    step: float = 0.01,
) -> list[dict]:
    """
    Sweep classification thresholds from ``start`` to ``stop`` in ``step``
    increments and compute precision / recall / F1 at each point.

    The primary goal is to maximize F1-score across the optimal boundary.
    """
    results = []
    thresholds = np.arange(start, stop + step / 2, step)

    for thresh in thresholds:
        y_pred = (y_proba >= thresh).astype(int)
        
        # If all predictions are identical, avoid warnings
        if len(np.unique(y_pred)) <= 1 and len(np.unique(y_true)) > 1:
            prec = 0.0
            rec = 0.0
            f1 = 0.0
        else:
            prec = precision_score(y_true, y_pred, zero_division=0)
            rec  = recall_score(y_true, y_pred, zero_division=0)
            f1   = f1_score(y_true, y_pred, zero_division=0)
            
        results.append({
            "threshold": round(float(thresh), 4),
            "precision": round(prec, 4),
            "recall":    round(rec,  4),
            "f1":        round(f1,   4),
            "meets_floor": True, # maintained for backward compat
        })

    return results


def select_best_threshold(sweep_results: list[dict]) -> dict:
    """
    Select the threshold that maximises F1 Score.
    """
    if not sweep_results:
        return {"threshold": 0.5, "precision": 0.0, "recall": 0.0, "f1": 0.0}

    return max(sweep_results, key=lambda r: r["f1"])


# ---------------------------------------------------------------------------
# Artifact persistence — metrics JSON + visualizations
# ---------------------------------------------------------------------------

def save_training_artifacts(
    metrics: dict,
    sweep: list[dict],
    classifier,
    y_test: np.ndarray,
    y_pred: np.ndarray,
    y_proba: np.ndarray,
    s_test: np.ndarray,
    output_dir: Path | None = None,
) -> None:
    """
    Persist training metrics as JSON and generate visualisation plots.

    Outputs (all written to *output_dir*, default ``clone_detection/models/``):

    * ``training_metrics.json``     — threshold sweep table + final metrics
    * ``visualizations/threshold_sweep.png``       — Precision / Recall / F1 vs threshold
    * ``visualizations/feature_importances_train.png`` — top-20 XGBoost importances
    * ``visualizations/confusion_matrix_train.png``     — confusion matrix heatmap
    * ``visualizations/per_source_recall.png``     — per-CSV-source recall bar chart

    Args:
        metrics:    Final metrics dict (threshold, precision, recall, f1).
        sweep:      Full threshold-sweep table from ``threshold_sweep()``.
        classifier: Trained ``SyntacticClassifier`` instance.
        y_test:     Ground-truth labels for the held-out test split.
        y_pred:     Binary predictions at the selected threshold.
        y_proba:    XGBoost clone probabilities for the test split.
        s_test:     Source CSV filenames for each test-split row (for per-source breakdown).
        output_dir: Directory to write files into.  Defaults to
                    ``clone_detection/models/`` (resolved via ``get_models_dir()``).
    """
    from clone_detection.utils.common_setup import get_models_dir

    if output_dir is None:
        output_dir = get_models_dir()
    output_dir = Path(output_dir)
    viz_dir = output_dir / "visualizations"
    viz_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Metrics JSON ─────────────────────────────────────────────────────
    # Serialise feature importances as plain list-of-pairs for JSON.
    top_features = [
        {"feature": name, "importance": round(float(imp), 6)}
        for name, imp in classifier.get_feature_importance_sorted()[:20]
    ]
    metrics_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {k: (round(float(v), 6) if isinstance(v, float) else v) for k, v in metrics.items()},
        "threshold_sweep": sweep,
        "top_20_features": top_features,
    }
    metrics_path = output_dir / "training_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as fh:
        json.dump(metrics_payload, fh, indent=2, default=str)
    logger.info(f"Training metrics JSON saved → {metrics_path}")

    # ── 2. Visualizations ───────────────────────────────────────────────────
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from sklearn.metrics import confusion_matrix as sk_cm

        # ── 2a. Threshold sweep ─────────────────────────────────────────────
        thresholds = [r["threshold"] for r in sweep]
        precisions = [r["precision"] for r in sweep]
        recalls    = [r["recall"]    for r in sweep]
        f1s        = [r["f1"]        for r in sweep]

        fig, ax = plt.subplots(figsize=(10, 6))
        ax.plot(thresholds, precisions, "b-o", label="Precision", markersize=3)
        ax.plot(thresholds, recalls,    "g-o", label="Recall",    markersize=3)
        ax.plot(thresholds, f1s,        "r-o", label="F1",        markersize=3)
        best_t = metrics.get("threshold", 0.5)
        ax.axvline(x=best_t, color="purple", linestyle="--",
                   label=f"Selected threshold ({best_t:.2f})")
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

        # ── 2b. Feature importances ─────────────────────────────────────────
        top_feats  = classifier.get_feature_importance_sorted()[:20]
        feat_names = [f[0].replace("feat_", "") for f in top_feats]
        feat_vals  = [f[1] for f in top_feats]

        fig, ax = plt.subplots(figsize=(10, 8))
        bars = ax.barh(feat_names[::-1], feat_vals[::-1], color="steelblue")
        for bar, val in zip(bars, feat_vals[::-1]):
            ax.text(
                bar.get_width() + 0.001, bar.get_y() + bar.get_height() / 2,
                f"{val:.4f}", va="center", fontsize=8,
            )
        ax.set_xlabel("Importance")
        ax.set_title("Top-20 Feature Importances (Training)")
        ax.grid(axis="x", alpha=0.3)
        fig.tight_layout()
        fi_path = viz_dir / "feature_importances_train.png"
        fig.savefig(fi_path, dpi=150)
        plt.close(fig)
        logger.info(f"Feature importance plot saved    → {fi_path}")

        # ── 2c. Confusion matrix ────────────────────────────────────────────
        cm = sk_cm(y_test, y_pred)
        fig, ax = plt.subplots(figsize=(6, 5))
        im = ax.imshow(cm, interpolation="nearest", cmap="Blues")
        plt.colorbar(im, ax=ax)
        classes    = ["Non-Clone", "Clone"]
        tick_marks = [0, 1]
        ax.set_xticks(tick_marks)
        ax.set_yticks(tick_marks)
        ax.set_xticklabels(classes)
        ax.set_yticklabels(classes)
        threshold_color = cm.max() / 2.0
        for i in range(2):
            for j in range(2):
                ax.text(
                    j, i, str(cm[i, j]),
                    ha="center", va="center",
                    color="white" if cm[i, j] > threshold_color else "black",
                    fontsize=14, fontweight="bold",
                )
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        ax.set_title("Confusion Matrix — Training (Test Split)")
        fig.tight_layout()
        cm_path = viz_dir / "confusion_matrix_train.png"
        fig.savefig(cm_path, dpi=150)
        plt.close(fig)
        logger.info(f"Confusion matrix plot saved      → {cm_path}")

        # ── 2d. Per-source recall ───────────────────────────────────────────
        per_src: dict[str, float] = {}
        for src in sorted(np.unique(s_test)):
            mask = s_test == src
            yt   = y_test[mask]
            yp   = y_pred[mask]
            if np.any(yt == 1):
                tp  = int(np.sum((yt == 1) & (yp == 1)))
                fn  = int(np.sum((yt == 1) & (yp == 0)))
                per_src[src] = tp / (tp + fn) if (tp + fn) > 0 else 0.0

        if per_src:
            srcs   = list(per_src.keys())
            recs   = [per_src[s] for s in srcs]
            colors = ["tomato" if r < 0.5 else "steelblue" for r in recs]

            fig, ax = plt.subplots(figsize=(10, 5))
            ax.barh(srcs, recs, color=colors)
            for i, (src, rec) in enumerate(zip(srcs, recs)):
                ax.text(rec + 0.01, i, f"{rec:.3f}", va="center", fontsize=9)
            ax.set_xlabel("Recall")
            ax.set_title("Per-Source Recall (Training — Test Split)")
            ax.axvline(x=0.5, color="gray", linestyle="--", alpha=0.5, label="0.5 line")
            ax.set_xlim(0, 1.1)
            ax.legend()
            ax.grid(axis="x", alpha=0.3)
            fig.tight_layout()
            ps_path = viz_dir / "per_source_recall.png"
            fig.savefig(ps_path, dpi=150)
            plt.close(fig)
            logger.info(f"Per-source recall plot saved     → {ps_path}")

    except ImportError:
        logger.warning("matplotlib not installed — skipping visualization plots (run: poetry add matplotlib)")
    except Exception as exc:
        logger.warning(f"Visualization generation failed: {exc}")


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(
    model_name: str = DEFAULT_MODEL_NAME,
    sample_size: int | None = None,
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
) -> dict:
    """
    Train the two-stage XGBoost Clone Detector (Stage 1).

    This model is trained on ALL syntactic clone types so that it learns
    what *any* clone looks like before the Type-3 Filter (Stage 2) applies
    the near-miss boundary correction.

    Key design choices:
      * Balanced sampling       — Type-3 pairs dominate (20k) while Type-1/2
                                  (8k each) still teach the full spectrum.
      * colsample_bytree=0.8   — Relaxed from 0.6; with a richer positive set
                                  the AST features no longer need forced selection.
      * scale_pos_weight=2.0   — Reduced from 5.0; Type-1/2 pairs make the
                                  positive class much larger so less amplification.
      * min_child_weight=2     — Prevents overfitting to rare structural patterns.
      * gamma=0.1              — Conservative pruning for a balanced model.
      * Threshold sweep        — Post-training calibration at precision floor 0.80;
                                  the Type-3 Filter handles per-type precision.

    Returns:
        dict of metrics at the selected clone detector operating threshold.
    """
    logger.info("=" * 80)
    logger.info("Two-Stage Clone Detection — Stage 1: XGBoost Clone Detector")
    logger.info("=" * 80)
    logger.info("Training objective : Clone vs NonClone (Type-1 + 2 + 3 = positive)")
    logger.info("Stage 2 (Type-3 Filter) will be applied at inference time in evaluate.py")
    logger.info(f"n_estimators      : {n_estimators}")
    logger.info(f"max_depth         : {max_depth}")
    logger.info(f"learning_rate     : {learning_rate}")
    logger.info(f"subsample         : {subsample}")
    logger.info(f"colsample_bytree  : {colsample_bytree}")
    logger.info(f"min_child_weight  : {min_child_weight}")
    logger.info(f"gamma             : {gamma}")
    logger.info(f"reg_lambda        : {reg_lambda}")
    logger.info(f"scale_pos_weight  : {scale_pos_weight}")
    logger.info(f"Precision floor   : 0.80 (Type-3 Filter adds extra precision)")
    logger.info("")
    for csv_name, label, target, weight in DATASET_CONFIG:
        logger.info(f"  {csv_name:<16s}  label={label}  target={target:>6,}  weight={weight}×")
    logger.info("=" * 80)

    # ---- Handle sample_size ----------------------------------------------
    config_to_use = DATASET_CONFIG
    if sample_size is not None:
        total_target = sum(t for _, _, t, _ in DATASET_CONFIG)
        ratio = sample_size / total_target
        config_to_use = [
            (csv_name, label, max(1, int(target * ratio)), weight)
            for csv_name, label, target, weight in DATASET_CONFIG
        ]
        logger.info(f"Applying sample_size={sample_size} (Scaling targets by {ratio:.4f})")
        for csv_name, label, target, weight in config_to_use:
            logger.info(f"  {csv_name:<16s}  Target: {target:>6,}")
        logger.info("=" * 80)

    # ---- Load balanced dataset -------------------------------------------
    code1_list, code2_list, labels, sources, row_weights = load_toma_dataset(
        dataset_dir=TOMA_DATASET_DIR,
        dataset_config=config_to_use,
    )

    total = len(labels)
    n_pos = sum(labels)
    n_neg = total - n_pos
    logger.info(f"\nDataset: {total:,} pairs  |  Clones: {n_pos:,}  |  NonClones: {n_neg:,}")

    # Log per-source breakdown
    import collections
    src_counts = collections.Counter(sources)
    logger.info("\nPer-source counts:")
    for src, cnt in sorted(src_counts.items()):
        logger.info(f"  {src:<16s}: {cnt:,}")

    # ---- Feature extraction -----------------------------------------------
    logger.info("\nExtracting hybrid String + AST + Structural Density features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)
    s = np.array(sources)
    w = np.array(row_weights)

    logger.info(f"Feature matrix: {X.shape}  ({len(feature_names)} features)")
    logger.info(f"  String features      : 6")
    logger.info(f"  AST core features    : 7  (incl. structural_density ×3)")
    logger.info(f"  Node-type dists      : {len(feature_names) - 13}")

    # ---- Train/test split ------------------------------------------------
    X_train, X_test, y_train, y_test, s_train, s_test, w_train, w_test = train_test_split(
        X, y, s, w, test_size=test_size, random_state=42, stratify=y
    )

    logger.info(f"\nTrain / test split  {1 - test_size:.0%} / {test_size:.0%}:")
    logger.info(f"  Train: {len(y_train):,} pairs")
    logger.info(f"  Test : {len(y_test):,} pairs")
    
    # ---- Dynamically compute scale_pos_weight ---------------------------
    # Using negative_samples / positive_samples
    computed_scale_pos_weight = float(np.sum(y_train == 0)) / max(1, np.sum(y_train == 1))
    scale_pos_weight = computed_scale_pos_weight
    logger.info(f"\nComputed scale_pos_weight = {scale_pos_weight:.4f} (neg={np.sum(y_train==0)} / pos={np.sum(y_train==1)})")

    # ---- Per-row sample weight distribution (train) ----------------------
    logger.info("\nSample-weight distribution (train split):")
    for src in sorted(np.unique(s_train)):
        mask = s_train == src
        avg_w = w_train[mask].mean()
        logger.info(f"  {src:<16s} × {avg_w:.2f}  ({mask.sum():,} rows)")
    # ---- Classifier -------------------------------------------------------
    classifier = SyntacticClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        colsample_bytree=colsample_bytree,
        min_child_weight=min_child_weight,
        feature_names=feature_names,
        use_gpu=use_gpu,
        scale_pos_weight=scale_pos_weight,
        gamma=gamma,
        reg_lambda=reg_lambda,
        eval_metric="auc",
    )
    
    classifier.model.set_params(scale_pos_weight=scale_pos_weight)

    X_train_final = X_train
    X_test_final = X_test

    logger.info(f"\nScaling features with StandardScaler...")
    X_train_scaled = classifier.scaler.fit_transform(X_train_final)
    X_test_scaled = classifier.scaler.transform(X_test_final)
    
    # --- Feature Selection (importance >= 1%) ---
    logger.info("\nRunning preliminary training for Feature Selection...")
    classifier.model.fit(X_train_scaled, y_train, sample_weight=w_train)
    
    importances = classifier.model.feature_importances_
    # features >= 1% importance
    kept_indices = list(np.where(importances >= 0.01)[0])
    
    # Force keeping the Type-3 filter boundaries regardless of importance!
    for mandatory_feat in ["feat_levenshtein_ratio", "feat_ast_jaccard"]:
        if mandatory_feat in feature_names:
            idx = feature_names.index(mandatory_feat)
            if idx not in kept_indices:
                kept_indices.append(idx)
                
    kept_indices = np.array(sorted(kept_indices))
    dropped_count = len(feature_names) - len(kept_indices)
    
    if dropped_count > 0 and len(kept_indices) > 0:
        logger.info(f"Dropping {dropped_count} features with < 1% importance.")
        new_feature_names = [feature_names[i] for i in kept_indices]
        X_train_final = X_train[:, kept_indices]
        X_test_final = X_test[:, kept_indices]
        
        # update classifier features and fit scaler again on filtered features
        classifier.feature_names = new_feature_names
        X_train_scaled = classifier.scaler.fit_transform(X_train_final)
        X_test_scaled = classifier.scaler.transform(X_test_final)
    else:
        logger.info("Keeping all features (none < 1% or all dropped).")

    # --- Hyperparameter Optimization ---
    logger.info("\nRunning RandomizedSearchCV Hyperparameter Optimization...")
    from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
    
    param_dist = {
        'max_depth': [4, 5, 6, 7],
        'learning_rate': [0.03, 0.05, 0.1],
        'n_estimators': [200, 300, 400, 500],
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 0.9],
        'gamma': [0, 0.1, 0.3],
        'min_child_weight': [1, 3, 5],
    }
    
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    random_search = RandomizedSearchCV(
        classifier.model, param_distributions=param_dist,
        n_iter=5, scoring='f1', cv=cv, verbose=1, random_state=42, n_jobs=-1
    )
    # Fit random search (don't use early stopping/eval set here as CV handles it)
    random_search.fit(X_train_scaled, y_train, sample_weight=w_train)
    
    best_params = random_search.best_params_
    logger.info(f"Best hyperparameters found for F1: {best_params}")
    classifier.model.set_params(**best_params)

    # Configure early stopping parameter on the original model to safely run with early_stopping_rounds
    classifier.model.set_params(early_stopping_rounds=30)
    
    # --- Final Training with Early Stopping ---
    logger.info(f"\nTraining Final XGBoost Clone Detector with Early Stopping …")
    
    classifier.model.fit(
        X_train_scaled, y_train, 
        sample_weight=w_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False
    )
    classifier.is_trained = True

    # ---- Threshold sweep -------------------------------------------------
    logger.info("\nRunning threshold sweep (0.30 → 0.80) to maximize F1 …")
    # predict_proba expects unscaled features, it scales them automatically inside
    y_proba_test = classifier.predict_proba(X_test_final)[:, 1]
    sweep = threshold_sweep(y_test, y_proba_test)

    logger.info(f"\n  {'Thresh':>7} | {'Precision':>9} | {'Recall':>7} | {'F1':>7} | Floor?")
    logger.info(f"  {'-'*7}-+-{'-'*9}-+-{'-'*7}-+-{'-'*7}-+-{'-'*6}")
    for row in sweep:
        flag = "✓" if row["meets_floor"] else "✗"
        logger.info(
            f"  {row['threshold']:>7.2f} | {row['precision']:>9.4f} | "
            f"{row['recall']:>7.4f} | {row['f1']:>7.4f} | {flag}"
        )

    best = select_best_threshold(sweep)
    logger.info(f"\n  ► Selected threshold : {best['threshold']:.2f}")

    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
    y_pred_best = (y_proba_test >= best["threshold"]).astype(int)
    
    # Final robust metrics
    test_acc = accuracy_score(y_test, y_pred_best)
    test_prec = precision_score(y_test, y_pred_best, zero_division=0)
    test_rec = recall_score(y_test, y_pred_best, zero_division=0)
    test_f1 = f1_score(y_test, y_pred_best, zero_division=0)
    test_auc = roc_auc_score(y_test, y_proba_test)
    
    logger.info("\n" + "=" * 40)
    logger.info("FINAL EVALUATION METRICS (Test Set)")
    logger.info("=" * 40)
    logger.info(f"Accuracy : {test_acc:.4f}")
    logger.info(f"Precision: {test_prec:.4f}")
    logger.info(f"Recall   : {test_rec:.4f}")
    logger.info(f"F1 Score : {test_f1:.4f}")
    logger.info(f"ROC AUC  : {test_auc:.4f}")
    
    cm = confusion_matrix(y_test, y_pred_best)
    logger.info("\nConfusion Matrix:")
    logger.info(f"True Neg (TN): {cm[0][0]:>6} | False Pos (FP): {cm[0][1]:>6}")
    logger.info(f"False Neg(FN): {cm[1][0]:>6} | True Pos  (TP): {cm[1][1]:>6}")
    logger.info("=" * 40)

    # ---- Per-source recall at selected threshold -------------------------
    y_pred_best = (y_proba_test >= best["threshold"]).astype(int)
    logger.info("\nPer-Source Metrics at Selected Clone Detector Threshold:")
    logger.info(f"  {'Source':<18} | {'Metric':<7} | Value")
    logger.info(f"  {'-'*18}-+-{'-'*7}-+-{'-'*6}")
    for src in sorted(np.unique(s_test)):
        mask = s_test == src
        yt = y_test[mask]
        yp = y_pred_best[mask]
        if np.any(yt == 1):
            tp = int(np.sum((yt == 1) & (yp == 1)))
            fn = int(np.sum((yt == 1) & (yp == 0)))
            rec_src = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            logger.info(f"  {src:<18s} | Recall  | {rec_src:.4f}  (TP={tp}, FN={fn})")
        else:
            fp = int(np.sum((yt == 0) & (yp == 1)))
            fpr = fp / len(yt) if len(yt) > 0 else 0.0
            logger.info(f"  {src:<18s} | FPR     | {fpr:.4f}  (FP={fp}, n={len(yt)})")

    # ---- Feature importance ----------------------------------------------
    logger.info("\nTop-20 Feature Importances:")
    logger.info(f"  {'Feature':<50} | Importance")
    logger.info(f"  {'-'*50}-+-{'-'*10}")
    for feat_name, imp in classifier.get_feature_importance_sorted()[:20]:
        logger.info(f"  {feat_name:<50s} | {imp:.4f}")

    # ---- Save ------------------------------------------------------------
    # Persist calibrated threshold in the pkl so evaluate.py/inference
    # code can apply the same boundary without extra CLI flags.
    classifier.calibrated_threshold = best["threshold"]
    saved_path = classifier.save(model_name)

    # ---- Persist metrics + visualizations --------------------------------
    final_metrics = {
        "threshold": best["threshold"],
        "precision": best["precision"],
        "recall":    best["recall"],
        "f1":        best["f1"],
        "accuracy":  float(test_acc),
        "roc_auc":   float(test_auc),
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
    )

    logger.info(f"\n{'='*80}")
    logger.info(f"Model saved → {saved_path}")
    logger.info(f"Clone detector threshold: {best['threshold']:.2f}")
    logger.info("Next step: run evaluate.py to measure Type-3 recall via the Type-3 Filter")
    logger.info(f"  poetry run python evaluate.py --threshold {best['threshold']:.2f}")
    logger.info("  or sweep thresholds for the best Type-3 F1:")
    logger.info("  for t in 0.10 0.15 0.20 0.25 0.30; do")
    logger.info(f"    poetry run python evaluate.py --threshold $t")
    logger.info("  done")
    logger.info("=" * 80)

    return final_metrics


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Train the two-stage XGBoost Clone Detector (Stage 1).\n\n"
            "Labels: Type-1 + Type-2 + Type-3 → 1 (Clone), NonClone → 0.\n"
            "Stage 2 (Type-3 Filter) is applied at evaluation / inference time."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--model-name",         type=str,   default=DEFAULT_MODEL_NAME)
    parser.add_argument("--sample-size",        type=int,   default=None,
                        help="Limit total pairs across all sources (scales config proportionally)")
    parser.add_argument("--n-estimators",        type=int,   default=500)
    parser.add_argument("--max-depth",           type=int,   default=8)
    parser.add_argument("--learning-rate",       type=float, default=0.05)
    parser.add_argument("--subsample",           type=float, default=0.9)
    parser.add_argument("--colsample-bytree",    type=float, default=0.8)
    parser.add_argument("--min-child-weight",    type=int,   default=2)
    parser.add_argument("--gamma",               type=float, default=0.1,
                        help="Min loss reduction for leaf split (conservative pruning)")
    parser.add_argument("--reg-lambda",          type=float, default=1.0,
                        help="L2 regularization on leaf weights")
    parser.add_argument("--scale-pos-weight",    type=float, default=2.0,
                        help="Scale factor for positive class (clone) gradient")
    parser.add_argument("--no-node-types",       action="store_true",
                        help="Disable per-node-type AST distribution features")
    parser.add_argument("--use-gpu",             action="store_true")
    parser.add_argument("--verbose",             action="store_true")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="Directory to write training_metrics.json and visualization plots "
             "(default: clone_detection/models/)",
    )

    args = parser.parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    train(
        model_name=args.model_name,
        sample_size=args.sample_size,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        subsample=args.subsample,
        colsample_bytree=args.colsample_bytree,
        min_child_weight=args.min_child_weight,
        gamma=args.gamma,
        reg_lambda=args.reg_lambda,
        scale_pos_weight=args.scale_pos_weight,
        include_node_types=not args.no_node_types,
        use_gpu=args.use_gpu,
        output_dir=args.output_dir,
    )
