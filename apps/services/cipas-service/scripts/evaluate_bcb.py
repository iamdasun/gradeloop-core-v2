#!/usr/bin/env python3
"""
BigCloneBench Evaluation Script.

This script evaluates the trained clone detection models on the BigCloneBench (BCB) dataset.
Since BCB only contains clones (no non-clones), we add non-clones from TOMA as negatives.

Usage:
    python evaluate_bcb.py [--sample-size N]
"""

import argparse
import json
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
from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier, SyntacticClassifier
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import (
    detect_language,
    get_bigclonebench_dir,
    load_toma_csv,
    set_random_seed,
    setup_logging,
)

logger = setup_logging("evaluate_bcb")


class BigCloneBenchEvaluator:
    """Evaluator for BigCloneBench dataset."""

    def __init__(self, sample_size: int = 500):
        self.sample_size = sample_size
        self.tokenizer = TreeSitterTokenizer()
        self.syntactic_extractor = SyntacticFeatureExtractor()
        self.semantic_extractor = SemanticFeatureExtractor(tokenizer=self.tokenizer)
        self.type3_model = None
        self.type4_model = None

        # Path to the balanced dataset
        self.bcb_balanced_path = Path(
            "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/bigclonebench/"
            "bigclonebench_balanced.json"
        )

        # Benchmark results for comparison
        self.benchmarks = {
            "SourcererCC": {"precision": 0.87, "recall": 0.73, "f1": 0.79},
            "ASTNN": {"precision": 0.91, "recall": 0.85, "f1": 0.88},
        }

    def load_bcb_data(self) -> list:
        """Load code pairs from BigCloneBench Balanced JSON."""
        if not self.bcb_balanced_path.exists():
            raise FileNotFoundError(f"Balanced BCB file not found: {self.bcb_balanced_path}")

        logger.info(f"Loading BigCloneBench Balanced from {self.bcb_balanced_path} …")
        with open(self.bcb_balanced_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def load_models(self):
        """Load trained models (XGBoost)."""
        logger.info("Loading trained models...")

        # Try to find models in the new microservice structure first, then fallback
        model_paths = [
            Path(__file__).parent.parent.parent / "cipas-services/cipas-syntactics/clone_detection/models",
            Path(__file__).parent.parent / "models"
        ]

        # Type-3
        for path in model_paths:
            m_path = path / "type3_xgb.pkl"
            if m_path.exists():
                self.type3_model = SyntacticClassifier.load(str(m_path))
                logger.info(f"✓ Loaded Type-3 (XGBoost) model from {m_path}")
                break
        
        if not self.type3_model:
            logger.warning("Type-3 model (type3_xgb.pkl) not found.")

        # Type-4
        for path in model_paths:
            m_path = path / "type4_xgb.pkl"
            if m_path.exists():
                self.type4_model = SemanticClassifier.load(str(m_path))
                logger.info(f"✓ Loaded Type-4 (XGBoost) model from {m_path}")
                break

        if not self.type4_model:
            logger.warning("Type-4 model (type4_xgb.pkl) not found.")

    def extract_syntactic_features(
        self, code1: str, code2: str, language: str
    ) -> np.ndarray:
        """Extract syntactic features for a code pair."""
        try:
            tokens1 = self.tokenizer.tokenize(
                code1, language, abstract_identifiers=True
            )
            tokens2 = self.tokenizer.tokenize(
                code2, language, abstract_identifiers=True
            )
            return self.syntactic_extractor.extract_features(tokens1, tokens2)
        except Exception:
            return np.zeros(6)

    def extract_semantic_features(
        self, code1: str, code2: str, language: str
    ) -> np.ndarray:
        """Extract semantic features for a code pair."""
        try:
            features = self.semantic_extractor.extract_fused_features(
                code1, code2, language
            )
            return FeatureFusion.normalize_features(
                features.reshape(1, -1), method="zscore"
            )[0]
        except Exception:
            return np.zeros(self.semantic_extractor.n_fused_features)

    def evaluate_type3(self, n_samples: int = 200) -> dict:
        """
        Evaluate Type-3 detection using BigCloneBench Balanced.
        """
        if self.type3_model is None:
            return {}

        logger.info("=" * 60)
        logger.info("Type-3 Clone Detection Evaluation (BCB Balanced)")
        logger.info("=" * 60)

        # Load balanced data
        records = self.load_bcb_data()
        
        # Filter for Type-3 clones or Non-clones
        clones = [r for r in records if int(r["label"]) == 1 and int(r.get("clone_type", 0)) == 3]
        non_clones = [r for r in records if int(r["label"]) == 0]

        import random
        random.seed(42)
        if len(clones) > n_samples:
            clones = random.sample(clones, n_samples)
        if len(non_clones) > n_samples:
            non_clones = random.sample(non_clones, n_samples)

        logger.info(f"Evaluating on {len(clones)} Type-3 clones and {len(non_clones)} non-clones")

        # Build evaluation dataset
        features = []
        labels = []

        for record in clones + non_clones:
            code1 = record.get("code1", "").strip()
            code2 = record.get("code2", "").strip()
            if code1 and code2:
                feat = self.extract_syntactic_features(code1, code2, "java")
                features.append(feat)
                labels.append(int(record["label"]))

        if len(features) < 10:
            logger.warning("Not enough valid samples")
            return {}

        X = np.array(features)
        y = np.array(labels)

        # Predict
        y_pred = self.type3_model.predict(X)
        y_proba = self.type3_model.predict_proba(X)

        # Metrics
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
            "precision": precision_score(y, y_pred, zero_division=0),
            "recall": recall_score(y, y_pred, zero_division=0),
            "f1": f1_score(y, y_pred, zero_division=0),
            "auc_roc": roc_auc_score(y, y_proba[:, 1]) if len(np.unique(y)) > 1 else 0.0,
        }
        metrics["confusion_matrix"] = confusion_matrix(y, y_pred).tolist()

        # Print results
        logger.info("\nResults:")
        logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
        logger.info(f"  Precision: {metrics['precision']:.4f}")
        logger.info(f"  Recall:    {metrics['recall']:.4f}")
        logger.info(f"  F1 Score:  {metrics['f1']:.4f}")
        logger.info(f"  AUC-ROC:   {metrics['auc_roc']:.4f}")
        logger.info(f"\nConfusion Matrix:\n{confusion_matrix(y, y_pred)}")

        return metrics

    def evaluate_type4(self, n_samples: int = 200) -> dict:
        """
        Evaluate Type-4 detection using TOMA semantic clones + BCB non-clones.
        """
        if self.type4_model is None:
            return {}

        logger.info("\n" + "=" * 60)
        logger.info("Type-4 Clone Detection Evaluation (TOMA + BCB)")
        logger.info("=" * 60)

        # Load semantic clones from TOMA (balanced BCB doesn't have Type-4)
        logger.info("Loading semantic clones from TOMA dataset...")
        df_semantic = load_toma_csv("type-5.csv")
        df_semantic = df_semantic.sample(n=min(n_samples, len(df_semantic)), random_state=43)

        # Load non-clones from BCB Balanced
        records = self.load_bcb_data()
        non_clones = [r for r in records if int(r["label"]) == 0]
        import random
        random.seed(43)
        if len(non_clones) > n_samples:
            non_clones = random.sample(non_clones, n_samples)

        # Build evaluation dataset
        features = []
        labels = []

        # Process TOMA semantic clones (label=1)
        logger.info(f"Processing {len(df_semantic)} TOMA semantic clones...")
        for _, row in df_semantic.iterrows():
            code1 = load_toma_code(row["id1"])
            code2 = load_toma_code(row["id2"])
            if code1 and code2:
                feat = self.extract_semantic_features(code1, code2, "java")
                features.append(feat)
                labels.append(1)

        # Process BCB non-clones (label=0)
        logger.info(f"Processing {len(non_clones)} BCB non-clones...")
        for record in non_clones:
            code1 = record.get("code1", "").strip()
            code2 = record.get("code2", "").strip()
            if code1 and code2:
                feat = self.extract_semantic_features(code1, code2, "java")
                features.append(feat)
                labels.append(0)

        if len(features) < 10:
            logger.warning("Not enough valid samples")
            return {}

        X = np.array(features)
        y = np.array(labels)

        # Predict
        y_pred = self.type4_model.predict(X)
        y_proba = self.type4_model.predict_proba(X)

        # Metrics
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
            "precision": precision_score(y, y_pred, zero_division=0),
            "recall": recall_score(y, y_pred, zero_division=0),
            "f1": f1_score(y, y_pred, zero_division=0),
            "auc_roc": roc_auc_score(y, y_proba[:, 1]) if len(np.unique(y)) > 1 else 0.0,
        }
        metrics["confusion_matrix"] = confusion_matrix(y, y_pred).tolist()

        # Print results
        logger.info("\nResults:")
        logger.info(f"  Accuracy:  {metrics['accuracy']:.4f}")
        logger.info(f"  Precision: {metrics['precision']:.4f}")
        logger.info(f"  Recall:    {metrics['recall']:.4f}")
        logger.info(f"  F1 Score:  {metrics['f1']:.4f}")
        logger.info(f"  AUC-ROC:   {metrics['auc_roc']:.4f}")
        logger.info(f"\nConfusion Matrix:\n{confusion_matrix(y, y_pred)}")

        return metrics

    def compare_with_benchmarks(self, type3_metrics: dict, type4_metrics: dict):
        """Compare results with benchmark tools."""
        logger.info("\n" + "=" * 70)
        logger.info("Comparison with Benchmark Tools")
        logger.info("=" * 70)

        if type3_metrics:
            logger.info("\nType-3 Clone Detection:")
            logger.info(f"  {'Tool':<20} {'Precision':<12} {'Recall':<12} {'F1':<12}")
            logger.info(f"  {'-' * 20} {'-' * 12} {'-' * 12} {'-' * 12}")
            for tool, bench in self.benchmarks.items():
                logger.info(
                    f"  {tool:<20} {bench['precision']:<12.4f} {bench['recall']:<12.4f} {bench['f1']:<12.4f}"
                )
            logger.info(
                f"  {'Our Model (RF)':<20} {type3_metrics['precision']:<12.4f} {type3_metrics['recall']:<12.4f} {type3_metrics['f1']:<12.4f}"
            )

        if type4_metrics:
            logger.info("\nType-4 Clone Detection:")
            logger.info(
                f"  {'ASTNN':<20} {self.benchmarks['ASTNN']['precision']:<12.4f} {self.benchmarks['ASTNN']['recall']:<12.4f} {self.benchmarks['ASTNN']['f1']:<12.4f}"
            )
            logger.info(
                f"  {'Our Model (XGB)':<20} {type4_metrics['precision']:<12.4f} {type4_metrics['recall']:<12.4f} {type4_metrics['f1']:<12.4f}"
            )


def load_toma_code(code_id: int) -> str:
    """Load source code from TOMA dataset."""
    from clone_detection.utils.common_setup import get_toma_dataset_dir

    source_file = get_toma_dataset_dir() / "id2sourcecode" / f"{code_id}.java"
    if not source_file.exists():
        return ""
    try:
        with open(source_file, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate clone detection on BigCloneBench"
    )
    parser.add_argument(
        "--sample-size", type=int, default=200, help="Number of samples per class"
    )
    parser.add_argument("--quiet", action="store_true", help="Suppress detailed output")
    args = parser.parse_args()

    set_random_seed(42)
    evaluator = BigCloneBenchEvaluator(sample_size=args.sample_size)

    # Load models
    evaluator.load_models()

    start_time = time.time()

    # Evaluate
    type3_metrics = evaluator.evaluate_type3(n_samples=args.sample_size)
    type4_metrics = evaluator.evaluate_type4(n_samples=args.sample_size)

    # Compare with benchmarks
    evaluator.compare_with_benchmarks(type3_metrics, type4_metrics)

    total_time = time.time() - start_time
    logger.info(f"\nTotal evaluation time: {total_time:.2f} seconds")

    # Summary
    print("\n" + "=" * 60)
    print("EVALUATION SUMMARY")
    print("=" * 60)
    if type3_metrics:
        print(f"\nType-3 (Syntactic) on BCB:")
        print(
            f"  F1: {type3_metrics['f1']:.4f} | Precision: {type3_metrics['precision']:.4f} | Recall: {type3_metrics['recall']:.4f}"
        )
    if type4_metrics:
        print(f"\nType-4 (Semantic) on BCB:")
        print(
            f"  F1: {type4_metrics['f1']:.4f} | Precision: {type4_metrics['precision']:.4f} | Recall: {type4_metrics['recall']:.4f}"
        )
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
