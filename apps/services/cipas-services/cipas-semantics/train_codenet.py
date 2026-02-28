"""
Training Script for Type-IV Code Clone Detector using Project CodeNet Dataset.

This script trains an XGBoost classifier based on the Sheneamer et al. (2021) framework
using the Project CodeNet dataset.

CodeNet Dataset Structure:
- datasets/project-codenet/data/pXXXXX/{language}/{submission_id}.{ext}
- datasets/project-codenet/metadata/pXXXXX.csv

Usage:
    # Train with CodeNet dataset (Java)
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --language java \
        --model-name type4_xgb_codenet.pkl \
        --sample-size 10000

    # Train with multiple languages
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --languages java python csharp \
        --model-name type4_xgb_multilang.pkl \
        --sample-size 20000

    # Train using problem-based sampling (solutions to same problem = clones)
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --language java \
        --model-name type4_xgb_codenet.pkl \
        --sampling-strategy problem \
        --sample-size 15000
"""

import argparse
import json
import logging
import os
import random
from collections import defaultdict
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from tqdm import tqdm

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import get_model_path, setup_logging

logger = setup_logging(__name__)


class CodeNetDataLoader:
    """
    Load and prepare training data from Project CodeNet dataset.

    CodeNet provides multiple solutions to the same programming problem,
    which can be used as positive (clone) pairs. Different problems
    provide negative (non-clone) pairs.
    """

    def __init__(self, dataset_path: str, language: str = "Java"):
        """
        Initialize CodeNet data loader.

        Args:
            dataset_path: Path to Project CodeNet root directory
            language: Programming language to load (as named in CodeNet)
        """
        self.dataset_path = Path(dataset_path)
        self.language = language
        self.data_path = self.dataset_path / "data"
        self.metadata_path = self.dataset_path / "metadata"

        # Language mapping from CodeNet names to our parser names
        self.language_map = {
            "java": "java",
            "Java": "java",
            "Python": "python",
            "Python3": "python",
            "C++": "c",  # Use C parser for C++ as fallback
            "C": "c",
            "C#": "csharp",
            "Ruby": "python",  # Fallback
            "JavaScript": "python",  # Fallback
        }

    def load_problem_submissions(
        self, problem_id: str, status_filter: str = "Accepted"
    ) -> list[str]:
        """
        Load all submissions for a problem that meet status criteria.

        Args:
            problem_id: Problem ID (e.g., 'p00001')
            status_filter: Filter by submission status (default: 'Accepted')

        Returns:
            List of source code strings
        """
        submissions = []

        # Read metadata for this problem
        metadata_file = self.metadata_path / f"{problem_id}.csv"
        if not metadata_file.exists():
            return submissions

        try:
            df = pd.read_csv(metadata_file)

            # Filter by language and status
            mask = df["language"] == self.language
            if status_filter:
                mask &= df["status"] == status_filter

            filtered_df = df[mask]

            # Load source code for each submission
            for _, row in filtered_df.iterrows():
                submission_id = row["submission_id"]
                code_file = (
                    self.data_path / problem_id / self.language / f"{submission_id}"
                )

                # Try with common extensions
                for ext in ["", ".java", ".py", ".cpp", ".c", ".cs"]:
                    if code_file.with_suffix(ext).exists():
                        try:
                            code = code_file.with_suffix(ext).read_text(
                                encoding="utf-8", errors="ignore"
                            )
                            if len(code.strip()) > 50:  # Minimum code length
                                submissions.append(code)
                        except Exception:
                            pass
                        break

        except Exception as e:
            logger.warning(f"Error loading problem {problem_id}: {e}")

        return submissions

    def get_problem_list(self, min_submissions: int = 10) -> list[str]:
        """
        Get list of problems with sufficient submissions.

        Args:
            min_submissions: Minimum number of submissions required

        Returns:
            List of problem IDs
        """
        problems = []

        problem_list_file = self.metadata_path / "problem_list.csv"
        if not problem_list_file.exists():
            # Scan data directory instead
            if self.data_path.exists():
                problems = [
                    d.name
                    for d in self.data_path.iterdir()
                    if d.is_dir() and d.name.startswith("p")
                ]
            return problems

        try:
            df = pd.read_csv(problem_list_file)

            for problem_id in df["id"]:
                metadata_file = self.metadata_path / f"{problem_id}.csv"
                if metadata_file.exists():
                    try:
                        problem_df = pd.read_csv(metadata_file)
                        count = len(problem_df[problem_df["language"] == self.language])
                        if count >= min_submissions:
                            problems.append(problem_id)
                    except Exception:
                        pass

        except Exception as e:
            logger.warning(f"Error reading problem list: {e}")
            # Fallback: scan data directory
            if self.data_path.exists():
                problems = [
                    d.name
                    for d in self.data_path.iterdir()
                    if d.is_dir() and d.name.startswith("p")
                ]

        return problems

    def create_training_pairs(
        self,
        sample_size: int = 10000,
        clone_ratio: float = 0.5,
        problems: Optional[list[str]] = None,
    ) -> tuple[list[str], list[str], list[int]]:
        """
        Create training pairs from CodeNet dataset.

        Positive pairs: Solutions to the same problem (semantic clones)
        Negative pairs: Solutions to different problems (non-clones)

        Args:
            sample_size: Total number of pairs to create
            clone_ratio: Ratio of positive (clone) pairs
            problems: Optional list of problems to use

        Returns:
            Tuple of (code1_list, code2_list, labels)
        """
        if problems is None:
            logger.info("Loading problem list...")
            problems = self.get_problem_list(min_submissions=5)
            logger.info(f"Found {len(problems)} problems with submissions")

        # Limit problems for faster loading
        if len(problems) > 100:
            problems = random.sample(problems, 100)

        # Load submissions per problem
        problem_submissions = {}
        logger.info("Loading submissions...")

        for problem_id in tqdm(problems, desc="Loading problems"):
            submissions = self.load_problem_submissions(problem_id)
            if len(submissions) >= 2:
                problem_submissions[problem_id] = submissions

        logger.info(f"Loaded {len(problem_submissions)} problems with submissions")

        # Create pairs
        code1_list = []
        code2_list = []
        labels = []

        n_clone_pairs = int(sample_size * clone_ratio)
        n_nonclone_pairs = sample_size - n_clone_pairs

        # Create clone pairs (same problem)
        logger.info(f"Creating {n_clone_pairs} clone pairs...")
        clone_count = 0
        problem_ids = list(problem_submissions.keys())

        while clone_count < n_clone_pairs and problem_ids:
            problem_id = random.choice(problem_ids)
            submissions = problem_submissions[problem_id]

            if len(submissions) >= 2:
                code1, code2 = random.sample(submissions, 2)
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(1)
                clone_count += 1

        # Create non-clone pairs (different problems)
        logger.info(f"Creating {n_nonclone_pairs} non-clone pairs...")
        nonclone_count = 0

        while nonclone_count < n_nonclone_pairs and len(problem_ids) >= 2:
            problem1, problem2 = random.sample(problem_ids, 2)
            subs1 = problem_submissions[problem1]
            subs2 = problem_submissions[problem2]

            if subs1 and subs2:
                code1 = random.choice(subs1)
                code2 = random.choice(subs2)
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(0)
                nonclone_count += 1

        logger.info(
            f"Created {len(code1_list)} total pairs "
            f"({clone_count} clones, {nonclone_count} non-clones)"
        )

        return code1_list, code2_list, labels


def train_codenet(
    dataset_path: str,
    language: str = "java",
    languages: Optional[list[str]] = None,
    model_name: str = "type4_xgb_codenet.pkl",
    sample_size: int = 10000,
    clone_ratio: float = 0.5,
    sampling_strategy: str = "problem",
    test_size: float = 0.2,
    cross_validation: bool = True,
) -> dict:
    """
    Train Type-IV clone detector using CodeNet dataset.

    Args:
        dataset_path: Path to Project CodeNet dataset
        language: Primary language to train on
        languages: Optional list of languages for multi-language training
        model_name: Name for the saved model file
        sample_size: Number of training pairs
        clone_ratio: Ratio of clone pairs in training data
        sampling_strategy: 'problem' (same problem = clone) or 'random'
        test_size: Fraction of data for testing
        cross_validation: Whether to use cross-validation

    Returns:
        Training metrics dictionary
    """
    logger.info(f"Loading CodeNet dataset from {dataset_path}...")

    # Map language names
    language_map = {
        "java": "Java",
        "python": "Python",
        "c": "C",
        "csharp": "C#",
        "cpp": "C++",
    }

    if languages is None:
        languages = [language]

    all_code1 = []
    all_code2 = []
    all_labels = []

    for lang in languages:
        codenet_lang = language_map.get(lang, lang.capitalize())
        loader = CodeNetDataLoader(dataset_path, codenet_lang)

        code1, code2, labels = loader.create_training_pairs(
            sample_size=sample_size // len(languages),
            clone_ratio=clone_ratio,
        )

        all_code1.extend(code1)
        all_code2.extend(code2)
        all_labels.extend(labels)

    logger.info(f"Total training pairs: {len(all_code1)}")

    # Extract features
    logger.info("Extracting Sheneamer features...")
    extractor = SheneamerFeatureExtractor()

    X = []
    y = all_labels

    for code1, code2 in tqdm(
        zip(all_code1, all_code2), total=len(all_code1), desc="Extracting features"
    ):
        try:
            # Determine language for parsing
            parse_lang = languages[0] if len(languages) == 1 else "java"

            fused_features = extractor.extract_fused_features(code1, code2, parse_lang)
            X.append(fused_features)
        except Exception as e:
            logger.debug(f"Feature extraction failed: {e}")
            continue

    X = np.array(X)
    y = np.array(y)

    logger.info(f"Feature matrix shape: {X.shape}")
    logger.info(f"Class distribution: {sum(y)} clones, {len(y) - sum(y)} non-clones")

    # Train classifier
    logger.info("Training XGBoost classifier...")
    classifier = SemanticClassifier(
        max_depth=8,
        learning_rate=0.05,
        n_estimators=300,
        subsample=0.9,
        colsample_bytree=0.8,
        reg_lambda=1.0,
    )

    metrics = classifier.train(
        X, y, test_size=test_size, cross_validation=cross_validation
    )

    # Save model
    model_path = classifier.save(model_name)
    logger.info(f"Model saved to {model_path}")

    # Save feature names
    feature_names_file = get_model_path(f"{model_name}.features.json")
    with open(feature_names_file, "w") as f:
        json.dump(extractor.get_feature_names(fused=True), f, indent=2)
    logger.info(f"Feature names saved to {feature_names_file}")

    return metrics


def main():
    """Main entry point for training."""
    parser = argparse.ArgumentParser(
        description="Train Type-IV Code Clone Detector using CodeNet dataset"
    )

    parser.add_argument(
        "--dataset",
        type=str,
        default="../../../../datasets/project-codenet",
        help="Path to Project CodeNet dataset",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "python", "c", "csharp", "cpp"],
        help="Programming language to train on",
    )
    parser.add_argument(
        "--languages",
        type=str,
        nargs="+",
        default=None,
        help="Multiple languages for multi-language training",
    )
    parser.add_argument(
        "--model-name",
        type=str,
        default="type4_xgb_codenet.pkl",
        help="Name for the saved model file",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=10000,
        help="Number of training pairs to sample",
    )
    parser.add_argument(
        "--clone-ratio",
        type=float,
        default=0.5,
        help="Ratio of clone pairs in training data (0.0-1.0)",
    )
    parser.add_argument(
        "--sampling-strategy",
        type=str,
        default="problem",
        choices=["problem", "random"],
        help="Sampling strategy for creating pairs",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Fraction of data to use for testing",
    )
    parser.add_argument(
        "--no-cv",
        action="store_true",
        help="Disable cross-validation during training",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    args = parser.parse_args()

    # Set logging level
    logging.getLogger().setLevel(getattr(logging, args.log_level))

    logger.info("=" * 60)
    logger.info("Type-IV Code Clone Detector Training (CodeNet)")
    logger.info("=" * 60)
    logger.info(f"Dataset: {args.dataset}")
    logger.info(f"Language(s): {args.languages or [args.language]}")
    logger.info(f"Sample size: {args.sample_size}")
    logger.info(f"Clone ratio: {args.clone_ratio}")
    logger.info(f"Model name: {args.model_name}")
    logger.info("=" * 60)

    # Train
    metrics = train_codenet(
        dataset_path=args.dataset,
        language=args.language,
        languages=args.languages,
        model_name=args.model_name,
        sample_size=args.sample_size,
        clone_ratio=args.clone_ratio,
        sampling_strategy=args.sampling_strategy,
        test_size=args.test_size,
        cross_validation=not args.no_cv,
    )

    # Print results
    logger.info("=" * 60)
    logger.info("TRAINING RESULTS")
    logger.info("=" * 60)
    for metric, value in metrics.items():
        if isinstance(value, float):
            logger.info(f"{metric}: {value:.4f}")
        else:
            logger.info(f"{metric}: {value}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
