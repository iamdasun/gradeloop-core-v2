"""
Training Script for Type-IV Code Clone Detector using Project CodeNet Dataset.

This script trains an XGBoost classifier based on the Sheneamer et al. (2021) framework
using the Project CodeNet dataset.

Usage:
    # Train with CodeNet dataset (Java)
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --language java \
        --model-name type4_xgb_codenet.pkl \
        --sample-size 10000 \
        --visualize

    # Train with multiple languages
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --languages java python csharp \
        --model-name type4_xgb_multilang.pkl \
        --sample-size 20000 \
        --visualize \
        --output-dir ./training_output

    # Train without visualization (faster)
    poetry run python train_codenet.py \
        --dataset ../../../../datasets/project-codenet \
        --language java \
        --model-name type4_xgb_codenet.pkl
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
from clone_detection.utils.metrics_visualization import MetricsVisualizer

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
        sample_size: Optional[int] = None,
        clone_ratio: float = 0.5,
        problems: Optional[list[str]] = None,
        max_problems: Optional[int] = None,
        hard_negative_ratio: float = 0.20,
        include_gptclonebench: bool = False,
        gptclonebench_path: Optional[str] = None,
        gptclonebench_ratio: float = 0.05,
    ) -> tuple[list[str], list[str], list[int]]:
        """
        Create training pairs from CodeNet dataset with hard negative mining.

        Positive pairs: Solutions to the same problem (semantic clones)
        Negative pairs: Solutions to different problems (non-clones)
        Hard negatives: Solutions to similar problems with similar structure

        Args:
            sample_size: Total number of pairs to create (None = use all available)
            clone_ratio: Ratio of positive (clone) pairs
            problems: Optional list of problems to use
            max_problems: Maximum number of problems to load (speeds up training)
            hard_negative_ratio: Ratio of hard negative pairs (default: 20%)
            include_gptclonebench: Whether to include GPTCloneBench samples
            gptclonebench_path: Path to GPTCloneBench dataset
            gptclonebench_ratio: Ratio of GPTCloneBench samples (default: 5%)

        Returns:
            Tuple of (code1_list, code2_list, labels)
        """
        if problems is None:
            logger.info("Loading problem list...")
            problems = self.get_problem_list(min_submissions=5)
            logger.info(f"Found {len(problems)} problems with submissions")

            # Limit problems for faster training
            if max_problems is not None:
                problems = problems[:max_problems]
                logger.info(
                    f"Using {len(problems)} problems (limited from {len(problems)})"
                )

        # Load submissions per problem
        problem_submissions = {}
        logger.info("Loading submissions...")

        # Use tqdm for progress tracking
        for problem_id in tqdm(problems, desc="Loading problems"):
            submissions = self.load_problem_submissions(problem_id)
            if len(submissions) >= 2:
                problem_submissions[problem_id] = submissions

        logger.info(f"Loaded {len(problem_submissions)} problems with submissions")

        # Create pairs
        code1_list = []
        code2_list = []
        labels = []

        # Calculate target pair counts
        if sample_size is None:
            # Use all available pairs (estimate)
            total_possible = sum(
                max(0, len(subs) * (len(subs) - 1) // 2)
                for subs in problem_submissions.values()
            )
            # Limit to prevent memory issues
            sample_size = min(total_possible, 500000)  # Cap at 500k pairs
            logger.info(f"Using estimated {sample_size:,} pairs from full dataset")

        # Calculate pair counts
        n_clone_pairs = int(sample_size * clone_ratio)
        n_hard_negative_pairs = int(sample_size * hard_negative_ratio)
        n_easy_negative_pairs = sample_size - n_clone_pairs - n_hard_negative_pairs

        # Ensure non-negative
        n_easy_negative_pairs = max(0, n_easy_negative_pairs)

        # ========================================
        # 1. Create clone pairs (same problem) - Label 1
        # ========================================
        logger.info(f"Creating {n_clone_pairs:,} clone pairs (same problem)...")
        clone_count = 0
        problem_ids = list(problem_submissions.keys())

        while clone_count < n_clone_pairs and problem_ids:
            problem_id = random.choice(problem_ids)
            submissions = problem_submissions[problem_id]

            if len(submissions) >= 2:
                code1, code2 = random.sample(submissions, 2)
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(1)  # Same problem = clone
                clone_count += 1

            if clone_count % 1000 == 0:
                logger.info(f"  Created {clone_count:,} clone pairs...")

        # ========================================
        # 2. Create hard negative pairs (similar problems, different logic) - Label 0
        # ========================================
        logger.info(f"Creating {n_hard_negative_pairs:,} hard negative pairs...")
        logger.info(
            "Hard negatives: Similar problems with similar structure but different semantics"
        )

        hard_negative_count = 0

        # Group problems by similarity (adjacent problem IDs often have similar structure)
        sorted_problems = sorted(problem_ids)

        while hard_negative_count < n_hard_negative_pairs and len(sorted_problems) >= 2:
            # Pick adjacent or nearby problems (likely to have similar structure)
            idx = random.randint(0, len(sorted_problems) - 2)
            problem1 = sorted_problems[idx]
            problem2 = sorted_problems[
                idx + random.randint(1, min(3, len(sorted_problems) - idx - 1))
            ]

            # Verify different problems
            if problem1 != problem2:
                subs1 = problem_submissions[problem1]
                subs2 = problem_submissions[problem2]

                if subs1 and subs2:
                    code1 = random.choice(subs1)
                    code2 = random.choice(subs2)
                    code1_list.append(code1)
                    code2_list.append(code2)
                    labels.append(0)  # Different problems = non-clone (hard negative)
                    hard_negative_count += 1

            if hard_negative_count % 500 == 0:
                logger.info(f"  Created {hard_negative_count:,} hard negative pairs...")

        # ========================================
        # 3. Create easy negative pairs (random different problems) - Label 0
        # ========================================
        logger.info(f"Creating {n_easy_negative_pairs:,} easy negative pairs...")
        easy_negative_count = 0

        while easy_negative_count < n_easy_negative_pairs and len(problem_ids) >= 2:
            problem1, problem2 = random.sample(problem_ids, 2)
            subs1 = problem_submissions[problem1]
            subs2 = problem_submissions[problem2]

            if subs1 and subs2:
                code1 = random.choice(subs1)
                code2 = random.choice(subs2)
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(0)
                easy_negative_count += 1

            if easy_negative_count % 1000 == 0:
                logger.info(f"  Created {easy_negative_count:,} easy negative pairs...")

        # ========================================
        # 4. Add GPTCloneBench domain mixing (5-10%)
        # ========================================
        if include_gptclonebench and gptclonebench_path:
            logger.info(
                f"Adding GPTCloneBench samples ({gptclonebench_ratio * 100:.0f}%)..."
            )
            gpt_samples = self._load_gptclonebench_samples(
                gptclonebench_path, int(sample_size * gptclonebench_ratio)
            )

            if gpt_samples:
                logger.info(f"Loaded {len(gpt_samples)} GPTCloneBench pairs")
                for code1, code2, label in gpt_samples:
                    code1_list.append(code1)
                    code2_list.append(code2)
                    labels.append(label)

        logger.info(
            f"Created {len(code1_list):,} total pairs "
            f"({clone_count:,} clones, {hard_negative_count:,} hard negatives, {easy_negative_count:,} easy negatives)"
        )

        # Label verification
        clone_pairs = sum(1 for l in labels if l == 1)
        nonclone_pairs = sum(1 for l in labels if l == 0)
        logger.info(
            f"Label distribution: {clone_pairs} clones ({clone_pairs / len(labels) * 100:.1f}%), {nonclone_pairs} non-clones ({nonclone_pairs / len(labels) * 100:.1f}%)"
        )

        return code1_list, code2_list, labels

    def _load_gptclonebench_samples(
        self,
        gptclonebench_path: str,
        n_samples: int,
    ) -> list[tuple[str, str, int]]:
        """
        Load samples from GPTCloneBench dataset for domain mixing.

        Args:
            gptclonebench_path: Path to GPTCloneBench JSONL file
            n_samples: Number of samples to load

        Returns:
            List of (code1, code2, label) tuples
        """
        import json

        samples = []

        try:
            with open(gptclonebench_path, "r", encoding="utf-8") as f:
                lines = f.readlines()

            # Sample randomly
            if len(lines) > n_samples:
                lines = random.sample(lines, n_samples)

            for line in lines:
                data = json.loads(line)
                code1 = data.get("code1", "")
                code2 = data.get("code2", "")
                # GPTCloneBench uses 'semantic' boolean
                label = 1 if data.get("semantic", False) else 0

                if code1 and code2 and len(code1) > 50 and len(code2) > 50:
                    samples.append((code1, code2, label))

        except Exception as e:
            logger.warning(f"Failed to load GPTCloneBench: {e}")

        return samples


def train_codenet(
    dataset_path: str,
    language: str = "java",
    languages: Optional[list[str]] = None,
    model_name: str = "type4_xgb_codenet.pkl",
    sample_size: Optional[int] = None,
    clone_ratio: float = 0.5,
    hard_negative_ratio: float = 0.20,
    include_gptclonebench: bool = False,
    gptclonebench_path: Optional[str] = None,
    gptclonebench_ratio: float = 0.05,
    test_size: float = 0.2,
    cross_validation: bool = True,
    visualize: bool = True,
    output_dir: Optional[str] = None,
    max_problems: Optional[int] = None,
    feature_pruning: bool = True,
    isotonic_calibration: bool = True,
) -> dict:
    """
    Train Type-IV clone detector using CodeNet dataset with hard negative mining.

    Args:
        dataset_path: Path to Project CodeNet dataset
        language: Primary language to train on
        languages: Optional list of languages for multi-language training
        model_name: Name for the saved model file
        sample_size: Number of training pairs (None = use full dataset, capped at 500k)
        clone_ratio: Ratio of clone pairs in training data
        hard_negative_ratio: Ratio of hard negative pairs (default: 20%)
        include_gptclonebench: Whether to include GPTCloneBench samples
        gptclonebench_path: Path to GPTCloneBench dataset
        gptclonebench_ratio: Ratio of GPTCloneBench samples (default: 5%)
        test_size: Fraction of data for testing
        cross_validation: Whether to use cross-validation
        visualize: Whether to generate visualizations
        output_dir: Directory for visualization output
        feature_pruning: Enable feature pruning (drop bottom 20%)
        isotonic_calibration: Enable isotonic probability calibration

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
            sample_size=sample_size,
            clone_ratio=clone_ratio,
            hard_negative_ratio=hard_negative_ratio,
            include_gptclonebench=include_gptclonebench,
            gptclonebench_path=gptclonebench_path,
            gptclonebench_ratio=gptclonebench_ratio,
            max_problems=max_problems,
        )

        all_code1.extend(code1)
        all_code2.extend(code2)
        all_labels.extend(labels)

    logger.info(f"Total training pairs: {len(all_code1)}")

    # Extract features
    logger.info("Extracting Sheneamer features...")
    extractor = SheneamerFeatureExtractor()

    X = []
    y = []  # Sync y with X (only add labels for successful extractions)

    failed_extractions = 0
    successful_extractions = 0

    # Determine the parsing language
    parse_lang = languages[0] if len(languages) == 1 else "java"
    logger.info(f"Using language '{parse_lang}' for feature extraction")
    logger.info(f"Available parsers: {list(extractor.tokenizer.parsers.keys())}")

    # Log first code sample for debugging
    if all_code1:
        logger.info(f"Sample code 1 (first 100 chars): {all_code1[0][:100]}...")
        logger.info(f"Sample code 2 (first 100 chars): {all_code2[0][:100]}...")

    for code1, code2, label in tqdm(
        zip(all_code1, all_code2, all_labels),
        total=len(all_labels),
        desc="Extracting features",
    ):
        try:
            fused_features = extractor.extract_fused_features(code1, code2, parse_lang)

            # Validate feature shape
            if not isinstance(fused_features, np.ndarray) or fused_features.ndim != 1:
                logger.warning(
                    f"Invalid feature shape: {type(fused_features)}, ndim: {getattr(fused_features, 'ndim', 'N/A')}"
                )
                failed_extractions += 1
                continue

            X.append(fused_features)
            y.append(label)
            successful_extractions += 1

            # Log progress
            if successful_extractions == 1:
                logger.info(
                    f"First successful extraction: shape={fused_features.shape}, dtype={fused_features.dtype}"
                )
            elif successful_extractions == 100:
                logger.info(f"Extracted 100 features successfully...")

        except Exception as e:
            if failed_extractions < 3:  # Log first 3 failures
                logger.warning(f"Feature extraction failed: {e}")
                logger.warning(
                    f"  Code1 length: {len(code1)}, Code2 length: {len(code2)}"
                )
            failed_extractions += 1
            continue

    logger.info(f"Successfully extracted features for {successful_extractions} pairs")
    if failed_extractions > 0:
        logger.warning(f"Failed to extract features for {failed_extractions} pairs")

    # Convert list of arrays to numpy array
    if successful_extractions > 0:
        X = np.stack(X)  # Use stack for list of equal-length arrays
        y = np.array(y)
        logger.info(f"X type: {type(X)}, dtype: {X.dtype}, shape: {X.shape}")
    else:
        X = np.array([]).reshape(0, extractor.n_fused_features)
        y = np.array([])
        logger.warning("No features extracted, creating empty array")

    # Verify feature matrix is valid
    if X.size == 0 or len(X.shape) < 2:
        logger.error(f"Feature matrix is empty or invalid. Shape: {X.shape}")
        logger.error("This may be due to:")
        logger.error("  1. Tree-sitter parser not loaded for the specified language")
        logger.error("  2. All code snippets failed parsing")
        logger.error("  3. Language mismatch between data and parser")
        logger.error(f"  4. Requested language: {parse_lang}")
        logger.error(
            f"  5. Available parsers: {list(extractor.tokenizer.parsers.keys())}"
        )
        raise ValueError(f"Feature matrix extraction failed. Shape: {X.shape}")

    logger.info(f"Feature matrix shape: {X.shape}")
    logger.info(f"Class distribution: {sum(y)} clones, {len(y) - sum(y)} non-clones")

    # Train classifier with feature pruning and isotonic calibration
    logger.info(
        "Training XGBoost classifier with feature pruning and isotonic calibration..."
    )
    classifier = SemanticClassifier(
        max_depth=8,
        learning_rate=0.05,
        n_estimators=300,
        subsample=0.9,
        colsample_bytree=0.8,
        reg_lambda=1.0,
        feature_pruning=feature_pruning,
        feature_pruning_percentile=0.20,  # Drop bottom 20% of features
        isotonic_calibration=isotonic_calibration,
        calibration_cv_folds=5,
    )

    feature_names = extractor.get_feature_names(fused=True)

    metrics = classifier.train(
        X,
        y,
        feature_names=feature_names,
        test_size=test_size,
        cross_validation=cross_validation,
        apply_feature_pruning=feature_pruning,
        apply_isotonic_calibration=isotonic_calibration,
    )

    # Save model
    model_path = classifier.save(model_name)
    logger.info(f"Model saved to {model_path}")

    # Save feature names
    feature_names_file = get_model_path(f"{model_name}.features.json")
    feature_names = extractor.get_feature_names(fused=True)
    with open(feature_names_file, "w") as f:
        json.dump(feature_names, f, indent=2)
    logger.info(f"Feature names saved to {feature_names_file}")

    # Save training metrics
    metrics_file = get_model_path(f"{model_name}.metrics.json")
    with open(metrics_file, "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    logger.info(f"Training metrics saved to {metrics_file}")

    # Generate visualizations
    if visualize:
        logger.info("Generating training visualizations...")
        visualizer = MetricsVisualizer(output_dir=output_dir)

        # Get predictions for visualization
        from sklearn.model_selection import train_test_split

        X_train_viz, X_test_viz, y_train_viz, y_test_viz = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Apply same feature pruning as during training
        if classifier.pruned_feature_indices is not None:
            X_test_viz = X_test_viz[:, classifier.pruned_feature_indices]
            logger.info(
                f"Applied feature pruning to visualization data: {X_test_viz.shape[1]} features"
            )

        y_pred = classifier.predict(X_test_viz)
        y_scores = classifier.predict_proba(X_test_viz)[:, 1]

        # Create complete report - use pruned feature names
        if classifier.feature_names:
            viz_feature_names = classifier.feature_names
        else:
            viz_feature_names = feature_names
            if classifier.pruned_feature_indices is not None:
                viz_feature_names = [
                    feature_names[i] for i in classifier.pruned_feature_indices
                ]

        # Create complete report
        extra_info = {
            "dataset": dataset_path,
            "language(s)": ", ".join(languages) if languages else language,
            "sample_size": len(all_code1),
            "clone_ratio": clone_ratio,
            "model_name": model_name,
            "feature_count": X.shape[1],
            "pruned_feature_count": classifier.pruned_feature_count,
            "train_size": len(X_train_viz),
            "test_size": len(X_test_viz),
        }

        report_files = visualizer.create_complete_report(
            y_true=y_test_viz,
            y_pred=y_pred,
            y_scores=y_scores,
            metrics=metrics,
            feature_names=viz_feature_names,
            importances=classifier.base_model.feature_importances_,  # Use base_model for importances
            extra_info=extra_info,
            report_name=f"training_report_{model_name.replace('.pkl', '')}.html",
        )

        logger.info(f"Visualizations saved to: {report_files['html_report']}")
        metrics["visualization_path"] = str(report_files["html_report"])

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
        "--visualize",
        action="store_true",
        default=True,
        help="Generate visualization reports after training",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory for visualization output (default: ./metrics_output)",
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
        visualize=args.visualize,
        output_dir=args.output_dir,
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
