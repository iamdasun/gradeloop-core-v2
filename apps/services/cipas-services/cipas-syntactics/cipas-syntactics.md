# CIPAS Syntactics Service — Setup, Training & Evaluation Guide

## Overview

**CIPAS Syntactics** is a syntactic code clone detection service for **Type-1, Type-2, and Type-3 clones**. It uses:

- **Automatic cascade detection**: Type-1 → Type-2 → Type-3 → Non-clone
- **NiCad-style normalization** for Type-1/2 detection
- **TOMA approach with XGBoost** for Type-3 detection
- **LSH candidate pre-filtering**: 128-permutation MinHash reduces O(N²) pairwise comparisons by ~95 %
- **Collusion graph**: connected-component analysis to surface student plagiarism rings
- **6 syntactic features**: Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler
- **~65x faster** than neural network approaches

### Full Detection Pipeline

```
Submission
   │
   ▼ Phase 1: Segmentation
   Structural blocks + sliding-window fragments
   │
   ▼ Phase 2: Template Filtering
   Discard fragments matching instructor skeleton (Jaccard ≥ 0.90)
   │
   ▼ Phase 3: LSH Indexing
   128-permutation MinHash → insert into MinHashLSH buckets
   │
   ▼ Phase 4: Candidate Retrieval
   Query LSH buckets → candidate pairs (O(1), ~95 % workload reduction)
   │
   ▼ Phase 5: Cascade Detection
   Pass A (Type-1 literal) → Pass B (Type-2 blinded) → Phase 2 (Type-3 XGBoost)
   │
   ▼ Phase 6: Collusion Graph
   Confirmed edges added → connected components → collusion groups
```

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
3. [Configuration](#configuration) ⭐ **NEW**
4. [Model Training](#model-training)
5. [Model Evaluation](#model-evaluation)
6. [Pipeline Evaluation on Project CodeNet](#pipeline-evaluation-on-project-codenet)
7. [Running the Service](#running-the-service)
8. [API Usage](#api-usage)
9. [Docker Deployment](#docker-deployment)
10. [Troubleshooting](#troubleshooting)
11. [Quick Reference](#quick-reference)

---

## Prerequisites

### System Requirements

- **Python**: 3.11 or higher
- **RAM**: Minimum 4 GB (8 GB recommended for training)
- **Storage**: 500 MB for dependencies + model storage
- **OS**: Linux, macOS, or Windows with WSL

### Required Dependencies

The project uses **Poetry** for dependency management:

```bash
pip install poetry
```

Key runtime dependencies (from `pyproject.toml`):

| Package | Purpose |
|---------|--------|
| `fastapi`, `uvicorn` | HTTP API |
| `tree-sitter`, `tree-sitter-java/c/python/c-sharp` | CST parsing |
| `xgboost`, `scikit-learn` | Type-3 ML classifier |
| `datasketch` | MinHash LSH (Phase 3 candidate retrieval) |
| `networkx` | Collusion graph connected-component analysis |
| `rapidfuzz` | Fast string similarity metrics |
| `tqdm`, `rich` | Progress bars |
| `pyyaml` | YAML configuration |

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

### 3. Verify Installation

```bash
poetry run python -c "from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer; print('✓ Tree-sitter loaded')"
poetry run python -c "import xgboost; print('✓ XGBoost loaded')"
poetry run python -c "from datasketch import MinHash; print('✓ datasketch loaded')"
```

### 4. Create Models Directory

```bash
mkdir -p models
```

### 5. Run Tests

```bash
poetry run pytest tests/test_pipeline_phases.py -q
# Expected: 39 passed
```

---

## ⭐ Configuration (NEW - v2.0)

All training and evaluation parameters are now managed through **`config.yaml`**. This eliminates the need for complex command-line arguments.

### Quick Start

```bash
# Simple usage - uses config.yaml defaults
python train.py
python evaluate.py
```

### Configuration File Structure

The `config.yaml` file contains all parameters:

```yaml
# Dataset paths
datasets:
  toma:
    path: "/path/to/toma-dataset"
  bigclonebench_balanced:
    path: "/path/to/bigclonebench_balanced.json"

# Training configuration
training:
  model:
    name: "clone_detector_xgb.pkl"
    output_dir: "./results/train"
  
  xgboost:
    n_estimators: 500
    max_depth: 8
    learning_rate: 0.05
    scale_pos_weight: 2.0
  
  sample_size: null  # null = full dataset
  
# Evaluation configuration
evaluation:
  model:
    path: "clone_detector_xgb.pkl"
    output_dir: "./results/evaluate"
  
  clone_types: [1, 2, 3]
  sample_size: null
  threshold: null  # null = use calibrated
```

### Override Configuration via CLI

```bash
# Override specific parameters
python train.py --sample-size 10000 --n-estimators 300

# Use custom config file
python train.py --config /path/to/custom-config.yaml

# Disable visualizations for faster execution
python train.py --no-visualize
```

### Example: Quick Test Configuration

Create `quick_test.yaml`:

```yaml
training:
  sample_size: 5000
  xgboost:
    n_estimators: 200
    max_depth: 6
  visualize: false

evaluation:
  sample_size: 1000
  visualize: false
```

Run with:

```bash
python train.py --config quick_test.yaml
python evaluate.py --config quick_test.yaml
```

---

## Model Training

### Understanding the Training Process

The syntactic classifier uses **XGBoost** to detect Type-3 clones. Training requires:

- **Dataset**: TOMA dataset with labeled code pairs
- **Feature Extraction**: 6 syntactic + AST features per pair
- **Output**: Trained model saved as `clone_detector_xgb.pkl`

### Training with TOMA Dataset

#### Quick Training (5-10 minutes)

```bash
python train.py --sample-size 5000 --no-visualize
```

#### Standard Training (30-60 minutes)

```bash
# Uses config.yaml defaults
python train.py
```

#### Full Training (1-2 hours)

Edit `config.yaml`:

```yaml
training:
  sample_size: null  # Use full dataset
  visualize: true
```

Then run:

```bash
python train.py
```

#### Custom Configuration

```bash
python train.py \
  --sample-size 15000 \
  --n-estimators 400 \
  --max-depth 6 \
  --learning-rate 0.08 \
  --no-node-types
```

### Training Output

Expected output:

```
================================================================================
Two-Stage Clone Detection — Stage 1: XGBoost Clone Detector
================================================================================
Dataset: /path/to/toma-dataset
Output: ./results/train
================================================================================

Dataset: 61,000 pairs | Clones: 41,000 | NonClones: 20,000

Extracting hybrid String + AST + Structural Density features …
Feature matrix: (61000, 20)

Train / test split: 80% / 20%
  Train: 48,800 pairs
  Test : 12,200 pairs

Training XGBoost model...
Running hyperparameter optimization...

FINAL METRICS (Test Set)
========================================
Accuracy : 0.8923
Precision: 0.8756
Recall   : 0.9012
F1 Score : 0.8882
ROC AUC  : 0.9456
Threshold: 0.42

Model saved → clone_detector_xgb.pkl
================================================================================
```

### Training Artifacts

- `models/clone_detector_xgb.pkl` - Trained model
- `results/train/training_metrics.json` - Metrics
- `results/train/visualizations/` - Plots:
  - `threshold_sweep.png`
  - `feature_importances_train.png`
  - `confusion_matrix_train.png`
  - `per_source_recall.png`

---

## Model Evaluation

### Evaluation with BigCloneBench Balanced

#### Quick Evaluation (2-5 minutes)

```bash
python evaluate.py --sample-size 1000 --no-visualize
```

#### Standard Evaluation

```bash
# Uses config.yaml defaults
python evaluate.py
```

#### Evaluate Specific Clone Types

```bash
# Evaluate Type-3 only
python evaluate.py --clone-types 3

# Evaluate Type-1 and Type-2
python evaluate.py --clone-types 1 2
```

#### Custom Threshold

```bash
python evaluate.py --threshold 0.35
```

### Evaluation Output

Expected output:

```
================================================================================
Two-Stage Clone Detection — Pipeline Evaluation
================================================================================
Dataset: /path/to/bigclonebench_balanced.json
Model: clone_detector_xgb.pkl
Clone types: [1, 2, 3]
================================================================================

Total: 10,000 | Clones: 5,000 | Non-clones: 5,000

EVALUATION REPORT
================================================================================
Accuracy : 0.8845
Precision: 0.8712
Recall   : 0.8923
F1 Score : 0.8816
ROC AUC  : 0.9378
Threshold: 0.42

Per-Clone-Type Recall:
  Type-1: 0.9234 (n=1500)
  Type-2: 0.8956 (n=2000)
  Type-3: 0.8567 (n=1500)
================================================================================
```

### Evaluation Artifacts

- `results/evaluate/evaluation_metrics.json` - Metrics
- `results/evaluate/visualizations/` - Plots:
  - `confusion_matrix_eval.png`
  - `per_clone_type_recall.png`

---

## Pipeline Evaluation on Project CodeNet

### Dataset Location

```bash
/path/to/project-codenet/
├── data/
│   └── {problem_id}/{language}/{submission_id}.{ext}
└── metadata/
    └── {problem_id}.csv
```

### Running the Pipeline Evaluator

#### Quick Smoke Test

```bash
python evaluate_clustering.py --n-problems 5 --max-submissions 50
```

#### Standard Evaluation

```bash
python evaluate_clustering.py --n-problems 20 --max-submissions 100
```

#### Multi-Language Evaluation

```bash
python evaluate_clustering.py \
  --language java python \
  --n-problems 10 \
  --max-submissions 100 \
  --verbose
```

### CLI Reference

```bash
python evaluate_clustering.py \
  --n-problems 20 \
  --language java \
  --max-submissions 100 \
  --lsh-threshold 0.3 \
  --lsh-perm 128 \
  --skip-brute-force \
  --verbose
```

---

## Running the Service

### Development Mode

```bash
python main.py
# or
uvicorn main:app --reload --port 8086
```

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8086 --workers 4
```

### Using Environment Variables

```bash
export CIPAS_SYNTACTICS_PORT=8086
export CIPAS_SYNTACTICS_HOST=0.0.0.0
python main.py
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
      "model_name": "clone_detector_xgb.pkl",
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
    "code1": "int sum(int a, int b) { return a + b; }",
    "code2": "int add(int x, int y) { return x + y; }",
    "language": "java"
  }'
```

Response:

```json
{
  "is_clone": true,
  "confidence": 0.92,
  "clone_type": "Type-2",
  "pipeline_used": "Tiered Syntactic Cascade",
  "tokens1_count": 12,
  "tokens2_count": 11,
  "syntactic_features": {
    "jaccard_similarity": 0.95,
    "dice_coefficient": 0.97,
    "levenshtein_distance": 3,
    "levenshtein_ratio": 0.96
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
curl http://localhost:8086/api/v1/syntactics/feature-importance
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

#### 1. `ModuleNotFoundError: No module named 'datasketch'`

**Solution**: Use poetry environment:

```bash
poetry install
poetry run python train.py
```

#### 2. Model Not Found

**Error**: `Model file not found: clone_detector_xgb.pkl`

**Solution**: Train the model first:

```bash
python train.py
```

#### 3. Tree-sitter Parser Loading Failed

**Error**: `Language not supported`

**Solution**: Reinstall tree-sitter packages:

```bash
poetry install --no-cache
```

#### 4. Port Already in Use

**Error**: `Address already in use`

**Solution**: Change port:

```bash
export CIPAS_SYNTACTICS_PORT=8088
python main.py
```

#### 5. CORS Errors from Web UI

**Solution**: Configure CORS in `main.py` or use same origin.

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

# Training (uses config.yaml defaults)
python train.py

# Training with overrides
python train.py --sample-size 10000 --n-estimators 300

# Evaluation (uses config.yaml defaults)
python evaluate.py

# Evaluate specific clone types
python evaluate.py --clone-types 3

# Pipeline evaluation
python evaluate_clustering.py --n-problems 20 --max-submissions 100

# Run service
python main.py
# or
uvicorn main:app --reload --port 8086

# Docker
docker build -t cipas-syntactics .
docker run -p 8086:8086 cipas-syntactics
```

### File Structure

```
cipas-syntactics/
├── config.yaml                 # ⭐ Configuration file
├── train.py                    # Training entry point
├── train_core.py               # Core training logic
├── evaluate.py                 # Evaluation entry point
├── evaluate_core.py            # Core evaluation logic
├── evaluate_parallel.py        # Parallel evaluation
├── evaluate_clustering.py      # Clustering evaluation
├── main.py                     # FastAPI application
├── routes.py                   # API routes
├── schemas.py                  # Pydantic models
├── clone_detection/            # Core library
│   ├── pipelines/              # Tiered detection
│   ├── features/               # Feature extraction
│   ├── models/                 # XGBoost classifier
│   ├── normalizers/            # NiCAD normalization
│   └── type3_filter.py         # Type-3 filter
└── models/                     # Trained models
```

### Clone Detection Thresholds

| Phase | Clone Type | Threshold |
|-------|------------|-----------|
| Phase 1 (NiCAD) | Type-1 | Jaccard ≥ 0.98, Levenshtein ≥ 0.98 |
| Phase 1 (NiCAD) | Type-2 | Max(Jaccard, Lev) ≥ 0.95, Δtokens ≤ 5% |
| Phase 2 (XGBoost) | Type-3 | Probability ≥ calibrated threshold |
| Phase 3 (Filter) | Type-3 | Lev ≤ 0.85, AST Jaccard ≤ 0.90 |

### Performance Benchmarks

| Task | Dataset | Time |
|------|---------|------|
| Training (sampled) | TOMA 10k | 5-10 min |
| Training (full) | TOMA 61k | 1-2 hours |
| Evaluation (sampled) | BCB 1k | 2-5 min |
| Evaluation (full) | BCB Balanced | 15-30 min |
| Pipeline (20 problems) | CodeNet | 30-60 min |

---

**Version**: 2.0.0 (Configuration-Based)  
**Last Updated**: March 6, 2026
