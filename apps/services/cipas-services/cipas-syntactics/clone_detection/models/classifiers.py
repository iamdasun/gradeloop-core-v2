"""
Classification Models for Syntactic Clone Detection.

This module implements:
- XGBoost classifier for syntactic similarity (Type-1/2/3 clones)
- Model training, evaluation, and persistence utilities
"""

import pickle
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import cross_val_score, train_test_split
from xgboost import XGBClassifier

from ..utils.common_setup import get_model_path, setup_logging

logger = setup_logging(__name__)


class SyntacticClassifier:
    """
    XGBoost classifier for syntactic similarity (Type-1/2/3 clones).

    Achieves high F1 scores (90%+) while being significantly faster
    than neural network approaches (~65x faster than DeepSim).
    XGBoost provides better accuracy through gradient boosting with
    optimized tree structures and regularization.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        min_child_weight: int = 1,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        random_state: int = 42,
        feature_names: Optional[list[str]] = None,
        use_gpu: bool = False,
        **kwargs,
    ):
        """
        Initialize the XGBoost classifier.

        Args:
            n_estimators: Number of boosting rounds (trees)
            max_depth: Maximum depth of each tree
            learning_rate: Step size shrinkage (eta)
            min_child_weight: Minimum sum of instance weight in a child
            subsample: Subsample ratio of training instances
            colsample_bytree: Subsample ratio of columns when constructing each tree
            random_state: Random seed for reproducibility
            feature_names: Optional list of feature names for explainability
            use_gpu: Whether to use GPU acceleration
        """
        self.model = XGBClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            min_child_weight=min_child_weight,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            scale_pos_weight=kwargs.get("scale_pos_weight", 1.0),
            random_state=random_state,
            n_jobs=-1,
            tree_method="hist" if not use_gpu else "gpu_hist",
            eval_metric="logloss",
        )
        self.is_trained = False
        # Calibrated decision threshold (float) set by train.py after the
        # threshold sweep.  Persisted inside the pkl so inference code can
        # apply the same boundary without extra CLI flags.
        self.calibrated_threshold: float | None = None
        self.feature_names = feature_names or [
            "jaccard_similarity",
            "dice_coefficient",
            "levenshtein_distance",
            "levenshtein_ratio",
            "jaro_similarity",
            "jaro_winkler_similarity",
        ]

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
        self.model.fit(X_train, y_train)
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

    def save(self, model_name: str = "type3_rf.pkl") -> Path:
        """
        Save the trained model to disk.

        Args:
            model_name: Name for the model file

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
    def load(cls, model_name: str = "type3_rf.pkl") -> "SyntacticClassifier":
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

    def get_feature_importance(self) -> dict[str, float]:
        """
        Get feature importance scores.

        Returns:
            Dictionary mapping feature names to importance scores
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained to get feature importance")

        importances = self.model.feature_importances_

        return dict(zip(self.feature_names, importances))

    def get_feature_importance_sorted(self) -> list[tuple[str, float]]:
        """
        Get feature importance scores sorted by importance (descending).

        Useful for explainability and feature importance visualization (GRADELOOP-83).

        Returns:
            List of (feature_name, importance) tuples sorted by importance
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained to get feature importance")

        importances = self.model.feature_importances_
        importance_dict = list(zip(self.feature_names, importances))
        return sorted(importance_dict, key=lambda x: x[1], reverse=True)

    def get_feature_importance_dataframe(self):
        """
        Get feature importance as a pandas DataFrame.

        Useful for visualization and reporting (GRADELOOP-83).

        Returns:
            pandas DataFrame with feature names and importance scores
        """
        if not self.is_trained:
            raise RuntimeError("Model must be trained to get feature importance")

        import pandas as pd

        importances = self.model.feature_importances_
        df = pd.DataFrame({"feature": self.feature_names, "importance": importances})
        return df.sort_values("importance", ascending=False)


def create_syntactic_classifier() -> SyntacticClassifier:
    """Create a new syntactic classifier with default parameters."""
    return SyntacticClassifier()
