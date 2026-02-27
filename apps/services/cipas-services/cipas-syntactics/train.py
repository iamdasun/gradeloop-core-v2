"""
train.py — Type-3 Clone Detection Model Training (ToMa + XGBoost).

Pipeline context:
  Phase 1: NiCAD-style normalizer → detects Type-1 and Type-2 clones
  Phase 2 (this model): ToMa + XGBoost → detects Type-3 clones
  Fallback: Non-syntactic clone (semantic / Type-4+)

Training data (from TOMA dataset, ALL SEMANTIC DATA EXCLUDED):
  Positives (label = 1):
    type-3.csv — syntactic near-miss clones (Type-3)
    type-4.csv — moderate Type-3 clones (still syntactically similar)
  Negatives (label = 0):
    nonclone.csv — confirmed non-clone pairs

Optimization Strategy:
  Objective  : Maximize Type-3 Recall (target: 40%+) at Precision ≥ 90%
  scale_pos_weight = 5.0   — penalizes False Negatives more aggressively
  sample_weight: rows from type-3.csv/type-4.csv get weight 2.0 (vs 1.0 for nonclone)
  colsample_bytree = 0.6   — forces trees to use AST features by excluding
                              String features (Levenshtein) in ~40% of branches
  Threshold sweep: 0.10 → 0.50 in 0.05 steps — selects threshold that
                   maximizes recall while keeping overall precision ≥ 90%.

New Features:
  feat_structural_density_1/2 : AST nodes per LOC for each snippet.
  feat_structural_density_diff: Absolute difference in structural density.
  These capture code complexity invariant to text similarity.

Usage:
    poetry run python train.py
    poetry run python train.py --sample-size 5000
    poetry run python train.py --scale-pos-weight 3.0 --no-node-types
"""

import argparse
import logging
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
# Dataset paths & file lists (NO semantic data)
# ---------------------------------------------------------------------------

TOMA_DATASET_DIR = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/toma-dataset"
)

# Positive class — syntactic near-misses only
CLONE_CSV_FILES = ["type-3.csv", "type-4.csv"]

# Negative class — genuine non-clones only
NEGATIVE_CSV_FILES = ["nonclone.csv"]

# Default output model
DEFAULT_MODEL_NAME = "type3_xgb.pkl"

# Per-source sample weights applied during XGBoost .fit()
# Near-miss sources are weighted higher to compensate for their difficulty.
SOURCE_WEIGHTS: dict[str, float] = {
    "type-3.csv": 2.0,   # Hard near-miss clones → emphasize heavily
    "type-4.csv": 2.0,   # Moderate Type-3 → still syntactically challenging
    "nonclone.csv": 1.0, # Negative class stays at baseline
}


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

    Returns:
        (code1_list, code2_list, labels, sources)
        sources — CSV filename for each pair (used to assign sample_weights).
    """
    id2code_dir = dataset_dir / "id2sourcecode"
    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    code1_list: list[str] = []
    code2_list: list[str] = []
    labels: list[int] = []
    sources: list[str] = []

    # ── Positive pairs ──────────────────────────────────────────────────────
    for csv_name in clone_csv_files:
        csv_path = dataset_dir / csv_name
        if not csv_path.exists():
            logger.warning(f"[+] Clone CSV not found: {csv_path} — skipping")
            continue

        logger.info(f"[+] Loading POSITIVE pairs from {csv_name} …")
        df = pd.read_csv(csv_path, header=None,
                         names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"])
        if sample_size and len(df) > sample_size:
            logger.info(f"    Sampling {sample_size:,} / {len(df):,} rows")
            df = df.sample(n=sample_size, random_state=42)

        loaded = 0
        for _, row in tqdm(df.iterrows(), total=len(df), desc=f"    {csv_name}"):
            c1 = _load_code(str(int(row["FUNCTION_ID_ONE"])), id2code_dir)
            c2 = _load_code(str(int(row["FUNCTION_ID_TWO"])), id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(1)
                sources.append(csv_name)
                loaded += 1
        logger.info(f"    Loaded {loaded:,} valid positive pairs from {csv_name}")

    # ── Negative pairs ──────────────────────────────────────────────────────
    for csv_name in negative_csv_files:
        neg_path = dataset_dir / csv_name
        if not neg_path.exists():
            logger.warning(f"[-] Negative CSV not found: {neg_path} — skipping")
            continue

        logger.info(f"[-] Loading NEGATIVE pairs from {csv_name} …")
        if csv_name == "nonclone.csv":
            df_neg = pd.read_csv(neg_path)
        else:
            df_neg = pd.read_csv(neg_path, header=None,
                                 names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"])

        if sample_size and len(df_neg) > sample_size:
            logger.info(f"    Sampling {sample_size:,} / {len(df_neg):,} rows from {csv_name}")
            df_neg = df_neg.sample(n=sample_size, random_state=42)

        loaded = 0
        for _, row in tqdm(df_neg.iterrows(), total=len(df_neg), desc=f"    {csv_name}"):
            c1 = _load_code(str(int(row["FUNCTION_ID_ONE"])), id2code_dir)
            c2 = _load_code(str(int(row["FUNCTION_ID_TWO"])), id2code_dir)
            if c1 and c2:
                code1_list.append(c1)
                code2_list.append(c2)
                labels.append(0)
                sources.append(csv_name)
                loaded += 1
        logger.info(f"    Loaded {loaded:,} valid negative pairs from {csv_name}")

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
    Extract hybrid String + AST + Structural Density features.

    String features  (6)  : Jaccard, Dice, Levenshtein dist/ratio, Jaro, Jaro-Winkler
    AST features    (7+N) : Structural Jaccard, AST depth diff, node count diff/ratio,
                            structural_density_1/2/diff, per-node-type dists
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
# Threshold sweep — the core calibration step
# ---------------------------------------------------------------------------

def threshold_sweep(
    y_true: np.ndarray,
    y_proba: np.ndarray,
    start: float = 0.10,
    stop: float = 0.50,
    step: float = 0.05,
    target_precision: float = 0.90,
) -> list[dict]:
    """
    Sweep classification thresholds from `start` to `stop` in `step` increments.

    For each threshold, reports precision, recall, F1, and whether the threshold
    satisfies the precision floor.

    Returns:
        List of dicts with keys: threshold, precision, recall, f1, meets_floor
    """
    results = []
    thresholds = np.arange(start, stop + step / 2, step)

    for thresh in thresholds:
        y_pred = (y_proba >= thresh).astype(int)
        prec = precision_score(y_true, y_pred, zero_division=0)
        rec  = recall_score(y_true, y_pred, zero_division=0)
        f1   = f1_score(y_true, y_pred, zero_division=0)
        results.append({
            "threshold": round(float(thresh), 4),
            "precision": round(prec, 4),
            "recall":    round(rec,  4),
            "f1":        round(f1,   4),
            "meets_floor": prec >= target_precision,
        })

    return results


def select_best_threshold(sweep_results: list[dict]) -> dict:
    """
    From sweep results, select the threshold that:
      1. Satisfies the precision floor (>= target_precision), AND
      2. Maximizes recall.

    Falls back to highest-precision entry if no threshold meets the floor.
    """
    floor_candidates = [r for r in sweep_results if r["meets_floor"]]

    if not floor_candidates:
        logger.warning("No threshold achieved the precision floor — returning highest precision.")
        return max(sweep_results, key=lambda r: r["precision"])

    return max(floor_candidates, key=lambda r: r["recall"])


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(
    sample_size: int | None = None,
    model_name: str = DEFAULT_MODEL_NAME,
    test_size: float = 0.2,
    n_estimators: int = 200,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    subsample: float = 0.8,
    colsample_bytree: float = 0.6,    # reduced from 0.8 → forces AST features into trees
    scale_pos_weight: float = 5.0,    # aggressive FN penalization
    include_node_types: bool = True,
    use_gpu: bool = False,
) -> dict:
    """
    Train the Type-3 recall-optimized XGBoost clone detection model.

    Key choices:
      * colsample_bytree=0.6  — each tree only sees 60% of features at split time;
        since String features dominate, this forces the model to also rely on
        feat_ast_jaccard, feat_node_block_diff, feat_structural_density_diff, etc.
      * scale_pos_weight=5.0  — clone examples count 5× more than non-clone
        examples in the gradient computation, pushing the model toward recall.
      * sample_weight per-row — rows from type-3.csv / type-4.csv get 2× weight,
        further emphasizing correct prediction of hard near-miss pairs.
      * Threshold sweep 0.10→0.50 — post-training calibration to find the
        operating point that maximises recall with precision ≥ 90%.

    Returns:
        dict of metrics at the selected operating threshold.
    """
    logger.info("=" * 80)
    logger.info("Type-3 Clone Detection — RECALL-OPTIMIZED Training (v2)")
    logger.info("=" * 80)
    logger.info(f"Positives        : {CLONE_CSV_FILES}")
    logger.info(f"Negatives        : {NEGATIVE_CSV_FILES}")
    logger.info(f"scale_pos_weight : {scale_pos_weight}")
    logger.info(f"colsample_bytree : {colsample_bytree}  (reduced to boost AST feature usage)")
    logger.info(f"sample_weights   : type-3/4 → 2.0×, nonclone → 1.0×")
    logger.info(f"n_estimators     : {n_estimators}")
    logger.info(f"Threshold sweep  : 0.10 → 0.50 @ 0.05 steps; precision floor = 90%")
    logger.info("=" * 80)

    # ---- Load data -----------------------------------------------------------
    code1_list, code2_list, labels, sources = load_toma_dataset(
        dataset_dir=TOMA_DATASET_DIR,
        clone_csv_files=CLONE_CSV_FILES,
        negative_csv_files=NEGATIVE_CSV_FILES,
        sample_size=sample_size,
    )

    total = len(labels)
    n_pos = sum(labels)
    n_neg = total - n_pos
    logger.info(f"\nDataset: {total:,} pairs  |  Positives: {n_pos:,}  |  Negatives: {n_neg:,}")

    # ---- Feature extraction -------------------------------------------------
    logger.info("\nExtracting hybrid String + AST + Structural Density features …")
    X, feature_names = extract_features(
        code1_list, code2_list, language="java", include_node_types=include_node_types
    )
    y = np.array(labels)
    s = np.array(sources)

    logger.info(f"Feature matrix: {X.shape}  ({len(feature_names)} features)")
    logger.info(f"  String features      : 6")
    logger.info(f"  AST core features    : 7  (incl. structural_density ×3)")
    logger.info(f"  Node-type dists      : {len(feature_names) - 13}")

    # ---- Train/test split ---------------------------------------------------
    X_train, X_test, y_train, y_test, s_train, s_test = train_test_split(
        X, y, s, test_size=test_size, random_state=42, stratify=y
    )

    # ---- Per-row sample weights ---------------------------------------------
    # type-3 / type-4 rows → 2.0; nonclone → 1.0
    train_weights = np.array([SOURCE_WEIGHTS.get(src, 1.0) for src in s_train])
    logger.info(f"\nSample-weight distribution (train split):")
    for src in np.unique(s_train):
        w = SOURCE_WEIGHTS.get(src, 1.0)
        n = np.sum(s_train == src)
        logger.info(f"  {src:<16s} × {w:.1f}  ({n:,} rows)")

    # ---- Classifier ---------------------------------------------------------
    classifier = SyntacticClassifier(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        colsample_bytree=colsample_bytree,
        feature_names=feature_names,
        use_gpu=use_gpu,
        scale_pos_weight=scale_pos_weight,
    )

    logger.info(f"\nTraining XGBoost …")
    classifier.model.fit(X_train, y_train, sample_weight=train_weights)
    classifier.is_trained = True

    # ---- Threshold sweep ----------------------------------------------------
    logger.info("\nRunning threshold sweep (0.10 → 0.50) …")
    y_proba_test = classifier.predict_proba(X_test)[:, 1]
    sweep = threshold_sweep(y_test, y_proba_test, target_precision=0.90)

    # Print the sweep table
    logger.info(f"\n  {'Thresh':>7} | {'Precision':>9} | {'Recall':>7} | {'F1':>7} | Floor?")
    logger.info(f"  {'-'*7}-+-{'-'*9}-+-{'-'*7}-+-{'-'*7}-+-{'-'*6}")
    for row in sweep:
        flag = "✓" if row["meets_floor"] else "✗"
        logger.info(
            f"  {row['threshold']:>7.2f} | {row['precision']:>9.4f} | "
            f"{row['recall']:>7.4f} | {row['f1']:>7.4f} | {flag}"
        )

    best = select_best_threshold(sweep)
    logger.info(f"\n  ► Selected threshold: {best['threshold']:.2f}")
    logger.info(f"    Precision : {best['precision']:.4f}")
    logger.info(f"    Recall    : {best['recall']:.4f}")
    logger.info(f"    F1        : {best['f1']:.4f}")

    # ---- Per-source recall at selected threshold ----------------------------
    y_pred_best = (y_proba_test >= best["threshold"]).astype(int)
    logger.info("\nPer-Source Metrics at Selected Threshold:")
    logger.info(f"  {'Source':<18} | {'Metric':<7} | Value")
    logger.info(f"  {'-'*18}-+-{'-'*7}-+-{'-'*6}")
    for src in np.unique(s_test):
        mask = s_test == src
        yt = y_test[mask]
        yp = y_pred_best[mask]
        if np.any(yt == 1):
            tp = np.sum((yt == 1) & (yp == 1))
            fn = np.sum((yt == 1) & (yp == 0))
            rec_src = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            logger.info(f"  {src:<18s} | Recall  | {rec_src:.4f}  (TP={tp}, FN={fn})")
        else:
            fp = np.sum((yt == 0) & (yp == 1))
            fpr = fp / len(yt) if len(yt) > 0 else 0.0
            logger.info(f"  {src:<18s} | FPR     | {fpr:.4f}  (FP={fp}, n={len(yt)})")

    # ---- Feature importance -------------------------------------------------
    logger.info("\nTop-20 Feature Importances:")
    logger.info(f"  {'Feature':<50} | Importance")
    logger.info(f"  {'-'*50}-+-{'-'*10}")
    for feat_name, imp in classifier.get_feature_importance_sorted()[:20]:
        logger.info(f"  {feat_name:<50s} | {imp:.4f}")

    # ---- Save ---------------------------------------------------------------
    # Persist calibrated threshold inside the pkl so evaluate.py can read it
    # without the user needing to pass --threshold every time.
    classifier.calibrated_threshold = best["threshold"]
    saved_path = classifier.save(model_name)
    logger.info(f"\nModel saved → {saved_path}")
    logger.info(f"Recommended inference threshold: {best['threshold']:.2f}")
    logger.info("(Pass this via --threshold to evaluate.py or the inference pipeline)")

    return {
        "threshold": best["threshold"],
        "precision": best["precision"],
        "recall":    best["recall"],
        "f1":        best["f1"],
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train recall-optimized ToMa + XGBoost (Type-3 clone detection)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--sample-size",       type=int,   default=None,
                        help="Max rows per CSV file (None = use all)")
    parser.add_argument("--model-name",        type=str,   default=DEFAULT_MODEL_NAME)
    parser.add_argument("--n-estimators",      type=int,   default=200)
    parser.add_argument("--max-depth",         type=int,   default=6)
    parser.add_argument("--learning-rate",     type=float, default=0.1)
    parser.add_argument("--subsample",         type=float, default=0.8)
    parser.add_argument("--colsample-bytree",  type=float, default=0.6)
    parser.add_argument("--scale-pos-weight",  type=float, default=5.0,
                        help="XGBoost scale_pos_weight (5.0 = strong FN penalization)")
    parser.add_argument("--no-node-types",     action="store_true",
                        help="Disable per-node-type AST distribution features")
    parser.add_argument("--use-gpu",           action="store_true")
    parser.add_argument("--verbose",           action="store_true")

    args = parser.parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    train(
        sample_size=args.sample_size,
        model_name=args.model_name,
        n_estimators=args.n_estimators,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        subsample=args.subsample,
        colsample_bytree=args.colsample_bytree,
        scale_pos_weight=args.scale_pos_weight,
        include_node_types=not args.no_node_types,
        use_gpu=args.use_gpu,
    )
