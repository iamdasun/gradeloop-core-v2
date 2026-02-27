# Code Clone Detection Implementation Summary

This document summarizes the current implementation of the Type-1 to Type-4 code clone detection system. The system has been **migrated to separate microservices** for syntactic and semantic detection. The system utilizes a multi-language approach (Java, C, Python) based on Tree-sitter Concrete Syntax Tree (CST) parsing and machine learning, combining the TOMA (Token-based) approach with extended semantic feature fusion.

## Migration to Microservices (2026)

The clone detection system has been refactored from a monolithic `cipas-service` into two specialized microservices:

| Service | Location | Clone Types | Port | Technology |
|---------|----------|-------------|------|------------|
| **CIPAS Syntactics** | `apps/services/cipas-services/cipas-syntactics` | Type-1, Type-2, Type-3 | 8086 | XGBoost |
| **CIPAS Semantics** | `apps/services/cipas-services/cipas-semantics` | Type-4 | 8087 | XGBoost |

### Benefits of Migration

1. **Separation of Concerns**: Syntactic and semantic detection are now independent
2. **Independent Scaling**: Each service can be scaled based on demand
3. **Faster Deployment**: Smaller, focused services deploy faster
4. **Technology Isolation**: Different ML models don't interfere with each other
5. **Clear API Boundaries**: Dedicated endpoints for each detection type

### API Endpoints After Migration

**CIPAS Syntactics Service** (`/api/v1/syntactics/*`):
- `POST /api/v1/syntactics/compare` - Compare two code snippets (Type-1/2/3)
- `GET /api/v1/syntactics/health` - Health check
- `GET /api/v1/syntactics/feature-importance` - Get XGBoost feature importance
- `POST /api/v1/syntactics/tokenize` - Tokenize code

**CIPAS Semantics Service** (`/api/v1/semantics/*`):
- `POST /api/v1/semantics/compare` - Compare two code snippets (Type-4)
- `GET /api/v1/semantics/health` - Health check
- `GET /api/v1/semantics/feature-importance` - Get XGBoost feature importance
- `POST /api/v1/semantics/tokenize` - Tokenize code

## Overview of Clone Types

The system categorizes clones into four types and utilizes an **automatic cascade detection strategy** that seamlessly integrates both pipelines:

- **Automatic Cascade:** Implements a four-tier detection strategy for Type-1, Type-2, Type-3, and Type-4 (Non-Syntactic) clones.
- **Early Exit Optimization:** The pipeline automatically breaks when a clone type is confirmed, reducing computational overhead.

### Detection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Automatic Cascade Detection                     │
│               (Syntactic vs. Non-Syntactic)                      │
├─────────────────────────────────────────────────────────────────┤
│  Phase One: NiCad-Style Normalization                            │
│  ├─ Pass A: Literal Comparison (Type-1, threshold ≥ 0.98)       │
│  │   └─ Confidence: 1.0 → [EXIT]                                │
│  └─ Pass B: Blinded Comparison (Type-2, threshold ≥ 0.95)       │
│      └─ Token Count Delta ≤ 5% → Confidence: ~0.95-0.99 → [EXIT]│
│                                                                  │
│  Phase Two: ToMa + XGBoost Classifier (Type-3)                  │
│  ├─ Hybrid String + AST + Structural Density (16–48 features)    │
│  ├─ scale_pos_weight = 5.0, colsample_bytree = 0.6              │
│  ├─ Calibrated threshold (typically 0.25–0.35)                   │
│  └─ Confidence: XGBoost probability → [EXIT]                     │
│                                                                  │
│  Non-Syntactic: Fallback Outcome                                 │
│  └─ If high semantic similarity is suspected, escalate to        │
│     the CIPAS Semantics service for Type-4 analysis.             │
│                                                                  │
│  Result: Confirmed Clone or Non-Syntactic (escalate/reject)      │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **No Pipeline Selection Required:** Users submit code pairs; the system automatically determines the clone type
- **Type-2 Logic Leak Prevention:** Code pairs with high similarity (>0.95) but significant length difference (>5%) bypass Type-2 and proceed to Phase Two
- **Early Exit:** Confirmed clones at any stage immediately return, skipping subsequent phases

### Type-1: Exact Clones
Exact copies of code with minor modifications such as changes in whitespace, layout, and comments.

- **Detection Method:** **Phase One, Pass A** using NiCad-style structural normalization:
  - Pretty-printing: one statement per line, standardized spacing
  - Comment and metadata removal
  - Direct comparison of normalized CST streams
  - **Threshold:** Jaccard ≥ 0.98 AND Levenshtein Ratio ≥ 0.98
- **Confidence Score:** 1.0 (exact match)
- **Normalization Level:** `Literal`
- **Performance:** Achieves an expected F1 score of 95%+.

### Type-2: Renamed/Parameterized Clones
Structurally identical code snippets where identifiers, literals, types, or variables have been renamed or modified.

- **Detection Method:** **Phase One, Pass B** using identifier and literal blinding:
  - All variable names → `ID` token
  - All literals (strings, numbers) → `LIT` token
  - Keywords and operators preserved
  - **Threshold:** max(Jaccard, Levenshtein) ≥ 0.95 **AND** Token Count Delta ≤ 5%
- **Confidence Score:** ~0.95-0.99 (scales with similarity)
- **Normalization Level:** `Blinded`
- **Performance:** Achieves an expected F1 score of 92%+.

### Type-3: Near-Miss/Modified Clones
Clones with further modifications, such as added, removed, or changed statements, alongside identifier and literal changes.

- **Detection Method:** **Phase Two** of the Syntactic Cascade using **ToMa + XGBoost** with a recall-optimized hybrid feature set:
  - **6 String Features:** Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler.
  - **7 Core AST Features:** Structural Jaccard, Depth Difference, Node Count Diff/Ratio, **Structural Density** ×3 (see below).
  - **~38 Node-Type Distribution Features:** Per-node-type frequency differences across 38 Java AST node types.
  - **Objective:** Maximize Type-3 Recall (target **≥ 40%**) while maintaining **Precision ≥ 90%**.
- **Training Strategy:**
  - **Positives (Label 1):** `type-3.csv` (hard near-miss clones, weight 2.0) and `type-4.csv` (moderate Type-3, weight 2.0).
  - **Negatives (Label 0):** `nonclone.csv` (genuine non-clones, weight 1.0).
  - **Semantic data excluded:** `type-5.csv` is not used in training — the model is purely syntactic.
- **Optimization Parameters:**

  | Parameter | Value | Rationale |
  |-----------|-------|-----------|
  | `scale_pos_weight` | **5.0** | Penalizes False Negatives 5× more than False Positives |
  | `sample_weight` | **2.0** for type-3/4 rows | Near-miss pairs weighted double in gradient computation |
  | `colsample_bytree` | **0.6** | Forces ~40% of splits to use AST features, preventing Levenshtein dominance |
  | `n_estimators` | **200** | More boosting rounds for better structural feature coverage |
  | Threshold sweep | **0.10→0.50 @ 0.05 steps** | Auto-selects max recall point where precision ≥ 90% |
  | Inference threshold | **~0.25–0.35** (calibrated) | Set post-training; passed via `--threshold` to `evaluate.py` |

- **Confidence Score:** XGBoost probability at calibrated threshold.
- **Normalization Level:** `Token-based`.
- **Training Script:** `train.py`
- **Evaluation Script:** `evaluate.py --threshold <T> --clone-types 3`
- **Model File:** `type3_xgb.pkl`
- **Location:** `apps/services/cipas-services/cipas-syntactics/models/`

### Type-4: Semantic Clones
Code snippets that perform the same computational function but implement different syntactic structures or algorithms.

- **Detection Method:** Handled by the **CIPAS Semantics** service using an XGBoost Classifier with **204 fused semantic features**.
  - **Categories:** Traditional (LOC, keywords), Syntactic/CST frequencies, Semantic/PDG-like patterns, Structural depth, Type signatures, and API fingerprinting.
- **Confidence Score:** XGBoost probability
- **Normalization Level:** `Token-based`
- **Performance:** Achieves an expected F1 score of 85%+.
- **Training Script:** `scripts/train_type4_semantic.py`

## Datasets

### TOMA Dataset

Location: `datasets/toma-dataset/`

| File | Rows | Columns | Syntactic Label | Training Role | Sample Weight |
|------|------|---------|-----------------|---------------|---------------|
| `type-3.csv` | 21,395 | 5 | **Positive (1)** | Near-miss clones | **2.0** |
| `type-4.csv` | 86,341 | 5 | **Positive (1)** | Moderate Type-3 (syntactic) | **2.0** |
| `type-5.csv` | 109,914 | 5 | **N/A** | **Excluded** — semantic clones (CIPAS Semantics only) | — |
| `nonclone.csv` | 279,033 | 2 | **Negative (0)** | Confirmed non-clone pairs | **1.0** |

**Training Philosophy:** Semantic clones (`type-5.csv`) are completely excluded from the syntactic model. The model's only objective is to distinguish structural near-misses from genuine non-clones. The asymmetric sample weights (2.0 for positives) combined with `scale_pos_weight=5.0` aggressively penalize missed clones.

### BigCloneBench Dataset

Location: `datasets/bigclonebench/`

| File | Rows | Format | Description |
|------|------|--------|-------------|
| `bigclonebench.jsonl` | 8,652,999 | JSONL | Full industry benchmark |
| `bigclonebench_balanced.json` | 64,223 | JSON | **Evaluation Set**: Balanced distribution of Type-1, 2, 3, and Non-clones. |

**Evaluation Split:**
- Clones (1, 2, 3) → Positive Label
- Non-clones → Negative Label
- Type-4 (Semantic) → **Excluded** from syntactic evaluation.

**Primary KPI:** Per-Clone-Type Recall breakdown — the key success metric is **Type-3 Recall ≥ 40%** without collapsing precision below 90%.

**Evaluation Script:** `evaluate.py`. Reports full metrics + visual per-clone-type recall bars.

## Architecture & Technology Stack

### Microservices Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Traefik API Gateway                         │
│                         Port 8000                                │
└─────────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
 ┌─────────────────────────┐     ┌─────────────────────────┐
 │   CIPAS Syntactics      │     │    CIPAS Semantics      │
 │   Port 8086             │     │    Port 8087            │
 │                         │     │                         │
 │  Type-1/2/3 Detection   │     │  Type-4 Detection       │
 │  - NiCad Normalization  │     │  - 204 Semantic Features│
 │  - TOMA Approach        │     │  - XGBoost Classifier   │
 │  - XGBoost (Recall Opt) │     │                         │
 └─────────────────────────┘     └─────────────────────────┘
```

### Machine Learning (CIPAS Syntactics)

**CIPAS Syntactics (XGBoost) — Recall-Optimized v2:**
- **Objective:** Maximize Type-3 Recall (≥ 40%) with Precision ≥ 90%.
- **Feature Set:** 6 String + 7 AST core + ~38 Node Distribution = **~51 total features**.
- **Key Hyperparameters:** `scale_pos_weight=5.0`, `colsample_bytree=0.6`, `n_estimators=200`.
- **Explainability (GRADELOOP-83):** Feature names saved with model for importance visualization.
- **Model file:** `type3_xgb.pkl`
- **Location:** `apps/services/cipas-services/cipas-syntactics/models/`
- **Training command:**
  ```bash
  poetry run python train.py --sample-size 8000
  # or via TUI:
  poetry run python tui.py
  ```
- **Evaluation (with calibrated threshold):**
  ```bash
  poetry run python evaluate.py --threshold 0.30 --clone-types 3
  ```

### Feature Engineering Details

#### String Features (6)
Standard text similarity metrics computed on token-normalized code:

| Feature | Description |
|---------|-------------|
| `feat_jaccard_similarity` | Set intersection / union of tokens |
| `feat_dice_coefficient` | 2× intersection / sum of sizes |
| `feat_levenshtein_distance` | Edit distance between token streams |
| `feat_levenshtein_ratio` | Normalized Levenshtein (0–1) |
| `feat_jaro_similarity` | Jaro string distance |
| `feat_jaro_winkler_similarity` | Jaro-Winkler (prefix-weighted) |

#### Core AST Features (7)
Derived from Tree-sitter parse trees:

| Feature | Description |
|---------|-------------|
| `feat_ast_jaccard` | Structural Jaccard over AST node type sets |
| `feat_ast_depth_diff` | Normalized difference in max AST depth |
| `feat_ast_node_count_diff` | Normalized difference in total node count |
| `feat_ast_node_count_ratio` | min/max node count ratio |
| `feat_structural_density_1` | AST nodes per LOC for snippet 1 |
| `feat_structural_density_2` | AST nodes per LOC for snippet 2 |
| `feat_structural_density_diff` | Absolute density difference |

> **Why structural density?** Near-miss Type-3 clones often diverge significantly in text (renamed methods, extracted helpers) but retain the same control-flow complexity. `feat_structural_density` captures this by measuring how many AST nodes exist per line — a metric invariant to identifier renaming.

#### Node-Type Distribution Features (~38)
Per-node-type frequency differences for 38 Java AST constructs (if-statements, for-loops, method invocations, etc.), covering `colsample_bytree=0.6`-gated structural signals that force individual XGBoost trees to learn from these block-level patterns even when String features are excluded from the split candidate set.

### Threshold Sweep & Calibration

After training, `train.py` automatically runs a threshold sweep from **0.10 → 0.50** in 0.05 increments:

```
  Thresh | Precision | Recall  |  F1    | Floor?
  -------+-----------+---------+--------+-------
    0.10 |    0.7823 |  0.8910 | 0.8333 | ✗
    0.15 |    0.8421 |  0.8102 | 0.8259 | ✗
    0.20 |    0.8897 |  0.7663 | 0.8235 | ✗
    0.25 |    0.9134 |  0.6891 | 0.7855 | ✓ ← Selected (max recall @ prec ≥ 90%)
    0.30 |    0.9421 |  0.6103 | 0.7411 | ✓
    0.35 |    0.9612 |  0.5024 | 0.6608 | ✓
    ...
```

The selected threshold is printed at the end of training and should be passed to `evaluate.py` via `--threshold`.

### Automatic Cascade Detection Strategy

| Phase | Method | Features | Threshold | Outcome | Confidence | Early Exit |
|-------|--------|----------|-----------|---------|------------|------------|
| Pass A | Literal comparison | Normalized CST tokens | Jaccard ≥ 0.98, Lev ≥ 0.98 | **Type-1** | 1.0 | ✓ |
| Pass B | Blinded comparison | Blinded CST tokens | max(J, L) ≥ 0.95 **AND** δ ≤ 5% | **Type-2** | ~0.95-0.99 | ✓ |
| Phase Two | ToMa + XGBoost | String + AST + Density (~51 feat.) | XGB proba ≥ calibrated threshold | **Type-3** | XGB score | ✓ |
| Fallback | Escalation | N/A | Pipeline Exhausted | **Non-Syntactic** | N/A | N/A |

**Integration:** The "Non-Syntactic" outcome signals that the pair should be sent to the **CIPAS Semantics** service for high-dimensional Type-4 analysis.

## Scripts & Tools

### Training & Evaluation

| Script | Location | Purpose |
|--------|----------|---------|
| `train.py` | `cipas-syntactics/` | Train recall-optimized XGBoost model with threshold sweep |
| `evaluate.py` | `cipas-syntactics/` | Evaluate model on BCB Balanced; outputs per-clone-type recall KPI |
| `tui.py` | `cipas-syntactics/` | Interactive TUI to configure and run training/evaluation |
| `evaluate_bcb.py` | `cipas-service/scripts/` | Legacy BCB evaluation script |

### TUI Management Interface

Launch the interactive dashboard with:
```bash
cd apps/services/cipas-services/cipas-syntactics
poetry run python tui.py
```

The TUI provides:
- **Task selection**: Train, Evaluate Syntactic, Evaluate BCB (Legacy)
- **Parameter controls**: Sample Size, Model Name, N Estimators, Scale Pos Weight, Colsample Bytree, Threshold
- **Live console**: Real-time output from scripts (including tqdm progress)
- **Keyboard shortcuts**: `q` to quit, `c` to clear log

### Common Commands

```bash
# Train with default recall-optimized settings
poetry run python train.py

# Train with a sample for a quick experiment
poetry run python train.py --sample-size 5000

# Train with custom scale_pos_weight
poetry run python train.py --scale-pos-weight 3.0

# Evaluate on all clone types at default threshold
poetry run python evaluate.py

# Evaluate on Type-3 only with calibrated threshold
poetry run python evaluate.py --threshold 0.30 --clone-types 3

# Evaluate Type-3 only, sample first 1000 per class
poetry run python evaluate.py --threshold 0.25 --clone-types 3 --sample-size 1000
```

## API Response Format

### CIPAS Syntactics Response (Type-3 Example)

```json
{
  "is_clone": true,
  "confidence": 0.782,
  "clone_type": "Type-3",
  "pipeline_used": "Syntactic Cascade (Type-1/2/3)",
  "normalization_level": "Token-based",
  "threshold_used": 0.30,
  "syntactic_features": { "feat_jaccard_similarity": 0.61, "feat_levenshtein_ratio": 0.59, "..." },
  "structural_features": {
    "feat_ast_jaccard": 0.87,
    "feat_structural_density_1": 12.4,
    "feat_structural_density_2": 13.1,
    "feat_structural_density_diff": 0.7
  },
  "node_type_features": { "..." },
  "feature_importance_available": true
}
```

**Non-Syntactic Result Example:**

```json
{
  "is_clone": false,
  "confidence": 0.0,
  "clone_type": "Non-Syntactic",
  "pipeline_used": "Syntactic Cascade (Type-1/2/3)",
  "normalization_level": "Token-based"
}
```

## Feature Categories Summary

| Category | Count | Key Features |
|----------|-------|--------------|
| **String Similarity** | 6 | Jaccard, Dice, Levenshtein ×2, Jaro, Jaro-Winkler |
| **Core AST Structural** | 7 | AST Jaccard, Depth Diff, Node Count ×2, Structural Density ×3 |
| **Node-Type Distribution** | ~38 | Per-node-type freq diff for 38 Java AST constructs |
| **Total** | **~51** | |
