"""
Metrics Visualization Module for Type-IV Code Clone Detector.

This module provides comprehensive visualization capabilities for training
and evaluation metrics, including:
- Confusion matrices
- ROC curves and AUC
- Precision-Recall curves
- Feature importance charts
- Training history plots
- HTML report generation

All visualizations are exported as high-quality PNG/SVG files and
interactive HTML reports.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    RocCurveDisplay,
    auc,
    confusion_matrix,
    precision_recall_curve,
    roc_curve,
)

# Configure matplotlib for non-interactive backend
plt.switch_backend("Agg")

logger = logging.getLogger(__name__)


class MetricsVisualizer:
    """
    Comprehensive metrics visualization for clone detector training and evaluation.

    Generates publication-quality charts and interactive HTML reports.
    """

    # Color palettes
    COLOR_PALETTE = {
        "primary": "#2E86AB",
        "secondary": "#A23B72",
        "success": "#28A745",
        "warning": "#FFC107",
        "danger": "#DC3545",
        "info": "#17A2B8",
        "clone": "#28A745",
        "non_clone": "#DC3545",
    }

    def __init__(self, output_dir: Optional[str] = None):
        """
        Initialize the visualizer.

        Args:
            output_dir: Directory to save visualizations (default: ./metrics_output)
        """
        self.output_dir = Path(output_dir) if output_dir else Path("metrics_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.figures_dir = self.output_dir / "figures"
        self.figures_dir.mkdir(exist_ok=True)
        self.report_dir = self.output_dir / "reports"
        self.report_dir.mkdir(exist_ok=True)

        # Set seaborn style
        sns.set_style("whitegrid")
        sns.set_palette("husl")

        # Store metrics history
        self.metrics_history = []

    def plot_confusion_matrix(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        labels: Optional[list[str]] = None,
        title: str = "Confusion Matrix",
        save_name: str = "confusion_matrix.png",
        normalize: bool = False,
        figsize: tuple[int, int] = (10, 8),
    ) -> Path:
        """
        Plot and save confusion matrix.

        Args:
            y_true: True labels
            y_pred: Predicted labels
            labels: Class labels (default: ['Non-Clone', 'Clone'])
            title: Plot title
            save_name: Output filename
            normalize: Whether to normalize values
            figsize: Figure size

        Returns:
            Path to saved figure
        """
        if labels is None:
            labels = ["Non-Clone", "Clone"]

        fig, ax = plt.subplots(figsize=figsize)

        cm = confusion_matrix(y_true, y_pred)
        if normalize:
            cm = cm.astype("float") / cm.sum(axis=1)[:, np.newaxis]

        disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
        disp.plot(ax=ax, cmap=plt.cm.Blues, values_format=".2f" if normalize else "d")

        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.set_xlabel("Predicted Label", fontsize=12)
        ax.set_ylabel("True Label", fontsize=12)

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"Confusion matrix saved to {save_path}")
        return save_path

    def plot_roc_curve(
        self,
        y_true: np.ndarray,
        y_scores: np.ndarray,
        title: str = "ROC Curve",
        save_name: str = "roc_curve.png",
        figsize: tuple[int, int] = (10, 8),
    ) -> tuple[Path, float]:
        """
        Plot and save ROC curve with AUC score.

        Args:
            y_true: True binary labels
            y_scores: Target scores (probability estimates)
            title: Plot title
            save_name: Output filename
            figsize: Figure size

        Returns:
            Tuple of (save_path, auc_score)
        """
        fig, ax = plt.subplots(figsize=figsize)

        fpr, tpr, thresholds = roc_curve(y_true, y_scores)
        roc_auc = auc(fpr, tpr)

        display = RocCurveDisplay(
            fpr=fpr,
            tpr=tpr,
            roc_auc=roc_auc,
            estimator_name="Type-IV Clone Detector",
        )
        display.plot(ax=ax, color=self.COLOR_PALETTE["primary"])

        # Add diagonal line (random classifier)
        ax.plot(
            [0, 1],
            [0, 1],
            "k--",
            label="Random Classifier (AUC = 0.50)",
            linewidth=2,
            alpha=0.5,
        )

        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.set_xlabel("False Positive Rate", fontsize=12)
        ax.set_ylabel("True Positive Rate", fontsize=12)
        ax.legend(loc="lower right")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.05])

        # Add AUC annotation
        ax.text(
            0.6,
            0.3,
            f"AUC = {roc_auc:.4f}",
            fontsize=16,
            fontweight="bold",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5),
        )

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"ROC curve saved to {save_path} (AUC = {roc_auc:.4f})")
        return save_path, roc_auc

    def plot_precision_recall_curve(
        self,
        y_true: np.ndarray,
        y_scores: np.ndarray,
        title: str = "Precision-Recall Curve",
        save_name: str = "pr_curve.png",
        figsize: tuple[int, int] = (10, 8),
    ) -> tuple[Path, float]:
        """
        Plot and save Precision-Recall curve with average precision.

        Args:
            y_true: True binary labels
            y_scores: Target scores (probability estimates)
            title: Plot title
            save_name: Output filename
            figsize: Figure size

        Returns:
            Tuple of (save_path, average_precision)
        """
        fig, ax = plt.subplots(figsize=figsize)

        precision, recall, thresholds = precision_recall_curve(y_true, y_scores)
        # Calculate area under PR curve
        ap = auc(recall, precision)

        ax.plot(
            recall,
            precision,
            color=self.COLOR_PALETTE["secondary"],
            linewidth=3,
            label=f"Type-IV Detector (AP = {ap:.4f})",
        )

        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.set_xlabel("Recall", fontsize=12)
        ax.set_ylabel("Precision", fontsize=12)
        ax.legend(loc="lower left")
        ax.set_xlim([0.0, 1.0])
        ax.set_ylim([0.0, 1.05])

        # Add baseline (random classifier)
        baseline = y_true.sum() / len(y_true)
        ax.axhline(
            y=baseline,
            color="k",
            linestyle="--",
            label=f"Random Classifier (AP = {baseline:.4f})",
            alpha=0.5,
        )

        ax.text(
            0.6,
            0.3,
            f"AP = {ap:.4f}",
            fontsize=16,
            fontweight="bold",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5),
        )

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"PR curve saved to {save_path} (AP = {ap:.4f})")
        return save_path, ap

    def plot_feature_importance(
        self,
        feature_names: list[str],
        importances: np.ndarray,
        top_n: int = 20,
        title: str = "Top 20 Feature Importances",
        save_name: str = "feature_importance.png",
        figsize: tuple[int, int] = (12, 10),
        orientation: str = "horizontal",
    ) -> Path:
        """
        Plot and save feature importance chart.

        Args:
            feature_names: List of feature names
            importances: Feature importance scores
            top_n: Number of top features to display
            title: Plot title
            save_name: Output filename
            figsize: Figure size
            orientation: 'horizontal' or 'vertical'

        Returns:
            Path to saved figure
        """
        # Get top N features
        indices = np.argsort(importances)[::-1][:top_n]
        top_features = [feature_names[i] for i in indices]
        top_importances = importances[indices]

        fig, ax = plt.subplots(figsize=figsize)

        if orientation == "horizontal":
            # Horizontal bar chart (better for long feature names)
            y_pos = np.arange(len(top_features))
            bars = ax.barh(
                y_pos,
                top_importances,
                color=self.COLOR_PALETTE["primary"],
                alpha=0.8,
            )
            ax.set_yticks(y_pos)
            ax.set_yticklabels(top_features, fontsize=10)
            ax.set_xlabel("Importance Score", fontsize=12)
            ax.invert_yaxis()  # Highest importance at top

            # Add value labels
            for i, (bar, val) in enumerate(zip(bars, top_importances)):
                ax.text(
                    val + max(top_importances) * 0.01,
                    i,
                    f"{val:.4f}",
                    va="center",
                    fontsize=9,
                )
        else:
            # Vertical bar chart
            x_pos = np.arange(len(top_features))
            bars = ax.bar(
                x_pos,
                top_importances,
                color=self.COLOR_PALETTE["primary"],
                alpha=0.8,
            )
            ax.set_xticks(x_pos)
            ax.set_xticklabels(top_features, rotation=45, ha="right", fontsize=9)
            ax.set_ylabel("Importance Score", fontsize=12)

            # Add value labels
            for bar, val in zip(bars, top_importances):
                ax.text(
                    bar.get_x() + bar.get_width() / 2,
                    val + max(top_importances) * 0.01,
                    f"{val:.4f}",
                    ha="center",
                    va="bottom",
                    fontsize=9,
                )

        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.grid(axis="y" if orientation == "horizontal" else "x", alpha=0.3)

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"Feature importance saved to {save_path}")
        return save_path

    def plot_training_history(
        self,
        metrics: dict[str, list[float]],
        title: str = "Training History",
        save_name: str = "training_history.png",
        figsize: tuple[int, int] = (12, 6),
    ) -> Path:
        """
        Plot and save training history (accuracy, loss, etc.).

        Args:
            metrics: Dictionary of metric_name -> [values per epoch]
            title: Plot title
            save_name: Output filename
            figsize: Figure size

        Returns:
            Path to saved figure
        """
        fig, axes = plt.subplots(1, 2, figsize=figsize)

        epochs = range(1, len(next(iter(metrics.values()))) + 1)

        # Plot accuracy metrics
        acc_metrics = {k: v for k, v in metrics.items() if "acc" in k.lower()}
        for name, values in acc_metrics.items():
            axes[0].plot(
                epochs,
                values,
                label=name,
                linewidth=2,
                marker="o",
                markersize=4,
            )
        axes[0].set_xlabel("Epoch", fontsize=12)
        axes[0].set_ylabel("Accuracy", fontsize=12)
        axes[0].set_title("Accuracy Over Training", fontsize=13, fontweight="bold")
        axes[0].legend(loc="lower right")
        axes[0].grid(True, alpha=0.3)

        # Plot loss metrics
        loss_metrics = {k: v for k, v in metrics.items() if "loss" in k.lower()}
        for name, values in loss_metrics.items():
            axes[1].plot(
                epochs,
                values,
                label=name,
                linewidth=2,
                marker="s",
                markersize=4,
            )
        axes[1].set_xlabel("Epoch", fontsize=12)
        axes[1].set_ylabel("Loss", fontsize=12)
        axes[1].set_title("Loss Over Training", fontsize=13, fontweight="bold")
        axes[1].legend(loc="upper right")
        axes[1].grid(True, alpha=0.3)

        fig.suptitle(title, fontsize=14, fontweight="bold", y=1.02)
        plt.tight_layout()

        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"Training history saved to {save_path}")
        return save_path

    def plot_metrics_comparison(
        self,
        metrics_list: list[dict[str, float]],
        labels: list[str],
        title: str = "Metrics Comparison",
        save_name: str = "metrics_comparison.png",
        figsize: tuple[int, int] = (12, 8),
    ) -> Path:
        """
        Compare metrics across multiple runs/models.

        Args:
            metrics_list: List of metrics dictionaries
            labels: Labels for each run/model
            title: Plot title
            save_name: Output filename
            figsize: Figure size

        Returns:
            Path to saved figure
        """
        fig, ax = plt.subplots(figsize=figsize)

        metric_names = ["accuracy", "precision", "recall", "f1"]
        x = np.arange(len(metric_names))
        width = 0.8 / len(metrics_list)

        colors = plt.cm.Set3(np.linspace(0, 1, len(metrics_list)))

        for i, (metrics, label) in enumerate(zip(metrics_list, labels)):
            values = [metrics.get(m, 0) for m in metric_names]
            offset = (i - len(metrics_list) / 2 + 0.5) * width
            ax.bar(
                x + offset,
                values,
                width,
                label=label,
                color=colors[i],
                alpha=0.8,
            )

        ax.set_xlabel("Metric", fontsize=12)
        ax.set_ylabel("Score", fontsize=12)
        ax.set_title(title, fontsize=14, fontweight="bold")
        ax.set_xticks(x)
        ax.set_xticklabels(["Accuracy", "Precision", "Recall", "F1 Score"])
        ax.legend(loc="lower right")
        ax.set_ylim([0, 1.05])
        ax.grid(axis="y", alpha=0.3)

        # Add value labels
        for i, values in enumerate(
            [m.get(mn, 0) for mn in metric_names for m in metrics_list]
        ):
            pass  # Simplified for clarity

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"Metrics comparison saved to {save_path}")
        return save_path

    def plot_feature_distribution(
        self,
        X: np.ndarray,
        feature_names: list[str],
        y: Optional[np.ndarray] = None,
        top_n: int = 10,
        title: str = "Feature Distribution",
        save_name: str = "feature_distribution.png",
        figsize: tuple[int, int] = (14, 10),
    ) -> Path:
        """
        Plot distribution of top features by variance.

        Args:
            X: Feature matrix
            feature_names: List of feature names
            y: Optional labels for coloring
            top_n: Number of top features to show
            title: Plot title
            save_name: Output filename
            figsize: Figure size

        Returns:
            Path to saved figure
        """
        # Calculate variance and get top features
        variances = np.var(X, axis=0)
        top_indices = np.argsort(variances)[::-1][:top_n]

        fig, axes = plt.subplots(
            (top_n + 1) // 2,
            2,
            figsize=figsize,
        )
        axes = axes.flatten()

        for i, idx in enumerate(top_indices):
            if y is not None:
                # Box plot by class
                data = [X[y == 0, idx], X[y == 1, idx]]
                axes[i].boxplot(
                    data,
                    labels=["Non-Clone", "Clone"],
                    patch_artist=True,
                )
                axes[i].set_title(
                    (
                        feature_names[idx][:40] + "..."
                        if len(feature_names[idx]) > 40
                        else feature_names[idx]
                    ),
                    fontsize=10,
                )
            else:
                axes[i].hist(X[:, idx], bins=30, alpha=0.7, edgecolor="black")
                axes[i].set_title(
                    (
                        feature_names[idx][:40] + "..."
                        if len(feature_names[idx]) > 40
                        else feature_names[idx]
                    ),
                    fontsize=10,
                )
                axes[i].set_xlabel("Value")
                axes[i].set_ylabel("Frequency")

        plt.tight_layout()
        save_path = self.figures_dir / save_name
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        plt.close(fig)

        logger.info(f"Feature distribution saved to {save_path}")
        return save_path

    def generate_html_report(
        self,
        metrics: dict[str, Any],
        figures: list[Path],
        report_name: Optional[str] = None,
        extra_info: Optional[dict[str, Any]] = None,
    ) -> Path:
        """
        Generate comprehensive HTML report with metrics and figures.

        Args:
            metrics: Dictionary of all metrics
            figures: List of paths to figure files
            report_name: Output filename (default: timestamp-based)
            extra_info: Additional information to include

        Returns:
            Path to saved HTML report
        """
        if report_name is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            report_name = f"report_{timestamp}.html"

        report_path = self.report_dir / report_name

        # Build HTML content
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Type-IV Clone Detector - Evaluation Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }}
        .container {{
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #2E86AB;
            border-bottom: 3px solid #2E86AB;
            padding-bottom: 10px;
        }}
        h2 {{
            color: #A23B72;
            margin-top: 30px;
        }}
        .metrics-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }}
        .metric-card {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }}
        .metric-value {{
            font-size: 2.5em;
            font-weight: bold;
        }}
        .metric-label {{
            font-size: 0.9em;
            opacity: 0.9;
        }}
        .figure-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 30px;
            margin: 30px 0;
        }}
        .figure-card {{
            background: white;
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }}
        .figure-card img {{
            width: 100%;
            height: auto;
        }}
        .figure-caption {{
            text-align: center;
            color: #666;
            font-size: 0.9em;
            margin-top: 10px;
        }}
        .info-table {{
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }}
        .info-table th, .info-table td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }}
        .info-table th {{
            background-color: #2E86AB;
            color: white;
        }}
        .timestamp {{
            color: #666;
            font-size: 0.9em;
            text-align: right;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Type-IV Code Clone Detector - Evaluation Report</h1>
        <p class="timestamp">Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
"""

        # Add extra info table
        if extra_info:
            html_content += """
        <h2>📋 Experiment Information</h2>
        <table class="info-table">
"""
            for key, value in extra_info.items():
                html_content += f"""            <tr>
                <th>{key.replace("_", " ").title()}</th>
                <td>{value}</td>
            </tr>
"""
            html_content += """        </table>
"""

        # Add metrics cards
        html_content += """
        <h2>📊 Performance Metrics</h2>
        <div class="metrics-grid">
"""

        key_metrics = ["accuracy", "precision", "recall", "f1", "roc_auc"]
        for metric in key_metrics:
            if metric in metrics:
                value = metrics[metric]
                if isinstance(value, (int, float)):
                    display_value = f"{value:.4f}" if value <= 1 else f"{value:.2f}"
                    html_content += f"""
            <div class="metric-card">
                <div class="metric-value">{display_value}</div>
                <div class="metric-label">{metric.replace("_", " ").title()}</div>
            </div>
"""

        html_content += """        </div>
"""

        # Add all metrics table
        html_content += """
        <h2>📈 Detailed Metrics</h2>
        <table class="info-table">
"""
        for key, value in metrics.items():
            if isinstance(value, (int, float)):
                html_content += f"""            <tr>
                <th>{key.replace("_", " ").title()}</th>
                <td>{value:.6f}</td>
            </tr>
"""
        html_content += """        </table>
"""

        # Add figures
        html_content += """
        <h2>📉 Visualizations</h2>
        <div class="figure-grid">
"""

        figure_captions = {
            "confusion_matrix": "Confusion Matrix",
            "roc_curve": "ROC Curve",
            "pr_curve": "Precision-Recall Curve",
            "feature_importance": "Feature Importance",
            "training_history": "Training History",
            "metrics_comparison": "Metrics Comparison",
            "feature_distribution": "Feature Distribution",
        }

        for fig_path in figures:
            if fig_path.exists():
                fig_name = fig_path.stem
                caption = figure_captions.get(
                    fig_name, fig_name.replace("_", " ").title()
                )
                html_content += f"""
            <div class="figure-card">
                <img src="{fig_path.name}" alt="{caption}">
                <div class="figure-caption">{caption}</div>
            </div>
"""

        html_content += """        </div>
    </div>
</body>
</html>
"""

        # Write HTML file
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Copy figures to report directory for HTML access
        report_figures_dir = self.report_dir / "figures"
        report_figures_dir.mkdir(exist_ok=True)
        for fig_path in figures:
            if fig_path.exists():
                dest = report_figures_dir / fig_path.name
                dest.write_bytes(fig_path.read_bytes())

        logger.info(f"HTML report saved to {report_path}")
        return report_path

    def save_metrics_json(
        self,
        metrics: dict[str, Any],
        filename: Optional[str] = None,
    ) -> Path:
        """
        Save metrics to JSON file.

        Args:
            metrics: Metrics dictionary
            filename: Output filename

        Returns:
            Path to saved JSON file
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"metrics_{timestamp}.json"

        json_path = self.output_dir / filename

        # Convert numpy types to Python types
        def convert_types(obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, (np.int64, np.int32)):
                return int(obj)
            elif isinstance(obj, (np.float64, np.float32)):
                return float(obj)
            elif isinstance(obj, dict):
                return {k: convert_types(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_types(i) for i in obj]
            return obj

        metrics_clean = convert_types(metrics)
        metrics_clean["timestamp"] = datetime.now().isoformat()

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(metrics_clean, f, indent=2)

        logger.info(f"Metrics saved to {json_path}")
        return json_path

    def create_complete_report(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_scores: np.ndarray,
        metrics: dict[str, Any],
        feature_names: Optional[list[str]] = None,
        importances: Optional[np.ndarray] = None,
        extra_info: Optional[dict[str, Any]] = None,
        report_name: Optional[str] = None,
    ) -> dict[str, Path]:
        """
        Create a complete evaluation report with all visualizations.

        Args:
            y_true: True labels
            y_pred: Predicted labels
            y_scores: Prediction scores/probabilities
            metrics: Metrics dictionary
            feature_names: Feature names for importance plot
            importances: Feature importances
            extra_info: Additional information
            report_name: Report filename

        Returns:
            Dictionary of saved file paths
        """
        figures = []

        # 1. Confusion Matrix
        cm_path = self.plot_confusion_matrix(
            y_true,
            y_pred,
            title="Confusion Matrix - Type-IV Clone Detection",
            save_name="confusion_matrix.png",
            normalize=False,
        )
        figures.append(cm_path)

        # 2. Normalized Confusion Matrix
        cm_norm_path = self.plot_confusion_matrix(
            y_true,
            y_pred,
            title="Normalized Confusion Matrix",
            save_name="confusion_matrix_normalized.png",
            normalize=True,
        )
        figures.append(cm_norm_path)

        # 3. ROC Curve
        roc_path, _ = self.plot_roc_curve(
            y_true,
            y_scores,
            title="ROC Curve - Type-IV Clone Detection",
            save_name="roc_curve.png",
        )
        figures.append(roc_path)

        # 4. Precision-Recall Curve
        pr_path, _ = self.plot_precision_recall_curve(
            y_true,
            y_scores,
            title="Precision-Recall Curve - Type-IV Clone Detection",
            save_name="pr_curve.png",
        )
        figures.append(pr_path)

        # 5. Feature Importance
        if feature_names is not None and importances is not None:
            fi_path = self.plot_feature_importance(
                feature_names,
                importances,
                top_n=20,
                title="Top 20 Most Important Features",
                save_name="feature_importance.png",
            )
            figures.append(fi_path)

        # 6. Save metrics to JSON
        json_path = self.save_metrics_json(metrics)

        # 7. Generate HTML report
        html_path = self.generate_html_report(
            metrics=metrics,
            figures=figures,
            report_name=report_name,
            extra_info=extra_info,
        )

        saved_files = {
            "html_report": html_path,
            "metrics_json": json_path,
            "figures": figures,
        }

        logger.info(f"Complete report generated: {html_path}")
        return saved_files


def create_visualizer(output_dir: Optional[str] = None) -> MetricsVisualizer:
    """Factory function to create a MetricsVisualizer instance."""
    return MetricsVisualizer(output_dir)
