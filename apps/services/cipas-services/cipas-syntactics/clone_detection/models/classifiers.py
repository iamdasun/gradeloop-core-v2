"""
Classification Models for Syntactic Clone Detection.

This module implements:
- XGBoost Clone Detector (Stage 1 of the two-stage Type-3 detection pipeline)
  Trained on Type-1 + Type-2 + Type-3 (strong/moderate/weak) vs NonClone.
  Outputs clone probability used by the Stage 2 Type-3 Filter.
- Model training, evaluation, and persistence utilities.

Pipeline context:
  train.py    — trains this classifier on the full clone spectrum.
  type3_filter.py — Stage 2 filter applied on top of this model’s probabilities.
  evaluate.py — runs both stages end-to-end and measures Type-3 recall.
"""

import json
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
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
        gamma: float = 0.0,
        reg_lambda: float = 1.0,
        eval_metric: str = "logloss",
        random_state: int = 42,
        feature_names: Optional[list[str]] = None,
        use_gpu: bool = False,
        **kwargs,
    ):
        """
        Initialize the XGBoost Clone Detector.

        Args:
            n_estimators:    Number of boosting rounds (trees).
            max_depth:       Maximum depth of each tree.
            learning_rate:   Step size shrinkage (eta).
            min_child_weight: Minimum sum of instance weight in a child.
            subsample:       Subsample ratio of training instances.
            colsample_bytree: Subsample ratio of columns per tree.
            gamma:           Minimum loss reduction required for a leaf split
                             (conservative pruning — use 0.1 for near-miss data).
            reg_lambda:      L2 regularisation on leaf weights (default 1.0).
            eval_metric:     XGBoost evaluation metric ('logloss' or 'auc').
            random_state:    Random seed for reproducibility.
            feature_names:   Optional list of feature names for explainability.
            use_gpu:         Whether to use GPU acceleration.
        """
        self.model = XGBClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            min_child_weight=min_child_weight,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            gamma=gamma,
            reg_lambda=reg_lambda,
            scale_pos_weight=kwargs.get("scale_pos_weight", 1.0),
            random_state=random_state,
            n_jobs=-1,
            tree_method="hist" if not use_gpu else "gpu_hist",
            eval_metric=eval_metric,
        )
        self.is_trained = False
        self.scaler = StandardScaler()
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
        X_train_scaled = self.scaler.fit_transform(X_train)
        self.model.fit(X_train_scaled, y_train)
        self.is_trained = True

        # Evaluate on test set
        X_test_scaled = self.scaler.transform(X_test)
        y_pred = self.model.predict(X_test_scaled)

        metrics = {
            "accuracy": accuracy_score(y_test, y_pred),
            "precision": precision_score(y_test, y_pred, zero_division=0),
            "recall": recall_score(y_test, y_pred, zero_division=0),
            "f1": f1_score(y_test, y_pred, zero_division=0),
        }

        # Cross-validation
        if cross_validation:
            logger.info("Running StratifiedKFold CV...")
            cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            # scale all X for CV to accurately reflect pipeline performance
            X_scaled = self.scaler.transform(X)
            
            # evaluate accuracy
            acc_scores = cross_val_score(self.model, X_scaled, y, cv=cv, scoring="accuracy")
            metrics["cv_accuracy_mean"] = acc_scores.mean()
            metrics["cv_accuracy_std"] = acc_scores.std()

            # evaluate f1
            cv_scores = cross_val_score(self.model, X_scaled, y, cv=cv, scoring="f1")
            metrics["cv_f1_mean"] = cv_scores.mean()
            metrics["cv_f1_std"] = cv_scores.std()
            
            logger.info(
                f"CV Accuracy: {metrics['cv_accuracy_mean']:.4f} (+/- {metrics['cv_accuracy_std']:.4f})"
            )
            logger.info(
                f"CV F1: {metrics['cv_f1_mean']:.4f} (+/- {metrics['cv_f1_std']:.4f})"
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

        X_scaled = self.scaler.transform(X)
        return self.model.predict(X_scaled)

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

        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)

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
        model_dir = model_path.parent
        model_dir.mkdir(parents=True, exist_ok=True)
        
        # Save SyntacticClassifier as a whole (which is the main .pkl)
        import pickle
        with open(model_path, "wb") as f:
            pickle.dump(self, f)

        # Also save independent artifacts requested by the prompt
        scaler_path = model_dir / "scaler.pkl"
        with open(scaler_path, "wb") as f:
            pickle.dump(self.scaler, f)
            
        threshold_path = model_dir / "threshold.json"
        with open(threshold_path, "w") as f:
            json.dump({"threshold": self.calibrated_threshold}, f, indent=2)
            
        feature_list_path = model_dir / "feature_list.json"
        with open(feature_list_path, "w") as f:
            json.dump({"features": self.feature_names}, f, indent=2)

        logger.info(f"Model saved to {model_path}")
        logger.info(f"Side-car artifacts (scaler, threshold, features) saved to {model_dir}/")
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

        import pickle
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
