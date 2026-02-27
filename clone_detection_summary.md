# Code Clone Detection Implementation Summary

This document summarizes the current implementation of the Type-1 to Type-4 code clone detection system. The system has been **migrated to separate microservices** for syntactic and semantic detection. It utilizes a multi-language approach (Java, C, Python) based on Tree-sitter Concrete Syntax Tree (CST) parsing and machine learning, combining the TOMA (Token-based) approach with extended structural feature fusion.

## Migration to Microservices (2026)

The clone detection system has been refactored from a monolithic `cipas-service` into two specialized microservices:

| Service | Location | Clone Types | Port | Technology |
|---------|----------|-------------|------|------------|
| **CIPAS Syntactics** | `apps/services/cipas-services/cipas-syntactics` | Type-1, Type-2, Type-3 | 8086 | XGBoost (Two-Stage Pipeline) |
| **CIPAS Semantics** | `apps/services/cipas-services/cipas-semantics` | Type-4 | 8087 | XGBoost (Semantic Features) |

### API Endpoints

**CIPAS Syntactics Service** (`/api/v1/syntactics/*`):
- `POST /api/v1/syntactics/compare` — Compare two code snippets (Type-1/2/3)
- `GET /api/v1/syntactics/health` — Health check
- `GET /api/v1/syntactics/feature-importance` — Get XGBoost feature importance
- `POST /api/v1/syntactics/tokenize` — Tokenize code

**CIPAS Semantics Service** (`/api/v1/semantics/*`):
- `POST /api/v1/semantics/compare` — Compare two code snippets (Type-4)
- `GET /api/v1/semantics/health` — Health check
- `GET /api/v1/semantics/feature-importance` — Get XGBoost feature importance
- `POST /api/v1/semantics/tokenize` — Tokenize code

---

## Overview of Clone Types

| Type | Name | Description |
|------|------|-------------|
| **Type-1** | Exact | Identical code with only whitespace/comment differences |
| **Type-2** | Renamed | Structurally identical but with renamed identifiers/literals |
| **Type-3** | Near-Miss | Modified clones: added/removed/changed statements |
| **Type-4** | Semantic | Functionally equivalent but syntactically different |

---

## Detection Architecture

The syntactic detection pipeline has **three distinct stages**:

```
┌────────────────────────────────────────────────────────────────────┐
│                     Syntactic Cascade Detection                     │
│                    (CIPAS Syntactics — Port 8086)                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Stage 0: NiCAD-Style Normalizer                                    │
│  ├─ Pass A: Literal Comparison  → Type-1 (threshold ≥ 0.98)        │
│  │   └─ Confidence: 1.0 → [EXIT]                                   │
│  └─ Pass B: Blinded Comparison  → Type-2 (threshold ≥ 0.95)        │
│      └─ Token Count Delta ≤ 5% → Confidence: ~0.95–0.99 → [EXIT]   │
│                                                                     │
│  Stage 1: XGBoost Clone Detector  (clone_detector_xgb.pkl)         │
│  ├─ Trained on Type-1 + 2 + 3 (strong/moderate/weak) vs NonClone   │
│  ├─ 6 String + 7 AST Core + ~38 Node-Type Distribution features    │
│  ├─ Outputs clone probability p ∈ [0, 1]                           │
│  └─ If p > threshold → enter Stage 2                               │
│                                                                     │
│  Stage 2: Type-3 Filter  (clone_detection/type3_filter.py)         │
│  ├─ prob < 0.35              → Not a clone (reject)                 │
│  ├─ levenshtein_ratio > 0.85 → Too similar → Type-1/2 (reject)     │
│  ├─ ast_jaccard > 0.90       → Identical structure → Type-1/2 (rej)│
│  └─ Otherwise                → Type-3 near-miss ✓ → [EXIT]         │
│                                                                     │
│  Fallback: Non-Syntactic → escalate to CIPAS Semantics             │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

**Key design principle:**
> Stage 1 trains on the **full clone spectrum** so it learns what "any clone" looks like. Stage 2 then carves out the Type-3 near-miss corridor using structural feature boundaries — without retraining.

---

## Stage 0: NiCAD-Style Normalizer

### Type-1: Exact Clones

- **Detection:** Phase One, Pass A — literal comparison of normalized CST streams
  - Pretty-printing: one statement per line, standardized spacing
  - Comment and metadata removal
  - **Threshold:** Jaccard ≥ 0.98 AND Levenshtein Ratio ≥ 0.98
- **Confidence:** 1.0
- **Expected F1:** 95%+

### Type-2: Renamed/Parameterized Clones

- **Detection:** Phase One, Pass B — identifier and literal blinding
  - All variable names → `ID`, literals → `LIT`
  - Keywords and operators preserved
  - **Threshold:** max(Jaccard, Levenshtein) ≥ 0.95 **AND** Token Count Delta ≤ 5%
- **Confidence:** ~0.95–0.99
- **Expected F1:** 92%+

---

## Stage 1: XGBoost Clone Detector

### Training Data (TOMA Dataset)

Training labels are **binary** (Clone vs NonClone). The model learns the full clone spectrum before the Type-3 Filter narrows it down.

| CSV | TOMA Semantics | Label | Target | Weight | Rationale |
|-----|---------------|-------|--------|--------|-----------|
| `type-1.csv` | Exact clones | **1** | 8,000 | 1.5× | Easy positives — shape the boundary |
| `type-2.csv` | Renamed clones | **1** | 8,000 | 1.5× | Easy positives — shape the boundary |
| `type-3.csv` | **Strong** Type-3 near-miss | **1** | 20,000 | **2.0×** | Hard positives — most important |
| `type-4.csv` | **Moderate** Type-3 / heavy modification | **1** | 15,000 | 1.5× | Mid-difficulty — broadens spectrum |
| `type-5.csv` | **Weak** near-miss / borderline semantic | **1** | 10,000 | 1.0× | Noisy — gentle signal |
| `nonclone.csv` | Confirmed non-clones | **0** | 25,000 | 1.0× | Balanced against larger positive set |

**Total training pairs:** ~86,000 (61,000 clones, 25,000 non-clones)

### XGBoost Hyperparameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `n_estimators` | **500** | More rounds for complex near-miss boundary |
| `max_depth` | **8** | Deeper trees capture structural patterns |
| `learning_rate` | **0.05** | Slower learning for better generalization |
| `subsample` | **0.9** | High row sampling — robust against outliers |
| `colsample_bytree` | **0.8** | Relaxed from 0.6; rich positive set reduces need for forced AST splits |
| `min_child_weight` | **2** | Prevents overfitting rare structural patterns |
| `gamma` | **0.1** | Conservative pruning |
| `reg_lambda` | **1.0** | L2 regularization on leaf weights |
| `scale_pos_weight` | **2.0** | Reduced from 5.0 — larger positive class reduces imbalance |
| `eval_metric` | **auc** | Better for imbalanced clone spectrum |

### Output

- **Model file:** `clone_detector_xgb.pkl`
- **Location:** `apps/services/cipas-services/cipas-syntactics/models/`
- **Calibrated threshold:** stored inside pkl after post-training sweep

---

## Stage 2: Type-3 Filter

**File:** `clone_detection/type3_filter.py`

The Type-3 Filter is applied at inference time on every pair that passes Stage 1's probability threshold. It applies three boundary rules that define the **near-miss corridor**:

```
Type-3 Near-Miss Corridor:
  ┌─ Minimum clone signal: prob ≥ 0.35
  ├─ Below text identity: levenshtein_ratio ≤ 0.85
  └─ Below structural identity: ast_jaccard ≤ 0.90

             0.85        1.0
  lev_ratio  ─────────────
             │ Type-3  │Type-1/2
             │ corridor│(excluded)
  ast_jaccard──────────╂
                       0.90
```

| Rule | Threshold | Explanation |
|------|-----------|-------------|
| `prob_floor` | `< 0.35` | Pair not a clone at all → reject |
| `lev_upper` | `> 0.85` | Text too similar → Type-1/2, not near-miss → reject |
| `ast_upper` | `> 0.90` | AST structure identical → Type-1/2 → reject |
| Otherwise | — | **Type-3 near-miss clone ✓** |

### API functions

```python
# Array-based (used in evaluate.py / batch inference)
from clone_detection.type3_filter import is_type3_clone
pred = is_type3_clone(features_array, feature_names, clone_probability)

# Dict-based (used in routes.py / API layer)
from clone_detection.type3_filter import is_type3_clone_dict
pred = is_type3_clone_dict(features_dict, clone_probability)
```

---

## Feature Engineering

### String Features (6)
Computed on token-normalized code streams:

| Feature | Description |
|---------|-------------|
| `feat_jaccard_similarity` | Set intersection / union of tokens |
| `feat_dice_coefficient` | 2× intersection / sum of sizes |
| `feat_levenshtein_distance` | Edit distance between token streams |
| `feat_levenshtein_ratio` | Normalized Levenshtein (0–1) |
| `feat_jaro_similarity` | Jaro string distance |
| `feat_jaro_winkler_similarity` | Jaro-Winkler (prefix-weighted) |

### Core AST Features (7)
Derived from Tree-sitter parse trees:

| Feature | Description |
|---------|-------------|
| `feat_ast_jaccard` | Structural Jaccard over AST node-type sets |
| `feat_ast_depth_diff` | Normalized difference in max AST depth |
| `feat_ast_node_count_diff` | Normalized difference in total node count |
| `feat_ast_node_count_ratio` | min/max node count ratio |
| `feat_structural_density_1` | AST nodes per LOC for snippet 1 |
| `feat_structural_density_2` | AST nodes per LOC for snippet 2 |
| `feat_structural_density_diff` | Absolute density difference |

> **Why structural density?** Near-miss Type-3 clones often diverge in text (renamed methods, extracted helpers) but retain the same control-flow complexity. Structural density captures this: it measures AST nodes per line, a metric invariant to identifier renaming.

### Node-Type Distribution Features (~38)
Per-node-type frequency differences for 38 Java AST constructs: `if_statement`, `for_statement`, `method_invocation`, `binary_expression`, etc.

**Total feature count: ~51** (6 string + 7 AST core + ~38 node-type dists)

---

## Threshold Sweep & Calibration

After training, `train.py` automatically runs a threshold sweep from **0.10 → 0.50** in 0.05 increments. The precision floor is **0.80** (relaxed from 0.90 — Stage 2 Type-3 Filter handles per-type precision refinement):

```
  Thresh | Precision | Recall  |  F1    | Floor?
  -------+-----------+---------+--------+-------
    0.10 |    0.8100 |  0.9100 | 0.8571 | ✓
    0.15 |    0.8421 |  0.8700 | 0.8558 | ✓
    0.20 |    0.8750 |  0.8300 | 0.8519 | ✓
    0.25 |    0.9000 |  0.7800 | 0.8356 | ✓ ← example selected
    0.30 |    0.9300 |  0.7100 | 0.8056 | ✓
    ...
```

The selected threshold is stored in the pkl and printed at the end of training. Apply it via `--threshold` to `evaluate.py`.

---

## Evaluation

Evaluation runs the **full two-stage pipeline** on BigCloneBench Balanced and reports per-clone-type Precision, Recall, and F1.

### BigCloneBench Dataset

| File | Rows | Format | Description |
|------|------|--------|-------------|
| `bigclonebench.jsonl` | 8,652,999 | JSONL | Full industry benchmark |
| `bigclonebench_balanced.json` | 64,223 | JSON | **Evaluation Set**: Balanced Type-1, 2, 3, and Non-clones |

- Location: `datasets/bigclonebench/`
- Type-4 (semantic) pairs **excluded** from syntactic evaluation.
- **Primary KPI:** Type-3 Recall ≥ 40%

### Expected Results

| Metric | Old Pipeline (Type-3 direct) | New Pipeline (Two-Stage) |
|--------|------------------------------|--------------------------|
| Type-3 Recall | ~0.27 | **0.45–0.60 (target)** |
| Precision | ~0.90 | 0.80–0.88 |
| Type-3 F1 | ~0.41 | **0.55+ (target)** |

---

## Scripts & Tools

### Training & Evaluation

| Script | Purpose |
|--------|---------|
| `train.py` | Train Stage 1 Clone Detector with balanced TOMA dataset + threshold sweep |
| `evaluate.py` | Evaluate Stage 1 + Stage 2 on BCB Balanced; outputs Type-3 Precision/Recall/F1 |
| `tui.py` | Interactive TUI to configure and run training/evaluation |

### Common Commands

```bash
# Train Stage 1 Clone Detector (full dataset, ~86k pairs)
poetry run python train.py

# Train with custom scale_pos_weight
poetry run python train.py --scale-pos-weight 2.0

# Evaluate on all clone types using model's calibrated threshold
poetry run python evaluate.py

# Evaluate on Type-3 only at a specific threshold
poetry run python evaluate.py --threshold 0.25 --clone-types 3

# Threshold sweep for best Type-3 F1 (Step 9)
for t in 0.10 0.15 0.20 0.25 0.30; do
  poetry run python evaluate.py --threshold $t
done

# Evaluate with Type-3 similarity logging (Step 10)
poetry run python evaluate.py --threshold 0.20 --log-type3-similarity

# Quick experiment with sample
poetry run python evaluate.py --threshold 0.20 --sample-size 2000

# Launch TUI
poetry run python tui.py
```

---

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                       Traefik API Gateway                          │
│                           Port 8000                                │
└───────────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
 ┌───────────────────────────┐   ┌──────────────────────────────┐
 │    CIPAS Syntactics        │   │      CIPAS Semantics          │
 │    Port 8086               │   │      Port 8087               │
 │                            │   │                              │
 │  Stage 0: NiCAD Normalizer │   │  204 Semantic Features       │
 │    └─ Type-1 / Type-2      │   │  XGBoost Classifier          │
 │                            │   │  → Type-4 Clones             │
 │  Stage 1: Clone Detector   │   │                              │
 │    └─ XGBoost (full spec.) │   └──────────────────────────────┘
 │       clone_detector_xgb   │
 │                            │
 │  Stage 2: Type-3 Filter    │
 │    └─ Boundary rules       │
 │       → Type-3 near-miss   │
 └───────────────────────────┘
```

---

## API Response Format

### CIPAS Syntactics — Type-3 Response

```json
{
  "is_clone": true,
  "confidence": 0.782,
  "clone_type": "Type-3",
  "pipeline_used": "Syntactic Cascade (Stage 1 + Stage 2 Type-3 Filter)",
  "normalization_level": "Token-based",
  "threshold_used": 0.25,
  "stage1_probability": 0.782,
  "type3_filter_applied": true,
  "syntactic_features": { "feat_jaccard_similarity": 0.61, "feat_levenshtein_ratio": 0.59 },
  "structural_features": {
    "feat_ast_jaccard": 0.72,
    "feat_structural_density_1": 12.4,
    "feat_structural_density_2": 13.1,
    "feat_structural_density_diff": 0.7
  },
  "feature_importance_available": true
}
```

### Non-Syntactic Fallback

```json
{
  "is_clone": false,
  "confidence": 0.0,
  "clone_type": "Non-Syntactic",
  "pipeline_used": "Syntactic Cascade (Stages 0–2 exhausted)"
}
```

---

## Feature Categories Summary

| Category | Count | Key Features |
|----------|-------|--------------|
| **String Similarity** | 6 | Jaccard, Dice, Levenshtein ×2, Jaro, Jaro-Winkler |
| **Core AST Structural** | 7 | AST Jaccard, Depth Diff, Node Count ×2, Structural Density ×3 |
| **Node-Type Distribution** | ~38 | Per-node-type freq diff for 38 Java AST constructs |
| **Total** | **~51** | |
