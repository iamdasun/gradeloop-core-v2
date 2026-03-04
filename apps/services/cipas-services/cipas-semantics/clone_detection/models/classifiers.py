"""
Classification Models for Semantic Clone Detection.

This module implements:
- XGBoost classifier for semantic similarity (Type-4 clones)
- Feature pruning to remove low-importance features
- Isotonic probability calibration for meaningful outputs
- Probability threshold calibration for optimal decision boundary
- Macro-F1 optimized threshold selection for non-clone detection
"""

import json
import pickle
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.calibration import CalibratedClassifierCV
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
    - Feature pruning: Drops bottom 20% of features based on importance
    - Isotonic calibration: Wraps XGBoost for statistically meaningful probabilities
    - Macro-F1 optimized threshold selection for non-clone detection
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
        feature_pruning: bool = True,
        feature_pruning_percentile: float = 0.20,
        isotonic_calibration: bool = True,
        calibration_cv_folds: int = 5,
    ):
        """
        Initialize the XGBoost classifier with calibration and pruning.

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
            feature_pruning: Enable feature pruning (drop bottom 20% importance)
            feature_pruning_percentile: Percentile of features to prune (default: 0.20)
            isotonic_calibration: Enable isotonic probability calibration
            calibration_cv_folds: Number of CV folds for calibration (default: 5)
        """
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.n_estimators = n_estimators
        self.min_child_weight = min_child_weight
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.reg_alpha = reg_alpha
        self.reg_lambda = reg_lambda
        self.random_state = random_state
        self.feature_pruning = feature_pruning
        self.feature_pruning_percentile = feature_pruning_percentile
        self.isotonic_calibration = isotonic_calibration
        self.calibration_cv_folds = calibration_cv_folds

        # Base XGBoost model
        self.base_model = xgb.XGBClassifier(
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

        # Model (may be wrapped in CalibratedClassifierCV)
        self.model = self.base_model

        self.is_trained = False
        self.feature_names: List[str] = []  # Set during training
        self.decision_threshold = decision_threshold
        self.threshold_history: Dict[str, float] = {}  # Threshold calibration history

        # Feature pruning state
        self.pruned_feature_indices: Optional[np.ndarray] = None
        self.original_feature_count: int = 0
        self.pruned_feature_count: int = 0

        # Calibration state
        self.is_calibrated = False

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_names: Optional[List[str]] = None,
        test_size: float = 0.2,
        cross_validation: bool = True,
        calibrate_threshold: bool = True,
        apply_feature_pruning: Optional[bool] = None,
        apply_isotonic_calibration: Optional[bool] = None,
    ) -> dict:
        """
        Train the XGBoost classifier with feature pruning and isotonic calibration.

        Args:
            X: Feature matrix of shape (n_samples, n_features)
            y: Labels array of shape (n_samples,)
            feature_names: Optional list of feature names
            test_size: Fraction of data to use for testing
            cross_validation: Whether to perform cross-validation
            calibrate_threshold: Whether to calibrate decision threshold after training
            apply_feature_pruning: Override default feature pruning setting
            apply_isotonic_calibration: Override default isotonic calibration setting

        Returns:
            Dictionary with training metrics
        """
        # Determine settings
        do_pruning = (
            apply_feature_pruning
            if apply_feature_pruning is not None
            else self.feature_pruning
        )
        do_calibration = (
            apply_isotonic_calibration
            if apply_isotonic_calibration is not None
            else self.isotonic_calibration
        )

        logger.info(f"Training with {X.shape[0]} samples, {X.shape[1]} features")
        logger.info(
            f"Feature pruning: {do_pruning}, Isotonic calibration: {do_calibration}"
        )

        # Store original feature count
        self.original_feature_count = X.shape[1]

        # Step 1: Feature Pruning (drop bottom 20% importance)
        if do_pruning:
            logger.info("Performing feature pruning...")
            X, pruned_indices = self._prune_features(X, y, test_size)
            self.pruned_feature_indices = pruned_indices
            self.pruned_feature_count = X.shape[1]
            logger.info(
                f"Features after pruning: {self.pruned_feature_count} (removed {self.original_feature_count - self.pruned_feature_count})"
            )
        else:
            self.pruned_feature_count = X.shape[1]

        # Step 2: Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Step 3: Train base model
        logger.info(f"Training XGBoost with {X_train.shape[0]} samples...")
        eval_set = [(X_test, y_test)]

        self.base_model.fit(
            X_train,
            y_train,
            eval_set=eval_set,
            verbose=False,
        )

        # Store feature names (pruned)
        if feature_names:
            if do_pruning and self.pruned_feature_indices is not None:
                self.feature_names = [
                    feature_names[i] for i in self.pruned_feature_indices
                ]
            else:
                self.feature_names = feature_names

        # Step 4: Isotonic Calibration
        if do_calibration:
            logger.info("Applying isotonic probability calibration...")
            self.model = CalibratedClassifierCV(
                self.base_model,
                method="isotonic",
                cv=self.calibration_cv_folds,
            )
            self.model.fit(X_train, y_train)
            self.is_calibrated = True
            logger.info("Isotonic calibration applied")
        else:
            self.model = self.base_model
            self.is_calibrated = False

        self.is_trained = True

        # Step 5: Evaluate on test set
        y_pred_default = self.model.predict(X_test)
        y_proba_default = self.model.predict_proba(X_test)[:, 1]

        metrics = {
            "accuracy": accuracy_score(y_test, y_pred_default),
            "precision": precision_score(y_test, y_pred_default, zero_division=0),
            "recall": recall_score(y_test, y_pred_default, zero_division=0),
            "f1": f1_score(y_test, y_pred_default, zero_division=0),
            "roc_auc": roc_auc_score(y_test, y_proba_default),
            "feature_pruning_applied": do_pruning,
            "isotonic_calibration_applied": do_calibration,
            "original_features": self.original_feature_count,
            "pruned_features": self.pruned_feature_count,
        }

        # Cross-validation (on base model before calibration)
        if cross_validation and not do_calibration:
            cv_scores = cross_val_score(self.base_model, X, y, cv=5, scoring="f1")
            metrics["cv_f1_mean"] = cv_scores.mean()
            metrics["cv_f1_std"] = cv_scores.std()
            logger.info(
                f"Cross-validation F1: {metrics['cv_f1_mean']:.4f} (+/- {metrics['cv_f1_std']:.4f})"
            )

        # Step 6: Threshold calibration (optimize for Macro-F1)
        if calibrate_threshold:
            logger.info("Calibrating decision threshold for Macro-F1...")
            optimal_threshold = self.find_optimal_threshold(
                X_test, y_test, metric="f1_macro"
            )

            if optimal_threshold:
                self.decision_threshold = optimal_threshold
                metrics["optimal_threshold"] = optimal_threshold

                # Re-evaluate with optimal threshold
                y_pred_optimal = self.predict(X_test)
                metrics["accuracy_thresholded"] = accuracy_score(y_test, y_pred_optimal)
                metrics["precision_thresholded"] = precision_score(
                    y_test, y_pred_optimal, zero_division=0
                )
                metrics["recall_thresholded"] = recall_score(
                    y_test, y_pred_optimal, zero_division=0
                )
                metrics["f1_thresholded"] = f1_score(
                    y_test, y_pred_optimal, zero_division=0
                )

                # Macro-F1 (average of F1 for each class)
                f1_class0 = f1_score(y_test, y_pred_optimal, pos_label=0)
                f1_class1 = f1_score(y_test, y_pred_optimal, pos_label=1)
                metrics["macro_f1_thresholded"] = (f1_class0 + f1_class1) / 2

                logger.info(
                    f"Optimal threshold: {optimal_threshold:.3f} (Macro-F1: {metrics.get('macro_f1_thresholded', 0):.4f})"
                )

        logger.info(f"Test set metrics: {metrics}")

        return metrics

    def _prune_features(
        self,
        X: np.ndarray,
        y: np.ndarray,
        test_size: float = 0.2,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prune the bottom 20% of features based on feature importance.

        This reduces noise from rare CST nodes and improves model generalization.

        Args:
            X: Feature matrix
            y: Labels array
            test_size: Fraction of data for test split (used for importance estimation)

        Returns:
            Tuple of (X_pruned, pruned_feature_indices)
        """
        # Split for importance estimation
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=y
        )

        # Train a temporary model to get feature importances
        temp_model = xgb.XGBClassifier(
            max_depth=self.max_depth,
            learning_rate=self.learning_rate,
            n_estimators=self.n_estimators,
            random_state=self.random_state,
            n_jobs=-1,
            eval_metric="logloss",
        )

        temp_model.fit(X_train, y_train, verbose=False)

        # Get feature importances
        importances = temp_model.feature_importances_

        # Calculate the percentile threshold
        n_features = len(importances)
        n_prune = int(n_features * self.feature_pruning_percentile)

        # Get indices of features to keep (top 80%)
        n_keep = n_features - n_prune
        keep_indices = np.argsort(importances)[-n_keep:]
        keep_indices = np.sort(keep_indices)  # Sort to maintain original order

        logger.info(
            f"Pruning {n_prune} features ({self.feature_pruning_percentile * 100:.0f}%). "
            f"Keeping {n_keep} features."
        )

        # Prune features
        X_pruned = X[:, keep_indices]

        return X_pruned, keep_indices

    def predict(self, X: np.ndarray, threshold: Optional[float] = None) -> np.ndarray:
        """
        Predict clone labels for feature vectors using calibrated threshold.

        Automatically applies feature pruning if the model was trained with pruning.

        Args:
            X: Feature matrix of shape (n_samples, n_features) - can be original or pruned
            threshold: Optional custom threshold (uses self.decision_threshold if not provided)

        Returns:
            Predicted labels
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        # Apply feature pruning if model was trained with pruning (backward compatible)
        if (
            hasattr(self, "pruned_feature_indices")
            and self.pruned_feature_indices is not None
        ):
            # Check if features need pruning
            if X.shape[1] != self.pruned_feature_count:
                X = X[:, self.pruned_feature_indices]

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

        Automatically applies feature pruning if the model was trained with pruning.

        Args:
            X: Feature matrix of shape (n_samples, n_features) - can be original or pruned

        Returns:
            Probability arrays of shape (n_samples, n_classes)
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained before prediction")

        # Apply feature pruning if model was trained with pruning (backward compatible)
        if (
            hasattr(self, "pruned_feature_indices")
            and self.pruned_feature_indices is not None
        ):
            # Check if features need pruning
            if X.shape[1] != self.pruned_feature_count:
                X = X[:, self.pruned_feature_indices]

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

        Automatically applies feature pruning if the model was trained with pruning.

        Args:
            X: Feature matrix
            y: True labels
            thresholds: Array of thresholds to test (default: 0.1 to 0.9 in 0.05 steps)

        Returns:
            DataFrame with metrics for each threshold
        """
        # Apply feature pruning if needed (backward compatible)
        if (
            hasattr(self, "pruned_feature_indices")
            and self.pruned_feature_indices is not None
        ):
            if X.shape[1] != self.pruned_feature_count:
                X = X[:, self.pruned_feature_indices]

        if thresholds is None:
            thresholds = np.arange(0.1, 0.95, 0.05)

        results = []
        y_proba = self.model.predict_proba(X)[:, 1]

        for thresh in thresholds:
            y_pred = (y_proba >= thresh).astype(int)

            # Skip if all predictions are one class
            if len(np.unique(y_pred)) < 2:
                continue

            # Calculate per-class F1 for Macro-F1
            f1_class0 = f1_score(y, y_pred, pos_label=0, zero_division=0)
            f1_class1 = f1_score(y, y_pred, pos_label=1, zero_division=0)

            results.append(
                {
                    "threshold": thresh,
                    "accuracy": accuracy_score(y, y_pred),
                    "precision": precision_score(y, y_pred, zero_division=0),
                    "recall": recall_score(y, y_pred, zero_division=0),
                    "f1": f1_score(y, y_pred, zero_division=0),
                    "macro_f1": (f1_class0 + f1_class1) / 2,
                    "f1_class0": f1_class0,
                    "f1_class1": f1_class1,
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

        Automatically applies feature pruning if the model was trained with pruning.

        Args:
            X: Feature matrix
            y: True labels
            metric: Metric to optimize ('f1', 'f1_macro', 'precision', 'recall', 'accuracy')
                   'f1_macro' prioritizes balanced performance on both classes (recommended)
            min_threshold: Minimum threshold to consider
            max_threshold: Maximum threshold to consider

        Returns:
            Optimal threshold value
        """
        # Apply feature pruning if needed (backward compatible)
        if (
            hasattr(self, "pruned_feature_indices")
            and self.pruned_feature_indices is not None
        ):
            if X.shape[1] != self.pruned_feature_count:
                X = X[:, self.pruned_feature_indices]

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

            if metric == "f1_macro":
                # Macro-F1: Average of F1 for each class (prioritizes non-clone detection)
                f1_class0 = f1_score(y, y_pred, pos_label=0, zero_division=0)
                f1_class1 = f1_score(y, y_pred, pos_label=1, zero_division=0)
                score = (f1_class0 + f1_class1) / 2
            elif metric == "f1":
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
