# CIPAS Semantics - Output Files Reference

## Quick Reference

### Training Outputs

```bash
# Train model
poetry run python train.py --sample-size 10000 --visualize
```

**Files Created:**

| Location | File | Description |
|----------|------|-------------|
| `models/` | `type4_xgb_java.pkl` | Trained model |
| `models/` | `type4_xgb_java.pkl.features.json` | Feature names (437) |
| `results/train/` | `training_metrics.json` | Training metrics |
| `results/train/visualizations/` | `confusion_matrix_train.png` | Confusion matrix |
| `results/train/visualizations/` | `feature_importances_train.png` | Feature importance |
| `results/train/visualizations/` | `threshold_sweep.png` | Threshold sweep plot |
| `results/train/visualizations/` | `per_source_recall.png` | Per-source recall |

### Evaluation Outputs

```bash
# Evaluate model (full dataset)
poetry run python evaluate.py --model models/type4_xgb_java.pkl
```

**Files Created:**

| Location | File | Description |
|----------|------|-------------|
| `results/evaluate/` | `metrics_gptclonebench_java.json` | Java evaluation metrics |
| `results/evaluate/` | `metrics_gptclonebench_python.json` | Python evaluation metrics |
| `results/evaluate/` | `metrics_gptclonebench_c.json` | C evaluation metrics |
| `results/evaluate/` | `metrics_gptclonebench_csharp.json` | C# evaluation metrics |
| `results/evaluate/` | `threshold_sweep_results.csv` | Threshold analysis |
| `results/evaluate/visualizations/` | `confusion_matrix_eval.png` | Confusion matrix |
| `results/evaluate/visualizations/` | `feature_importances_eval.png` | Feature importance |
| `results/evaluate/` | `evaluation_report_*.html` | HTML visualization report |

---

## Training Metrics (JSON)

**File:** `results/train/training_metrics.json`

```json
{
  "accuracy": 0.85,
  "precision": 0.84,
  "recall": 0.87,
  "f1": 0.855,
  "roc_auc": 0.91,
  "optimal_threshold": 0.52,
  "accuracy_thresholded": 0.86,
  "precision_thresholded": 0.85,
  "recall_thresholded": 0.88,
  "f1_thresholded": 0.865,
  "macro_f1_thresholded": 0.85,
  "feature_pruning_applied": true,
  "isotonic_calibration_applied": true,
  "original_features": 437,
  "pruned_features": 350
}
```

### Metrics Explained

| Metric | Description | Target |
|--------|-------------|--------|
| `accuracy` | Overall correctness | >0.85 |
| `precision` | TP / (TP + FP) | >0.85 |
| `recall` | TP / (TP + FN) | >0.80 |
| `f1` | Harmonic mean of precision/recall | >0.85 |
| `roc_auc` | Area under ROC curve | >0.90 |
| `optimal_threshold` | Threshold maximizing Macro-F1 | 0.50-0.65 |
| `macro_f1_thresholded` | Macro-F1 at optimal threshold | >0.80 |
| `original_features` | Features before pruning | 437 |
| `pruned_features` | Features after pruning | 350 |

---

## Evaluation Metrics (JSON)

**File:** `results/evaluate/metrics_*.json`

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
  "visualization_path": "evaluation_output/reports/evaluation_report_java.html"
}
```

### Metrics Explained

| Metric | Description | Target |
|--------|-------------|--------|
| `accuracy` | Overall correctness | >0.85 |
| `precision` | TP / (TP + FP) | >0.85 |
| `recall` | TP / (TP + FN) | >0.75 |
| `f1` | Overall F1 score | >0.80 |
| `macro_f1` | Average F1 for both classes | >0.75 |
| `roc_auc` | Area under ROC curve | >0.85 |
| `threshold_used` | Decision threshold used | 0.50-0.65 |
| `true_negatives` | Correct non-clone predictions | - |
| `false_positives` | Incorrect clone predictions | - |
| `false_negatives` | Incorrect non-clone predictions | - |
| `true_positives` | Correct clone predictions | - |
| `optimal_threshold_f1` | Best threshold for F1 | - |
| `optimal_threshold_macro_f1` | Best threshold for Macro-F1 | - |

---

## Threshold Sweep (CSV)

**File:** `results/evaluate/threshold_sweep_results.csv`

```csv
threshold,accuracy,precision,recall,f1,macro_f1,f1_class0,f1_class1,positive_predictions,negative_predictions
0.10,0.85,0.88,0.95,0.91,0.82,0.70,0.94,520,480
0.15,0.86,0.89,0.93,0.91,0.83,0.72,0.93,510,490
...
0.50,0.88,0.92,0.85,0.88,0.82,0.80,0.85,450,550
...
0.90,0.75,0.98,0.50,0.66,0.62,0.88,0.36,200,800
```

### Columns Explained

| Column | Description |
|--------|-------------|
| `threshold` | Decision threshold tested |
| `accuracy` | Overall accuracy at this threshold |
| `precision` | Precision at this threshold |
| `recall` | Recall at this threshold |
| `f1` | F1 score at this threshold |
| `macro_f1` | Macro-F1 at this threshold |
| `f1_class0` | F1 for non-clones at this threshold |
| `f1_class1` | F1 for clones at this threshold |
| `positive_predictions` | Number predicted as clones |
| `negative_predictions` | Number predicted as non-clones |

---

## Visualization Reports (HTML)

### Training Report

**File:** `results/evaluate/evaluation_report_*.html`

**Sections:**
1. **Training Overview** - Dataset info, parameters
2. **ROC Curve** - Receiver Operating Characteristic
3. **Precision-Recall Curve** - PR curve
4. **Confusion Matrix** - Heatmap visualization
5. **Feature Importance** - Top 20 features bar chart
6. **Metrics Summary** - All training metrics

### Evaluation Report

**File:** `results/evaluate/evaluation_report_*.html`

**Sections:**
1. **Evaluation Overview** - Dataset info, model info
2. **ROC Curve** - Receiver Operating Characteristic
3. **Precision-Recall Curve** - PR curve
4. **Confusion Matrix** - Normalized heatmap
5. **Feature Importance** - Top 20 features bar chart
6. **Threshold Sweep** - Metrics vs threshold plot
7. **Metrics Summary** - All evaluation metrics

---

## Accessing Outputs

### View Metrics

```bash
# Training metrics
cat results/train/training_metrics.json | python -m json.tool

# Evaluation metrics
cat results/evaluate/metrics_java.json | python -m json.tool

# Threshold sweep
cat results/evaluate/threshold_sweep_results.csv
```

### View Visualizations

```bash
# Training report
open results/train/visualizations/confusion_matrix_train.png

# Evaluation report
open results/evaluate/evaluation_report_java.html
```

### Compare Languages

```python
import json
from pathlib import Path

output_dir = Path("results/evaluate")
results = {}

for lang in ["java", "python", "c", "csharp"]:
    metrics_file = output_dir / f"metrics_gptclonebench_{lang}.json"
    if metrics_file.exists():
        with open(metrics_file) as f:
            results[lang] = json.load(f)

print(f"{'Language':<10} {'Accuracy':<10} {'F1':<10} {'Macro-F1':<10}")
print("-" * 40)
for lang, metrics in results.items():
    print(f"{lang:<10} {metrics['accuracy']:<10.3f} {metrics['f1']:<10.3f} {metrics['macro_f1']:<10.3f}")
```

---

## Output Directory Structure

```
cipas-semantics/
├── models/
│   ├── type4_xgb_java.pkl              # Model file
│   └── type4_xgb_java.pkl.features.json # Feature names
│
├── results/
│   ├── train/
│   │   ├── training_metrics.json       # Training metrics
│   │   └── visualizations/
│   │       ├── confusion_matrix_train.png
│   │       ├── feature_importances_train.png
│   │       ├── per_source_recall.png
│   │       └── threshold_sweep.png
│   │
│   └── evaluate/
│       ├── metrics_gptclonebench_java.json
│       ├── metrics_gptclonebench_python.json
│       ├── metrics_gptclonebench_c.json
│       ├── metrics_gptclonebench_csharp.json
│       ├── threshold_sweep_results.csv
│       └── visualizations/
│           ├── confusion_matrix_eval.png
│           ├── feature_importances_eval.png
│           └── evaluation_report_*.html
```

---

**Last Updated:** March 1, 2026  
**CIPAS Semantics v2.0**
