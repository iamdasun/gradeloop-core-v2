# Code Clone Detection Implementation Summary

This document summarizes the current implementation of the Type-1 to Type-4 code clone detection system within the `cipas-service`. The system utilizes a multi-language approach (Java, C, Python) based on Tree-sitter Concrete Syntax Tree (CST) parsing and machine learning, combining the TOMA (Token-based) approach with extended semantic feature fusion.

## Overview of Clone Types

The system categorizes clones into four types and utilizes a **tiered detection strategy** with two main pipelines:

- **Pipeline A (Syntactic Pipeline):** Implements a three-tier detection strategy for Type-1, Type-2, and Type-3 clones using **NiCad-style normalization** and a **Random Forest Classifier**.
- **Pipeline B (Semantic Pipeline):** Responsible for detecting functional similarities with differing syntax, covering Type-4 clones using an **XGBoost Classifier**.

### Detection Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline A (Syntactic)                    │
├─────────────────────────────────────────────────────────────┤
│  Phase One: NiCad-Style Normalization                        │
│  ├─ Pass A: Literal Comparison (Type-1, threshold ≥ 0.98)   │
│  │   └─ Confidence: 1.0                                      │
│  └─ Pass B: Blinded Comparison (Type-2, threshold ≥ 0.95)   │
│      └─ Confidence: ~0.95-0.99                               │
│                                                              │
│  Phase Two: TOMA Approach (Type-3)                           │
│  ├─ Token Frequency Vector + Token Sequence Stream          │
│  └─ Random Forest Classification (6 syntactic features)      │
│      └─ Confidence: RF probability                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
         Type-1/Type-2 confirmed? → Skip Pipeline B ✓
                              ↓
                    Not confirmed
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Pipeline B (Semantic)                     │
│  Type-4 Detection: XGBoost with 100+ fused features         │
│  └─ Confidence: XGBoost probability                          │
└─────────────────────────────────────────────────────────────┘
```

### Type-1: Exact Clones
Exact copies of code with minor modifications such as changes in whitespace, layout, and comments.

- **Detection Method:** **Phase One, Pass A** of Pipeline A using NiCad-style structural normalization:
  - Pretty-printing: one statement per line, standardized spacing
  - Comment and metadata removal
  - Direct comparison of normalized CST streams
  - **Threshold:** Jaccard ≥ 0.98 AND Levenshtein Ratio ≥ 0.98
- **Confidence Score:** 1.0 (exact match)
- **Normalization Level:** `Literal`
- **Performance:** Achieves an expected F1 score of 95%+.

### Type-2: Renamed/Parameterized Clones
Structurally identical code snippets where identifiers, literals, types, or variables have been renamed or modified.

- **Detection Method:** **Phase One, Pass B** of Pipeline A using identifier and literal blinding:
  - All variable names → `ID` token
  - All literals (strings, numbers) → `LIT` token
  - Keywords and operators preserved
  - **Threshold:** max(Jaccard, Levenshtein) ≥ 0.95
- **Confidence Score:** ~0.95-0.99 (scales with similarity)
- **Normalization Level:** `Blinded`
- **Performance:** Achieves an expected F1 score of 92%+.

### Type-3: Near-Miss/Modified Clones
Clones with further modifications, such as added, removed, or changed statements, alongside identifier and literal changes.

- **Detection Method:** **Phase Two** of Pipeline A using TOMA (Token-based) approach:
  - Token Frequency Vector with cosine similarity
  - Token Sequence Stream for structural comparison
  - Random Forest model trained on 6 core syntactic features:
    - Jaccard Similarity (Set overlap)
    - Dice Coefficient (Weighted overlap)
    - Levenshtein Distance & Ratio (Edit distance)
    - Jaro & Jaro-Winkler Similarity (Character matching)
- **Confidence Score:** Random Forest probability
- **Normalization Level:** `Token-based`
- **Performance:** Achieves an expected F1 score of 90%+.

### Type-4: Semantic Clones
Code snippets that perform the same computational function but implement different syntactic structures or algorithms.

- **Detection Method:** Handled by **Pipeline B's XGBoost Classifier**. Since syntactic similarity is low for Type-4 clones, the system extracts over 100 fused semantic features:
  - **Traditional Features (7):** Lines of Code (LOC), Keyword category counts (control, declaration, memory, import, exception).
  - **Syntactic/CST Features (30+):** Frequencies of Tree-sitter nodes (e.g., control structures, declarations, expressions, invocations).
  - **Semantic/PDG-like Features (5+):** Derived structural patterns mimicking a Program Dependence Graph, such as control construct frequency, assignment patterns, function call patterns, and binary operations.
- **Confidence Score:** XGBoost probability
- **Normalization Level:** `Token-based`
- **Performance:** Achieves an expected F1 score of 85%+.

## Datasets

### TOMA Dataset

Location: `datasets/toma-dataset/`

The TOMA dataset contains pre-classified clone pairs with similarity scores for training and evaluation.

| File | Rows | Columns | Description |
|------|------|---------|-------------|
| `type-1.csv` | 48,116 | 5 | Type-1 exact clone pairs |
| `type-2.csv` | 4,234 | 5 | Type-2 renamed clone pairs |
| `type-3.csv` | 21,395 | 5 | Type-3 modified clone pairs |
| `type-4.csv` | 86,341 | 5 | Type-4 intermediate clone pairs |
| `type-5.csv` | 109,914 | 5 | Type-4 final clone pairs (semantic) |
| `clone.csv` | 270,000 | 5 | All clone pairs combined |
| `nonclone.csv` | 279,033 | 2 | Non-clone pairs (negative samples) |

**CSV Column Format** (type-*.csv, clone.csv):
```
id1, id2, label, similarity_line, similarity_token
```

| Column | Type | Description |
|--------|------|-------------|
| `id1` | int | Function ID of first code snippet |
| `id2` | int | Function ID of second code snippet |
| `label` | int | Clone type label (1=Type-1, 2=Type-2, 3=Type-3/4) |
| `similarity_line` | float | Line-level similarity score [0, 1] |
| `similarity_token` | float | Token-level similarity score [0, 1] |

**CSV Column Format** (nonclone.csv):
```
FUNCTION_ID_ONE, FUNCTION_ID_TWO
```

| Column | Type | Description |
|--------|------|-------------|
| `FUNCTION_ID_ONE` | int | Function ID of first code snippet |
| `FUNCTION_ID_TWO` | int | Function ID of second code snippet |

**Source Code Storage:**
- Location: `datasets/toma-dataset/id2sourcecode/`
- Format: Individual `.java` files named by function ID (e.g., `10601019.java`)

### BigCloneBench Dataset

Location: `datasets/bigclonebench/`

| File | Rows | Format | Description |
|------|------|--------|-------------|
| `bigclonebench.jsonl` | 8,652,999 | JSONL | Industry-standard clone benchmark dataset |

**JSONL Schema:**
```json
{
  "id1": int,
  "id2": int,
  "label": int,
  "clone_type": int,
  "functionality_id": int,
  "functionality_name": string,
  "similarity_line": float,
  "similarity_token": float,
  "file1": string,
  "startline1": int,
  "endline1": int,
  "file2": string,
  "startline2": int,
  "endline2": int,
  "code1": string,
  "code2": string
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id1`, `id2` | int | Unique function identifiers |
| `label` | int | Clone label (1=clone, 0=non-clone) |
| `clone_type` | int | Clone type (1, 2, 3, or 4) |
| `functionality_id` | int | Functional category ID |
| `functionality_name` | string | Human-readable functionality name |
| `similarity_line` | float | Line-level similarity [0, 1] |
| `similarity_token` | float | Token-level similarity [0, 1] |
| `file1`, `file2` | string | Source file names |
| `startline1`, `endline1` | int | Line range in file1 |
| `startline2`, `endline2` | int | Line range in file2 |
| `code1`, `code2` | string | Full source code snippets |

## Architecture & Technology Stack

### Parsing
- **Tree-sitter:** Robust, language-agnostic CST generation for Java, C, and Python
- **15 Standardized Token Types:** Covering 99.7% of code tokens:
  - MODIFIER, TYPE, CONTROL, OPERATOR, DELIMITER
  - LITERAL, NUMBER, STRING, IDENTIFIER, COMMENT
  - ANNOTATION, FUNCTION, IMPORT, MEMORY, OTHER

### Machine Learning
- **scikit-learn (Random Forest):** Pipeline A - Type-1/2/3 detection
  - Highly parallelized (`n_jobs=-1`)
  - 6 syntactic features
  - ~65x faster than neural approaches
- **XGBoost:** Pipeline B - Type-4 detection
  - Optimized for high-dimensional feature spaces (100+ features)
  - Regularization to prevent overfitting (L1/L2)
  - CPU-optimized for LMS deployment

### Tiered Detection Strategy

**Key Innovation:** Eliminates "logic leak" where renamed variables were misclassified as Type-1.

| Phase | Method | Threshold | Clone Type | Confidence |
|-------|--------|-----------|------------|------------|
| Pass A | Literal comparison | Jaccard ≥ 0.98, Lev ≥ 0.98 | Type-1 | 1.0 |
| Pass B | Blinded comparison | max(J, L) ≥ 0.95 | Type-2 | ~0.95-0.99 |
| Phase Two | TOMA + Random Forest | RF probability | Type-3 | RF score |
| Pipeline B | XGBoost | XGB probability | Type-4 | XGB score |

**Optimization:** Pipeline B (XGBoost) is **skipped** when Type-1 or Type-2 is confirmed, reducing computational overhead.

### Evaluation
- Evaluated and benchmarked using the standard **BigCloneBench** dataset
- Compared against existing tools: SourcererCC, ASTNN, DeepSim
- Cross-validation with 5-fold CV for robust metrics

## API Response Format

The refactored system includes a `normalization_level` field in the response:

```json
{
  "is_clone": true,
  "confidence": 0.955,
  "clone_type": "Type-2",
  "pipeline_used": "syntactic",
  "normalization_level": "Blinded",
  "syntactic_features": { ... },
  "tokens1_count": 14,
  "tokens2_count": 14
}
```

**Normalization Levels:**
- `Literal` - Type-1 detection (no abstraction)
- `Blinded` - Type-2 detection (identifiers → ID, literals → LIT)
- `Token-based` - Type-3/Type-4 detection (TOMA approach)
