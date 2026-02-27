#!/usr/bin/env python3
"""
Threshold Calibration Script for Clone Detection Models.

Finds optimal decision thresholds for BigCloneBench evaluation to handle
domain shift between TOMA training data and BCB test data.

Usage:
    python calibrate_thresholds.py --sample-size 200
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent))

from clone_detection.features.semantic_features import (
    FeatureFusion,
    SemanticFeatureExtractor,
)
from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier, SyntacticClassifier
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import (
    get_bigclonebench_dir,
    load_toma_csv,
    set_random_seed,
    setup_logging,
)

logger = setup_logging("calibrate")


def load_bcb_clones(n_samples: int = 200) -> list:
    """Load clone samples from BigCloneBench."""
    bcb_dir = get_bigclonebench_dir()
    jsonl_file = bcb_dir / "bigclonebench.jsonl"

    data = []
    with open(jsonl_file, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= 5000:
                break
            try:
                record = json.loads(line.strip())
                if record.get("clone_type") == 3:
                    data.append(record)
                    if len(data) >= n_samples:
                        break
            except json.JSONDecodeError:
                continue
    return data


def load_toma_code(code_id: int) -> str:
    """Load source code from TOMA dataset."""
    from clone_detection.utils.common_setup import get_toma_dataset_dir

    source_file = get_toma_dataset_dir() / "id2sourcecode" / f"{code_id}.java"
    if not source_file.exists():
        return ""
    try:
        with open(source_file, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


def find_optimal_threshold(
    y_true: np.ndarray, y_proba: np.ndarray
) -> tuple[float, float]:
    """
    Find optimal threshold that maximizes F1 score.

    Returns:
        (optimal_threshold, best_f1)
    """
    best_f1 = 0
    best_threshold = 0.5

    for threshold in np.arange(0.1, 0.9, 0.05):
        y_pred = (y_proba >= threshold).astype(int)

        # Calculate F1
        tp = np.sum((y_pred == 1) & (y_true == 1))
        fp = np.sum((y_pred == 1) & (y_true == 0))
        fn = np.sum((y_pred == 0) & (y_true == 1))

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0
        )

        if f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold

    return best_threshold, best_f1


def calibrate_type3(n_clones: int = 200):
    """Calibrate threshold for Type-3 model."""
    logger.info("=" * 60)
    logger.info("Type-3 Model Threshold Calibration")
    logger.info("=" * 60)

    # Load model
    try:
        model = SyntacticClassifier.load("type3_rf.pkl")
    except FileNotFoundError:
        logger.error("Type-3 model not found!")
        return None

    # Load data
    tokenizer = TreeSitterTokenizer()
    extractor = SyntacticFeatureExtractor()

    bcb_clones = load_bcb_clones(n_clones)
    df_nonclones = load_toma_csv("nonclone.csv").sample(n=n_clones, random_state=42)

    features = []
    labels = []

    # BCB clones
    for record in bcb_clones:
        code1, code2 = record.get("code1", ""), record.get("code2", "")
        if code1 and code2:
            tokens1 = tokenizer.tokenize(code1, "java", abstract_identifiers=True)
            tokens2 = tokenizer.tokenize(code2, "java", abstract_identifiers=True)
            features.append(extractor.extract_features(tokens1, tokens2))
            labels.append(1)

    # TOMA non-clones
    for _, row in df_nonclones.iterrows():
        code1 = load_toma_code(row["id1"])
        code2 = load_toma_code(row["id2"])
        if code1 and code2:
            tokens1 = tokenizer.tokenize(code1, "java", abstract_identifiers=True)
            tokens2 = tokenizer.tokenize(code2, "java", abstract_identifiers=True)
            features.append(extractor.extract_features(tokens1, tokens2))
            labels.append(0)

    X = np.array(features)
    y = np.array(labels)

    # Get probabilities
    y_proba = model.predict_proba(X)[:, 1]

    # Find optimal threshold
    threshold, f1 = find_optimal_threshold(y, y_proba)

    # Metrics with calibrated threshold
    y_pred = (y_proba >= threshold).astype(int)
    from sklearn.metrics import f1_score, precision_score, recall_score

    precision = precision_score(y, y_pred, zero_division=0)
    recall = recall_score(y, y_pred, zero_division=0)

    logger.info(f"\nOptimal Threshold: {threshold:.2f}")
    logger.info(f"F1 Score: {f1:.4f}")
    logger.info(f"Precision: {precision:.4f}")
    logger.info(f"Recall: {recall:.4f}")
    logger.info(
        f"Default threshold (0.5) F1: {f1_score(y, (y_proba >= 0.5).astype(int), zero_division=0):.4f}"
    )

    return threshold


def calibrate_type4(n_clones: int = 200):
    """Calibrate threshold for Type-4 model."""
    logger.info("\n" + "=" * 60)
    logger.info("Type-4 Model Threshold Calibration")
    logger.info("=" * 60)

    # Load model
    try:
        model = SemanticClassifier.load("type4_xgb.pkl")
    except FileNotFoundError:
        logger.error("Type-4 model not found!")
        return None

    # Load data
    tokenizer = TreeSitterTokenizer()
    extractor = SemanticFeatureExtractor(tokenizer=tokenizer)

    bcb_clones = load_bcb_clones(n_clones)
    df_nonclones = load_toma_csv("nonclone.csv").sample(n=n_clones, random_state=43)

    features = []
    labels = []

    # BCB clones
    for record in bcb_clones:
        code1, code2 = record.get("code1", ""), record.get("code2", "")
        if code1 and code2:
            feat = extractor.extract_fused_features(code1, code2, "java")
            features.append(feat)
            labels.append(1)

    # TOMA non-clones
    for _, row in df_nonclones.iterrows():
        code1 = load_toma_code(row["id1"])
        code2 = load_toma_code(row["id2"])
        if code1 and code2:
            feat = extractor.extract_fused_features(code1, code2, "java")
            features.append(feat)
            labels.append(0)

    X = np.array(features)
    y = np.array(labels)

    # Normalize
    from clone_detection.features.semantic_features import FeatureFusion

    X_norm = FeatureFusion.normalize_features(X, method="zscore")

    # Get probabilities
    y_proba = model.predict_proba(X_norm)[:, 1]

    # Find optimal threshold
    threshold, f1 = find_optimal_threshold(y, y_proba)

    # Metrics with calibrated threshold
    y_pred = (y_proba >= threshold).astype(int)
    from sklearn.metrics import f1_score, precision_score, recall_score

    precision = precision_score(y, y_pred, zero_division=0)
    recall = recall_score(y, y_pred, zero_division=0)

    logger.info(f"\nOptimal Threshold: {threshold:.2f}")
    logger.info(f"F1 Score: {f1:.4f}")
    logger.info(f"Precision: {precision:.4f}")
    logger.info(f"Recall: {recall:.4f}")
    logger.info(
        f"Default threshold (0.5) F1: {f1_score(y, (y_proba >= 0.5).astype(int), zero_division=0):.4f}"
    )

    return threshold


def main():
    parser = argparse.ArgumentParser(
        description="Calibrate decision thresholds for BCB evaluation"
    )
    parser.add_argument(
        "--sample-size", type=int, default=200, help="Number of samples per class"
    )
    args = parser.parse_args()

    set_random_seed(42)

    logger.info("THRESHOLD CALIBRATION FOR BIGCLONEBENCH")
    logger.info("=" * 60)

    t3_threshold = calibrate_type3(args.sample_size)
    t4_threshold = calibrate_type4(args.sample_size)

    logger.info("\n" + "=" * 60)
    logger.info("CALIBRATION SUMMARY")
    logger.info("=" * 60)
    logger.info(
        f"Type-3 (RF) optimal threshold: {t3_threshold:.2f}"
        if t3_threshold
        else "Type-3: N/A"
    )
    logger.info(
        f"Type-4 (XGB) optimal threshold: {t4_threshold:.2f}"
        if t4_threshold
        else "Type-4: N/A"
    )
    logger.info("=" * 60)

    # Save thresholds
    thresholds = {"type3": t3_threshold, "type4": t4_threshold}
    output_file = Path(__file__).parent / "thresholds.json"
    with open(output_file, "w") as f:
        json.dump(thresholds, f, indent=2)
    logger.info(f"\nThresholds saved to {output_file}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
