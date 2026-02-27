"""
Training Script for Semantic Clone Detection Model (Type-4).

This script trains an XGBoost classifier on labeled code pair datasets.
Supports TOMA dataset format (CSV with function IDs) and JSON format (with inline code).

Usage:
    # Train with TOMA dataset
    poetry run python train_model.py \
        --dataset /path/to/toma-dataset \
        --dataset-format toma \
        --language java \
        --model-name type4_xgb.pkl

    # Train with JSON dataset
    poetry run python train_model.py \
        --dataset /path/to/dataset.json \
        --dataset-format json \
        --language java \
        --model-name type4_xgb.pkl
"""

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

from clone_detection.features.semantic_features import SemanticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)


def load_toma_dataset(
    dataset_dir: str,
    sample_size: int | None = None,
    clone_types: list[int] | None = None,
) -> tuple[list[str], list[str], list[int]]:
    """
    Load TOMA dataset from directory structure.

    TOMA dataset format:
    - clone.csv: FUNCTION_ID_ONE, FUNCTION_ID_TWO, CLONE_TYPE, ...
    - nonclone.csv: FUNCTION_ID_ONE, FUNCTION_ID_TWO
    - id2sourcecode/: Directory with individual .java files named by function ID

    Args:
        dataset_dir: Path to TOMA dataset directory
        sample_size: Optional sample size for each class (for faster training)
        clone_types: Optional list of clone types to include (1-5). None = all.
                     For Type-4 detection, typically use [4] or [3, 4, 5].

    Returns:
        Tuple of (code1_list, code2_list, labels)
    """
    dataset_path = Path(dataset_dir)
    id2code_dir = dataset_path / "id2sourcecode"

    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    def load_code_from_id(func_id: str) -> str | None:
        """Load source code from function ID."""
        code_file = id2code_dir / f"{func_id}.java"
        if code_file.exists():
            try:
                with open(code_file, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()
            except Exception:
                return None
        return None

    code1_list = []
    code2_list = []
    labels = []

    # Load clone pairs
    clone_file = dataset_path / "clone.csv"
    if clone_file.exists():
        logger.info(f"Loading clones from {clone_file}...")
        # clone.csv has no header, so we specify column names
        df_clones = pd.read_csv(
            clone_file,
            header=None,
            names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
        )

        # Filter by clone types if specified
        if clone_types is not None:
            df_clones = df_clones[df_clones["CLONE_TYPE"].isin(clone_types)]

        total_clones = len(df_clones)
        if sample_size and total_clones > sample_size:
            logger.info(f"Sampling {sample_size} clone pairs from {total_clones}")
            df_clones = df_clones.sample(n=sample_size, random_state=42)
            total_clones = sample_size

        logger.info(f"Processing {total_clones} clone pairs...")
        processed = 0
        for _, row in tqdm(
            df_clones.iterrows(), total=total_clones, desc="Loading clone pairs"
        ):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))

            code1 = load_code_from_id(id1)
            code2 = load_code_from_id(id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(1)
                processed += 1

        logger.info(f"Loaded {processed} clone pairs with valid code")

    # Load non-clone pairs
    nonclone_file = dataset_path / "nonclone.csv"
    if nonclone_file.exists():
        logger.info(f"Loading non-clones from {nonclone_file}...")
        df_nonclones = pd.read_csv(nonclone_file)

        total_nonclones = len(df_nonclones)
        if sample_size and total_nonclones > sample_size:
            logger.info(
                f"Sampling {sample_size} non-clone pairs from {total_nonclones}"
            )
            df_nonclones = df_nonclones.sample(n=sample_size, random_state=42)
            total_nonclones = sample_size

        logger.info(f"Processing {total_nonclones} non-clone pairs...")
        processed = 0
        for _, row in tqdm(
            df_nonclones.iterrows(),
            total=total_nonclones,
            desc="Loading non-clone pairs",
        ):
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))

            code1 = load_code_from_id(id1)
            code2 = load_code_from_id(id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(0)
                processed += 1

        logger.info(f"Loaded {processed} non-clone pairs with valid code")

    return code1_list, code2_list, labels


def load_json_dataset(dataset_path: str) -> tuple[list[str], list[str], list[int]]:
    """
    Load a JSON dataset of code pairs.

    Expected format: List of objects with code1, code2, label fields
    label: 1 (clone) or 0 (not clone)

    Args:
        dataset_path: Path to dataset file

    Returns:
        Tuple of (code1_list, code2_list, labels)
    """
    with open(dataset_path, "r") as f:
        data = json.load(f)

    code1_list = [item["code1"] for item in data]
    code2_list = [item["code2"] for item in data]
    labels = [item["label"] for item in data]

    return code1_list, code2_list, labels


def extract_features_for_dataset(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
) -> np.ndarray:
    """
    Extract fused semantic features for all code pairs.

    Args:
        code1_list: List of first code snippets
        code2_list: List of second code snippets
        language: Programming language

    Returns:
        Feature matrix of shape (n_pairs, 204)
    """
    extractor = SemanticFeatureExtractor()
    features = []

    for code1, code2 in tqdm(
        zip(code1_list, code2_list), total=len(code1_list), desc="Extracting features"
    ):
        try:
            fused = extractor.extract_fused_features(code1, code2, language)
            features.append(fused)
        except Exception as e:
            logger.warning(f"Failed to extract features: {e}")
            features.append(np.zeros(204))

    return np.array(features)


def train_semantic_model(
    dataset_path: str,
    dataset_format: str = "toma",
    language: str = "java",
    model_name: str = "type4_xgb.pkl",
    test_size: float = 0.2,
    cross_validation: bool = True,
    sample_size: int | None = None,
    clone_types: list[int] | None = None,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    n_estimators: int = 100,
) -> dict:
    """
    Train the semantic clone detection model.

    Args:
        dataset_path: Path to labeled dataset (directory for TOMA, file for JSON)
        dataset_format: Dataset format ('toma' or 'json')
        language: Programming language of code snippets
        model_name: Name for saved model
        test_size: Fraction of data for testing
        cross_validation: Whether to use cross-validation
        sample_size: Optional sample size per class (for TOMA dataset)
        clone_types: Optional list of clone types to include (for TOMA dataset)
        max_depth: Maximum tree depth for XGBoost
        learning_rate: Learning rate for XGBoost
        n_estimators: Number of boosting rounds

    Returns:
        Training metrics dictionary
    """
    logger.info(f"Loading {dataset_format} dataset from {dataset_path}...")

    if dataset_format == "toma":
        code1_list, code2_list, labels = load_toma_dataset(
            dataset_path, sample_size=sample_size, clone_types=clone_types
        )
    elif dataset_format == "json":
        code1_list, code2_list, labels = load_json_dataset(dataset_path)
    else:
        raise ValueError(f"Unknown dataset format: {dataset_format}")

    logger.info(f"Loaded {len(code1_list)} code pairs")
    logger.info(
        f"Class distribution: {sum(labels)} clones, {len(labels) - sum(labels)} non-clones"
    )

    logger.info("Extracting semantic features...")
    X = extract_features_for_dataset(code1_list, code2_list, language)
    y = np.array(labels)

    logger.info(f"Feature matrix shape: {X.shape}")

    # Create and train classifier
    classifier = SemanticClassifier(
        max_depth=max_depth,
        learning_rate=learning_rate,
        n_estimators=n_estimators,
    )

    logger.info("Training XGBoost classifier...")
    metrics = classifier.train(
        X, y, test_size=test_size, cross_validation=cross_validation
    )

    # Save model
    model_path = classifier.save(model_name)
    logger.info(f"Model saved to {model_path}")

    return metrics


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train semantic clone detection model")
    parser.add_argument(
        "--dataset",
        type=str,
        required=True,
        help="Path to labeled dataset (directory for TOMA, JSON file for JSON format)",
    )
    parser.add_argument(
        "--dataset-format",
        type=str,
        default="toma",
        choices=["toma", "json"],
        help="Dataset format (toma or json)",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "c", "python"],
        help="Programming language",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default="type4_xgb.pkl",
        help="Output model filename",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Test set size ratio",
    )
    parser.add_argument(
        "--no-cv",
        action="store_true",
        help="Disable cross-validation",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Sample size per class (for TOMA dataset, optional)",
    )
    parser.add_argument(
        "--clone-types",
        type=int,
        nargs="+",
        default=None,
        help="Clone types to include (1-5, for TOMA dataset, optional). "
        "For Type-4 detection, use [4] or [3,4,5]",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=6,
        help="Maximum tree depth for XGBoost",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.1,
        help="Learning rate for XGBoost",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=100,
        help="Number of boosting rounds for XGBoost",
    )

    args = parser.parse_args()

    metrics = train_semantic_model(
        dataset_path=args.dataset,
        dataset_format=args.dataset_format,
        language=args.language,
        model_name=args.model_name,
        test_size=args.test_size,
        cross_validation=not args.no_cv,
        sample_size=args.sample_size,
        clone_types=args.clone_types,
        max_depth=args.max_depth,
        learning_rate=args.learning_rate,
        n_estimators=args.n_estimators,
    )

    logger.info("\n" + "=" * 60)
    logger.info("Training Complete!")
    logger.info("=" * 60)
    for metric, value in metrics.items():
        logger.info(f"{metric}: {value:.4f}")
