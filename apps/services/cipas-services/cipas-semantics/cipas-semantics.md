# CIPAS Semantics Service - Setup, Training & Evaluation Guide

## Overview

**CIPAS Semantics** is a semantic code clone detection service for **Type-4 clones** (functionally equivalent code with different implementations). It uses:

- **102 semantic features** per code snippet (204 fused features per pair)
- **XGBoost classification** optimized for high-dimensional feature spaces
- **Tree-sitter CST parsing** for multi-language support (Java, C, Python)
- **Six feature categories**: Traditional, CST, Semantic/PDG-like, Structural Depth, Type Signatures, API Fingerprinting

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Instructions](#setup-instructions)
3. [Model Training](#model-training)
4. [Model Evaluation](#model-evaluation)
5. [Running the Service](#running-the-service)
6. [API Usage](#api-usage)
7. [Docker Deployment](#docker-deployment)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Python**: 3.14 or higher
- **RAM**: Minimum 4GB (8GB recommended for training)
- **Storage**: 500MB for dependencies + model storage
- **OS**: Linux, macOS, or Windows with WSL

### Required Dependencies

The project uses **Poetry** for dependency management. Install it if not already available:

```bash
pip install poetry
```

---

## Setup Instructions

### 1. Navigate to the Service Directory

```bash
cd apps/services/cipas-services/cipas-semantics
```

### 2. Create Virtual Environment (Poetry)

```bash
poetry install
```

This will:
- Create a virtual environment with Python 3.14
- Install all dependencies from `pyproject.toml`
- Set up the project for development

### 3. Verify Installation

```bash
poetry run python -c "from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer; print('✓ Tree-sitter loaded')"
poetry run python -c "import xgboost; print('✓ XGBoost loaded')"
```

### 4. Create Models Directory

```bash
mkdir -p models
```

---

## Model Training

### Understanding the Training Process

The semantic classifier uses **XGBoost** to detect Type-4 clones. Training requires:

- **Dataset**: Labeled code pairs (clone/not-clone) with semantic features
- **Feature Extraction**: 102 features per snippet, 204 fused per pair
- **Output**: Trained model saved as `models/type4_xgb.pkl`

### Training with TOMA Dataset

The `train_model.py` script is already created and supports the TOMA dataset format.

#### TOMA Dataset Structure

The TOMA dataset at `datasets/toma-dataset/` contains:
- `clone.csv`: Clone pairs with function IDs and clone types
- `nonclone.csv`: Non-clone pairs with function IDs
- `id2sourcecode/`: Individual `.java` files named by function ID

#### Running Training (TOMA Dataset)

```bash
# Train with full TOMA dataset (may take several hours)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl

# Train with sampled data (faster, for testing)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl \
  --sample-size 10000

# Train with specific clone types (e.g., Type-4 only for semantic detection)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl \
  --clone-types 4 \
  --sample-size 5000

# Train with Type-3 and Type-4 clones
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl \
  --clone-types 3 4 \
  --sample-size 8000
```

#### Training with Custom JSON Dataset

You can also use a custom JSON dataset:

```bash
poetry run python train_model.py \
  --dataset /path/to/dataset.json \
  --dataset-format json \
  --language java \
  --model-name type4_xgb.pkl
```

#### JSON Dataset Format

```json
[
  {
    "code1": "int sum(int a, int b) { return a + b; }",
    "code2": "int add(int x, int y) { int result = x + y; return result; }",
    "label": 1
  },
  {
    "code1": "int sum(int a, int b) { return a + b; }",
    "code2": "int multiply(int a, int b) { return a * b; }",
    "label": 0
  }
]
```

### Training Output

Expected output:
```
2026-02-26 10:00:00 - __main__ - INFO - Loading toma dataset from ../../../../datasets/toma-dataset...
2026-02-26 10:00:10 - __main__ - INFO - Loaded 20000 code pairs
2026-02-26 10:00:10 - __main__ - INFO - Class distribution: 10000 clones, 10000 non-clones
2026-02-26 10:00:10 - __main__ - INFO - Extracting semantic features...
2026-02-26 10:15:00 - __main__ - INFO - Feature matrix shape: (20000, 204)
2026-02-26 10:15:01 - __main__ - INFO - Training XGBoost classifier...
2026-02-26 10:16:00 - __main__ - INFO - Cross-validation F1: 0.8523 (+/- 0.0234)
2026-02-26 10:16:00 - __main__ - INFO - Test set metrics: {'accuracy': 0.86, 'precision': 0.84, 'recall': 0.87, 'f1': 0.855}
2026-02-26 10:16:01 - __main__ - INFO - Model saved to /path/to/cipas-semantics/models/type4_xgb.pkl
```

---

## Model Evaluation

### Evaluation with BigCloneBench Dataset

The `evaluate_model.py` script supports BigCloneBench, TOMA, and JSON formats.

#### Running Evaluation (BigCloneBench)

```bash
# Evaluate with BigCloneBench dataset
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# Evaluate with sampled data (faster)
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java \
  --sample-size 5000
```

#### Running Evaluation (TOMA Dataset)

```bash
# Evaluate with TOMA dataset
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java

# Evaluate with sampled data
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --sample-size 5000
```

#### Running Evaluation (JSON Dataset)

```bash
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset /path/to/test_dataset.json \
  --dataset-format json \
  --language java
```

### Evaluation Output

Expected output:
```
2026-02-26 11:00:00 - __main__ - INFO - Loading model from models/type4_xgb.pkl...
2026-02-26 11:00:01 - __main__ - INFO - Loading BigCloneBench dataset from ../../../../datasets/bigclonebench/bigclonebench.jsonl...
2026-02-26 11:00:05 - __main__ - INFO - Found 100000 entries in BigCloneBench
2026-02-26 11:00:10 - __main__ - INFO - Loaded 5000 code pairs from BigCloneBench
2026-02-26 11:00:10 - __main__ - INFO - Extracting features for 5000 pairs...
2026-02-26 11:05:00 - __main__ - INFO - Making predictions...

============================================================
EVALUATION REPORT
============================================================
Dataset: ../../../../datasets/bigclonebench/bigclonebench.jsonl
Format: bigclonebench
Total pairs: 5000
Class distribution: 2500 clones, 2500 non-clones

------------------------------------------------------------
Accuracy:  0.8600
Precision: 0.8450
Recall:    0.8700
F1 Score:  0.8575
ROC AUC:   0.9134

Classification Report:
              precision    recall  f1-score   support
   Non-Clone       0.85      0.84      0.84      2500
       Clone       0.84      0.87      0.85      2500
    Accuracy                           0.86      5000
   Macro Avg       0.85      0.85      0.85      5000
Weighted Avg       0.86      0.86      0.86      5000

Confusion Matrix:
[[2100  400]
 [ 325 2175]]

Top 10 Feature Importances:
  feature_45: 0.0234
  feature_12: 0.0198
  feature_78: 0.0187
  feature_3: 0.0176
  feature_91: 0.0165
  feature_56: 0.0154
  feature_102: 0.0143
  feature_23: 0.0132
  feature_67: 0.0121
  feature_34: 0.0110
```

### Evaluation Metrics Explained

| Metric | Description | Target |
|--------|-------------|--------|
| **Accuracy** | Overall correctness | >0.85 |
| **Precision** | True positives / (True positives + False positives) | >0.85 |
| **Recall** | True positives / (True positives + False negatives) | >0.80 |
| **F1 Score** | Harmonic mean of precision and recall | >0.85 |
| **ROC AUC** | Area under ROC curve | >0.90 |

---

## Running the Service

### Development Mode

```bash
poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8087
```

### Production Mode

```bash
poetry run uvicorn main:app --host 0.0.0.0 --port 8087 --workers 4
```

### Using Environment Variables

```bash
export CIPAS_SEMANTICS_PORT=8087
export CIPAS_SEMANTICS_HOST=0.0.0.0
poetry run python main.py
```

---

## API Usage

### Base URL

```
http://localhost:8087/api/v1/semantics
```

### Interactive Documentation

Once the service is running, access:
- **Swagger UI**: http://localhost:8087/docs
- **ReDoc**: http://localhost:8087/redoc

### Key Endpoints

#### 1. Health Check

```bash
curl http://localhost:8087/api/v1/semantics/health
```

Response:
```json
{
  "status": "healthy",
  "service": "cipas-semantics",
  "version": "0.1.0",
  "models": {
    "semantic_type4": {
      "model_name": "type4_xgb.pkl",
      "available": true,
      "loaded": true,
      "error": null
    }
  }
}
```

#### 2. Compare Two Code Snippets

```bash
curl -X POST http://localhost:8087/api/v1/semantics/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "int sum(int a, int b) { return a + b; }",
    "code2": "int add(int x, int y) { int result = x + y; return result; }",
    "language": "java"
  }'
```

Response:
```json
{
  "is_clone": true,
  "confidence": 0.92,
  "clone_type": "Type-4",
  "pipeline_used": "Semantic XGBoost (Type-4)",
  "normalization_level": "Token-based",
  "tokens1_count": 12,
  "tokens2_count": 18,
  "semantic_features": {
    "feature_count": 204
  }
}
```

#### 3. Batch Comparison

```bash
curl -X POST http://localhost:8087/api/v1/semantics/compare/batch \
  -H "Content-Type: application/json" \
  -d '{
    "pairs": [
      {
        "code1": "int sum(int a, int b) { return a + b; }",
        "code2": "int add(int x, int y) { return x + y; }",
        "language": "java"
      },
      {
        "code1": "int sum(int a, int b) { return a + b; }",
        "code2": "int mul(int a, int b) { return a * b; }",
        "language": "java"
      }
    ]
  }'
```

#### 4. Get Feature Importance

```bash
curl http://localhost:8087/api/v1/semantics/feature-importance
```

#### 5. Tokenize Code

```bash
curl -X POST http://localhost:8087/api/v1/semantics/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "code": "int x = calculate(a, b);",
    "language": "java",
    "abstract_identifiers": true
  }'
```

Response:
```json
{
  "tokens": ["int", "V", "=", "V", "(", "V", ",", "V", ")"],
  "token_count": 9,
  "language": "java"
}
```

---

## Docker Deployment

### Build Docker Image

```bash
cd apps/services/cipas-services/cipas-semantics
docker build -t cipas-semantics:latest .
```

### Run Docker Container

```bash
docker run -d \
  -p 8087:8087 \
  -v $(pwd)/models:/app/models \
  --name cipas-semantics \
  cipas-semantics:latest
```

### Docker Compose

Add to project's `docker-compose.yaml`:

```yaml
services:
  cipas-semantics:
    build:
      context: ./apps/services/cipas-services/cipas-semantics
    ports:
      - "8087:8087"
    volumes:
      - ./apps/services/cipas-services/cipas-semantics/models:/app/models
    environment:
      - CIPAS_SEMANTICS_PORT=8087
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8087/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Troubleshooting

### Common Issues

#### 1. Model Not Found

**Error**: `Model file not found: type4_xgb.pkl`

**Solution**: Train the model first or download a pre-trained model:
```bash
poetry run python train_model.py --dataset /path/to/dataset.json
```

#### 2. Tree-sitter Parser Loading Failed

**Error**: `Language not supported`

**Solution**: Ensure tree-sitter language packages are installed:
```bash
poetry install
```

#### 3. Feature Extraction Fails

**Error**: `Parsing failed for code snippet`

**Solution**: Verify code syntax is valid for the specified language.

#### 4. Port Already in Use

**Error**: `Address already in use`

**Solution**: Change port:
```bash
export CIPAS_SEMANTICS_PORT=8088
poetry run uvicorn main:app --port 8088
```

### Getting Help

Check logs for detailed error messages:
```bash
docker logs cipas-semantics
```

---

## Quick Reference

### Commands Summary

```bash
# Setup
cd apps/services/cipas-services/cipas-semantics
poetry install

# Training with TOMA dataset
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl

# Training with sampled data (faster)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl \
  --sample-size 10000

# Training with Type-4 clones only
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type4_xgb.pkl \
  --clone-types 4 \
  --sample-size 5000

# Evaluation with BigCloneBench
poetry run python evaluate_model.py \
  --model models/type4_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# Run service
poetry run uvicorn main:app --reload --port 8087

# Docker
docker build -t cipas-semantics .
docker run -p 8087:8087 cipas-semantics
```

### File Structure

```
cipas-semantics/
├── main.py                 # FastAPI application entry
├── routes.py               # API route handlers
├── schemas.py              # Pydantic models
├── pyproject.toml          # Dependencies
├── Dockerfile              # Docker configuration
├── train_model.py          # Training script (TOMA/JSON support)
├── evaluate_model.py       # Evaluation script (BigCloneBench/TOMA/JSON)
├── clone_detection/
│   ├── features/
│   │   └── semantic_features.py   # 102 feature extractors
│   ├── models/
│   │   └── classifiers.py         # XGBoost wrapper
│   ├── tokenizers/
│   │   └── tree_sitter_tokenizer.py
│   └── utils/
│       └── common_setup.py        # Path/logging utilities
└── models/                 # Trained models directory
    └── type4_xgb.pkl       # Semantic model
```

**Datasets:**
- `datasets/toma-dataset/` - Training dataset (TOMA format)
- `datasets/bigclonebench/bigclonebench.jsonl` - Evaluation dataset (BigCloneBench format)
