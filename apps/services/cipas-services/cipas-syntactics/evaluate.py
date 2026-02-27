"""
evaluate.py — Evaluate the trained Type-3 clone detection model (ToMa + XGBoost).

Pipeline context:
  Phase 1: NiCAD-style normalizer → Type-1 / Type-2
  Phase 2 (this model): ToMa + XGBoost → Type-3
  Fallback: Non-syntactic clone

The evaluation dataset mirrors the training setup:
  Positives → type-3.csv + type-4.csv  (from TOMA dataset)
  Negatives → nonclone.csv

Features used must match the trained model:
  String features (6): Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
  AST features (4+N) : Structural Jaccard, depth diff, node count diff/ratio,
                       per-node-type distribution diffs

Usage:
    poetry run python evaluate.py
    poetry run python evaluate.py --model models/type3_xgb.pkl --sample-size 2000
"""

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd
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
# Hardcoded TOMA dataset path (mirrors train.py)
# ---------------------------------------------------------------------------
TOMA_DATASET_DIR = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
)
CLONE_CSV_FILES = ["type-3.csv", "type-4.csv"]
DEFAULT_MODEL_NAME = "type3_xgb.pkl"


# ---------------------------------------------------------------------------
# Data loading (same logic as train.py)
# ---------------------------------------------------------------------------

def _load_code(func_id: str, id2code_dir: Path) -> str | None:
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
    clone_csv_files: list[str],
    sample_size: int | None = None,
) -> tuple[list[str], list[str], list[int]]:
    """
    Load evaluation pairs from the TOMA dataset directory.

    Mirrors the loading logic in train.py so the evaluation set
    follows the same distribution as the training set.
    """
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []

    # ---- Positives -------------------------------------------------------
    for csv_name in clone_csv_files:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists():
            logger.warning(f"Clone CSV not found: {csv_path} — skipping")
            continue

        logger.info(f"Loading clone pairs from {csv_path} …")
        df = pd.read_csv(
            csv_path,
            header=None,
            names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
        )

        if sample_size and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=0)  # different seed from training

        loaded = 0
        for _, row in tqdm(df.iterrows(), total=len(df), desc=f"  {csv_name}"):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))
            c1 = _load_code(id1, id2code_dir)
            c2 = _load_code(id2, id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(1)
                loaded += 1

        logger.info(f"  Loaded {loaded} clone pairs")

    # ---- Negatives -------------------------------------------------------
    nonclone_path = dataset_dir / "nonclone.csv"
    if nonclone_path.exists():
        logger.info(f"Loading non-clone pairs from {nonclone_path} …")
        df_nc = pd.read_csv(nonclone_path)

        if sample_size and len(df_nc) > sample_size:
            df_nc = df_nc.sample(n=sample_size, random_state=0)

        loaded = 0
        for _, row in tqdm(df_nc.iterrows(), total=len(df_nc), desc="  nonclone.csv"):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))
            c1 = _load_code(id1, id2code_dir)
            c2 = _load_code(id2, id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(0)
                loaded += 1

        logger.info(f"  Loaded {loaded} non-clone pairs")

    return code1_list, code2_list, labels


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
    extractor = SyntacticFeatureExtractor(language=language, include_node_types=include_node_types)
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
    sample_size: int | None = None,
    include_node_types: bool = True,
) -> dict:
    """
    Evaluate the trained Type-3 detection model on the TOMA dataset.

    Returns:
        Dictionary containing accuracy, precision, recall, F1, ROC-AUC.
    """
    logger.info("=" * 80)
    logger.info("Type-3 Clone Detection — Model Evaluation (ToMa + XGBoost)")
    logger.info("=" * 80)
    logger.info(f"Model   : {model_name}")
    logger.info(f"Dataset : {TOMA_DATASET_DIR}")
    logger.info("=" * 80)

    # ---- Load model ------------------------------------------------------
    logger.info(f"\nLoading model '{model_name}' …")
    try:
        model = SyntacticClassifier.load(model_name)
    except FileNotFoundError:
        logger.error(
            f"Model file not found. Train the model first:\n"
            f"  poetry run python train.py"
        )
        raise

    # ---- Load evaluation data --------------------------------------------
    logger.info("\nLoading evaluation dataset …")
    code1_list, code2_list, labels = load_toma_dataset(
        dataset_dir=TOMA_DATASET_DIR,
        clone_csv_files=CLONE_CSV_FILES,
        sample_size=sample_size,
    )

    total = len(labels)
    n_clones = sum(labels)
    logger.info(f"Total pairs : {total}")
    logger.info(f"  Clones    : {n_clones}  ({n_clones / total * 100:.1f} %)")
    logger.info(f"  Non-clones: {total - n_clones}  ({(total - n_clones) / total * 100:.1f} %)")

    # ---- Extract features -----------------------------------------------
    logger.info("\nExtracting features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    # ---- Predict ---------------------------------------------------------
    logger.info("\nRunning predictions …")
    y_pred = model.predict(X)
    y_proba = model.predict_proba(X)[:, 1]

    # ---- Compute metrics -------------------------------------------------
    metrics = {
        "accuracy" : accuracy_score(y, y_pred),
        "precision": precision_score(y, y_pred, zero_division=0),
        "recall"   : recall_score(y, y_pred, zero_division=0),
        "f1"       : f1_score(y, y_pred, zero_division=0),
        "roc_auc"  : roc_auc_score(y, y_proba),
    }

    # ---- Report ----------------------------------------------------------
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT")
    logger.info("=" * 80)
    logger.info(f"Dataset    : {TOMA_DATASET_DIR}")
    logger.info(f"Positives  : {CLONE_CSV_FILES}")
    logger.info(f"Total pairs: {total}")
    logger.info("-" * 80)
    logger.info(f"Accuracy   : {metrics['accuracy']:.4f}")
    logger.info(f"Precision  : {metrics['precision']:.4f}")
    logger.info(f"Recall     : {metrics['recall']:.4f}")
    logger.info(f"F1 Score   : {metrics['f1']:.4f}")
    logger.info(f"ROC AUC    : {metrics['roc_auc']:.4f}")
    logger.info("\nClassification Report:")
    logger.info(classification_report(y, y_pred, target_names=["Non-Clone", "Clone"]))
    logger.info("Confusion Matrix (rows=actual, cols=predicted):")
    cm = confusion_matrix(y, y_pred)
    logger.info(f"  TN={cm[0,0]:>7}  FP={cm[0,1]:>7}")
    logger.info(f"  FN={cm[1,0]:>7}  TP={cm[1,1]:>7}")

    # ---- Feature importance (if the model has stored feature names) ------
    logger.info("\nTop-20 Feature Importances:")
    logger.info("-" * 80)
    try:
        for feat_name, importance in model.get_feature_importance_sorted()[:20]:
            logger.info(f"  {feat_name:<50s}: {importance:.4f}")
    except Exception:
        pass  # model may not have named features

    return metrics


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the trained Type-3 clone detection model.\n"
            f"Dataset is hardcoded to: {TOMA_DATASET_DIR}"
        )
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL_NAME,
        metavar="MODEL_NAME",
        help=f"Model filename inside the models/ directory (default: {DEFAULT_MODEL_NAME})",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        metavar="N",
        help="Sample at most N pairs per split for fast evaluation. Default: use all pairs.",
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable per-node-type AST features (must match what was used during training)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    evaluate(
        model_name=args.model,
        sample_size=args.sample_size,
        include_node_types=not args.no_node_types,
    )
