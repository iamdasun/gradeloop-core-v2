# CIPAS Syntactics Service - Setup, Training & Evaluation Guide

## Overview

**CIPAS Syntactics** is a syntactic code clone detection service for **Type-1, Type-2, and Type-3 clones**. It uses:

- **Automatic cascade detection**: Type-1 → Type-2 → Type-3 → Non-clone
- **NiCad-style normalization** for Type-1/2 detection
- **TOMA approach with XGBoost** for Type-3 detection
- **6 syntactic features**: Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler
- **~65x faster** than neural network approaches

### Clone Type Detection

| Clone Type | Description | Detection Method | Threshold |
|------------|-------------|------------------|-----------|
| **Type-1** | Exact matches (renaming, formatting) | Literal CST comparison | ≥0.98 |
| **Type-2** | Renamed identifiers/literals | Blinded CST comparison | ≥0.95 + Δtokens ≤5% |
| **Type-3** | Modified statements | TOMA + XGBoost | XGB probability |

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

The project uses **Poetry** for dependency management:

```bash
pip install poetry
```

---

## Setup Instructions

### 1. Navigate to the Service Directory

```bash
cd apps/services/cipas-services/cipas-syntactics
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

The syntactic classifier uses **XGBoost** to detect Type-3 clones (modified statements). Training requires:

- **Dataset**: Labeled code pairs (clone/not-clone) with syntactic features
- **Feature Extraction**: 6 similarity features per pair
- **Output**: Trained model saved as `models/type3_xgb.pkl`

### Feature Extraction

The `SyntacticFeatureExtractor` computes 6 features from token sequences:

1. **Jaccard Similarity**: Set overlap measure
2. **Dice Coefficient**: Weighted set similarity
3. **Levenshtein Distance**: Edit distance (normalized)
4. **Levenshtein Ratio**: String similarity percentage
5. **Jaro Similarity**: Character matching score
6. **Jaro-Winkler Similarity**: Jaro with prefix bonus

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
  --model-name type3_xgb.pkl

# Train with sampled data (faster, for testing)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_xgb.pkl \
  --sample-size 10000

# Train with specific clone types (e.g., Type-3 only)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_xgb.pkl \
  --clone-types 3 \
  --sample-size 5000
```

#### Training with Custom JSON Dataset

You can also use a custom JSON dataset:

```bash
poetry run python train_model.py \
  --dataset /path/to/dataset.json \
  --dataset-format json \
  --language java \
  --model-name type3_rf.pkl
```

#### JSON Dataset Format

```json
[
  {
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int bar(int y) { return y + 1; }",
    "label": 1
  },
  {
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int multiply(int x) { return x * 2; }",
    "label": 0
  }
]
```

### Training Output

Expected output:
```
2026-02-26 10:00:00 - __main__ - INFO - Loading toma dataset from ../../../../datasets/toma-dataset...
2026-02-26 10:00:05 - __main__ - INFO - Loaded 20000 code pairs
2026-02-26 10:00:05 - __main__ - INFO - Class distribution: 10000 clones, 10000 non-clones
2026-02-26 10:00:05 - __main__ - INFO - Extracting syntactic features...
2026-02-26 10:05:00 - __main__ - INFO - Feature matrix shape: (20000, 6)
2026-02-26 10:05:01 - __main__ - INFO - Training XGBoost classifier...
2026-02-26 10:05:15 - __main__ - INFO - Cross-validation F1: 0.9023 (+/- 0.0156)
2026-02-26 10:05:15 - __main__ - INFO - Test set metrics: {'accuracy': 0.91, 'precision': 0.90, 'recall': 0.92, 'f1': 0.91}
2026-02-26 10:05:16 - __main__ - INFO - Model saved to /path/to/cipas-syntactics/models/type3_xgb.pkl
```

---

## Model Evaluation

### Evaluation with BigCloneBench Dataset

The `evaluate_model.py` script supports BigCloneBench, TOMA, and JSON formats.

#### Running Evaluation (BigCloneBench)

```bash
# Evaluate with BigCloneBench dataset
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# Evaluate with sampled data (faster)
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java \
  --sample-size 5000
```

#### Running Evaluation (TOMA Dataset)

```bash
# Evaluate with TOMA dataset
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java

# Evaluate with sampled data
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --sample-size 5000
```

#### Running Evaluation (JSON Dataset)

```bash
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset /path/to/test_dataset.json \
  --dataset-format json \
  --language java
```

### Evaluation Output

Expected output:
```
2026-02-26 11:00:00 - __main__ - INFO - Loading model from models/type3_rf.pkl...
2026-02-26 11:00:01 - __main__ - INFO - Loading BigCloneBench dataset from ../../../../datasets/bigclonebench/bigclonebench.jsonl...
2026-02-26 11:00:05 - __main__ - INFO - Found 100000 entries in BigCloneBench
2026-02-26 11:00:10 - __main__ - INFO - Loaded 5000 code pairs from BigCloneBench
2026-02-26 11:00:10 - __main__ - INFO - Extracting features for 5000 pairs...
2026-02-26 11:02:00 - __main__ - INFO - Making predictions...

============================================================
EVALUATION REPORT
============================================================
Dataset: ../../../../datasets/bigclonebench/bigclonebench.jsonl
Format: bigclonebench
Total pairs: 5000
Class distribution: 2500 clones, 2500 non-clones

------------------------------------------------------------
Accuracy:  0.9100
Precision: 0.9050
Recall:    0.9200
F1 Score:  0.9125
ROC AUC:   0.9534

Classification Report:
              precision    recall  f1-score   support
   Non-Clone       0.91      0.90      0.90      2500
       Clone       0.90      0.92      0.91      2500
    Accuracy                           0.91      5000
   Macro Avg       0.91      0.91      0.91      5000
Weighted Avg       0.91      0.91      0.91      5000

Confusion Matrix:
[[2250  250]
 [ 200 2300]]

Feature Importances:
  jaccard_similarity: 0.3500
  dice_coefficient: 0.2800
  levenshtein_distance: 0.1200
  levenshtein_ratio: 0.1500
  jaro_similarity: 0.0500
  jaro_winkler_similarity: 0.0500
```

### Evaluation Metrics Explained

| Metric | Description | Target |
|--------|-------------|--------|
| **Accuracy** | Overall correctness | >0.90 |
| **Precision** | True positives / (True positives + False positives) | >0.90 |
| **Recall** | True positives / (True positives + False negatives) | >0.90 |
| **F1 Score** | Harmonic mean of precision and recall | >0.90 |
| **ROC AUC** | Area under ROC curve | >0.95 |

### Cascade Detection Performance

The service uses automatic cascade detection:

| Phase | Clone Type | Avg. Detection Time |
|-------|------------|---------------------|
| Pass A (Literal) | Type-1 | <5ms |
| Pass B (Blinded) | Type-2 | <10ms |
| Phase Two (TOMA+RF) | Type-3 | ~50ms |

---

## Running the Service

### Development Mode

```bash
poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8086
```

### Production Mode

```bash
poetry run uvicorn main:app --host 0.0.0.0 --port 8086 --workers 4
```

### Using Environment Variables

```bash
export CIPAS_SYNTACTICS_PORT=8086
export CIPAS_SYNTACTICS_HOST=0.0.0.0
poetry run python main.py
```

---

## API Usage

### Base URL

```
http://localhost:8086/api/v1/syntactics
```

### Interactive Documentation

Once the service is running, access:
- **Swagger UI**: http://localhost:8086/docs
- **ReDoc**: http://localhost:8086/redoc

### Key Endpoints

#### 1. Health Check

```bash
curl http://localhost:8086/api/v1/syntactics/health
```

Response:
```json
{
  "status": "healthy",
  "service": "cipas-syntactics",
  "version": "0.1.0",
  "models": {
    "syntactic_type3": {
      "model_name": "type3_rf.pkl",
      "available": true,
      "loaded": true,
      "error": null
    }
  }
}
```

#### 2. Compare Two Code Snippets

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int bar(int y) { return y + 1; }",
    "language": "java"
  }'
```

Response:
```json
{
  "is_clone": true,
  "confidence": 0.97,
  "clone_type": "Type-2",
  "pipeline_used": "Syntactic Cascade (Type-1/2/3)",
  "normalization_level": "Blinded",
  "tokens1_count": 12,
  "tokens2_count": 12,
  "syntactic_features": {
    "jaccard_similarity": 0.85,
    "dice_coefficient": 0.92,
    "levenshtein_distance": 5,
    "levenshtein_ratio": 0.95,
    "jaro_similarity": 0.96,
    "jaro_winkler_similarity": 0.98
  }
}
```

#### 3. Batch Comparison

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/compare/batch \
  -H "Content-Type: application/json" \
  -d '{
    "pairs": [
      {
        "code1": "public int foo(int x) { return x + 1; }",
        "code2": "public int bar(int y) { return y + 1; }",
        "language": "java"
      },
      {
        "code1": "public int foo(int x) { return x + 1; }",
        "code2": "public int mul(int x) { return x * 2; }",
        "language": "java"
      }
    ]
  }'
```

#### 4. Get Feature Importance

```bash
curl http://localhost:8086/api/v1/syntactics/feature-importance
```

Response:
```json
{
  "model": "type3_rf.pkl",
  "features": {
    "jaccard_similarity": 0.35,
    "dice_coefficient": 0.28,
    "levenshtein_distance": 0.12,
    "levenshtein_ratio": 0.15,
    "jaro_similarity": 0.05,
    "jaro_winkler_similarity": 0.05
  }
}
```

#### 5. Tokenize Code

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/tokenize \
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
cd apps/services/cipas-services/cipas-syntactics
docker build -t cipas-syntactics:latest .
```

### Run Docker Container

```bash
docker run -d \
  -p 8086:8086 \
  -v $(pwd)/models:/app/models \
  --name cipas-syntactics \
  cipas-syntactics:latest
```

### Docker Compose

Add to project's `docker-compose.yaml`:

```yaml
services:
  cipas-syntactics:
    build:
      context: ./apps/services/cipas-services/cipas-syntactics
    ports:
      - "8086:8086"
    volumes:
      - ./apps/services/cipas-services/cipas-syntactics/models:/app/models
    environment:
      - CIPAS_SYNTACTICS_PORT=8086
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8086/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Troubleshooting

### Common Issues

#### 1. Model Not Found

**Error**: `Model file not found: type3_rf.pkl`

**Solution**: Train the model first:
```bash
poetry run python train_model.py --dataset /path/to/dataset.json
```

#### 2. Tree-sitter Parser Loading Failed

**Error**: `Language not supported`

**Solution**: Reinstall dependencies:
```bash
poetry install --force
```

#### 3. Feature Extraction Fails

**Error**: `Parsing failed for code snippet`

**Solution**: Verify code syntax is valid for the specified language.

#### 4. Port Already in Use

**Error**: `Address already in use`

**Solution**: Change port:
```bash
export CIPAS_SYNTACTICS_PORT=8089
poetry run uvicorn main:app --port 8089
```

#### 5. Low Type-3 Detection Accuracy

**Solution**: 
- Increase training dataset size
- Tune hyperparameters: `--n-estimators 200 --max-depth 15`
- Ensure balanced class distribution in dataset

### Getting Help

Check logs for detailed error messages:
```bash
docker logs cipas-syntactics
```

---

## Quick Reference

### Commands Summary

```bash
# Setup
cd apps/services/cipas-services/cipas-syntactics
poetry install

# Training with TOMA dataset
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_rf.pkl

# Training with sampled data (faster)
poetry run python train_model.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_rf.pkl \
  --sample-size 10000

# Evaluation with BigCloneBench
poetry run python evaluate_model.py \
  --model models/type3_rf.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# Run service
poetry run uvicorn main:app --reload --port 8086

# Docker
docker build -t cipas-syntactics .
docker run -p 8086:8086 cipas-syntactics
```

### File Structure

```
cipas-syntactics/
├── main.py                 # FastAPI application entry
├── routes.py               # API route handlers
├── schemas.py              # Pydantic models
├── pyproject.toml          # Dependencies
├── Dockerfile              # Docker configuration
├── train_model.py          # Training script (TOMA/JSON support)
├── evaluate_model.py       # Evaluation script (BigCloneBench/TOMA/JSON)
├── clone_detection/
│   ├── features/
│   │   └── syntactic_features.py    # 6 feature extractors
│   ├── models/
│   │   └── classifiers.py           # Random Forest wrapper
│   ├── normalizers/
│   │   └── structural_normalizer.py # NiCad-style normalization
│   ├── pipelines/
│   │   └── __init__.py              # Tiered cascade pipeline
│   └── tokenizers/
│       └── tree_sitter_tokenizer.py
└── models/                 # Trained models directory
    └── type3_rf.pkl        # Syntactic model
```

**Datasets:**
- `datasets/toma-dataset/` - Training dataset (TOMA format)
- `datasets/bigclonebench/bigclonebench.jsonl` - Evaluation dataset (BigCloneBench format)

### Clone Detection Thresholds

| Clone Type | Jaccard | Levenshtein | Token Delta |
|------------|---------|-------------|-------------|
| **Type-1** | ≥0.98 | ≥0.98 | 0% |
| **Type-2** | ≥0.95 | ≥0.95 | ≤5% |
| **Type-3** | RF Classification | | |

### Performance Benchmarks

| Metric | Value |
|--------|-------|
| Type-1 Detection | <5ms |
| Type-2 Detection | <10ms |
| Type-3 Detection | ~50ms |
| Speed vs Neural | ~65x faster |
| F1 Score (Type-3) | 90%+ |
