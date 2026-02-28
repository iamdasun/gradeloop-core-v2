"""
Evaluation Script for Semantic Clone Detection Model (Type-4).

Evaluates a trained XGBoost classifier on test datasets.
Supports BigCloneBench (JSONL) and TOMA dataset formats.

Usage:
    # Evaluate with BigCloneBench dataset
    poetry run python evaluate_model.py \
        --model models/type4_xgb.pkl \
        --dataset /path/to/bigclonebench/bigclonebench.jsonl \
        --dataset-format bigclonebench \
        --language java \
        --visualize

    # Evaluate with TOMA dataset
    poetry run python evaluate_model.py \
        --model models/type4_xgb.pkl \
        --dataset /path/to/toma-dataset \
        --dataset-format toma \
        --language java \
        --visualize \
        --output-dir ./evaluation_output

    # Evaluate with JSON dataset
    poetry run python evaluate_model.py \
        --model models/type4_xgb.pkl \
        --dataset /path/to/test_dataset.json \
        --dataset-format json \
        --language java
"""

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from tqdm import tqdm

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.utils.common_setup import setup_logging
from clone_detection.utils.metrics_visualization import MetricsVisualizer

logger = setup_logging(__name__)


def load_bigclonebench_dataset(
    dataset_path: str, sample_size: int | None = None
) -> tuple[list[str], list[str], list[int]]:
    """
    Load BigCloneBench dataset from JSONL file.

    BigCloneBench format (JSONL):
    - Each line is a JSON object with: id1, id2, label, clone_type, code1, code2, ...

    Args:
        dataset_path: Path to JSONL file
        sample_size: Optional sample size for evaluation

    Returns:
        Tuple of (code1_list, code2_list, labels)
    """
    code1_list = []
    code2_list = []
    labels = []

    logger.info(f"Loading BigCloneBench dataset from {dataset_path}...")

    with open(dataset_path, "r", encoding="utf-8") as f:
        total_lines = sum(1 for _ in f)

    logger.info(f"Found {total_lines} entries in BigCloneBench")

    with open(dataset_path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if sample_size and i >= sample_size:
                break

            try:
                data = json.loads(line)
                code1 = data.get("code1", "")
                code2 = data.get("code2", "")
                label = data.get("label", 0)

                if code1 and code2:
                    code1_list.append(code1)
                    code2_list.append(code2)
                    labels.append(label)
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse line {i}: {e}")

            if (i + 1) % 1000 == 0:
                logger.info(f"  Processed {i + 1} entries")

    logger.info(f"Loaded {len(code1_list)} code pairs from BigCloneBench")
    return code1_list, code2_list, labels


def load_toma_dataset(
    dataset_dir: str, sample_size: int | None = None
) -> tuple[list[str], list[str], list[int]]:
    """
    Load TOMA dataset from directory structure.

    Args:
        dataset_dir: Path to TOMA dataset directory
        sample_size: Optional sample size for evaluation

    Returns:
        Tuple of (code1_list, code2_list, labels)
    """
    dataset_path = Path(dataset_dir)
    id2code_dir = dataset_path / "id2sourcecode"

    if not id2code_dir.exists():
        raise ValueError(f"id2sourcecode directory not found at {id2code_dir}")

    def load_code_from_id(func_id: str) -> str | None:
        """Load source code from function ID."""
        code_file = id2code_dir / f"{func_id}.java"
        if code_file.exists():
            try:
                with open(code_file, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()
            except Exception:
                return None
        return None

    code1_list = []
    code2_list = []
    labels = []

    # Load clone pairs
    clone_file = dataset_path / "clone.csv"
    if clone_file.exists():
        logger.info(f"Loading clones from {clone_file}...")
        # clone.csv has no header, so we specify column names
        df_clones = pd.read_csv(
            clone_file,
            header=None,
            names=["FUNCTION_ID_ONE", "FUNCTION_ID_TWO", "CLONE_TYPE", "SIM1", "SIM2"],
        )

        total_clones = len(df_clones)
        if sample_size and total_clones > sample_size:
            df_clones = df_clones.sample(n=sample_size, random_state=42)
            total_clones = sample_size

        logger.info(f"Processing {total_clones} clone pairs...")
        processed = 0
        for _, row in df_clones.iterrows():
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))

            code1 = load_code_from_id(id1)
            code2 = load_code_from_id(id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(1)
                processed += 1

        logger.info(f"Loaded {processed} clone pairs with valid code")

    # Load non-clone pairs
    nonclone_file = dataset_path / "nonclone.csv"
    if nonclone_file.exists():
        logger.info(f"Loading non-clones from {nonclone_file}...")
        df_nonclones = pd.read_csv(nonclone_file)

        total_nonclones = len(df_nonclones)
        if sample_size and total_nonclones > sample_size:
            df_nonclones = df_nonclones.sample(n=sample_size, random_state=42)
            total_nonclones = sample_size

        logger.info(f"Processing {total_nonclones} non-clone pairs...")
        processed = 0
        for _, row in df_nonclones.iterrows():
            id1 = str(int(row["FUNCTION_ID_ONE"]))
            id2 = str(int(row["FUNCTION_ID_TWO"]))

            code1 = load_code_from_id(id1)
            code2 = load_code_from_id(id2)

            if code1 and code2:
                code1_list.append(code1)
                code2_list.append(code2)
                labels.append(0)
                processed += 1

        logger.info(f"Loaded {processed} non-clone pairs with valid code")

    return code1_list, code2_list, labels


def load_json_dataset(dataset_path: str) -> tuple[list[str], list[str], list[int]]:
    """Load JSON dataset (same format as training)."""
    with open(dataset_path, "r") as f:
        data = json.load(f)

    code1_list = [item["code1"] for item in data]
    code2_list = [item["code2"] for item in data]
    labels = [item["label"] for item in data]

    return code1_list, code2_list, labels


def evaluate_model(
    model_path: str,
    dataset_path: str,
    dataset_format: str = "bigclonebench",
    language: str = "java",
    output_report: bool = True,
    sample_size: int | None = None,
    visualize: bool = True,
    output_dir: Optional[str] = None,
) -> dict:
    """
    Evaluate a trained semantic model.

    Args:
        model_path: Path to trained model (.pkl file)
        dataset_path: Path to test dataset
        dataset_format: Dataset format ('bigclonebench', 'toma', or 'json')
        language: Programming language
        output_report: Whether to print detailed report
        sample_size: Optional sample size for evaluation
        visualize: Whether to generate visualization reports
        output_dir: Directory for visualization output

    Returns:
        Evaluation metrics dictionary
    """
    logger.info(f"Loading model from {model_path}...")
    model = SemanticClassifier.load(Path(model_path).name)

    logger.info(f"Loading test dataset from {dataset_path}...")

    if dataset_format == "bigclonebench":
        code1_list, code2_list, labels = load_bigclonebench_dataset(
            dataset_path, sample_size=sample_size
        )
    elif dataset_format == "toma":
        code1_list, code2_list, labels = load_toma_dataset(
            dataset_path, sample_size=sample_size
        )
    elif dataset_format == "json":
        code1_list, code2_list, labels = load_json_dataset(dataset_path)
    else:
        raise ValueError(f"Unknown dataset format: {dataset_format}")

    logger.info(f"Extracting features for {len(code1_list)} pairs...")
    extractor = SheneamerFeatureExtractor()
    features = []

    for code1, code2 in tqdm(
        zip(code1_list, code2_list), total=len(code1_list), desc="Extracting features"
    ):
        try:
            fused = extractor.extract_fused_features(code1, code2, language)
            features.append(fused)
        except Exception as e:
            logger.warning(f"Feature extraction failed: {e}")
            features.append(np.zeros(extractor.n_fused_features))

    X_test = np.array(features)
    y_test = np.array(labels)

    logger.info("Making predictions...")
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    # Calculate metrics
    metrics = {
        "accuracy": accuracy_score(y_test, y_pred),
        "precision": precision_score(y_test, y_pred, zero_division=0),
        "recall": recall_score(y_test, y_pred, zero_division=0),
        "f1": f1_score(y_test, y_pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, y_proba),
    }

    if output_report:
        logger.info("\n" + "=" * 60)
        logger.info("EVALUATION REPORT")
        logger.info("=" * 60)
        logger.info(f"Dataset: {dataset_path}")
        logger.info(f"Format: {dataset_format}")
        logger.info(f"Total pairs: {len(y_test)}")
        logger.info(
            f"Class distribution: {sum(y_test)} clones, {len(y_test) - sum(y_test)} non-clones"
        )
        logger.info("\n" + "-" * 60)
        logger.info(f"Accuracy:  {metrics['accuracy']:.4f}")
        logger.info(f"Precision: {metrics['precision']:.4f}")
        logger.info(f"Recall:    {metrics['recall']:.4f}")
        logger.info(f"F1 Score:  {metrics['f1']:.4f}")
        logger.info(f"ROC AUC:   {metrics['roc_auc']:.4f}")
        logger.info("\nClassification Report:")
        logger.info(
            classification_report(y_test, y_pred, target_names=["Non-Clone", "Clone"])
        )
        logger.info("\nConfusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        logger.info(cm)

        # Feature importance
        logger.info("\nTop 10 Feature Importances:")
        importance = model.get_feature_importance(top_n=10)
        for name, score in importance:
            logger.info(f"  {name}: {score:.4f}")

    # Generate visualizations
    if visualize:
        logger.info("\nGenerating evaluation visualizations...")
        visualizer = MetricsVisualizer(output_dir=output_dir)

        # Load feature names
        feature_names = extractor.get_feature_names(fused=True)

        # Create complete report
        extra_info = {
            "dataset": dataset_path,
            "dataset_format": dataset_format,
            "language": language,
            "model_path": model_path,
            "total_samples": len(y_test),
            "feature_count": X_test.shape[1],
        }

        report_files = visualizer.create_complete_report(
            y_true=y_test,
            y_pred=y_pred,
            y_scores=y_proba,
            metrics=metrics,
            feature_names=feature_names,
            importances=model.model.feature_importances_,
            extra_info=extra_info,
            report_name=f"evaluation_report_{Path(dataset_path).stem}.html",
        )

        logger.info(f"Visualizations saved to: {report_files['html_report']}")
        metrics["visualization_path"] = str(report_files["html_report"])

    return metrics


if __name__ == "__main__":
    import argparse
    from typing import Optional

    parser = argparse.ArgumentParser(
        description="Evaluate semantic clone detection model"
    )
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help="Path to trained model (.pkl file)",
    )
    parser.add_argument(
        "--dataset",
        type=str,
        required=True,
        help="Path to test dataset",
    )
    parser.add_argument(
        "--dataset-format",
        type=str,
        default="bigclonebench",
        choices=["bigclonebench", "toma", "json"],
        help="Dataset format",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="java",
        choices=["java", "c", "python", "csharp"],
        help="Programming language",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=None,
        help="Sample size for evaluation (optional)",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Disable detailed report output",
    )
    parser.add_argument(
        "--visualize",
        action="store_true",
        default=True,
        help="Generate visualization reports after evaluation",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Directory for visualization output (default: ./metrics_output)",
    )

    args = parser.parse_args()

    evaluate_model(
        model_path=args.model,
        dataset_path=args.dataset,
        dataset_format=args.dataset_format,
        language=args.language,
        output_report=not args.no_report,
        sample_size=args.sample_size,
        visualize=args.visualize,
        output_dir=args.output_dir,
    )
