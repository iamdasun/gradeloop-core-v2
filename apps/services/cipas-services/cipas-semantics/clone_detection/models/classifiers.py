"""
Classification Models for Semantic Clone Detection.

This module implements:
- XGBoost classifier for semantic similarity (Type-4 clones)
- Model training, evaluation, and persistence utilities
- Probability threshold calibration for optimal decision boundary
"""

import json
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import cross_val_score, train_test_split

from ..utils.common_setup import get_model_path, setup_logging

logger = setup_logging(__name__)


class SemanticClassifier:
    """
    XGBoost classifier for semantic similarity (Type-4 clones).

    XGBoost provides superior semantic detection with regularization
    to prevent overfitting. Optimized for high-dimensional feature spaces.

    Features:
    - Standard XGBoost classification
    - Probability threshold calibration for optimal F1
    - Threshold sweep analysis for custom operating points
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
        decision_threshold: float = 0.5,
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
            decision_threshold: Probability threshold for classification (default: 0.5)
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
        self.decision_threshold = decision_threshold
        self.threshold_history: Dict[str, float] = {}  # Threshold calibration history

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        test_size: float = 0.2,
        cross_validation: bool = True,
        calibrate_threshold: bool = True,
    ) -> dict:
        """
        Train the XGBoost classifier.

        Args:
            X: Feature matrix of shape (n_samples, n_features)
            y: Labels array of shape (n_samples,)
            test_size: Fraction of data to use for testing
            cross_validation: Whether to perform cross-validation
            calibrate_threshold: Whether to calibrate decision threshold after training

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

        # Evaluate on test set with default threshold
        y_pred_default = self.model.predict(X_test)

        metrics = {
            "accuracy": accuracy_score(y_test, y_pred_default),
            "precision": precision_score(y_test, y_pred_default),
            "recall": recall_score(y_test, y_pred_default),
            "f1": f1_score(y_test, y_pred_default),
        }

        # Cross-validation
        if cross_validation:
            cv_scores = cross_val_score(self.model, X, y, cv=5, scoring="f1")
            metrics["cv_f1_mean"] = cv_scores.mean()
            metrics["cv_f1_std"] = cv_scores.std()
            logger.info(
                f"Cross-validation F1: {metrics['cv_f1_mean']:.4f} (+/- {metrics['cv_f1_std']:.4f})"
            )

        # Threshold calibration
        if calibrate_threshold:
            logger.info("Calibrating decision threshold...")
            threshold_results = self.threshold_sweep(X_test, y_test)
            optimal_threshold = self.find_optimal_threshold(X_test, y_test, metric="f1")

            if optimal_threshold:
                self.decision_threshold = optimal_threshold
                metrics["optimal_threshold"] = optimal_threshold

                # Re-evaluate with optimal threshold
                y_pred_optimal = self.predict(X_test)
                metrics["accuracy_thresholded"] = accuracy_score(y_test, y_pred_optimal)
                metrics["precision_thresholded"] = precision_score(
                    y_test, y_pred_optimal
                )
                metrics["recall_thresholded"] = recall_score(y_test, y_pred_optimal)
                metrics["f1_thresholded"] = f1_score(y_test, y_pred_optimal)

                logger.info(
                    f"Optimal threshold: {optimal_threshold:.3f} (F1: {metrics['f1_thresholded']:.4f})"
                )

        logger.info(f"Test set metrics: {metrics}")

        return metrics

    def predict(self, X: np.ndarray, threshold: Optional[float] = None) -> np.ndarray:
        """
        Predict clone labels for feature vectors using calibrated threshold.

        Args:
            X: Feature matrix of shape (n_samples, n_features)
            threshold: Optional custom threshold (uses self.decision_threshold if not provided)

        Returns:
            Predicted labels
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        # Use custom threshold or calibrated threshold
        thresh = threshold if threshold is not None else self.decision_threshold

        # Get probabilities
        y_proba = self.model.predict_proba(X)[:, 1]

        # Apply threshold
        y_pred = (y_proba >= thresh).astype(int)

        return y_pred

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

    def threshold_sweep(
        self,
        X: np.ndarray,
        y: np.ndarray,
        thresholds: Optional[np.ndarray] = None,
    ) -> pd.DataFrame:
        """
        Perform a threshold sweep to analyze model performance at different thresholds.

        Args:
            X: Feature matrix
            y: True labels
            thresholds: Array of thresholds to test (default: 0.1 to 0.9 in 0.05 steps)

        Returns:
            DataFrame with metrics for each threshold
        """
        if thresholds is None:
            thresholds = np.arange(0.1, 0.95, 0.05)

        results = []
        y_proba = self.model.predict_proba(X)[:, 1]

        for thresh in thresholds:
            y_pred = (y_proba >= thresh).astype(int)

            # Skip if all predictions are one class
            if len(np.unique(y_pred)) < 2:
                continue

            results.append(
                {
                    "threshold": thresh,
                    "accuracy": accuracy_score(y, y_pred),
                    "precision": precision_score(y, y_pred, zero_division=0),
                    "recall": recall_score(y, y_pred, zero_division=0),
                    "f1": f1_score(y, y_pred, zero_division=0),
                    "positive_predictions": np.sum(y_pred),
                    "negative_predictions": np.sum(1 - y_pred),
                }
            )

        results_df = pd.DataFrame(results)
        self.threshold_history = {
            "thresholds": thresholds.tolist(),
            "results": results,
        }

        return results_df

    def find_optimal_threshold(
        self,
        X: np.ndarray,
        y: np.ndarray,
        metric: str = "f1",
        min_threshold: float = 0.1,
        max_threshold: float = 0.9,
    ) -> float:
        """
        Find the optimal decision threshold for a given metric.

        Args:
            X: Feature matrix
            y: True labels
            metric: Metric to optimize ('f1', 'precision', 'recall', 'accuracy')
            min_threshold: Minimum threshold to consider
            max_threshold: Maximum threshold to consider

        Returns:
            Optimal threshold value
        """
        y_proba = self.model.predict_proba(X)[:, 1]

        # Try many threshold values for fine-grained optimization
        thresholds = np.arange(min_threshold, max_threshold, 0.01)

        best_threshold = 0.5
        best_score = 0.0

        for thresh in thresholds:
            y_pred = (y_proba >= thresh).astype(int)

            # Skip if all predictions are one class
            if len(np.unique(y_pred)) < 2:
                continue

            if metric == "f1":
                score = f1_score(y, y_pred, zero_division=0)
            elif metric == "precision":
                score = precision_score(y, y_pred, zero_division=0)
            elif metric == "recall":
                score = recall_score(y, y_pred, zero_division=0)
            elif metric == "accuracy":
                score = accuracy_score(y, y_pred)
            else:
                raise ValueError(f"Unknown metric: {metric}")

            if score > best_score:
                best_score = score
                best_threshold = thresh

        logger.info(
            f"Optimal threshold for {metric}: {best_threshold:.3f} (score: {best_score:.4f})"
        )
        return best_threshold

    def set_threshold(self, threshold: float) -> None:
        """
        Manually set the decision threshold.

        Args:
            threshold: New threshold value (0.0 to 1.0)
        """
        if not 0.0 <= threshold <= 1.0:
            raise ValueError("Threshold must be between 0.0 and 1.0")
        self.decision_threshold = threshold
        logger.info(f"Decision threshold set to {threshold:.3f}")

    def get_threshold(self) -> float:
        """Get the current decision threshold."""
        return self.decision_threshold


def create_semantic_classifier() -> SemanticClassifier:
    """Create a new semantic classifier with default parameters."""
    return SemanticClassifier()
