"""
Classification Models for Semantic Clone Detection.

This module implements:
- XGBoost classifier for semantic similarity (Type-4 clones)
- Model training, evaluation, and persistence utilities
"""

import pickle
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import xgboost as xgb
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import cross_val_score, train_test_split

from ..utils.common_setup import get_model_path, setup_logging

logger = setup_logging(__name__)


class SemanticClassifier:
    """
    XGBoost classifier for semantic similarity (Type-4 clones).

    XGBoost provides superior semantic detection with regularization
    to prevent overfitting. Optimized for high-dimensional feature spaces.
    """

    def __init__(
        self,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        n_estimators: int = 100,
        min_child_weight: int = 1,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        reg_alpha: float = 0.1,
        reg_lambda: float = 1.0,
        random_state: int = 42,
    ):
        """
        Initialize the XGBoost classifier.

        Args:
            max_depth: Maximum depth of each tree
            learning_rate: Step size shrinkage (eta)
            n_estimators: Number of boosting rounds
            min_child_weight: Minimum sum of instance weight in a child
            subsample: Subsample ratio of training instances
            colsample_bytree: Subsample ratio of columns when constructing each tree
            reg_alpha: L1 regularization term (alpha)
            reg_lambda: L2 regularization term (lambda)
            random_state: Random seed for reproducibility
        """
        self.model = xgb.XGBClassifier(
            max_depth=max_depth,
            learning_rate=learning_rate,
            n_estimators=n_estimators,
            min_child_weight=min_child_weight,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            reg_alpha=reg_alpha,
            reg_lambda=reg_lambda,
            random_state=random_state,
            n_jobs=-1,
            eval_metric="logloss",
        )
        self.is_trained = False
        self.feature_names: List[str] = []  # Set during training

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        test_size: float = 0.2,
        cross_validation: bool = True,
    ) -> dict:
        """
        Train the XGBoost classifier.

        Args:
            X: Feature matrix of shape (n_samples, n_features)
            y: Labels array of shape (n_samples,)
            test_size: Fraction of data to use for testing
            cross_validation: Whether to perform cross-validation

        Returns:
            Dictionary with training metrics
        """
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Train model
        logger.info(f"Training XGBoost with {X_train.shape[0]} samples...")

        eval_set = [(X_test, y_test)]

        # XGBoost 2.x: train without early stopping for compatibility
        self.model.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=False,
        )

        self.is_trained = True

        # Evaluate on test set
        y_pred = self.model.predict(X_test)

        metrics = {
            "accuracy": accuracy_score(y_test, y_pred),
            "precision": precision_score(y_test, y_pred),
            "recall": recall_score(y_test, y_pred),
            "f1": f1_score(y_test, y_pred),
        }

        # Cross-validation
        if cross_validation:
            cv_scores = cross_val_score(self.model, X, y, cv=5, scoring="f1")
            metrics["cv_f1_mean"] = cv_scores.mean()
            metrics["cv_f1_std"] = cv_scores.std()
            logger.info(
                f"Cross-validation F1: {metrics['cv_f1_mean']:.4f} (+/- {metrics['cv_f1_std']:.4f})"
            )

        logger.info(f"Test set metrics: {metrics}")

        return metrics

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predict clone labels for feature vectors.

        Args:
            X: Feature matrix of shape (n_samples, n_features)

        Returns:
            Predicted labels
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        return self.model.predict(X)

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """
        Predict clone probabilities.

        Args:
            X: Feature matrix of shape (n_samples, n_features)

        Returns:
            Probability arrays of shape (n_samples, n_classes)
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        return self.model.predict_proba(X)

    def save(self, model_name: str = "type4_xgb.pkl") -> Path:
        """
        Save the trained model to disk.

        Args:
            model_name: Name of the model file

        Returns:
            Path to the saved model
        """
        if not self.is_trained:
            raise RuntimeError("Cannot save untrained model")

        model_path = get_model_path(model_name)

        with open(model_path, "wb") as f:
            pickle.dump(self, f)

        logger.info(f"Model saved to {model_path}")
        return model_path

    @classmethod
    def load(cls, model_name: str = "type4_xgb.pkl") -> "SemanticClassifier":
        """
        Load a trained model from disk.

        Args:
            model_name: Name of the model file

        Returns:
            Loaded classifier instance
        """
        model_path = get_model_path(model_name)

        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        with open(model_path, "rb") as f:
            model = pickle.load(f)

        logger.info(f"Model loaded from {model_path}")
        return model

    def get_feature_importance(self, top_n: int = 20) -> list[tuple[str, float]]:
        """
        Get top feature importance scores.

        Args:
            top_n: Number of top features to return

        Returns:
            List of (feature_name, importance) tuples
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained to get feature importance")

        importances = self.model.feature_importances_

        # Get indices of sorted importances
        sorted_indices = np.argsort(importances)[::-1][:top_n]

        # Use feature names if available
        if self.feature_names and len(self.feature_names) == len(importances):
            return [(self.feature_names[i], importances[i]) for i in sorted_indices]
        else:
            return [(f"feature_{i}", importances[i]) for i in sorted_indices]


def create_semantic_classifier() -> SemanticClassifier:
    """Create a new semantic classifier with default parameters."""
    return SemanticClassifier()
