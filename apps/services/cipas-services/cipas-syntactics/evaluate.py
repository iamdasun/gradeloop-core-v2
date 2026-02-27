"""
evaluate.py — Evaluate the two-stage clone detection pipeline on BigCloneBench Balanced.

Pipeline context:
  Stage 0: NiCAD-style normalizer → Type-1 / Type-2
  Stage 1: XGBoost Clone Detector (clone_detector_xgb.pkl)
           Trained on Type-1 + Type-2 + Type-3 (strong/moderate/weak) vs NonClone.
           Outputs a clone probability in [0, 1].
  Stage 2: Type-3 Filter (clone_detection/type3_filter.py)
           Applies levenshtein_ratio and ast_jaccard boundary checks to determine
           whether a confirmed clone is specifically a Type-3 near-miss.

Evaluation dataset:
  BigCloneBench Balanced (bigclonebench_balanced.json)
  Path: /home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/bigclonebench_balanced.json

  JSON schema per record:
    {
      "id1", "id2",
      "label"      : 1 = clone, 0 = non-clone,
      "clone_type" : 1 | 2 | 3  (only meaningful when label == 1),
      "code1", "code2",
      ...
    }

  Evaluation split used:
    Syntactic clones → label=1  AND  clone_type in {1, 2, 3} → XGBoost target = 1
    Non-clones       → label=0                                → XGBoost target = 0

    NOTE: clone_type=4 (semantic-only) pairs are EXCLUDED from the binary
    evaluation because this model is a syntactic-only detector.
    The per-clone-type breakdown is reported separately.

Primary KPI:
  Type-3 Recall ≥ 40% (measured via the Stage 2 Type-3 Filter output).

Prediction pipeline per pair:
  1. XGBoost predicts clone probability: p = model.predict_proba(X)[i][1]
  2. If p > threshold → is_clone = True, else False.
  3. If is_clone: apply Type-3 Filter → is_type3 = is_type3_clone(features, feature_names, p)
  4. Final prediction: 1 if is_type3 else 0.

Features must match what was used during training (train.py):
  String features (6): Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
  AST features (4+N) : Structural Jaccard, depth diff, node count diff/ratio,
                       structural_density_1/2/diff, per-node-type distribution diffs

Usage:
    poetry run python evaluate.py
    poetry run python evaluate.py --model models/clone_detector_xgb.pkl --sample-size 2000
    poetry run python evaluate.py --clone-types 3 --threshold 0.25
"""

import argparse
import json
import logging
from pathlib import Path

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
from clone_detection.type3_filter import is_type3_clone
from clone_detection.utils.common_setup import setup_logging

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

    logger.info(f"  Syntactic clones (Type-{{{','.join(str(t) for t in sorted(clone_types))}}}): {len(clones):,}")
    logger.info(f"  Non-clones                                      : {len(non_clones):,}")
    if skipped_type4:
        logger.info(f"  Type-4 semantic clones skipped (excluded)       : {skipped_type4:,}")

    # Sample if requested (independently per class)
    if sample_size:
        if len(clones) > sample_size:
            import random; random.seed(0)
            clones = random.sample(clones, sample_size)
            logger.info(f"  Sampled {sample_size} clone pairs")
        if len(non_clones) > sample_size:
            import random; random.seed(0)
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
# Feature extraction
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
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(
    model_name: str = DEFAULT_MODEL_NAME,
    clone_types: set[int] | None = None,
    sample_size: int | None = None,
    include_node_types: bool = True,
    threshold: float | None = None,
    log_type3_similarity: bool = False,
) -> dict:
    """
    Evaluate the two-stage clone detection pipeline on BigCloneBench Balanced.

    Prediction flow per pair:
      1. Clone Detector (XGBoost): p = model.predict_proba(X)[i][1]
      2. If p > threshold → enter Type-3 Filter
         else → not a clone (prediction = 0)
      3. Type-3 Filter: is_type3_clone(features_array, feature_names, p)
         True  → prediction = 1  (Type-3 near-miss clone)
         False → prediction = 0  (high-similarity clone excluded as Type-1/2,
                                   or probability too low)

    The per-clone-type recall breakdown measures how well this two-stage
    pipeline catches each clone type, with Type-3 recall being the primary KPI.

    Args:
        model_name:            Filename for the trained clone detector pkl.
        clone_types:           Set of clone types to include as positives.
        sample_size:           Limit pairs per class for faster evaluation.
        include_node_types:    Whether to include node-type distribution features.
        threshold:             Override the model's calibrated clone probability
                               threshold (None → use model's calibrated value).
        log_type3_similarity:  If True, log lev/ast/prob for each correct Type-3
                               detection (Step 10 optional logging).

    Returns:
        Dictionary containing accuracy, precision, recall, F1, ROC-AUC,
        and per-clone-type recall.
    """
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info("=" * 80)
    logger.info("Two-Stage Clone Detection — Pipeline Evaluation on BigCloneBench Balanced")
    logger.info("=" * 80)
    logger.info(f"Stage 1 model : {model_name}")
    logger.info(f"Stage 2       : Type-3 Filter (type3_filter.py)")
    logger.info(f"Dataset       : {BCB_BALANCED_PATH}")
    logger.info(f"Clone types   : {sorted(clone_types)}")
    logger.info(f"Threshold     : {threshold if threshold is not None else 'calibrated (from model)'}")
    logger.info("=" * 80)

    # ---- Load model -------------------------------------------------------
    logger.info(f"\nLoading clone detector model '{model_name}' …")
    try:
        model = SyntacticClassifier.load(model_name)
    except FileNotFoundError:
        logger.error(
            "Model file not found. Train the model first:\n"
            "  poetry run python train.py"
        )
        raise

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

    # ---- Extract features ------------------------------------------------
    logger.info("\nExtracting features …")
    X, raw_feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    # ---- Filter to those kept during training ----------------------------
    missing_feats = [f for f in model.feature_names if f not in raw_feature_names]
    if missing_feats:
        logger.error(f"Missing features required by the model: {missing_feats}")
        raise ValueError("Feature mismatch between training and inference")

    kept_indices = [raw_feature_names.index(f) for f in model.feature_names]
    X_filtered = X[:, kept_indices]
    feature_names = model.feature_names

    # ---- Stage 1: Clone Detector probabilities ---------------------------
    logger.info("\nRunning Stage 1: Clone Detector …")
    y_proba = model.predict_proba(X_filtered)[:, 1]

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

    # ---- Stage 2: Type-3 Filter ------------------------------------------
    logger.info("\nRunning Stage 2: Type-3 Filter …")
    y_pred: list[int] = []

    for i in range(len(X)):
        prob = float(y_proba[i])

        if prob > effective_threshold:
            # Pair is a clone — apply Type-3 boundary filter
            pred = int(is_type3_clone(X_filtered[i], feature_names, prob))

            # Optional: log structural signature of true-positive Type-3 detections
            if log_type3_similarity and pred == 1 and y[i] == 1:
                lev_idx = feature_names.index("feat_levenshtein_ratio")
                ast_idx = feature_names.index("feat_ast_jaccard")
                logger.info(
                    "Type3 clone: lev=%.3f, ast=%.3f, prob=%.3f",
                    X_filtered[i][lev_idx], X_filtered[i][ast_idx], prob,
                )
        else:
            pred = 0

        y_pred.append(pred)

    y_pred_arr = np.array(y_pred)

    # ---- Overall metrics -------------------------------------------------
    metrics = {
        "accuracy" : accuracy_score(y, y_pred_arr),
        "precision": precision_score(y, y_pred_arr, zero_division=0),
        "recall"   : recall_score(y, y_pred_arr, zero_division=0),
        "f1"       : f1_score(y, y_pred_arr, zero_division=0),
        "roc_auc"  : roc_auc_score(y, y_proba),
        "threshold": effective_threshold,
    }

    # ---- Per-clone-type breakdown ----------------------------------------
    clone_type_metrics: dict[int, dict] = {}
    for ct in sorted(clone_types):
        ct_idx = [
            i for i, m in enumerate(meta_list)
            if int(m["label"]) == 1 and int(m.get("clone_type", 0)) == ct
        ]
        if not ct_idx:
            continue

        ct_y    = y[ct_idx]
        ct_pred = y_pred_arr[ct_idx]

        tp = int(np.sum((ct_y == 1) & (ct_pred == 1)))
        fn = int(np.sum((ct_y == 1) & (ct_pred == 0)))
        fp = int(np.sum((ct_y == 0) & (ct_pred == 1)))
        tn = int(np.sum((ct_y == 0) & (ct_pred == 0)))

        recall_ct    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        precision_ct = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        f1_ct        = (
            2 * precision_ct * recall_ct / (precision_ct + recall_ct)
            if (precision_ct + recall_ct) > 0 else 0.0
        )

        clone_type_metrics[ct] = {
            "count":     len(ct_idx),
            "tp":        tp,
            "fn":        fn,
            "recall":    recall_ct,
            "precision": precision_ct,
            "f1":        f1_ct,
        }

    # ---- Report ----------------------------------------------------------
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT — BigCloneBench Balanced (Two-Stage Pipeline)")
    logger.info("=" * 80)
    logger.info(f"Dataset     : {BCB_BALANCED_PATH}")
    logger.info(f"Total       : {total:,} pairs")
    logger.info(f"Clones      : {n_clones:,}  |  Non-clones: {n_nonclones:,}")
    logger.info(f"Threshold   : {effective_threshold:.2f}  (Stage 1) + Type-3 Filter (Stage 2)")
    logger.info("-" * 80)
    logger.info(f"Accuracy    : {metrics['accuracy']:.4f}")
    logger.info(f"Precision   : {metrics['precision']:.4f}")
    logger.info(f"Recall      : {metrics['recall']:.4f}")
    logger.info(f"F1 Score    : {metrics['f1']:.4f}")
    logger.info(f"ROC AUC     : {metrics['roc_auc']:.4f}")

    logger.info("\nClassification Report:")
    logger.info(classification_report(y, y_pred_arr, target_names=["Non-Clone", "Clone"]))

    logger.info("Confusion Matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y, y_pred_arr)
    logger.info(f"  TN={cm[0,0]:>7}  FP={cm[0,1]:>7}")
    logger.info(f"  FN={cm[1,0]:>7}  TP={cm[1,1]:>7}")

    # Per-clone-type recall — PRIMARY KPI
    if clone_type_metrics:
        logger.info("\n" + "=" * 80)
        logger.info("Per-Clone-Type Metrics via Two-Stage Pipeline  (PRIMARY KPI)")
        logger.info("Target: Type-3 Recall ≥ 40%")
        logger.info("=" * 80)
        logger.info(f"  {'Type':<7} {'Recall':>7}  {'Precision':>9}  {'F1':>7}   bar (recall)             TP / (TP+FN)  n")
        logger.info(f"  {'-'*7} {'-'*7}  {'-'*9}  {'-'*7}   {'-'*24}  {'-'*12}  {'-'*6}")
        for ct, m in clone_type_metrics.items():
            bar_filled = int(m["recall"] * 20)
            bar = "█" * bar_filled + "░" * (20 - bar_filled)
            kpi = " ← TARGET" if ct == 3 else ""
            meet = " ✓" if ct == 3 and m["recall"] >= 0.40 else (" ✗" if ct == 3 else "")
            logger.info(
                f"  Type-{ct}  {m['recall']:>7.4f}  {m['precision']:>9.4f}  {m['f1']:>7.4f}   [{bar}]"
                f"  TP={m['tp']:>5} / {m['tp']+m['fn']:>5}  n={m['count']:>6}{kpi}{meet}"
            )

    # Feature importance
    logger.info("\nTop-20 Feature Importances (Clone Detector):")
    logger.info("-" * 80)
    try:
        for feat_name, importance in model.get_feature_importance_sorted()[:20]:
            logger.info(f"  {feat_name:<50s}: {importance:.4f}")
    except Exception:
        pass

    # Type-3 filter boundary reminder
    logger.info("\nType-3 Filter Boundaries Applied (Stage 2):")
    logger.info("  prob_floor       : 0.35  (pairs below this are not clones)")
    logger.info("  lev_ratio_upper  : 0.85  (above this = Type-1/2, excluded from Type-3)")
    logger.info("  ast_jaccard_upper: 0.90  (above this = Type-1/2, excluded from Type-3)")

    return {**metrics, "per_clone_type": clone_type_metrics}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the two-stage clone detection pipeline on BigCloneBench Balanced.\n\n"
            "Stage 1: XGBoost Clone Detector predicts clone probability.\n"
            "Stage 2: Type-3 Filter maps confirmed clones to near-miss Type-3 predictions.\n\n"
            f"Dataset: {BCB_BALANCED_PATH}"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL_NAME,
        metavar="MODEL_NAME",
        help=f"Model filename inside the models/ directory (default: {DEFAULT_MODEL_NAME})",
    )
    parser.add_argument(
        "--clone-types",
        type=int,
        nargs="+",
        default=[1, 2, 3],
        metavar="N",
        help="Clone types to include as positives (default: 1 2 3). "
             "Use '--clone-types 3' to evaluate only on Type-3 pairs.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        metavar="N",
        help="Sample at most N pairs per class for fast evaluation.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        metavar="T",
        help=(
            "Stage 1 clone probability threshold (None = use model calibrated value). "
            "Sweep 0.10–0.30 to find the best Type-3 F1."
        ),
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable per-node-type AST features (must match training config).",
    )
    parser.add_argument(
        "--log-type3-similarity",
        action="store_true",
        help="Log lev/ast/prob for every correctly detected Type-3 clone (verbose).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    evaluate(
        model_name=args.model,
        clone_types=set(args.clone_types),
        sample_size=args.sample_size,
        include_node_types=not args.no_node_types,
        threshold=args.threshold,
        log_type3_similarity=args.log_type3_similarity,
    )
