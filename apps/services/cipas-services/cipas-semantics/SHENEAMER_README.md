# Type-IV Code Clone Detector - Sheneamer et al. (2021) Implementation

## Overview

This module implements a **Type-IV (Semantic) Code Clone Detector** based on the framework proposed by **Sheneamer et al. (2021)** in their paper: *"An Effective Semantic Code Clone Detection Framework Using Pairwise Feature Fusion"* (IEEE Access).

The detector uses **machine learning (XGBoost)** with comprehensive feature extraction to identify code snippets that perform the same computational function but have different syntactic structures.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [API Reference](#api-reference)
6. [Feature Extraction](#feature-extraction)
7. [Training](#training)
8. [Evaluation](#evaluation)
9. [CodeNet Dataset](#codenet-dataset)
10. [Examples](#examples)

---

## Features

### Clone Type Detection

| Type | Name | Description | Detected |
|------|------|-------------|----------|
| Type-I | Exact | Identical code with whitespace/comment differences | ❌ |
| Type-II | Renamed | Structurally identical with renamed identifiers | ❌ |
| Type-III | Near-Miss | Modified clones with added/removed statements | ❌ |
| **Type-IV** | **Semantic** | **Functionally equivalent, syntactically different** | ✅ |

### Supported Languages

- **Java** (full support)
- **Python** (full support)
- **C#** (full support)
- **C** (fallback support)

### Feature Categories (101 features per code snippet)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Feature Breakdown (101)                       │
├─────────────────────────────────────────────────────────────────┤
│  Traditional (11)        │ LOC, keyword categories              │
│  Syntactic/CST (40)      │ Non-leaf node frequencies            │
│  Semantic/PDG (20)       │ Program dependency relationships     │
│  Structural Depth (15)   │ Nesting, depth, density metrics      │
│  Type Signatures (10)    │ Parameter/return type patterns       │
│  API Fingerprinting (5)  │ Library usage patterns               │
└─────────────────────────────────────────────────────────────────┘
```

**Fused Features:** 202 (concatenation of two 101-feature vectors)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     FastAPI Service (Port 8087)                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  POST /detect-clones                                              │
│  ├─ Accept: {code1, code2, language}                             │
│  ├─ Extract: 101 features per snippet (Sheneamer framework)      │
│  ├─ Fuse: Linear combination (concatenation) → 202 features      │
│  ├─ Predict: XGBoost classifier → {is_clone, clone_type, conf}   │
│  └─ Return: Clone detection results                              │
│                                                                   │
│  POST /compare                                                    │
│  └─ Legacy endpoint for compatibility                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Tree-sitter │   │   Sheneamer     │   │   XGBoost       │
│   Tokenizer   │   │   Features      │   │   Classifier    │
│               │   │   Extractor     │   │   (Type-IV)     │
│ - Java        │   │ - 101 features  │   │ - Pre-trained   │
│ - Python      │   │ - Post-order    │   │ - Boolean output│
│ - C#          │   │ - PDG-like      │   │ - clone_type    │
│ - C           │   │ - Depth metrics │   │ - Confidence    │
└───────────────┘   └─────────────────┘   └─────────────────┘
```

---

## Installation

### Prerequisites

- **Python**: 3.14 or higher
- **Poetry**: For dependency management
- **RAM**: 4GB minimum (8GB recommended for training)

### Install Dependencies

```bash
cd apps/services/cipas-services/cipas-semantics
poetry install
```

### Verify Installation

```bash
# Test Tree-sitter parsers
poetry run python -c "from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer; print('✓ Tree-sitter loaded')"

# Test feature extractor
poetry run python -c "from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor; print('✓ Sheneamer features loaded')"

# Test XGBoost
poetry run python -c "import xgboost; print('✓ XGBoost loaded')"
```

---

## Quick Start

### 1. Start the Service

```bash
# Development mode
poetry run uvicorn main:app --reload --port 8087

# Production mode
poetry run uvicorn main:app --host 0.0.0.0 --port 8087 --workers 4
```

### 2. Access Interactive Documentation

- **Swagger UI**: http://localhost:8087/docs
- **ReDoc**: http://localhost:8087/redoc

### 3. Detect Clones

```bash
curl -X POST http://localhost:8087/api/v1/semantics/detect-clones \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "int sum(int a, int b) { return a + b; }",
    "code2": "int add(int x, int y) { int result = x + y; return result; }",
    "language": "java"
  }'
```

### 4. Expected Response

```json
{
  "is_clone": true,
  "confidence": 0.92,
  "clone_type": 4,
  "clone_type_label": "Type-IV (Semantic)",
  "pipeline_used": "Sheneamer et al. (2021) Type-IV Detector",
  "features_extracted": 202,
  "feature_categories": {
    "traditional": 11,
    "syntactic_cst": 40,
    "semantic_pdg": 20,
    "structural_depth": 15,
    "type_signatures": 10,
    "api_fingerprinting": 5
  },
  "tokens1_count": 12,
  "tokens2_count": 18,
  "model_available": true
}
```

---

## API Reference

### POST /api/v1/semantics/detect-clones

Detect Type-IV code clones using the Sheneamer et al. (2021) framework.

**Request Body:**

```json
{
  "code1": "string (required)",
  "code2": "string (required)",
  "language": "java|python|csharp|c (default: java)"
}
```

**Response:**

```json
{
  "is_clone": "boolean",
  "confidence": "float (0-1)",
  "clone_type": "integer (1-4) or null",
  "clone_type_label": "string or null",
  "pipeline_used": "string",
  "features_extracted": "integer",
  "feature_categories": "object",
  "tokens1_count": "integer",
  "tokens2_count": "integer",
  "model_available": "boolean"
}
```

### POST /api/v1/semantics/compare

Legacy endpoint for code comparison (backward compatible).

### GET /api/v1/semantics/health

Check service health and model availability.

### GET /api/v1/semantics/feature-importance

Get feature importance scores from the trained model.

### POST /api/v1/semantics/tokenize

Tokenize source code using Tree-sitter.

---

## Feature Extraction

### Traditional Features (11)

| Feature | Description |
|---------|-------------|
| `loc` | Lines of code |
| `keyword_control_flow` | if, else, for, while, etc. |
| `keyword_exception_handling` | try, catch, throw, etc. |
| `keyword_declarations` | int, float, class, etc. |
| `keyword_access_modifiers` | public, private, protected |
| `keyword_oop` | class, extends, implements, etc. |
| `keyword_memory_management` | new, delete, malloc, etc. |
| `keyword_io_operations` | print, read, write, etc. |
| `keyword_import_export` | import, include, using, etc. |
| `keyword_concurrency` | thread, async, await, etc. |
| `keyword_lambda_functional` | lambda, yield, stream, etc. |

### Syntactic/CST Features (40)

Extracted via **post-order traversal** of the Tree-sitter Concrete Syntax Tree:

| Node Type | Description |
|-----------|-------------|
| `if_statement` | Conditional branches |
| `for_statement`, `while_statement` | Loop constructs |
| `try_statement`, `catch_clause` | Exception handling |
| `function_definition`, `method_declaration` | Function definitions |
| `class_declaration` | Class definitions |
| `assignment_expression`, `binary_expression` | Expressions |
| `method_invocation`, `call_expression` | Function calls |
| `block`, `statement_block` | Code blocks |
| ...and 26 more node types | |

### Semantic/PDG Features (20)

Implicit **Program Dependency Graph** relationships:

| Relationship | Description |
|--------------|-------------|
| `control_construct` | Control flow structures |
| `conditional_branch` | If/switch branches |
| `loop_construct` | For/while loops |
| `assignment` | Variable assignments |
| `variable_read`, `variable_write` | Data dependencies |
| `function_call`, `function_return` | Function-level deps |
| `binary_operation`, `unary_operation` | Operations |
| `array_access`, `field_access` | Memory access |
| ...and 10 more relationship types | |

### Structural Depth Features (15)

| Feature | Description |
|---------|-------------|
| `max_cst_depth` | Maximum CST depth |
| `avg_cst_depth` | Average CST depth |
| `leaf_to_internal_ratio` | Tree structure ratio |
| `max_control_nesting` | Deepest control nesting |
| `max_block_nesting` | Deepest block nesting |
| `statement_density` | Statements per line |
| `cyclomatic_complexity` | Decision points + 1 |
| `branching_factor_avg`, `branching_factor_max` | Tree branching |
| ...and 7 more depth metrics | |

### Type Signature Features (10)

| Feature | Description |
|---------|-------------|
| `primitive_return` | int, float, boolean returns |
| `void_return` | Void methods |
| `object_return` | Object/String returns |
| `array_return` | Array returns |
| `generic_return` | Generic/templated returns |
| `no_parameters`, `single_parameter`, `multi_parameters` | Parameter counts |
| `varargs` | Variable arguments |
| `constructor_pattern` | Constructor detection |

### API Fingerprinting Features (5)

| Feature | Description |
|---------|-------------|
| `math_computation` | Math operations |
| `string_manipulation` | String operations |
| `collection_operations` | List/map/set operations |
| `io_file_operations` | File I/O |
| `network_system_calls` | Network/system calls |

---

## Training

### Using CodeNet Dataset

```bash
# Train with Java submissions from CodeNet
poetry run python train_codenet.py \
  --dataset ../../../../datasets/project-codenet \
  --language java \
  --model-name type4_xgb_codenet.pkl \
  --sample-size 10000 \
  --clone-ratio 0.5

# Train with multiple languages
poetry run python train_codenet.py \
  --dataset ../../../../datasets/project-codenet \
  --languages java python csharp \
  --model-name type4_xgb_multilang.pkl \
  --sample-size 20000
```

### Training Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dataset` | `../../../../datasets/project-codenet` | Path to CodeNet |
| `--language` | `java` | Primary language |
| `--languages` | `None` | Multiple languages |
| `--model-name` | `type4_xgb_codenet.pkl` | Output model file |
| `--sample-size` | `10000` | Training pairs |
| `--clone-ratio` | `0.5` | Clone pair ratio |
| `--test-size` | `0.2` | Test split ratio |
| `--no-cv` | `False` | Disable cross-validation |

### Training Output

```
============================================================
Type-IV Code Clone Detector Training (CodeNet)
============================================================
Dataset: ../../../../datasets/project-codenet
Language(s): ['java']
Sample size: 10000
Clone ratio: 0.5
Model name: type4_xgb_codenet.pkl
============================================================
Loading CodeNet dataset...
Found 3500 problems with submissions
Creating 5000 clone pairs...
Creating 5000 non-clone pairs...
Total training pairs: 10000
Extracting Sheneamer features...
Feature matrix shape: (10000, 202)
Class distribution: 5000 clones, 5000 non-clones
Training XGBoost classifier...
Cross-validation F1: 0.8523 (+/- 0.0234)
Test set metrics: {'accuracy': 0.86, 'precision': 0.84, 'recall': 0.87, 'f1': 0.855}
Model saved to /path/to/models/type4_xgb_codenet.pkl
============================================================
TRAINING RESULTS
============================================================
accuracy: 0.8600
precision: 0.8400
recall: 0.8700
f1: 0.8550
cv_f1_mean: 0.8523
cv_f1_std: 0.0234
============================================================
```

---

## Evaluation

### Using BigCloneBench

```bash
poetry run python evaluate_model.py \
  --model models/type4_xgb_codenet.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java \
  --sample-size 5000
```

### Expected Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Accuracy** | >0.85 | Overall correctness |
| **Precision** | >0.85 | True positive rate |
| **Recall** | >0.80 | Detection rate |
| **F1 Score** | >0.85 | Harmonic mean |
| **ROC AUC** | >0.90 | Area under ROC curve |

---

## CodeNet Dataset

### Dataset Structure

```
datasets/project-codenet/
├── data/
│   ├── p00001/
│   │   ├── Java/
│   │   │   ├── s300682070.java
│   │   │   └── ...
│   │   ├── Python/
│   │   └── ...
│   └── ...
├── metadata/
│   ├── problem_list.csv
│   ├── p00001.csv
│   └── ...
└── problem_descriptions/
    ├── p00001.html
    └── ...
```

### Clone Pair Creation Strategy

**Positive Pairs (Clones):**
- Solutions to the **same problem** are considered semantic clones
- Different implementations of the same algorithm
- Varying coding styles and approaches

**Negative Pairs (Non-Clones):**
- Solutions to **different problems**
- Functionally unrelated code

### Sampling

```python
# Example: Load submissions for a problem
loader = CodeNetDataLoader("../../../../datasets/project-codenet", "Java")
submissions = loader.load_problem_submissions("p00001")

# Create training pairs
code1_list, code2_list, labels = loader.create_training_pairs(
    sample_size=10000,
    clone_ratio=0.5
)
```

---

## Examples

### Python Client

```python
import requests

def detect_clones(code1: str, code2: str, language: str = "java") -> dict:
    """Detect Type-IV clones between two code snippets."""
    response = requests.post(
        "http://localhost:8087/api/v1/semantics/detect-clones",
        json={
            "code1": code1,
            "code2": code2,
            "language": language
        }
    )
    return response.json()

# Example usage
code1 = """
public int sum(int a, int b) {
    return a + b;
}
"""

code2 = """
public int add(int x, int y) {
    int result = x + y;
    return result;
}
"""

result = detect_clones(code1, code2, "java")
print(f"Is clone: {result['is_clone']}")
print(f"Confidence: {result['confidence']:.2%}")
print(f"Clone type: {result['clone_type_label']}")
```

### Batch Detection

```python
def batch_detect(pairs: list[dict]) -> list[dict]:
    """Detect clones for multiple code pairs."""
    response = requests.post(
        "http://localhost:8087/api/v1/semantics/compare/batch",
        json={"pairs": pairs}
    )
    return response.json()["results"]

# Example
pairs = [
    {"code1": "int sum(int a, int b) { return a + b; }",
     "code2": "int add(int x, int y) { return x + y; }",
     "language": "java"},
    {"code1": "int sum(int a, int b) { return a + b; }",
     "code2": "int mul(int a, int b) { return a * b; }",
     "language": "java"}
]

results = batch_detect(pairs)
for i, result in enumerate(results):
    print(f"Pair {i+1}: is_clone={result['is_clone']}, confidence={result['confidence']:.2f}")
```

### Feature Extraction (Direct)

```python
from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor

extractor = SheneamerFeatureExtractor()

code1 = "int sum(int a, int b) { return a + b; }"
code2 = "int add(int x, int y) { int result = x + y; return result; }"

# Extract features for single code snippet
features1 = extractor.extract_features(code1, language="java")
print(f"Features shape: {features1.shape}")  # (101,)

# Extract fused features for pair comparison
fused = extractor.extract_fused_features(code1, code2, language="java")
print(f"Fused features shape: {fused.shape}")  # (202,)

# Get feature names
names = extractor.get_feature_names(fused=True)
print(f"First 10 features: {names[:10]}")
```

---

## References

1. **Sheneamer, A., et al. (2021).** "An Effective Semantic Code Clone Detection Framework Using Pairwise Feature Fusion." *IEEE Access*, Vol. 9, pp. 93253-93269. DOI: 10.1109/ACCESS.2021.3093020

2. **Project CodeNet:** "A Large-Scale Code Dataset for Code Similarity and Classification Tasks." IBM Research.

3. **BigCloneBench:** "A Benchmark for Code Clone Detection Tools."

---

## License

This implementation is part of the GradeLoop Core project. See the main repository for licensing information.
