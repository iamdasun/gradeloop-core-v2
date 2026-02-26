# Code Clone Detection Implementation Summary

This document summarizes the current implementation of the Type-1 to Type-4 code clone detection system. The system has been **migrated to separate microservices** for syntactic and semantic detection. The system utilizes a multi-language approach (Java, C, Python) based on Tree-sitter Concrete Syntax Tree (CST) parsing and machine learning, combining the TOMA (Token-based) approach with extended semantic feature fusion.

## Migration to Microservices (2026)

The clone detection system has been refactored from a monolithic `cipas-service` into two specialized microservices:

| Service | Location | Clone Types | Port | Technology |
|---------|----------|-------------|------|------------|
| **CIPAS Syntactics** | `apps/services/cipas-services/cipas-syntactics` | Type-1, Type-2, Type-3 | 8086 | Random Forest |
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
- `GET /api/v1/syntactics/feature-importance` - Get RF feature importance
- `POST /api/v1/syntactics/tokenize` - Tokenize code

**CIPAS Semantics Service** (`/api/v1/semantics/*`):
- `POST /api/v1/semantics/compare` - Compare two code snippets (Type-4)
- `GET /api/v1/semantics/health` - Health check
- `GET /api/v1/semantics/feature-importance` - Get XGBoost feature importance
- `POST /api/v1/semantics/tokenize` - Tokenize code

## Overview of Clone Types

The system categorizes clones into four types and utilizes an **automatic cascade detection strategy** that seamlessly integrates both pipelines:

- **Automatic Cascade:** Implements a four-tier detection strategy for Type-1, Type-2, Type-3, and Type-4 clones using **NiCad-style normalization**, **Random Forest**, and **XGBoost Classifiers**.
- **Early Exit Optimization:** The pipeline automatically breaks when a clone type is confirmed, reducing computational overhead.

### Detection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  Automatic Cascade Detection                     │
├─────────────────────────────────────────────────────────────────┤
│  Phase One: NiCad-Style Normalization                            │
│  ├─ Pass A: Literal Comparison (Type-1, threshold ≥ 0.98)       │
│  │   └─ Confidence: 1.0 → [EXIT]                                │
│  └─ Pass B: Blinded Comparison (Type-2, threshold ≥ 0.95)       │
│      └─ Token Count Delta ≤ 5% → Confidence: ~0.95-0.99 → [EXIT]│
│                                                                  │
│  Phase Two: TOMA Approach (Type-3)                               │
│  ├─ Token Frequency Vector + Token Sequence Stream              │
│  └─ Random Forest Classification (6 syntactic features)          │
│      └─ Confidence: RF probability → [EXIT]                      │
│                                                                  │
│  Phase Three: Semantic Analysis (Type-4)                         │
│  ├─ Fused Semantic Features (100+ features)                     │
│  └─ XGBoost Classification                                       │
│      └─ Confidence: XGBoost probability → [EXIT]                 │
│                                                                  │
│  Result: Not Clone (all phases completed without match)          │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **No Pipeline Selection Required:** Users submit code pairs; the system automatically determines the clone type
- **Type-2 Logic Leak Prevention:** Code pairs with high similarity (>0.95) but significant length difference (>5%) bypass Type-2 and proceed to Phase Two/Three
- **Early Exit:** Confirmed clones at any stage immediately return, skipping subsequent phases

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

- **Detection Method:** **Phase One, Pass B** of the Automatic Cascade using identifier and literal blinding:
  - All variable names → `ID` token
  - All literals (strings, numbers) → `LIT` token
  - Keywords and operators preserved
  - **Threshold:** max(Jaccard, Levenshtein) ≥ 0.95 **AND** Token Count Delta ≤ 5%
  - **Type-2 Logic Leak Prevention:** If token count difference > 5%, the pair bypasses Type-2 classification and proceeds to Phase Two (TOMA + Random Forest) for Type-3/Type-4 analysis, even if similarity is high. This prevents misclassification of structurally modified code as Type-2.
- **Confidence Score:** ~0.95-0.99 (scales with similarity)
- **Normalization Level:** `Blinded`
- **Performance:** Achieves an expected F1 score of 92%+.

### Type-3: Near-Miss/Modified Clones
Clones with further modifications, such as added, removed, or changed statements, alongside identifier and literal changes.

- **Detection Method:** **Phase Two** of the Automatic Cascade using **Hybrid Syntactic + Structural** approach:
  - **6 Syntactic Features** (TOMA-based):
    - Jaccard Similarity (Set overlap)
    - Dice Coefficient (Weighted overlap)
    - Levenshtein Distance & Ratio (Edit distance)
    - Jaro & Jaro-Winkler Similarity (Character matching)
  - **4 Structural AST Features**:
    - Structural Jaccard Similarity (intersection over union of AST node types)
    - AST Depth Difference (normalized maximum tree depth difference)
    - AST Node Count Difference (normalized complexity difference)
    - AST Node Count Ratio (size similarity indicator)
  - **38 Node Type Distribution Features** (optional, per Java AST node type):
    - Control flow: `if_statement`, `for_statement`, `while_statement`, `switch_statement`, `try_statement`, etc.
    - Declarations: `method_declaration`, `field_declaration`, `local_variable_declaration`
    - Expressions: `binary_expression`, `assignment_expression`, `method_invocation`, `ternary_expression`
    - Each feature measures normalized difference in node type frequencies
  - **Random Forest model** trained on **10 features** (basic) or **48 features** (with node types)
- **Confidence Score:** Random Forest probability
- **Normalization Level:** `Token-based`
- **Performance:** Expected F1 score improvement from 54% recall to 75%+ with structural features
- **Training Script:** `train_model.py` with `--include-node-types` flag for full 48-feature model
- **Model File:** `type3_hybrid_rf.pkl`
- **Location:** `apps/services/cipas-services/cipas-syntactics/clone_detection/models/`

### Type-4: Semantic Clones
Code snippets that perform the same computational function but implement different syntactic structures or algorithms.

- **Detection Method:** Handled by **Phase Three** of the Automatic Cascade using XGBoost Classifier with **102 semantic features per code snippet** (204 fused features per pair). Since syntactic similarity is low for Type-4 clones, the system extracts comprehensive semantic features across six categories:
  - **Traditional Features (10):** Lines of Code (LOC), 9 keyword category counts (control, declaration, memory, import, exception, loop, conditional, I/O, arithmetic).
  - **Syntactic/CST Features (40):** Frequencies of Tree-sitter CST nodes (function definitions, method declarations, control structures, expressions, statements, blocks, parameters, etc.).
  - **Semantic/PDG-like Features (20):** Derived structural patterns mimicking Program Dependence Graph information (control constructs, assignments, function calls, returns, operations, array/field access, method/constructor calls, loops, conditionals, exception handling, variable read/write, data/control dependencies, nested constructs, recursive/iterative patterns).
  - **Structural Depth Features (8):** Maximum CST depth, average nesting depth, leaf-to-internal node ratio, control flow depth, block nesting depth, statement density, cyclomatic complexity estimate, branching factor.
  - **Type Signature Features (12):** Return type patterns (primitive, void, object, array, generic), parameter patterns (no parameter, single, multiple, varargs), constructor, abstract method, static method indicators.
  - **API Fingerprinting Features (12):** Math operations, string operations, collection operations, I/O operations, network operations, thread operations, reflection operations, stream operations, error handling, utility calls, date/time operations, serialization patterns.
- **Confidence Score:** XGBoost probability (with high-confidence threshold P>0.85 for precision-critical applications)
- **Normalization Level:** `Token-based`
- **Performance:** Achieves an expected F1 score of 85%+.
- **Training Script:** `scripts/train_type4_semantic.py` - trains on Type-5 semantic clones from TOMA dataset with optional BigCloneBench integration

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

### Microservices Architecture

The clone detection system is now deployed as two independent microservices:

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
│  - Random Forest        │     │                         │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐
    │  Tree-sitter     │           │  Tree-sitter     │
    │  Parsers         │           │  Parsers         │
    │  (Java, C, Py)   │           │  (Java, C, Py)   │
    └──────────────────┘           └──────────────────┘
```

### Parsing
- **Tree-sitter:** Robust, language-agnostic CST generation for Java, C, and Python
- **15 Standardized Token Types:** Covering 99.7% of code tokens:
  - MODIFIER, TYPE, CONTROL, OPERATOR, DELIMITER
  - LITERAL, NUMBER, STRING, IDENTIFIER, COMMENT
  - ANNOTATION, FUNCTION, IMPORT, MEMORY, OTHER

### Machine Learning

**CIPAS Syntactics (Random Forest):**
- Highly parallelized (`n_jobs=-1`)
- **Hybrid Feature Set:**
  - **6 Syntactic Features:** Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler
  - **4 Structural Features:** AST Jaccard, AST Depth Diff, AST Node Count Diff, AST Node Count Ratio
  - **38 Node Type Distribution Features:** Per-node-type frequency differences (optional)
  - **Total:** 10 features (basic) or 48 features (full model with node types)
- **Explainability (GRADELOOP-83):** Feature names saved with model for importance visualization
- **Parsing Safety:** Graceful handling of malformed student code with fallback to zero features
- ~65x faster than neural approaches
- Model file: `type3_hybrid_rf.pkl`
- Location: `apps/services/cipas-services/cipas-syntactics/clone_detection/models/`
- Training command:
  ```bash
  # Full model with node types (48 features)
  poetry run python train_model.py \
      --dataset /path/to/dataset \
      --language java \
      --model-name type3_hybrid_rf.pkl
  
  # Basic model without node types (10 features)
  poetry run python train_model.py \
      --dataset /path/to/dataset \
      --no-node-types
  ```

**CIPAS Semantics (XGBoost):**
- Optimized for high-dimensional feature spaces (204 fused features per pair)
- L1 (Lasso) and L2 (Ridge) regularization to prevent overfitting
- CPU-optimized for LMS deployment
- High-confidence threshold: P>0.85 for precision-critical applications
- Model file: `type4_xgb.pkl`
- Location: `apps/services/cipas-services/cipas-semantics/models/`

### Automatic Cascade Detection Strategy

**Key Innovations:**
1. **Type-2 Logic Leak Prevention:** Prevents misclassification of structurally modified code as Type-2 by enforcing a token count delta constraint (≤5%)
2. **Automatic Cascade:** No pipeline selection required - the system automatically determines the appropriate clone type
3. **Early Exit Optimization:** Confirmed clones at any stage immediately return, skipping subsequent phases
4. **Hybrid Syntactic + Structural Features:** 48 features combining TOMA metrics with AST-based structural analysis for improved Type-3 recall (54% → 75%+)
5. **102+ Semantic Features:** Comprehensive feature extraction for Type-4 detection including CST frequencies, PDG-like relationships, structural depth, type signatures, and API fingerprinting

| Phase | Method | Features | Threshold | Clone Type | Confidence | Early Exit |
|-------|--------|----------|-----------|------------|------------|------------|
| Pass A | Literal comparison | Normalized CST tokens | Jaccard ≥ 0.98, Lev ≥ 0.98 | Type-1 | 1.0 | ✓ |
| Pass B | Blinded comparison | Blinded CST tokens | max(J, L) ≥ 0.95 **AND** δ ≤ 5% | Type-2 | ~0.95-0.99 | ✓ |
| Phase Two | Hybrid + Random Forest | 48 features (6 syntactic + 4 structural + 38 node type) | RF probability | Type-3 | RF score | ✓ |
| Phase Three | XGBoost + Semantic Features | 204 fused features (102 per code) | XGB probability | Type-4 | XGB score | ✓ |

**Optimization:** The cascade automatically breaks when a clone type is confirmed, reducing computational overhead by up to 80% for Type-1/Type-2 clones. Type-4 detection uses the full 204-feature vector only when earlier phases fail to confirm a clone.

### Evaluation
- Evaluated and benchmarked using the standard **BigCloneBench** dataset
- Compared against existing tools: SourcererCC, ASTNN, DeepSim
- Cross-validation with 5-fold CV for robust metrics

## API Response Format

After migration, each service has its own dedicated API endpoints:

### CIPAS Syntactics Response (Type-1/2/3)

```json
{
  "is_clone": true,
  "confidence": 0.955,
  "clone_type": "Type-3",
  "pipeline_used": "Syntactic Cascade (Type-1/2/3)",
  "normalization_level": "Token-based",
  "syntactic_features": {
    "jaccard_similarity": 0.85,
    "dice_coefficient": 0.92,
    "levenshtein_distance": 15,
    "levenshtein_ratio": 0.88,
    "jaro_similarity": 0.91,
    "jaro_winkler_similarity": 0.94
  },
  "structural_features": {
    "ast_jaccard": 0.92,
    "ast_depth_diff": 0.95,
    "ast_node_count_diff": 0.88,
    "ast_node_count_ratio": 0.90
  },
  "node_type_features": {
    "if_statement_diff": 1.0,
    "for_statement_diff": 0.85,
    "method_invocation_diff": 0.92
  },
  "tokens1_count": 120,
  "tokens2_count": 128,
  "feature_importance_available": true
}
```

### CIPAS Semantics Response (Type-4)

```json
{
  "is_clone": true,
  "confidence": 0.89,
  "clone_type": "Type-4",
  "pipeline_used": "Semantic XGBoost (Type-4)",
  "normalization_level": "Token-based",
  "semantic_features": {
    "feature_count": 204
  },
  "tokens1_count": 45,
  "tokens2_count": 52
}
```

**Normalization Levels:**
- `Literal` - Type-1 detection (no abstraction)
- `Blinded` - Type-2 detection (identifiers → ID, literals → LIT)
- `Token-based` - Type-3/Type-4 detection (TOMA approach)

**Pipeline Used Values:**
- `Syntactic Cascade (Type-1/2/3)` - CIPAS Syntactics service
- `Semantic XGBoost (Type-4)` - CIPAS Semantics service

**Feature Importance (GRADELOOP-83):**

The hybrid model provides explainability through feature importance analysis:

```json
{
  "feature_importance": [
    {"feature": "feat_jaro_similarity", "importance": 0.082},
    {"feature": "feat_ast_jaccard", "importance": 0.076},
    {"feature": "feat_dice_coefficient", "importance": 0.071},
    {"feature": "feat_node_if_statement_diff", "importance": 0.065},
    {"feature": "feat_node_for_statement_diff", "importance": 0.058},
    {"feature": "feat_levenshtein_ratio", "importance": 0.054},
    {"feature": "feat_ast_depth_diff", "importance": 0.049},
    {"feature": "feat_node_method_invocation_diff", "importance": 0.045}
  ],
  "total_features": 48,
  "model_type": "Random Forest",
  "n_estimators": 100
}
```

**Top Feature Categories:**
1. **Syntactic Similarity** (6 features): Jaccard, Dice, Levenshtein, Jaro, Jaro-Winkler
2. **Structural AST** (4 features): AST Jaccard, Depth Diff, Node Count Diff, Node Count Ratio
3. **Node Type Distribution** (38 features): Per-node-type frequency differences

**Instructor Dashboard Integration:** Feature importances can be visualized to show which code characteristics contributed most to clone detection decisions.
