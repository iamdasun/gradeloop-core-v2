#!/usr/bin/env python3
"""
Training and Evaluation Script for Type-1/2/3 Clone Detection Model.

This script trains and evaluates the Random Forest classifier for detecting
Type-1 (exact), Type-2 (renamed), and Type-3 (modified) clones using syntactic
similarity features (Pipeline A).

TOMA Dataset Structure:
- type-1.csv: Type-1 clones (exact)
- type-2.csv: Type-2 clones (renamed)
- type-3.csv: Strong Type-3 clones (modified, high similarity)
- type-4.csv: Moderate Type-3 clones (modified, lower similarity)
- type-5.csv: Type-4 clones (semantic) - used for Type-4 training
- nonclone.csv: Non-clone pairs (negatives)

By default, combines Type-1, Type-2, Type-3 (strong+moderate) with non-clones.

Usage:
    python train_type3.py [--dataset PATH] [--output-dir DIR] [--test]
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import (
    CloneType,
    get_model_path,
    get_toma_dataset_dir,
    load_source_code,
    load_source_code_batch,
    load_toma_csv,
    set_random_seed,
    setup_logging,
)

logger = setup_logging("train_type3")


class Type3Trainer:
    """
    Trainer for Type-1/2/3 clone detection model.

    Uses Pipeline A (syntactic features) with Random Forest classifier.
    Trains on combined Type-1, Type-2, and Type-3 data for comprehensive coverage.
    """

    def __init__(self, sample_size: int = 15000):
        """
        Initialize the trainer.

        Args:
            sample_size: Number of samples to use for training (for large datasets)
        """
        self.tokenizer = TreeSitterTokenizer()
        self.feature_extractor = SyntacticFeatureExtractor()
        self.classifier = None
        self.sample_size = sample_size

        # Cache for tokenized code
        self.token_cache = {}

    def prepare_dataset(
        self, dataset_files: list[str] = None, include_non_clones: bool = True
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Prepare training dataset from TOMA CSV files.

        By default, combines Type-1, Type-2, and Type-3 clones with non-clones
        for comprehensive binary classification training.

        Args:
            dataset_files: List of CSV files to combine (default: type-1,2,3)
            include_non_clones: Whether to include non-clone pairs as negatives

        Returns:
            Tuple of (feature_matrix, labels)
        """
        if dataset_files is None:
            # Default: train on Type-1, Type-2, Type-3 (strong + moderate)
            # type-3.csv = Strong Type-3, type-4.csv = Moderate Type-3
            dataset_files = ["type-1.csv", "type-2.csv", "type-3.csv", "type-4.csv"]

        # Load and combine clone datasets
        dfs = []
        for file in dataset_files:
            logger.info(f"Loading dataset: {file}")
            df = load_toma_csv(file)
            logger.info(f"  Loaded {len(df)} samples from {file}")
            dfs.append(df)

        df_clones = pd.concat(dfs, ignore_index=True)
        logger.info(f"Total clone samples: {len(df_clones)}")

        # Add non-clones as negative examples (label=0)
        if include_non_clones:
            logger.info("Loading non-clone samples...")
            df_nonclones = load_toma_csv("nonclone.csv")
            # Ensure label is 0 for non-clones
            df_nonclones["label"] = 0
            logger.info(f"  Loaded {len(df_nonclones)} non-clone samples")

            # Combine clones and non-clones
            df = pd.concat([df_clones, df_nonclones], ignore_index=True)
            logger.info(f"Combined dataset: {len(df)} total samples")
        else:
            df = df_clones

        # Ensure labels are set correctly (clones=1, non-clones=0)
        df.loc[df["label"] != 0, "label"] = 1

        # Sample if dataset is too large
        if len(df) > self.sample_size:
            logger.info(f"Sampling {self.sample_size} samples from {len(df)}")
            df = df.sample(n=self.sample_size, random_state=42)

        # Get unique code IDs
        all_ids = set(df["id1"].unique()) | set(df["id2"].unique())
        logger.info(f"Loading source code for {len(all_ids)} unique code snippets...")

        # Load source code
        code_cache = load_source_code_batch(list(all_ids))
        logger.info(f"Loaded {len(code_cache)} source code files")

        # Tokenize code
        logger.info("Tokenizing code snippets...")
        token_cache = {}
        for code_id, code in code_cache.items():
            try:
                tokens = self.tokenizer.tokenize(
                    code, language="java", abstract_identifiers=True
                )
                token_cache[code_id] = tokens
            except Exception as e:
                logger.warning(f"Failed to tokenize code {code_id}: {e}")
                token_cache[code_id] = []

        # Extract features for each pair
        logger.info("Extracting syntactic features...")
        features = []
        labels = []
        failed = 0

        for idx, row in df.iterrows():
            id1, id2 = row["id1"], row["id2"]
            label = int(row["label"])

            tokens1 = token_cache.get(id1, [])
            tokens2 = token_cache.get(id2, [])

            if not tokens1 or not tokens2:
                failed += 1
                continue

            # Extract features
            feat = self.feature_extractor.extract_features(tokens1, tokens2)
            features.append(feat)
            labels.append(label)

        X = np.array(features)
        y = np.array(labels)

        logger.info(f"Prepared dataset: {X.shape[0]} samples, {X.shape[1]} features")
        logger.info(f"Failed to process: {failed} pairs")
        logger.info(f"Label distribution: {np.bincount(y)} (0=non-clone, 1=clone)")

        return X, y

    def train(
        self,
        dataset_files: list[str] = None,
        include_non_clones: bool = True,
        save_model: bool = True,
    ) -> dict:
        """
        Train the Type-1/2/3 clone detection model.

        Args:
            dataset_files: List of CSV files to train on
            include_non_clones: Whether to include non-clone pairs
            save_model: Whether to save the trained model

        Returns:
            Training metrics dictionary
        """
        start_time = time.time()

        # Prepare dataset
        X, y = self.prepare_dataset(dataset_files, include_non_clones)

        # Initialize and train classifier
        logger.info("Initializing Random Forest classifier...")
        self.classifier = SyntacticClassifier(
            n_estimators=100, max_depth=10, random_state=42
        )

        # Train
        metrics = self.classifier.train(X, y, test_size=0.2, cross_validation=True)

        # Add training time
        metrics["training_time"] = time.time() - start_time
        logger.info(f"Total training time: {metrics['training_time']:.2f} seconds")

        # Feature importance
        if self.classifier.is_trained:
            importance = self.classifier.get_feature_importance()
            logger.info("Feature Importance:")
            for feat, imp in sorted(
                importance.items(), key=lambda x: x[1], reverse=True
            ):
                logger.info(f"  {feat}: {imp:.4f}")

        # Save model
        if save_model:
            model_path = self.classifier.save("type3_rf.pkl")
            logger.info(f"Model saved to {model_path}")

        return metrics

    def evaluate(
        self, test_dataset: str = "type-3.csv", model_name: str = "type3_rf.pkl"
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
        self.classifier = SyntacticClassifier.load(model_name)

        # Prepare test dataset with non-clones for proper AUC-ROC calculation
        # AUC-ROC requires both classes (0 and 1) to be present
        logger.info("Loading test clones and non-clones for balanced evaluation...")
        X, y = self.prepare_dataset(
            [test_dataset],
            include_non_clones=True,  # Add non-clones for proper binary metrics
        )

        # Predict
        logger.info("Making predictions...")
        y_pred = self.classifier.predict(X)
        y_proba = self.classifier.predict_proba(X)

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
        description="Train and evaluate Type-1/2/3 clone detection model"
    )
    parser.add_argument(
        "--datasets",
        type=str,
        nargs="+",
        default=["type-1.csv", "type-2.csv", "type-3.csv", "type-4.csv"],
        help="Dataset CSV files to train on (default: type-1,2,3,4 - strong+moderate Type-3)",
    )
    parser.add_argument(
        "--no-nonclones",
        action="store_true",
        help="Do not include non-clone samples in training",
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
    trainer = Type3Trainer(sample_size=args.sample_size)

    if args.eval_only:
        # Evaluation only
        trainer.evaluate()
    else:
        # Train model
        metrics = trainer.train(
            dataset_files=args.datasets, include_non_clones=not args.no_nonclones
        )

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
