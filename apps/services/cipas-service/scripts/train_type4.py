#!/usr/bin/env python3
"""
Training and Evaluation Script for Type-4 Clone Detection Model.

This script trains and evaluates the XGBoost classifier for detecting
Type-4 (semantic) clones using fused semantic features (Pipeline B).

TOMA Dataset Structure:
- type-1.csv: Type-1 clones (exact)
- type-2.csv: Type-2 clones (renamed)
- type-3.csv: Strong Type-3 clones
- type-4.csv: Moderate Type-3 clones
- type-5.csv: Type-4 clones (semantic) - USED FOR TYPE-4 TRAINING
- nonclone.csv: Non-clone pairs (negatives)

Note: In the TOMA dataset, Type-4 clones are stored in type-5.csv

Usage:
    python train_type4.py [--dataset PATH] [--output-dir DIR] [--test]
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from clone_detection.features.semantic_features import (
    FeatureFusion,
    SemanticFeatureExtractor,
)
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import (
    get_model_path,
    get_toma_dataset_dir,
    load_source_code,
    load_source_code_batch,
    load_toma_csv,
    set_random_seed,
    setup_logging,
)

logger = setup_logging("train_type4")


class Type4Trainer:
    """
    Trainer for Type-4 clone detection model.

    Uses Pipeline B (semantic features) with XGBoost classifier.
    Feature fusion via linear combination (concatenation).
    """

    def __init__(self, sample_size: int = 15000):
        """
        Initialize the trainer.

        Args:
            sample_size: Number of samples to use for training (for large datasets)
        """
        self.tokenizer = TreeSitterTokenizer()
        self.feature_extractor = SemanticFeatureExtractor(tokenizer=self.tokenizer)
        self.classifier = None
        self.sample_size = sample_size

        # Cache for source code
        self.code_cache = {}

    def prepare_dataset(
        self, dataset_file: str = "type-5.csv"
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Prepare training dataset from TOMA CSV file.

        Type-4 clones use fused semantic features from both code snippets.

        Args:
            dataset_file: Name of the CSV file in TOMA dataset directory
                          (type-5.csv contains Type-4 clones in TOMA dataset)

        Returns:
            Tuple of (feature_matrix, labels)
        """
        logger.info(f"Loading dataset: {dataset_file}")

        # Load CSV
        df = load_toma_csv(dataset_file)
        logger.info(f"Loaded {len(df)} samples")

        # Sample if dataset is too large
        if len(df) > self.sample_size:
            logger.info(f"Sampling {self.sample_size} samples from {len(df)}")
            df = df.sample(n=self.sample_size, random_state=42)

        # Get unique code IDs
        all_ids = set(df["id1"].unique()) | set(df["id2"].unique())
        logger.info(f"Loading source code for {len(all_ids)} unique code snippets...")

        # Load source code
        self.code_cache = load_source_code_batch(list(all_ids))
        logger.info(f"Loaded {len(self.code_cache)} source code files")

        # Extract fused features for each pair
        logger.info("Extracting semantic features with fusion...")
        features = []
        labels = []
        failed = 0

        for idx, row in df.iterrows():
            id1, id2 = row["id1"], row["id2"]
            # All entries in type-5.csv are Type-4 clones (label=1)
            # The 'label' column contains clone_type, not binary label

            code1 = self.code_cache.get(id1, "")
            code2 = self.code_cache.get(id2, "")

            if not code1 or not code2:
                failed += 1
                continue

            try:
                # Extract fused features (concatenation of both code snippets' features)
                feat = self.feature_extractor.extract_fused_features(
                    code1, code2, language="java"
                )
                features.append(feat)
                labels.append(1)  # All type-5 entries are clones
            except Exception as e:
                logger.debug(f"Failed to extract features for pair ({id1}, {id2}): {e}")
                failed += 1

        # Add non-clones as negative examples
        logger.info("Loading non-clone samples for negative examples...")
        df_nonclones = load_toma_csv("nonclone.csv")
        logger.info(f"  Loaded {len(df_nonclones)} non-clone samples")

        # Sample non-clones to balance dataset
        n_nonclones = min(len(df_nonclones), len(df))
        if len(df_nonclones) > n_nonclones:
            df_nonclones = df_nonclones.sample(n=n_nonclones, random_state=42)
        logger.info(f"  Using {len(df_nonclones)} non-clone samples")

        # Load source code for non-clones if not already cached
        nonclone_ids = set(df_nonclones["id1"].unique()) | set(
            df_nonclones["id2"].unique()
        )
        new_ids = nonclone_ids - set(self.code_cache.keys())
        if new_ids:
            logger.info(f"  Loading {len(new_ids)} additional source code files...")
            new_codes = load_source_code_batch(list(new_ids))
            self.code_cache.update(new_codes)

        for idx, row in df_nonclones.iterrows():
            id1, id2 = row["id1"], row["id2"]

            code1 = self.code_cache.get(id1, "")
            code2 = self.code_cache.get(id2, "")

            if not code1 or not code2:
                continue

            try:
                feat = self.feature_extractor.extract_fused_features(
                    code1, code2, language="java"
                )
                features.append(feat)
                labels.append(0)  # Non-clones
            except Exception as e:
                logger.debug(f"Failed to process non-clone pair: {e}")
                pass

        X = np.array(features)
        y = np.array(labels, dtype=np.int64)

        logger.info(f"Prepared dataset: {X.shape[0]} samples, {X.shape[1]} features")
        logger.info(f"Failed to process: {failed} pairs")
        logger.info(f"Label distribution: {np.bincount(y)} (0=non-clone, 1=clone)")

        return X, y

    def train(self, dataset_file: str = "type-5.csv", save_model: bool = True) -> dict:
        """
        Train the Type-4 clone detection model.

        Args:
            dataset_file: Name of the CSV dataset file
            save_model: Whether to save the trained model

        Returns:
            Training metrics dictionary
        """
        start_time = time.time()

        # Prepare dataset
        X, y = self.prepare_dataset(dataset_file)

        # Normalize features for XGBoost
        logger.info("Normalizing features...")
        X_normalized = FeatureFusion.normalize_features(X, method="zscore")

        # Initialize and train classifier
        logger.info("Initializing XGBoost classifier...")
        self.classifier = SemanticClassifier(
            max_depth=6,
            learning_rate=0.1,
            n_estimators=200,
            min_child_weight=1,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_alpha=0.1,
            reg_lambda=1.0,
            random_state=42,
        )

        # Store feature names for importance analysis
        self.classifier.feature_names = self.feature_extractor.get_feature_names(
            fused=True
        )

        # Train
        metrics = self.classifier.train(
            X_normalized,
            y,
            test_size=0.2,
            cross_validation=True,
            early_stopping_rounds=10,
        )

        # Add training time
        metrics["training_time"] = time.time() - start_time
        logger.info(f"Total training time: {metrics['training_time']:.2f} seconds")

        # Feature importance
        if self.classifier.is_trained:
            top_features = self.classifier.get_feature_importance(top_n=15)
            logger.info("Top 15 Feature Importance:")
            for feat, imp in top_features:
                logger.info(f"  {feat}: {imp:.4f}")

        # Save model
        if save_model:
            model_path = self.classifier.save("type4_xgb.pkl")
            logger.info(f"Model saved to {model_path}")

        return metrics

    def evaluate(
        self, test_dataset: str = "type-5.csv", model_name: str = "type4_xgb.pkl"
    ) -> dict:
        """
        Evaluate the trained model on a test dataset.

        Args:
            test_dataset: Name of the test dataset CSV file
            model_name: Name of the saved model to load

        Returns:
            Evaluation metrics dictionary
        """
        logger.info(f"Evaluating model: {model_name}")

        # Load model
        self.classifier = SemanticClassifier.load(model_name)

        # Prepare test dataset
        X, y = self.prepare_dataset(test_dataset)

        # Normalize features
        X_normalized = FeatureFusion.normalize_features(X, method="zscore")

        # Predict
        logger.info("Making predictions...")
        y_pred = self.classifier.predict(X_normalized)
        y_proba = self.classifier.predict_proba(X_normalized)

        # Calculate metrics
        from sklearn.metrics import (
            accuracy_score,
            confusion_matrix,
            f1_score,
            precision_score,
            recall_score,
            roc_auc_score,
        )

        metrics = {
            "accuracy": accuracy_score(y, y_pred),
            "precision": precision_score(y, y_pred),
            "recall": recall_score(y, y_pred),
            "f1": f1_score(y, y_pred),
            "auc_roc": roc_auc_score(y, y_proba[:, 1])
            if len(np.unique(y)) > 1
            else 0.0,
        }

        # Confusion matrix
        cm = confusion_matrix(y, y_pred)
        metrics["confusion_matrix"] = cm.tolist()

        logger.info("Evaluation Results:")
        logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
        logger.info(f"  Precision: {metrics['precision']:.4f}")
        logger.info(f"  Recall:    {metrics['recall']:.4f}")
        logger.info(f"  F1 Score:  {metrics['f1']:.4f}")
        logger.info(f"  AUC-ROC:   {metrics['auc_roc']:.4f}")
        logger.info(f"Confusion Matrix:\n{cm}")

        return metrics


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Train and evaluate Type-4 clone detection model"
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default="type-5.csv",
        help="Dataset CSV file name (default: type-5.csv for Type-4 clones)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Output directory for models (default: models/saved)",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=15000,
        help="Number of samples to use for training (default: 15000)",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run evaluation on test dataset after training",
    )
    parser.add_argument(
        "--eval-only", action="store_true", help="Only run evaluation (skip training)"
    )

    args = parser.parse_args()

    # Set random seed for reproducibility
    set_random_seed(42)

    # Initialize trainer
    trainer = Type4Trainer(sample_size=args.sample_size)

    if args.eval_only:
        # Evaluation only
        trainer.evaluate()
    else:
        # Train model
        metrics = trainer.train(dataset_file=args.dataset)

        print("\n" + "=" * 60)
        print("Training Complete")
        print("=" * 60)
        print(f"F1 Score:      {metrics['f1']:.4f}")
        print(f"Precision:     {metrics['precision']:.4f}")
        print(f"Recall:        {metrics['recall']:.4f}")
        print(f"CV F1 (mean):  {metrics.get('cv_f1_mean', 0):.4f}")
        print(f"Training Time: {metrics['training_time']:.2f}s")
        print("=" * 60)

        # Optional evaluation
        if args.test:
            print("\nRunning evaluation on test set...")
            eval_metrics = trainer.evaluate()

    return 0


if __name__ == "__main__":
    sys.exit(main())
