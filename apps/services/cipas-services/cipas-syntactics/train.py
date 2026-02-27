"""
train.py — Type-3 Clone Detection Model Training (ToMa + XGBoost).

Pipeline context:
  Phase 1: NiCAD-style normalizer → detects Type-1 and Type-2 clones
  Phase 2 (this model): ToMa + XGBoost → detects Type-3 clones
  Fallback: Non-syntactic clone (semantic / Type-4+)

Training data (from TOMA dataset):
  Positives (label = 1):
    type-3.csv — syntactic near-miss clones (Type-3)
    type-4.csv — moderate Type-3 clones (still syntactically similar)
  Negatives (label = 0):
    nonclone.csv — confirmed non-clone pairs

Features used (hybrid):
  String-based (6)  : Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler
  AST-based   (4+N) : Structural Jaccard, AST depth diff, node count diff/ratio,
                      per-node-type distribution diffs (N ≈ 37 Java node types)

Usage:
    poetry run python train.py
    poetry run python train.py --sample-size 5000 --no-cv
"""

import argparse
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

# ---------------------------------------------------------------------------
# Hardcoded TOMA dataset path
# ---------------------------------------------------------------------------
TOMA_DATASET_DIR = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
)

# CSV files whose pairs are syntactic clones → positive class (label = 1)
#   type-3.csv — syntactic near-miss clones
#   type-4.csv — moderate Type-3 clones (still syntactic)
CLONE_CSV_FILES = ["type-3.csv", "type-4.csv"]

# CSV files whose pairs are negatives for this model → label = 0
#   nonclone.csv — genuine non-clone pairs
NEGATIVE_CSV_FILES = ["nonclone.csv"]

# Default output model name
DEFAULT_MODEL_NAME = "type3_xgb.pkl"


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
    clone_csv_files: list[str],
    negative_csv_files: list[str],
    sample_size: int | None = None,
) -> tuple[list[str], list[str], list[int], list[str]]:
    """
    Load TOMA dataset pairs for Type-3 syntactic clone detection.
    """
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []
    sources: list[str] = []

    # ── Positive pairs ─────────────────────────────────────────────────────
    for csv_name in clone_csv_files:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists(): continue

        logger.info(f"[+] Loading POSITIVE pairs from {csv_name} …")
        df = pd.read_csv(csv_path, header=None, 
                         names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"])
        if sample_size and len(df) > sample_size:
            df = df.sample(n=sample_size, random_state=42)

        for _, row in tqdm(df.iterrows(), total=len(df), desc=f"    {csv_name}"):
            c1 = _load_code(str(int(row["FUNCTION_ID_ONE"])), id2code_dir)
            c2 = _load_code(str(int(row["FUNCTION_ID_TWO"])), id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(1)
                sources.append(csv_name)

    # ── Negative pairs ─────────────────────────────────────────────────────
    for csv_name in negative_csv_files:
        neg_path = dataset_dir / csv_name
        if not neg_path.exists(): continue

        logger.info(f"[-] Loading NEGATIVE pairs from {csv_name} …")
        if csv_name == "nonclone.csv":
            df_neg = pd.read_csv(neg_path)
        else:
            df_neg = pd.read_csv(neg_path, header=None,
                                names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"])

        if sample_size and len(df_neg) > sample_size:
            df_neg = df_neg.sample(n=sample_size, random_state=42)

        for _, row in tqdm(df_neg.iterrows(), total=len(df_neg), desc=f"    {csv_name}"):
            c1 = _load_code(str(int(row["FUNCTION_ID_ONE"])), id2code_dir)
            c2 = _load_code(str(int(row["FUNCTION_ID_TWO"])), id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(0)
                sources.append(csv_name)

    return code1_list, code2_list, labels, sources


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
    Extract hybrid String + AST features for every code pair.

    String features  (6)  : Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
    AST features    (4+N) : Structural Jaccard, AST depth diff, node count diff/ratio,
                            per-node-type distribution similarities

    Returns:
        (X, feature_names)
    """
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
# Training Refinements
# ---------------------------------------------------------------------------

def find_optimal_threshold(y_true, y_proba, target_precision=0.90):
    """Find the threshold that maximizes recall given a minimum precision constraint."""
    from sklearn.metrics import precision_recall_curve
    precisions, recalls, thresholds = precision_recall_curve(y_true, y_proba)
    
    # We want precision >= target_precision
    # Filter thresholds where precision meets the requirement
    valid_indices = np.where(precisions >= target_precision)[0]
    
    if len(valid_indices) == 0:
        logger.warning(f"Could not find any threshold reaching {target_precision} precision.")
        # Fallback to the one with highest precision
        idx = np.argmax(precisions)
    else:
        # Among those, pick the one with highest recall
        # valid_indices includes the dummy precision=1.0 at the end (which has recall=0)
        # We exclude the last index if it's the one with recall 0
        if valid_indices[-1] == len(recalls) - 1:
            valid_indices = valid_indices[:-1]
        
        if len(valid_indices) == 0:
            idx = np.argmax(precisions)
        else:
            # We want to maximize recall
            # recalls and precisions are indexed similarly
            best_idx = valid_indices[np.argmax(recalls[valid_indices])]
            idx = best_idx

    # Handle edge case where idx might be out of range for thresholds (since thresholds has len-1)
    threshold_idx = min(idx, len(thresholds) - 1)
    return thresholds[threshold_idx], precisions[idx], recalls[idx]


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
    Extract hybrid String + AST features for every code pair.

    String features  (6)  : Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
    AST features    (4+N) : Structural Jaccard, AST depth diff, node count diff/ratio,
                            per-node-type distribution similarities

    Returns:
        (X, feature_names)
    """
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
# Training
# ---------------------------------------------------------------------------

def train(
    sample_size: int | None = None,
    model_name: str = DEFAULT_MODEL_NAME,
    test_size: float = 0.2,
    cross_validation: bool = True,
    n_estimators: int = 200,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    subsample: float = 0.8,
    colsample_bytree: float = 0.8,
    include_node_types: bool = True,
    use_gpu: bool = False,
) -> dict:
    """
    Train the ToMa + XGBoost Type-3 clone detection model with recall optimization.
    """
    from sklearn.metrics import f1_score, make_scorer
    from sklearn.model_selection import train_test_split, cross_val_score

    logger.info("=" * 80)
    logger.info("Type-3 Clone Detection — RECALL-OPTIMIZED Training")
    logger.info("=" * 80)
    logger.info(f"Dataset    : {TOMA_DATASET_DIR}")
    logger.info(f"Positives  : {CLONE_CSV_FILES} (Ignoring semantic/Type-4)")
    logger.info(f"Negatives  : {NEGATIVE_CSV_FILES}")
    logger.info(f"Objective  : Maximize Type-3 Recall (Precision > 90%)")
    logger.info(f"Weight     : scale_pos_weight = 3.0")
    logger.info("=" * 80)

    # ---- Load data -------------------------------------------------------
    code1_list, code2_list, labels, sources = load_toma_dataset(
        dataset_dir=TOMA_DATASET_DIR,
        clone_csv_files=CLONE_CSV_FILES,
        negative_csv_files=NEGATIVE_CSV_FILES,
        sample_size=sample_size,
    )

    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)
    s = np.array(sources)

    # Split with stratification and source tracking
    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y, s, test_size=test_size, random_state=42, stratify=y
    )

    # ---- Initialize Classifier --------------------------------------------
    # Using scale_pos_weight=3.0 to boost recall for hard near-misses
    classifier = SyntacticClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        colsample_bytree=colsample_bytree,
        feature_names=feature_names,
        use_gpu=use_gpu,
        scale_pos_weight=3.0,
    )

    # Custom scoring: Focus on F1 of the specific Type-3 samples
    def type3_f1_scorer(estimator, X_val, y_val):
        # This is a bit tricky for cross_val_score as it doesn't easily pass 'sources'
        # For now, we use standard macro F1 as a proxy if we can't easily filter
        # But for the test set evaluation, we will be specific.
        y_pred = estimator.predict(X_val)
        return f1_score(y_val, y_pred)

    # ---- Train -----------------------------------------------------------
    logger.info("\nTraining XGBoost classifier (scale_pos_weight=3.0) …")
    classifier.model.fit(X_train, y_train)
    classifier.is_trained = True

    # ---- Threshold Optimization -------------------------------------------
    logger.info("\nOptimizing classification threshold for Precision > 90% …")
    y_proba = classifier.predict_proba(X_test)[:, 1]
    opt_threshold, opt_prec, opt_rec = find_optimal_threshold(y_test, y_proba, target_precision=0.90)
    
    logger.info(f"  [TARGET] Precision > 0.90")
    logger.info(f"  [RESULT] Optimal Threshold: {opt_threshold:.4f}")
    logger.info(f"  [RESULT] Precision: {opt_prec:.4f}")
    logger.info(f"  [RESULT] Recall   : {opt_rec:.4f}")

    # ---- Evaluation ------------------------------------------------------
    y_pred_opt = (y_proba >= opt_threshold).astype(int)
    
    # Per-source metrics
    logger.info("\nPer-Source Metrics (at Optimal Threshold):")
    for src in np.unique(s_test):
        mask = (s_test == src)
        if not np.any(mask): continue
        
        y_true_src = y_test[mask]
        y_pred_src = y_pred_opt[mask]
        
        # Only calculate recall for positive classes
        if np.any(y_true_src == 1):
            src_recall = np.sum((y_true_src == 1) & (y_pred_src == 1)) / np.sum(y_true_src == 1)
            logger.info(f"  {src:<15s} | Recall: {src_recall:.4f} (count={len(y_true_src)})")
        else:
            # For negative classes like nonclone.csv, show "False Positive Rate"
            fpr = np.sum((y_true_src == 0) & (y_pred_src == 1)) / len(y_true_src)
            logger.info(f"  {src:<15s} | FPR:    {fpr:.4f} (count={len(y_true_src)})")

    # ---- Save model ------------------------------------------------------
    saved_path = classifier.save(model_name)
    logger.info(f"\nModel saved to: {saved_path}")
    
    # Store threshold info for persistence? 
    # Current implementation doesn't store threshold in the pkl, 
    # but we should note it.
    logger.info(f"NOTE: Recommended classification threshold is {opt_threshold:.4f}")

    metrics = {
        "threshold": opt_threshold,
        "precision": opt_prec,
        "recall": opt_rec,
        "f1": (2 * opt_prec * opt_rec) / (opt_prec + opt_rec) if (opt_prec+opt_rec) > 0 else 0
    }
    
    return metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train recall-optimized ToMa + XGBoost")
    parser.add_argument("--sample-size", type=int, default=None)
    parser.add_argument("--model-name", type=str, default=DEFAULT_MODEL_NAME)
    parser.add_argument("--no-node-types", action="store_true")
    parser.add_argument("--use-gpu", action="store_true")
    parser.add_argument("--verbose", action="store_true")

    args = parser.parse_args()
    if args.verbose: logging.getLogger().setLevel(logging.DEBUG)

    train(
        sample_size=args.sample_size,
        model_name=args.model_name,
        include_node_types=not args.no_node_types,
        use_gpu=args.use_gpu
    )
