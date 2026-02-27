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
│  ├─ Hybrid String + AST Features (10-48 features)                │
│  ├─ Classifier: XGBoost (trained on Type-3 & Type-4 positives)   │
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

- **Detection Method:** **Phase Two** of the Syntactic Cascade using **ToMa + XGBoost** with hybrid features:
  - **6 Syntactic Features** (String-based): Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler.
  - **4+N Structural Features** (AST-based): AST Jaccard, Depth Difference, Node Count Difference/Ratio, and optional per-node-type distribution diffs.
  - **Objective:** Maximum Type-3 Recall while maintaining **Precision > 90%**.
- **Training Strategy:** 
  - **Positives (Label 1):** `type-3.csv` (near-miss) and `type-4.csv` (moderate Type-3).
  - **Negatives (Label 0):** `nonclone.csv` (negative samples).
  - **Optimization:** Uses `scale_pos_weight=3.0` and a custom threshold (typically **0.25 - 0.35**) to prioritize near-miss detection.
- **Confidence Score:** XGBoost probability.
- **Normalization Level:** `Token-based`.
- **Performance:** Evaluated on `bigclonebench_balanced.json` with per-clone-type recall breakdown.
- **Training Script:** `train.py`.
- **Model File:** `type3_xgb.pkl`.
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

| File | Rows | Columns | Syntactic Label | Description |
|------|------|---------|-----------------|-------------|
| `type-3.csv` | 21,395 | 5 | **Positive (1)** | Type-3 syntactic near-miss clones |
| `type-4.csv` | 86,341 | 5 | **Positive (1)** | Moderate Type-3 clones (still syntactic) |
| `type-5.csv` | 109,914 | 5 | **N/A** | Type-4 semantic clones (Reserved for Semantics) |
| `nonclone.csv` | 279,033 | 2 | **Negative (0)** | Confirmed non-clone pairs |

**Syntactic Feature Training:** The Phase 2 model focuses on distinguishing syntactic near-misses from confirmed non-clones. Semantic clones are excluded from this stage to avoid penalizing logic similarity that doesn't share structural patterns.

### BigCloneBench Dataset

Location: `datasets/bigclonebench/`

| File | Rows | Format | Description |
|------|------|--------|-------------|
| `bigclonebench.jsonl` | 8,652,999 | JSONL | Full industry benchmark |
| `bigclonebench_balanced.json` | 64,223 | JSON | **Evaluation Set**: Balanced distribution of Type-1, 2, 3, and Non-clones. |

**Evaluation Split:**
- Clones (1, 2, 3) → Positive Label
- Non-clones → Negative Label
- Type-4 (Semantic) → Excluded from Syntactic evaluation.

**Evaluation Script:** `evaluate.py`. Loads the model and reports metrics along with a per-clone-type recall breakdown.

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
 │  - NiCad Normalization  │     │  - 102 Semantic Features│
 │  - TOMA Approach        │     │  - XGBoost Classifier   │
 │  - XGBoost              │     │                         │
 └─────────────────────────┘     ┌─────────────────────────┐
```

### Machine Learning (CIPAS Syntactics)

**CIPAS Syntactics (XGBoost):**
- Optimized for high-performance classification
- **Hybrid Feature Set:** 6 Syntactic (String) + 4 Structural (AST) + 38 Node Distribution features.
- **Explainability (GRADELOOP-83):** Feature names saved with model for importance visualization.
- **Model file:** `type3_xgb.pkl`
- **Location:** `apps/services/cipas-services/cipas-syntactics/models/`
- **Training command:**
  ```bash
  poetry run python train.py --sample-size 5000 --tune --cv
  ```
- **Evaluation:**
  ```bash
  poetry run python evaluate.py
  ```

### Automatic Cascade Detection Strategy

| Phase | Method | Features | Threshold | Outcome | Confidence | Early Exit |
|-------|--------|----------|-----------|------------|------------|------------|
| Pass A | Literal comparison | Normalized CST tokens | Jaccard ≥ 0.98, Lev ≥ 0.98 | **Type-1** | 1.0 | ✓ |
| Pass B | Blinded comparison | Blinded CST tokens | max(J, L) ≥ 0.95 **AND** δ ≤ 5% | **Type-2** | ~0.95-0.99 | ✓ |
| Phase Two | ToMa + XGBoost | Hybrid String + AST | XGB probability | **Type-3** | XGB score | ✓ |
| Fallback | Escalation | N/A | Pipeline Exhausted | **Non-Syntactic** | N/A | N/A |

**Integration:** The "Non-Syntactic" outcome signals that the pair should be sent to the **CIPAS Semantics** service for high-dimensional Type-4 analysis.

## API Response Format

### CIPAS Syntactics Response (Type-3 Example)

```json
{
  "is_clone": true,
  "confidence": 0.955,
  "clone_type": "Type-3",
  "pipeline_used": "Syntactic Cascade (Type-1/2/3)",
  "normalization_level": "Token-based",
  "syntactic_features": { ... },
  "structural_features": { ... },
  "node_type_features": { ... },
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

**Top Feature Categories:**
1. **Syntactic Similarity** (6 features): Jaccard, Dice, Levenshtein, Jaro, Jaro-Winkler
2. **Structural AST** (4 features): AST Jaccard, Depth Diff, Node Count Diff, Node Count Ratio
3. **Node Type Distribution** (38 features): Per-node-type frequency differences
