# CIPAS Results Directory Structure

This document describes the organized output structure for training and evaluation results across both CIPAS services (Semantics and Syntactics).

## Directory Structure

```
cipas-services/
├── cipas-semantics/
│   ├── results/
│   │   ├── train/                          # Training outputs
│   │   │   ├── training_metrics.json       # Comprehensive training metrics
│   │   │   ├── threshold_sweep_results.csv # Threshold analysis
│   │   │   └── visualizations/
│   │   │       ├── confusion_matrix_train.png
│   │   │       ├── feature_importances_train.png
│   │   │       ├── per_source_recall.png
│   │   │       └── threshold_sweep.png
│   │   │
│   │   └── evaluate/                       # Evaluation outputs
│   │       ├── metrics_*.json              # Evaluation metrics per dataset/language
│   │       ├── threshold_sweep_results.csv # Threshold analysis
│   │       └── visualizations/
│   │           ├── confusion_matrix_eval.png
│   │           ├── per_clone_type_recall.png
│   │           ├── feature_importances_eval.png
│   │           └── evaluation_report_*.html
│   │
│   └── models/                             # Trained model files
│       └── type4_xgb_*.pkl
│
└── cipas-syntactics/
    ├── results/
    │   ├── train/                          # Training outputs
    │   │   ├── training_metrics.json       # Comprehensive training metrics
    │   │   └── visualizations/
    │   │       ├── confusion_matrix_train.png
    │   │       ├── feature_importances_train.png
    │   │       ├── per_source_recall.png
    │   │       └── threshold_sweep.png
    │   │
    │   └── evaluate/                       # Evaluation outputs
    │       ├── evaluation_metrics.json     # Overall evaluation metrics
    │       ├── clustering_results.json     # Clustering pipeline metrics
    │       └── visualizations/
    │           ├── confusion_matrix_eval.png
    │           ├── per_clone_type_recall.png
    │           └── feature_importances_eval.png
    │
    └── models/                             # Trained model files
        └── clone_detector_xgb.pkl
```

---

## CIPAS Semantics (Type-IV Clone Detector)

### Training Outputs

**Command:**
```bash
poetry run python train.py --sample-size 10000 --visualize
```

**Files Created in `results/train/`:**

| File | Description |
|------|-------------|
| `training_metrics.json` | Complete training metrics with threshold sweep |
| `visualizations/confusion_matrix_train.png` | Confusion matrix heatmap |
| `visualizations/feature_importances_train.png` | Top 20 feature importances |
| `visualizations/per_source_recall.png` | Recall by data source (Type-1, Type-2, Type-3, etc.) |
| `visualizations/threshold_sweep.png` | Precision/Recall/F1 vs threshold plot |

**Training Metrics JSON Structure:**
```json
{
  "generated_at": "2026-03-06T12:00:00+00:00",
  "metrics": {
    "threshold": 0.52,
    "precision": 0.85,
    "recall": 0.87,
    "f1": 0.86,
    "accuracy": 0.86,
    "roc_auc": 0.91
  },
  "threshold_sweep": [
    {
      "threshold": 0.30,
      "precision": 0.82,
      "recall": 0.92,
      "f1": 0.87,
      "meets_floor": true
    },
    ...
  ],
  "top_20_features": [
    {"feature": "ast_jaccard", "importance": 0.1234},
    {"feature": "levenshtein_ratio", "importance": 0.0987},
    ...
  ]
}
```

---

### Evaluation Outputs

**Command:**
```bash
poetry run python evaluate.py --model models/type4_xgb_java.pkl
```

**Files Created in `results/evaluate/`:**

| File | Description |
|------|-------------|
| `metrics_gptclonebench_java.json` | GPTCloneBench evaluation metrics (Java) |
| `metrics_gptclonebench_python.json` | GPTCloneBench evaluation metrics (Python) |
| `metrics_gptclonebench_c.json` | GPTCloneBench evaluation metrics (C) |
| `metrics_gptclonebench_csharp.json` | GPTCloneBench evaluation metrics (C#) |
| `threshold_sweep_results.csv` | Detailed threshold analysis |
| `visualizations/confusion_matrix_eval.png` | Confusion matrix heatmap |
| `visualizations/feature_importances_eval.png` | Feature importance chart |
| `evaluation_report_*.html` | Comprehensive HTML report with all visualizations |

**Evaluation Metrics JSON Structure:**
```json
{
  "accuracy": 0.88,
  "precision": 0.92,
  "recall": 0.85,
  "f1": 0.88,
  "macro_f1": 0.82,
  "roc_auc": 0.91,
  "threshold_used": 0.52,
  "true_negatives": 450,
  "false_positives": 50,
  "false_negatives": 75,
  "true_positives": 425,
  "optimal_threshold_f1": 0.55,
  "optimal_threshold_macro_f1": 0.52,
  "visualization_path": "results/evaluate/evaluation_report_java.html"
}
```

**Threshold Sweep CSV Columns:**
- `threshold` - Decision threshold tested
- `accuracy` - Overall accuracy
- `precision` - Precision (TP / (TP + FP))
- `recall` - Recall (TP / (TP + FN))
- `f1` - F1 Score
- `macro_f1` - Macro-F1 (average of both classes)
- `f1_class0` - F1 for non-clones
- `f1_class1` - F1 for clones
- `positive_predictions` - Number predicted as clones
- `negative_predictions` - Number predicted as non-clones

---

## CIPAS Syntactics (Type-1/2/3 Clone Detector)

### Training Outputs

**Command:**
```bash
poetry run python train.py --sample-size 20000
```

**Files Created in `results/train/`:**

| File | Description |
|------|-------------|
| `training_metrics.json` | Training metrics with threshold sweep |
| `visualizations/confusion_matrix_train.png` | Confusion matrix |
| `visualizations/feature_importances_train.png` | Top 20 features |
| `visualizations/per_source_recall.png` | Recall by TOMA source (type-1, type-2, etc.) |
| `visualizations/threshold_sweep.png` | Threshold sweep plot |

**Training Metrics JSON Structure:**
```json
{
  "generated_at": "2026-03-06T12:00:00+00:00",
  "metrics": {
    "threshold": 0.35,
    "precision": 0.88,
    "recall": 0.85,
    "f1": 0.865,
    "accuracy": 0.87,
    "roc_auc": 0.92
  },
  "threshold_sweep": [...],
  "top_20_features": [...]
}
```

---

### Evaluation Outputs

**Command:**
```bash
poetry run python evaluate.py --model models/clone_detector_xgb.pkl
```

**Files Created in `results/evaluate/`:**

| File | Description |
|------|-------------|
| `evaluation_metrics.json` | Overall evaluation metrics |
| `clustering_results.json` | Clustering pipeline evaluation (if run) |
| `visualizations/confusion_matrix_eval.png` | Confusion matrix |
| `visualizations/per_clone_type_recall.png` | Recall by clone type (Type-1, Type-2, Type-3) |
| `visualizations/feature_importances_eval.png` | Feature importance |

**Evaluation Metrics JSON Structure:**
```json
{
  "generated_at": "2026-03-06T12:00:00+00:00",
  "metrics": {
    "accuracy": 0.87,
    "precision": 0.89,
    "recall": 0.85,
    "f1": 0.87,
    "roc_auc": 0.92,
    "threshold": 0.35
  },
  "per_clone_type": {
    "1": {
      "count": 500,
      "tp": 485,
      "fn": 15,
      "recall": 0.97,
      "precision": 0.95,
      "f1": 0.96,
      "detector": "NiCAD (Phase One)"
    },
    "2": {
      "count": 500,
      "tp": 475,
      "fn": 25,
      "recall": 0.95,
      "precision": 0.93,
      "f1": 0.94,
      "detector": "NiCAD (Phase One)"
    },
    "3": {
      "count": 500,
      "tp": 225,
      "fn": 275,
      "recall": 0.45,
      "precision": 0.88,
      "f1": 0.60,
      "detector": "XGBoost + Type-3 Filter"
    }
  }
}
```

**Clustering Results JSON Structure:**
```json
{
  "summary": {
    "n_problems_evaluated": 20,
    "total_submissions": 1500,
    "total_pairs": 1124325,
    "mean_lsh_candidate_recall": 0.95,
    "mean_lsh_candidate_precision": 0.15,
    "mean_workload_reduction": 0.85,
    "mean_e2e_recall": 0.88,
    "mean_e2e_precision": 0.90,
    "mean_e2e_f1": 0.89,
    "mean_cluster_purity": 0.92,
    "mean_adjusted_rand_index": 0.75
  },
  "per_problem": [
    {
      "problem_id": "p00000",
      "language": "java",
      "n_submissions": 75,
      "n_total_pairs": 2775,
      "n_gt_clone_pairs": 150,
      "n_lsh_candidates": 400,
      "lsh_candidate_recall": 0.95,
      "lsh_candidate_precision": 0.36,
      "workload_reduction": 0.86,
      "e2e_recall": 0.90,
      "e2e_precision": 0.92,
      "e2e_f1": 0.91,
      "n_collusion_groups": 3,
      "cluster_purity": 0.93,
      "adjusted_rand_index": 0.78
    },
    ...
  ]
}
```

---

## Key Metrics Explained

### Classification Metrics

| Metric | Formula | Target | Description |
|--------|---------|--------|-------------|
| **Accuracy** | (TP + TN) / (TP + TN + FP + FN) | >0.85 | Overall correctness |
| **Precision** | TP / (TP + FP) | >0.85 | Correct clone predictions |
| **Recall** | TP / (TP + FN) | >0.80 | Detected clones |
| **F1 Score** | 2 × (Precision × Recall) / (Precision + Recall) | >0.85 | Harmonic mean |
| **Macro-F1** | (F1_class0 + F1_class1) / 2 | >0.80 | Balanced across classes |
| **ROC AUC** | Area under ROC curve | >0.90 | Ranking quality |

### CIPAS Syntactics Specific

| Metric | Target | Description |
|--------|--------|-------------|
| **Type-1 Recall** | >0.95 | Exact clone detection (NiCAD) |
| **Type-2 Recall** | >0.95 | Renamed clone detection (NiCAD) |
| **Type-3 Recall** | >0.40 | Near-miss clone detection (XGBoost + Filter) |

### Clustering Pipeline Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **LSH Candidate Recall** | >0.90 | % of true clones found by LSH |
| **Workload Reduction** | >0.80 | Reduction vs brute-force |
| **End-to-End Recall** | >0.85 | Final clone detection rate |
| **Cluster Purity** | >0.90 | Homogeneity of detected groups |
| **Adjusted Rand Index** | >0.70 | Agreement with ground truth |

---

## Accessing Results

### View Metrics

```bash
# Training metrics (Semantics)
cat cipas-semantics/results/train/training_metrics.json | python -m json.tool

# Evaluation metrics (Semantics)
cat cipas-semantics/results/evaluate/metrics_java.json | python -m json.tool

# Training metrics (Syntactics)
cat cipas-syntactics/results/train/training_metrics.json | python -m json.tool

# Evaluation metrics (Syntactics)
cat cipas-syntactics/results/evaluate/evaluation_metrics.json | python -m json.tool

# Clustering results
cat cipas-syntactics/results/evaluate/clustering_results.json | python -m json.tool
```

### View Visualizations

```bash
# Open HTML reports (Semantics)
open cipas-semantics/results/evaluate/evaluation_report_java.html

# View individual plots
open cipas-semantics/results/train/visualizations/confusion_matrix_train.png
open cipas-syntactics/results/evaluate/visualizations/per_clone_type_recall.png
```

### Compare Across Languages

```python
import json
from pathlib import Path

# Semantics evaluation comparison
results_dir = Path("cipas-semantics/results/evaluate")
languages = ["java", "python", "c", "csharp"]

print(f"{'Language':<12} {'Accuracy':<10} {'F1':<10} {'Macro-F1':<10} {'ROC AUC':<10}")
print("-" * 52)

for lang in languages:
    metrics_file = results_dir / f"metrics_gptclonebench_{lang}.json"
    if metrics_file.exists():
        with open(metrics_file) as f:
            metrics = json.load(f)
        print(f"{lang:<12} {metrics['accuracy']:<10.3f} {metrics['f1']:<10.3f} "
              f"{metrics['macro_f1']:<10.3f} {metrics['roc_auc']:<10.3f}")
```

### Compare Training vs Evaluation

```python
import json

# Load training metrics
with open("cipas-semantics/results/train/training_metrics.json") as f:
    train = json.load(f)

# Load evaluation metrics
with open("cipas-semantics/results/evaluate/metrics_java.json") as f:
    eval_metrics = json.load(f)

print("Training vs Evaluation Comparison:")
print(f"{'Metric':<15} {'Training':<12} {'Evaluation':<12} {'Diff':<10}")
print("-" * 49)

for metric in ["accuracy", "precision", "recall", "f1", "roc_auc"]:
    train_val = train["metrics"].get(metric, 0)
    eval_val = eval_metrics.get(metric, 0)
    diff = eval_val - train_val
    print(f"{metric:<15} {train_val:<12.4f} {eval_val:<12.4f} {diff:+10.4f}")
```

---

## Custom Output Directories

You can specify custom output directories:

### Semantics

```bash
# Training with custom output
poetry run python train.py \
    --sample-size 10000 \
    --output-dir ./custom_training_results

# Evaluation with custom output
poetry run python evaluate.py \
    --model models/type4_xgb_java.pkl \
    --output-dir ./custom_evaluation_results
```

### Syntactics

```bash
# Training with custom output
poetry run python train.py \
    --sample-size 20000 \
    --output-dir ./custom_training_results

# Evaluation with custom output
poetry run python evaluate.py \
    --model models/clone_detector_xgb.pkl \
    --output-dir ./custom_evaluation_results
```

---

## Migration from Old Structure

If you have results in the old directories (`metrics_output/`, `evaluation_output/`, `models/`), you can migrate them:

```bash
# Semantics
mv cipas-semantics/metrics_output/*.json cipas-semantics/results/train/
mv cipas-semantics/evaluation_output/*.json cipas-semantics/results/evaluate/
mv cipas-semantics/metrics_output/figures/* cipas-semantics/results/train/visualizations/
mv cipas-semantics/evaluation_output/figures/* cipas-semantics/results/evaluate/visualizations/

# Syntactics
mv cipas-syntactics/models/*.json cipas-syntactics/results/train/
mv cipas-syntactics/models/visualizations/* cipas-syntactics/results/train/visualizations/
```

---

**Last Updated:** March 6, 2026  
**CIPAS Core v2.0**
