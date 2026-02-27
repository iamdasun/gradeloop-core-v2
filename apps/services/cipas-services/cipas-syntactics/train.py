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
    type-5.csv   — semantic / Type-4 clones (NOT syntactically similar;
                    model learns to reject these as non-syntactic)

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
) -> tuple[list[str], list[str], list[int]]:
    """
    Load TOMA dataset pairs for Type-3 syntactic clone detection.

    Positive pairs (label = 1):
        Loaded from each file in *clone_csv_files*.
        Files have no header — columns: FUNCTION_ID_ONE, FUNCTION_ID_TWO,
        CLONE_TYPE, SIM1, SIM2
          type-3.csv — syntactic near-miss clones
          type-4.csv — moderate Type-3 clones (still syntactic)

    Negative pairs (label = 0):
        Loaded from each file in *negative_csv_files*:
          nonclone.csv — genuine non-clone pairs (has header row)

    Args:
        dataset_dir: Path to TOMA dataset directory.
        clone_csv_files: CSV file names for positive (syntactic clone) pairs.
        negative_csv_files: CSV file names that contribute negative pairs.
        sample_size: If set, sample at most this many rows per file.

    Returns:
        (code1_list, code2_list, labels)  where label 1 = clone, 0 = non-clone.
    """
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []

    # ── Positive pairs: syntactic clones (Type-3 + moderate Type-3) ────────
    for csv_name in clone_csv_files:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists():
            logger.warning(f"[+] Clone CSV not found: {csv_path} — skipping")
            continue

        logger.info(f"[+] Loading POSITIVE pairs from {csv_path} …")
        df = pd.read_csv(
            csv_path,
            header=None,
            names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
        )
        if sample_size and len(df) > sample_size:
            logger.info(f"    Sampling {sample_size} / {len(df)} rows")
            df = df.sample(n=sample_size, random_state=42)

        loaded = 0
        for _, row in tqdm(df.iterrows(), total=len(df), desc=f"    {csv_name}"):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))
            c1 = _load_code(id1, id2code_dir)
            c2 = _load_code(id2, id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(1)
                loaded += 1
        logger.info(f"    Loaded {loaded} valid positive pairs from {csv_name}")

    # ── Negative pairs: non-clones ────────────────────────────────────────
    for csv_name in negative_csv_files:
        neg_path = dataset_dir / csv_name
        if not neg_path.exists():
            logger.warning(f"[-] Negative CSV not found: {neg_path} — skipping")
            continue

        logger.info(f"[-] Loading NEGATIVE pairs from {neg_path} …")

        # nonclone.csv has a header; the clone-type CSVs do not
        if csv_name == "nonclone.csv":
            df_neg = pd.read_csv(neg_path)  # header: FUNCTION_ID_ONE, FUNCTION_ID_TWO
        else:
            df_neg = pd.read_csv(
                neg_path,
                header=None,
                names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
            )

        if sample_size and len(df_neg) > sample_size:
            logger.info(f"    Sampling {sample_size} / {len(df_neg)} rows from {csv_name}")
            df_neg = df_neg.sample(n=sample_size, random_state=42)

        loaded = 0
        for _, row in tqdm(df_neg.iterrows(), total=len(df_neg), desc=f"    {csv_name}"):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))
            c1 = _load_code(id1, id2code_dir)
            c2 = _load_code(id2, id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(0)
                loaded += 1
        logger.info(f"    Loaded {loaded} valid negative pairs from {csv_name}")

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
    n_estimators: int = 100,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    subsample: float = 0.8,
    colsample_bytree: float = 0.8,
    include_node_types: bool = True,
    use_gpu: bool = False,
) -> dict:
    """
    Train the ToMa + XGBoost Type-3 clone detection model.

    Returns:
        Dictionary of training / evaluation metrics.
    """
    logger.info("=" * 80)
    logger.info("Type-3 Clone Detection — Model Training (ToMa + XGBoost)")
    logger.info("=" * 80)
    logger.info(f"Dataset    : {TOMA_DATASET_DIR}")
    logger.info(f"Positives  : {CLONE_CSV_FILES}")
    logger.info(f"             (type-3=near-miss clones, type-4=moderate Type-3 clones)")
    logger.info(f"Negatives  : {NEGATIVE_CSV_FILES}")
    logger.info(f"             (nonclone.csv=non-clones)")
    logger.info(f"Model out  : models/{model_name}")
    logger.info(f"GPU        : {'Enabled' if use_gpu else 'Disabled'}")
    logger.info("=" * 80)

    # ---- Load data -------------------------------------------------------
    code1_list, code2_list, labels = load_toma_dataset(
        dataset_dir=TOMA_DATASET_DIR,
        clone_csv_files=CLONE_CSV_FILES,
        negative_csv_files=NEGATIVE_CSV_FILES,
        sample_size=sample_size,
    )

    total = len(labels)
    n_clones = sum(labels)
    n_nonclones = total - n_clones
    logger.info(f"Total pairs : {total}")
    logger.info(f"  Clones    : {n_clones}  ({n_clones / total * 100:.1f} %)")
    logger.info(f"  Non-clones: {n_nonclones}  ({n_nonclones / total * 100:.1f} %)")

    # ---- Extract features ------------------------------------------------
    logger.info("\nExtracting hybrid String + AST features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)

    logger.info(f"Feature matrix : {X.shape}")
    logger.info(f"Feature count  : {len(feature_names)}")
    logger.info(f"  String features : 6  (Jaccard, Dice, Levenshtein×2, Jaro, Jaro-Winkler)")
    logger.info(f"  AST features    : {len(feature_names) - 6}")

    # ---- Train classifier ------------------------------------------------
    classifier = SyntacticClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        colsample_bytree=colsample_bytree,
        feature_names=feature_names,
        use_gpu=use_gpu,
    )

    logger.info("\nTraining XGBoost classifier …")
    logger.info(f"  n_estimators    : {n_estimators}")
    logger.info(f"  max_depth       : {max_depth}")
    logger.info(f"  learning_rate   : {learning_rate}")
    logger.info(f"  subsample       : {subsample}")
    logger.info(f"  colsample_bytree: {colsample_bytree}")
    logger.info(f"  test_size       : {test_size}")
    logger.info(f"  cross_validation: {cross_validation}")

    metrics = classifier.train(X, y, test_size=test_size, cross_validation=cross_validation)

    # ---- Save model ------------------------------------------------------
    saved_path = classifier.save(model_name)
    logger.info(f"\nModel saved to: {saved_path}")

    # ---- Feature importance report ---------------------------------------
    logger.info("\n" + "=" * 80)
    logger.info("Top-20 Feature Importances")
    logger.info("=" * 80)
    for feat_name, importance in classifier.get_feature_importance_sorted()[:20]:
        logger.info(f"  {feat_name:<50s}: {importance:.4f}")

    logger.info("\n" + "=" * 80)
    logger.info("Training Complete!")
    logger.info("=" * 80)
    for metric, value in metrics.items():
        logger.info(f"  {metric}: {value:.4f}")

    return metrics


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Train the ToMa + XGBoost Type-3 clone detection model.\n"
            f"Dataset is hardcoded to: {TOMA_DATASET_DIR}"
        )
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        metavar="N",
        help="Sample at most N pairs per split (clones & non-clones independently). "
             "Useful for quick experiments. Default: use all pairs.",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default=DEFAULT_MODEL_NAME,
        help=f"Output model filename (default: {DEFAULT_MODEL_NAME})",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of data held out for testing (default: 0.2)",
    )
    parser.add_argument(
        "--no-cv",
        action="store_true",
        help="Disable 5-fold cross-validation (faster but less robust)",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=100,
        help="XGBoost: number of boosting rounds (default: 100)",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=6,
        help="XGBoost: maximum tree depth (default: 6)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.1,
        help="XGBoost: learning rate / eta (default: 0.1)",
    )
    parser.add_argument(
        "--subsample",
        type=float,
        default=0.8,
        help="XGBoost: subsample ratio of training instances (default: 0.8)",
    )
    parser.add_argument(
        "--colsample-bytree",
        type=float,
        default=0.8,
        help="XGBoost: subsample ratio of columns per tree (default: 0.8)",
    )
    parser.add_argument(
        "--no-node-types",
        action="store_true",
        help="Disable per-node-type AST distribution features (use only 10 core features)",
    )
    parser.add_argument(
        "--use-gpu",
        action="store_true",
        help="Use GPU acceleration for XGBoost training",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    train(
        sample_size=args.sample_size,
        model_name=args.model_name,
        test_size=args.test_size,
        cross_validation=not args.no_cv,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        subsample=args.subsample,
        colsample_bytree=args.colsample_bytree,
        include_node_types=not args.no_node_types,
        use_gpu=args.use_gpu,
    )
