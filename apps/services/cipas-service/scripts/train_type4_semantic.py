#!/usr/bin/env python3
"""
Type-4 Semantic Clone Detection Model Training Script.

This script trains an XGBoost classifier for detecting Type-4 (semantic) code clones
using 100+ fused semantic features. The model is designed to be the final stage
of the cascading detection pipeline, only triggering after Type-1, Type-2, and
Type-3 checks have failed.

Training Data:
- Positive samples: type-5.csv (semantic clones from TOMA dataset)
- Negative samples: nonclone.csv (hard negatives)

Features (100+ per code snippet):
- Traditional: LOC, keyword categories, complexity metrics (15 features)
- CST: Syntactic construct frequencies (40 features)
- Semantic/PDG: Dependency relationships (20 features)
- Structural Depth: Nesting, depth, ratios (8 features)
- Type Signatures: Parameter/return type patterns (10 features)
- API Fingerprinting: Call patterns, library usage (10 features)

Total: ~103 features per code snippet, ~206 fused features per pair
"""

import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# Add the service directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from clone_detection.features.semantic_features import SemanticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import get_datasets_dir, setup_logging

logger = setup_logging(__name__)


class Type4Trainer:
    """
    Trainer for Type-4 semantic clone detection model.

    Handles data loading, feature extraction, model training, and evaluation.
    """

    def __init__(
        self,
        datasets_dir: Optional[Path] = None,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        n_estimators: int = 200,
        min_child_weight: int = 1,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        reg_alpha: float = 0.1,
        reg_lambda: float = 1.0,
        random_state: int = 42,
    ):
        """
        Initialize the Type-4 trainer.

        Args:
            datasets_dir: Directory containing dataset files
            max_depth: Maximum depth of XGBoost trees
            learning_rate: Learning rate (eta)
            n_estimators: Number of boosting rounds
            min_child_weight: Minimum sum of instance weight in a child
            subsample: Subsample ratio of training instances
            colsample_bytree: Subsample ratio of columns per tree
            reg_alpha: L1 regularization term
            reg_lambda: L2 regularization term
            random_state: Random seed
        """
        self.datasets_dir = datasets_dir or get_datasets_dir()
        self.feature_extractor = SemanticFeatureExtractor()

        # Initialize classifier with hyperparameters optimized for semantic detection
        self.classifier = SemanticClassifier(
            max_depth=max_depth,
            learning_rate=learning_rate,
            n_estimators=n_estimators,
            min_child_weight=min_child_weight,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            reg_alpha=reg_alpha,
            reg_lambda=reg_lambda,
            random_state=random_state,
        )

        logger.info(
            f"Initialized Type-4 Trainer with {self.feature_extractor.n_features_per_code} features per code snippet"
        )
        logger.info(
            f"Fused feature vector size: {self.feature_extractor.n_fused_features}"
        )

    def load_type5_data(self, n_samples: int = 10000) -> tuple[list[str], list[str]]:
        """
        Load Type-5 (semantic) clone pairs from TOMA dataset.

        Args:
            n_samples: Number of samples to load

        Returns:
            Tuple of (code1_list, code2_list)
        """
        type5_path = self.datasets_dir / "toma-dataset" / "type-5.csv"
        source_dir = self.datasets_dir / "toma-dataset" / "id2sourcecode"

        if not type5_path.exists():
            raise FileNotFoundError(f"Type-5 dataset not found: {type5_path}")

        logger.info(f"Loading Type-5 semantic clones from {type5_path}")

        # Load dataset
        df = pd.read_csv(type5_path, nrows=n_samples)
        logger.info(f"Loaded {len(df)} Type-5 clone pairs")

        # Load source code for each pair
        code1_list = []
        code2_list = []

        for _, row in df.iterrows():
            id1 = int(row["id1"])
            id2 = int(row["id2"])

            # Load source code from files
            code1 = self._load_source_code(source_dir, id1)
            code2 = self._load_source_code(source_dir, id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)

        logger.info(f"Successfully loaded {len(code1_list)} valid Type-5 pairs")
        return code1_list, code2_list

    def load_nonclone_data(self, n_samples: int = 10000) -> tuple[list[str], list[str]]:
        """
        Load non-clone pairs (hard negatives).

        Args:
            n_samples: Number of samples to load

        Returns:
            Tuple of (code1_list, code2_list)
        """
        nonclone_path = self.datasets_dir / "toma-dataset" / "nonclone.csv"
        source_dir = self.datasets_dir / "toma-dataset" / "id2sourcecode"

        if not nonclone_path.exists():
            raise FileNotFoundError(f"Non-clone dataset not found: {nonclone_path}")

        logger.info(f"Loading non-clone pairs from {nonclone_path}")

        # Load dataset
        df = pd.read_csv(nonclone_path, nrows=n_samples)
        logger.info(f"Loaded {len(df)} non-clone pairs")

        # Load source code for each pair
        code1_list = []
        code2_list = []

        for _, row in df.iterrows():
            id1 = int(row["FUNCTION_ID_ONE"])
            id2 = int(row["FUNCTION_ID_TWO"])

            # Load source code from files
            code1 = self._load_source_code(source_dir, id1)
            code2 = self._load_source_code(source_dir, id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)

        logger.info(f"Successfully loaded {len(code1_list)} valid non-clone pairs")
        return code1_list, code2_list

    def load_bigclonebench_data(
        self, n_samples: int = 5000
    ) -> tuple[list[str], list[str]]:
        """
        Load Type-4 clones from BigCloneBench dataset.

        Args:
            n_samples: Number of samples to load

        Returns:
            Tuple of (code1_list, code2_list)
        """
        bcb_path = self.datasets_dir / "bigclonebench" / "bigclonebench.jsonl"

        if not bcb_path.exists():
            logger.warning(f"BigCloneBench dataset not found: {bcb_path}")
            return [], []

        logger.info(f"Loading Type-4 clones from BigCloneBench")

        import json

        code1_list = []
        code2_list = []

        with open(bcb_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i >= n_samples:
                    break

                record = json.loads(line)
                if record.get("clone_type") == 4:  # Only Type-4
                    code1 = record.get("code1", "")
                    code2 = record.get("code2", "")
                    if code1 and code2:
                        code1_list.append(code1)
                        code2_list.append(code2)

        logger.info(f"Loaded {len(code1_list)} Type-4 pairs from BigCloneBench")
        return code1_list, code2_list

    def _load_source_code(self, source_dir: Path, func_id: int) -> Optional[str]:
        """
        Load source code for a function ID.

        Args:
            source_dir: Directory containing source code files
            func_id: Function ID

        Returns:
            Source code string or None if not found
        """
        file_path = source_dir / f"{func_id}.java"

        if not file_path.exists():
            return None

        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            logger.warning(f"Failed to load source code for {func_id}: {e}")
            return None

    def extract_features(
        self, code1_list: list[str], code2_list: list[str], language: str = "java"
    ) -> np.ndarray:
        """
        Extract fused semantic features for all code pairs.

        Args:
            code1_list: List of first code snippets
            code2_list: List of second code snippets
            language: Programming language

        Returns:
            Feature matrix of shape (n_samples, n_features)
        """
        n_samples = len(code1_list)
        n_features = self.feature_extractor.n_fused_features

        logger.info(f"Extracting semantic features for {n_samples} pairs...")
        logger.info(f"Feature vector size: {n_features} (100+ features per code)")

        X = np.zeros((n_samples, n_features))

        for i, (code1, code2) in enumerate(zip(code1_list, code2_list)):
            try:
                fused_features = self.feature_extractor.extract_fused_features(
                    code1, code2, language
                )
                X[i] = fused_features
            except Exception as e:
                logger.warning(f"Feature extraction failed for pair {i}: {e}")
                # Use zero features as fallback
                pass

            if (i + 1) % 1000 == 0:
                logger.info(f"  Processed {i + 1}/{n_samples} pairs")

        logger.info(f"Feature extraction complete. Matrix shape: {X.shape}")
        return X

    def train(
        self,
        n_positives: int = 10000,
        n_negatives: int = 10000,
        test_size: float = 0.2,
        use_bigclonebench: bool = True,
    ) -> dict:
        """
        Train the Type-4 semantic clone detection model.

        Args:
            n_positives: Number of positive (clone) samples
            n_negatives: Number of negative (non-clone) samples
            test_size: Fraction of data for testing
            use_bigclonebench: Whether to include BigCloneBench data

        Returns:
            Dictionary with training metrics
        """
        logger.info("=" * 60)
        logger.info("Type-4 Semantic Clone Detection Model Training")
        logger.info("=" * 60)

        # Load positive samples (Type-5 semantic clones)
        pos_code1, pos_code2 = self.load_type5_data(n_positives)

        # Optionally add BigCloneBench Type-4 clones
        if use_bigclonebench:
            bcb_code1, bcb_code2 = self.load_bigclonebench_data(n_positives // 2)
            pos_code1.extend(bcb_code1)
            pos_code2.extend(bcb_code2)

        # Load negative samples (non-clones)
        neg_code1, neg_code2 = self.load_nonclone_data(n_negatives)

        # Create labels
        y_pos = np.ones(len(pos_code1))
        y_neg = np.zeros(len(neg_code1))

        # Combine data
        all_code1 = pos_code1 + neg_code1
        all_code2 = pos_code2 + neg_code2
        y = np.concatenate([y_pos, y_neg])

        logger.info(
            f"Total samples: {len(y)} (Positives: {len(y_pos)}, Negatives: {len(y_neg)})"
        )

        # Extract features
        X = self.extract_features(all_code1, all_code2)

        # Store feature names for importance reporting
        feature_names = self.feature_extractor.get_feature_names(fused=True)
        self.classifier.feature_names = feature_names

        # Train model
        metrics = self.classifier.train(
            X, y, test_size=test_size, cross_validation=True
        )

        # Additional Type-4 specific metrics
        # Calculate precision at high confidence (P>0.85)
        y_pred_proba = self.classifier.predict_proba(X)[:, 1]
        high_conf_mask = y_pred_proba > 0.85
        if np.sum(high_conf_mask) > 0:
            high_conf_precision = np.mean(y[high_conf_mask])
            metrics["high_confidence_precision"] = high_conf_precision
            metrics["high_confidence_samples"] = np.sum(high_conf_mask)
            logger.info(
                f"High confidence (P>0.85) precision: {high_conf_precision:.4f}"
            )
            logger.info(f"High confidence samples: {np.sum(high_conf_mask)}")

        logger.info("=" * 60)
        logger.info("Training Complete")
        logger.info("=" * 60)

        return metrics

    def save_model(self, model_path: str = "type4_xgb.pkl") -> Path:
        """
        Save the trained model.

        Args:
            model_path: Path to save the model

        Returns:
            Path to saved model
        """
        return self.classifier.save(model_path)

    def get_top_features(self, n: int = 20) -> list[tuple[str, float]]:
        """
        Get top N most important features.

        Args:
            n: Number of features to return

        Returns:
            List of (feature_name, importance) tuples
        """
        return self.classifier.get_feature_importance(top_n=n)


def main():
    """Main training pipeline."""
    import argparse

    parser = argparse.ArgumentParser(description="Train Type-4 Semantic Clone Detector")
    parser.add_argument(
        "--positives",
        type=int,
        default=10000,
        help="Number of positive (clone) samples",
    )
    parser.add_argument(
        "--negatives",
        type=int,
        default=10000,
        help="Number of negative (non-clone) samples",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="type4_xgb.pkl",
        help="Output model file path",
    )
    parser.add_argument(
        "--no-bcb",
        action="store_true",
        help="Disable BigCloneBench data loading",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=6,
        help="Maximum tree depth",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=200,
        help="Number of boosting rounds",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.1,
        help="Learning rate",
    )

    args = parser.parse_args()

    # Initialize trainer
    trainer = Type4Trainer(
        max_depth=args.max_depth,
        n_estimators=args.n_estimators,
        learning_rate=args.learning_rate,
    )

    # Train model
    metrics = trainer.train(
        n_positives=args.positives,
        n_negatives=args.negatives,
        use_bigclonebench=not args.no_bcb,
    )

    # Save model
    model_path = trainer.save_model(args.output)
    logger.info(f"Model saved to {model_path}")

    # Print top features
    logger.info("\nTop 20 Most Important Features:")
    logger.info("-" * 60)
    for name, importance in trainer.get_top_features(20):
        logger.info(f"  {name:40s} {importance:.4f}")

    # Print summary
    logger.info("\n" + "=" * 60)
    logger.info("Training Summary")
    logger.info("=" * 60)
    logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
    logger.info(f"  Precision: {metrics['precision']:.4f}")
    logger.info(f"  Recall:    {metrics['recall']:.4f}")
    logger.info(f"  F1 Score:  {metrics['f1']:.4f}")
    logger.info(
        f"  CV F1:     {metrics['cv_f1_mean']:.4f} (+/- {metrics['cv_f1_std']:.4f})"
    )

    if "high_confidence_precision" in metrics:
        logger.info(
            f"  High-Conf Precision (P>0.85): {metrics['high_confidence_precision']:.4f}"
        )

    logger.info("\n✓ Type-4 model training complete!")


if __name__ == "__main__":
    main()
