"""
evaluate.py — Evaluate the trained Type-3 clone detection model (ToMa + XGBoost).

Pipeline context:
  Phase 1: NiCAD-style normalizer → Type-1 / Type-2
  Phase 2 (this model): ToMa + XGBoost → Type-3
  Fallback: Non-syntactic clone

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
    Syntactic clones  → label=1  AND  clone_type in {1, 2, 3}   → XGBoost target = 1
    Non-clones        → label=0                                  → XGBoost target = 0

    NOTE: clone_type=4 (semantic-only) pairs are EXCLUDED from the binary
    evaluation because this model is a syntactic-only detector.
    The per-clone-type breakdown is reported separately.

Features must match what was used during training (train.py):
  String features (6): Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
  AST features (4+N) : Structural Jaccard, depth diff, node count diff/ratio,
                       per-node-type distribution diffs

Usage:
    poetry run python evaluate.py
    poetry run python evaluate.py --model models/type3_xgb.pkl --sample-size 2000
    poetry run python evaluate.py --clone-types 3         # evaluate only on Type-3 pairs
    poetry run python evaluate.py --include-type4         # include semantic clones as negatives
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
DEFAULT_MODEL_NAME = "type3_xgb.pkl"

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
    include_type4_as_negative: bool = False,
    sample_size: int | None = None,
) -> tuple[list[str], list[str], list[int], list[dict]]:
    """
    Load code pairs from BigCloneBench Balanced JSON for binary evaluation.

    Args:
        bcb_path: Path to bigclonebench_balanced.json.
        clone_types: If set, only evaluate on pairs whose clone_type is in this
                     set (for clones) or all non-clones.  Default: {1, 2, 3}.
        include_type4_as_negative: If True, include clone_type=4 pairs as label=0
                                   (they are non-syntactic clones).  Default: False
                                   (exclude them entirely to keep evaluation clean).
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
                if include_type4_as_negative:
                    # Treat semantic clones as label=0 for syntactic evaluation
                    rec = dict(rec)
                    rec["label"] = 0
                    rec["_original_clone_type"] = ct
                    non_clones.append(rec)
                else:
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
    include_type4_as_negative: bool = False,
    sample_size: int | None = None,
    include_node_types: bool = True,
) -> dict:
    """
    Evaluate the Type-3 clone detection model on BigCloneBench Balanced.

    Returns:
        Dictionary with accuracy, precision, recall, F1, ROC-AUC.
    """
    if clone_types is None:
        clone_types = SYNTACTIC_CLONE_TYPES

    logger.info("=" * 80)
    logger.info("Type-3 Clone Detection — Model Evaluation on BigCloneBench Balanced")
    logger.info("=" * 80)
    logger.info(f"Model       : {model_name}")
    logger.info(f"Dataset     : {BCB_BALANCED_PATH}")
    logger.info(f"Clone types : {sorted(clone_types)}")
    logger.info(f"Type-4 as negative: {include_type4_as_negative}")
    logger.info("=" * 80)

    # ---- Load model -------------------------------------------------------
    logger.info(f"\nLoading model '{model_name}' …")
    try:
        model = SyntacticClassifier.load(model_name)
    except FileNotFoundError:
        logger.error(
            "Model file not found. Train the model first:\n"
            "  poetry run python train.py"
        )
        raise

    # ---- Load evaluation data ---------------------------------------------
    logger.info("\nLoading evaluation dataset …")
    code1_list, code2_list, labels, meta_list = load_bcb_dataset(
        bcb_path=BCB_BALANCED_PATH,
        clone_types=clone_types,
        include_type4_as_negative=include_type4_as_negative,
        sample_size=sample_size,
    )

    total = len(labels)
    n_clones = sum(labels)
    n_nonclones = total - n_clones
    logger.info(f"\nTotal pairs : {total:,}")
    logger.info(f"  Clones    : {n_clones:,}  ({n_clones / total * 100:.1f} %)")
    logger.info(f"  Non-clones: {n_nonclones:,}  ({n_nonclones / total * 100:.1f} %)")

    # ---- Extract features -------------------------------------------------
    logger.info("\nExtracting features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    # ---- Predict ----------------------------------------------------------
    logger.info("\nRunning predictions …")
    y_pred = model.predict(X)
    y_proba = model.predict_proba(X)[:, 1]

    # ---- Overall metrics --------------------------------------------------
    metrics = {
        "accuracy" : accuracy_score(y, y_pred),
        "precision": precision_score(y, y_pred, zero_division=0),
        "recall"   : recall_score(y, y_pred, zero_division=0),
        "f1"       : f1_score(y, y_pred, zero_division=0),
        "roc_auc"  : roc_auc_score(y, y_proba),
    }

    # ---- Per-clone-type breakdown -----------------------------------------
    clone_type_metrics: dict[int, dict] = {}
    for ct in sorted(clone_types):
        # Indices for this clone type (positives only)
        ct_idx = [
            i for i, m in enumerate(meta_list)
            if int(m["label"]) == 1 and int(m.get("clone_type", 0)) == ct
        ]
        if not ct_idx:
            continue

        ct_y = y[ct_idx]
        ct_pred = y_pred[ct_idx]

        tp = int(np.sum((ct_y == 1) & (ct_pred == 1)))
        fn = int(np.sum((ct_y == 1) & (ct_pred == 0)))
        recall_ct = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        clone_type_metrics[ct] = {
            "count": len(ct_idx),
            "tp": tp,
            "fn": fn,
            "recall": recall_ct,
        }

    # ---- Report -----------------------------------------------------------
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT — BigCloneBench Balanced")
    logger.info("=" * 80)
    logger.info(f"Dataset  : {BCB_BALANCED_PATH}")
    logger.info(f"Total    : {total:,} pairs")
    logger.info(f"Clones   : {n_clones:,}  |  Non-clones: {n_nonclones:,}")
    logger.info("-" * 80)
    logger.info(f"Accuracy : {metrics['accuracy']:.4f}")
    logger.info(f"Precision: {metrics['precision']:.4f}")
    logger.info(f"Recall   : {metrics['recall']:.4f}")
    logger.info(f"F1 Score : {metrics['f1']:.4f}")
    logger.info(f"ROC AUC  : {metrics['roc_auc']:.4f}")

    logger.info("\nClassification Report:")
    logger.info(classification_report(y, y_pred, target_names=["Non-Clone", "Clone"]))

    logger.info("Confusion Matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y, y_pred)
    logger.info(f"  TN={cm[0,0]:>7}  FP={cm[0,1]:>7}")
    logger.info(f"  FN={cm[1,0]:>7}  TP={cm[1,1]:>7}")

    # Per-clone-type recall
    if clone_type_metrics:
        logger.info("\nPer-Clone-Type Recall (when Phase 1 passed these to Phase 2):")
        logger.info("-" * 80)
        for ct, m in clone_type_metrics.items():
            logger.info(
                f"  Type-{ct}  : count={m['count']:>6}  "
                f"TP={m['tp']:>6}  FN={m['fn']:>6}  "
                f"Recall={m['recall']:.4f}"
            )

    # Feature importance
    logger.info("\nTop-20 Feature Importances:")
    logger.info("-" * 80)
    try:
        for feat_name, importance in model.get_feature_importance_sorted()[:20]:
            logger.info(f"  {feat_name:<50s}: {importance:.4f}")
    except Exception:
        pass

    return metrics


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the Type-3 clone detection model on BigCloneBench Balanced.\n"
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
        "--include-type4",
        action="store_true",
        help="Include semantic / Type-4 clone pairs as label=0 negatives "
             "(default: exclude them from evaluation).",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        metavar="N",
        help="Sample at most N pairs per class for fast evaluation.",
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable per-node-type AST features (must match training config).",
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
        include_type4_as_negative=args.include_type4,
        sample_size=args.sample_size,
        include_node_types=not args.no_node_types,
    )
