# Syntactic Clone Detection Pipeline

This document describes the implementation of the syntactic clone detection pipeline, covering the tiered architecture, feature extraction, model details, and scripts.

## 1. Pipeline Architecture

The system uses a **Tiered Cascade Architecture** that short-circuits at the first confirmed clone type to maximize both precision and performance.

### Phase One: NiCAD-style (Type-1 & Type-2)
- **Engine**: `StructuralNormalizer` (CST-based)
- **Type-1**: Exact matches after basic normalization (literal CST comparison).
  - **Threshold**: Jaccard ≥ 0.98 AND Levenshtein ≥ 0.98.
- **Type-2**: Renamed/Parameterized clones (blinded CST comparison).
  - **Normalization**: Identifiers and literals are abstracted to `ID` and `LIT` tokens.
  - **Threshold**: max(Jaccard, Levenshtein) ≥ 0.95.
  - **Guard**: Token-length delta ≤ 5% to prevent false positives on structurally different code.

### Phase Two: ToMa + XGBoost (Type-3)
If Phase One does not confirm a clone, the pair is escalated to the machine learning model.
- **Engine**: `SyntacticClassifier` (XGBoost) + `Type-3 Filter`.
- **Stage 1 (Stage 1 Inference)**: XGBoost predicts a clone probability based on hybrid features.
- **Stage 2 (Type-3 Filtering)**: A post-classifier filter (`is_type3_clone`) maps a confirmed clone to a Type-3 near-miss result using specific boundaries:
  - `prob_floor`: 0.35 (Primary decision boundary).
  - `lev_ratio_upper`: 0.85 (Excludes Type-1/2 from being labeled as Type-3).
  - `ast_jaccard_upper`: 0.90 (Excludes Type-1/2 from being labeled as Type-3).

---

## 2. Feature Extraction

The `SyntacticFeatureExtractor` computes a combination of lexical and structural features:

### String Similarity (6 features)
- Jaccard, Dice, Levenshtein Distance/Ratio, Jaro, Jaro-Winkler.

### AST & Structural (7+ features)
- **Structural Jaccard**: Comparison of simplified AST tree hashes.
- **AST Metrics**: Depth diff, Node count diff/ratio.
- **Structural Density**: Measures the node density of both snippets and their difference (calculated as `node_count / line_count`).
- **Node Type Distribution** (Optional): Differences in the counts of specific AST node types (e.g., `if_statement`, `for_statement`).

---

## 3. Model Training (`train.py`)

The model is trained on the **TOMA dataset** using balanced sampling to ensure robust detection across the clone spectrum.

### Training Strategy
- **Labels**: Collapses Type-1, 2, and 3 into a single "Positive" category for the XGBoost learner.
- **Hyperparameter Optimization**: Uses `RandomizedSearchCV` to maximize F1-score.
- **Feature Selection**: Drops features with < 1% importance (while mandatory keeping the boundary features).
- **Scale Pos Weight**: Dynamically calculated based on class imbalance.
- **Early Stopping**: Prevents overfitting by monitoring loss on a 20% validation split.

---

## 4. Evaluation (`evaluate.py`)

Evaluation is performed on the **BigCloneBench Balanced** dataset using a **routed logic** that mirrors the real-world pipeline:

1. **Type-1 / Type-2 Ground-Truth**: Validated via the NiCAD phase (Phase One).
2. **Type-3 Ground-Truth**: Validated via the XGBoost path (Phase Two).
3. **Non-Clones**: Tested against *both* paths to measure the False Positive Rate (FPR).

---

## 5. Execution Scripts

### 📊 Training Script
Run training on the TOMA dataset. Artifacts are saved to `models/type3_xgb.pkl`.

```bash
# Basic run
poetry run python train.py

# Optimized for GPU
poetry run python train.py --use-gpu
```

### 📈 Evaluation Script
Evaluate the full two-stage pipeline performance.

```bash
# Basic evaluation
poetry run python evaluate.py

# Evaluate with a specific threshold sweep
for t in 0.10 0.15 0.20 0.25 0.30; do
  poetry run python evaluate.py --threshold $t
done
```

### 🛰 API Service
Start the FastAPI server for real-time inference.

```bash
poetry run uvicorn main:app --host 0.0.0.0 --port 8086
```
