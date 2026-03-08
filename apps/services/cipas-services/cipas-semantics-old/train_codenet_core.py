#!/usr/bin/env python3
"""
Core training logic for Type-IV Semantic Clone Detector using Project CodeNet.

Supports: Java, C, C#, Python
"""

import json
import multiprocessing as mp
import random
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from tqdm import tqdm

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)


# =============================================================================
# Parallel Feature Extraction Worker
# =============================================================================

def extract_features_worker(args):
    """
    Worker function for parallel feature extraction.
    
    Args:
        args: Tuple of (code1, code2, language, index)
        
    Returns:
        Tuple of (index, features_array) or (index, None) on error
    """
    code1, code2, language, idx = args
    try:
        extractor = SheneamerFeatureExtractor()
        fused = extractor.extract_fused_features(code1, code2, language)
        return (idx, fused)
    except Exception:
        # Return None for failed extractions - will be handled by caller
        return (idx, None)


def extract_features_parallel(
    code1_list: list[str],
    code2_list: list[str],
    language: str = "java",
    workers: Optional[int] = None,
    batch_size: int = 1000,
) -> np.ndarray:
    """
    Extract features in parallel using multiprocessing.
    
    Args:
        code1_list: List of first code samples
        code2_list: List of second code samples
        language: Programming language
        workers: Number of worker processes (default: CPU count)
        batch_size: Number of samples per progress update
        
    Returns:
        Feature matrix as numpy array
    """
    if workers is None:
        workers = mp.cpu_count()
    
    logger.info(f"Extracting features with {workers} workers...")
    
    # Prepare work items
    work_items = [
        (code1, code2, language, idx)
        for idx, (code1, code2) in enumerate(zip(code1_list, code2_list))
    ]
    
    features = [None] * len(work_items)
    failed_count = 0
    
    # Process in parallel with progress bar
    with ProcessPoolExecutor(max_workers=workers) as executor:
        # Submit all tasks
        futures = {
            executor.submit(extract_features_worker, item): item
            for item in work_items
        }
        
        # Collect results with progress bar
        with tqdm(total=len(futures), desc="Extracting features") as pbar:
            for future in as_completed(futures):
                idx, result = future.result()
                if result is not None:
                    features[idx] = result
                else:
                    failed_count += 1
                    # Use zero vector for failed extractions
                    if features[0] is not None:
                        features[idx] = np.zeros_like(features[0])
                    else:
                        # Will be filled after first successful extraction
                        features[idx] = None
                pbar.update(1)
    
    # Fill any remaining None values with zeros
    if failed_count > 0:
        logger.warning(f"Failed to extract features for {failed_count} pairs, using zero vectors")
        feature_dim = next((f.shape[0] for f in features if f is not None), 0)
        features = [f if f is not None else np.zeros(feature_dim) for f in features]
    
    return np.array(features)


class CodeNetDataLoader:
    """Load and prepare training data from Project CodeNet dataset."""

    def __init__(self, dataset_path: str, language: str = "Java"):
        """
        Initialize CodeNet data loader.

        Args:
            dataset_path: Path to Project CodeNet root directory
            language: Programming language (Java, C, C#, Python)
        """
        self.dataset_path = Path(dataset_path)
        self.language = language
        self.data_path = self.dataset_path / "data"
        self.metadata_path = self.dataset_path / "metadata"

        # Language directory mapping (exact names used in CodeNet)
        self.language_dir_map = {
            "java": "Java",
            "Java": "Java",
            "python": "Python",
            "Python": "Python",
            "c": "C",
            "C": "C",
            "csharp": "C#",
            "c#": "C#",
            "C#": "C#",
        }

        # File extensions for each language
        self.language_extensions = {
            "Java": [".java"],
            "Python": [".py"],
            "C": [".c", ".cpp"],
            "C#": [".cs"],
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

            # Get language directory name
            lang_dir = self.language_dir_map.get(self.language, self.language)

            # Filter by language and status
            mask = df["language"] == lang_dir
            if status_filter:
                mask &= df["status"] == status_filter

            filtered_df = df[mask]

            # Load source code for each submission
            for _, row in filtered_df.iterrows():
                submission_id = row["submission_id"]
                code_file = self.data_path / problem_id / lang_dir / f"{submission_id}"

                # Try with language-specific extensions
                exts = self.language_extensions.get(
                    lang_dir, [".java", ".py", ".c", ".cpp", ".cs"]
                )

                for ext in exts:
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
        """Get list of problems with sufficient submissions."""
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
                        lang_dir = self.language_dir_map.get(
                            self.language, self.language
                        )
                        count = len(problem_df[problem_df["language"] == lang_dir])
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
            sample_size: Total number of pairs to create
            clone_ratio: Ratio of positive (clone) pairs
            problems: Optional list of problems to use
            max_problems: Maximum number of problems to load
            hard_negative_ratio: Ratio of hard negative pairs
            include_gptclonebench: Whether to include GPTCloneBench samples
            gptclonebench_path: Path to GPTCloneBench dataset
            gptclonebench_ratio: Ratio of GPTCloneBench samples

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
                logger.info(f"Using {len(problems)} problems (limited)")

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

        # Calculate target pair counts
        if sample_size is None:
            sample_size = 500000  # Cap at 500k pairs
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
        # 2. Create hard negative pairs (similar problems) - Label 0
        # ========================================
        logger.info(f"Creating {n_hard_negative_pairs:,} hard negative pairs...")
        hard_negative_count = 0
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
        # 4. Add GPTCloneBench domain mixing (optional)
        # ========================================
        if include_gptclonebench and gptclonebench_path:
            logger.info("Adding GPTCloneBench samples...")
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
            f"({clone_count:,} clones, {hard_negative_count:,} hard negatives, "
            f"{easy_negative_count:,} easy negatives)"
        )

        # Label verification
        clone_pairs = sum(1 for label in labels if label == 1)
        nonclone_pairs = sum(1 for label in labels if label == 0)
        logger.info(
            f"Label distribution: {clone_pairs} clones ({clone_pairs / len(labels) * 100:.1f}%), "
            f"{nonclone_pairs} non-clones ({nonclone_pairs / len(labels) * 100:.1f}%)"
        )

        return code1_list, code2_list, labels

    def _load_gptclonebench_samples(
        self, gptclonebench_path: str, n_samples: int
    ) -> list[tuple[str, str, int]]:
        """Load samples from GPTCloneBench dataset for domain mixing."""
        samples = []
        try:
            with open(gptclonebench_path, "r", encoding="utf-8") as f:
                for i, line in enumerate(f):
                    if i >= n_samples:
                        break
                    data = json.loads(line)
                    code1 = data.get("code1", "")
                    code2 = data.get("code2", "")
                    label = 1 if data.get("semantic", False) else 0
                    if code1 and code2:
                        samples.append((code1, code2, label))
        except Exception as e:
            logger.warning(f"Error loading GPTCloneBench: {e}")
        return samples


def train_codenet(
    dataset_path: str,
    language: str = "java",
    languages: Optional[list[str]] = None,
    model_name: str = "type4_xgb_codenet.pkl",
    model_dir: str = "./models",
    sample_size: Optional[int] = None,
    clone_ratio: float = 0.5,
    hard_negative_ratio: float = 0.20,
    include_gptclonebench: bool = False,
    gptclonebench_path: Optional[str] = None,
    gptclonebench_ratio: float = 0.05,
    test_size: float = 0.2,
    cross_validation: bool = True,
    visualize: bool = True,
    output_dir: str = "./results/train",
    max_problems: Optional[int] = None,
    xgboost_params: Optional[dict] = None,
) -> dict:
    """
    Train Type-IV clone detector on Project CodeNet.

    Supports multi-language training: Java, C, C#, Python

    Args:
        dataset_path: Path to CodeNet dataset
        language: Primary language (if languages not specified)
        languages: List of languages to train on
        model_name: Output model filename
        model_dir: Directory to save model
        sample_size: Number of training pairs (None = full dataset)
        clone_ratio: Ratio of clone pairs
        hard_negative_ratio: Ratio of hard negative pairs
        include_gptclonebench: Include GPTCloneBench samples
        gptclonebench_path: Path to GPTCloneBench dataset
        gptclonebench_ratio: Ratio of GPTCloneBench samples
        test_size: Test split ratio
        cross_validation: Enable cross-validation
        visualize: Generate visualizations
        output_dir: Output directory for results
        max_problems: Maximum problems to use per language
        xgboost_params: Custom XGBoost parameters

    Returns:
        Training metrics dictionary
    """
    logger.info("=" * 70)
    logger.info("TYPE-IV CODE CLONE DETECTOR - TRAINING")
    logger.info("=" * 70)

    # Multi-language support
    langs = languages or [language]
    logger.info(f"Language(s): {langs}")

    all_code1, all_code2, all_labels = [], [], []

    for lang in langs:
        logger.info(f"\n{'=' * 60}")
        logger.info(f"Processing language: {lang}")
        logger.info(f"{'=' * 60}")

        loader = CodeNetDataLoader(dataset_path, lang)
        code1, code2, labels = loader.create_training_pairs(
            sample_size=sample_size // len(langs) if sample_size else None,
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

    logger.info(f"\n{'=' * 70}")
    logger.info(f"Total pairs: {len(all_code1):,}")

    if len(all_code1) == 0:
        logger.error("No training pairs created! Check dataset structure.")
        logger.error(
            f"Ensure CodeNet dataset has data/{lang}/ and metadata/ directories"
        )
        return {}

    # Extract features in parallel
    logger.info("\nExtracting Sheneamer features in parallel...")
    n_workers = min(mp.cpu_count(), 16)  # Cap at 16 workers
    logger.info(f"Using {n_workers} parallel workers for feature extraction")
    
    X = extract_features_parallel(
        code1_list=all_code1,
        code2_list=all_code2,
        language="java",  # Use primary language
        workers=n_workers,
    )
    y = np.array(all_labels)
    logger.info(f"Feature matrix: {X.shape}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=y
    )
    logger.info(f"Train: {len(y_train):,} | Test: {len(y_test):,}")

    # Get feature names (create extractor instance for metadata)
    extractor = SheneamerFeatureExtractor()
    feature_names = extractor.get_feature_names(fused=True)

    # Train classifier
    logger.info("\nTraining XGBoost classifier...")
    classifier = SemanticClassifier(
        n_estimators=xgboost_params.get("n_estimators", 500) if xgboost_params else 500,
        max_depth=xgboost_params.get("max_depth", 6) if xgboost_params else 6,
        learning_rate=xgboost_params.get("learning_rate", 0.1)
        if xgboost_params
        else 0.1,
        subsample=xgboost_params.get("subsample", 0.8) if xgboost_params else 0.8,
        colsample_bytree=xgboost_params.get("colsample_bytree", 0.8)
        if xgboost_params
        else 0.8,
        min_child_weight=xgboost_params.get("min_child_weight", 1)
        if xgboost_params
        else 1,
        reg_lambda=xgboost_params.get("reg_lambda", 1.0) if xgboost_params else 1.0,
        reg_alpha=xgboost_params.get("reg_alpha", 0.1) if xgboost_params else 0.1,
    )
    classifier.feature_names = feature_names

    classifier.fit(X_train, y_train, X_test, y_test, cv=cross_validation)
    classifier.is_trained = True

    # Evaluate
    logger.info("\nEvaluating on test set...")
    y_pred = classifier.predict(X_test)
    y_proba = classifier.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba),
    }

    logger.info("\n" + "=" * 70)
    logger.info("TEST METRICS")
    logger.info("=" * 70)
    for k, v in metrics.items():
        logger.info(f"{k:12s}: {v:.4f}")

    # Save model
    model_dir_path = Path(model_dir)
    model_dir_path.mkdir(parents=True, exist_ok=True)
    model_path = model_dir_path / model_name
    classifier.save(str(model_path))
    logger.info(f"\nModel saved to: {model_path.absolute()}")

    # Visualizations
    if visualize:
        try:
            from clone_detection.utils.metrics_visualization import MetricsVisualizer

            visualizer = MetricsVisualizer(output_dir=output_dir)

            extra_info = {
                "dataset": "CodeNet",
                "languages": langs,
                "total_samples": len(all_code1),
            }

            report_files = visualizer.create_complete_report(
                y_true=y_test,
                y_pred=y_pred,
                y_scores=y_proba,
                metrics=metrics,
                feature_names=classifier.feature_names,
                importances=classifier.base_model.feature_importances_,
                extra_info=extra_info,
                report_name="training_report.html",
            )
            logger.info(f"Visualizations saved to: {report_files['html_report']}")
            metrics["visualization_path"] = str(report_files["html_report"])
        except Exception as e:
            logger.warning(f"Visualization failed: {e}")

    return metrics
