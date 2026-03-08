# CIPAS Semantics Service - Setup, Training & Evaluation Guide

## Overview

**CIPAS Semantics** is a semantic code clone detection service for **Type-4 clones** (functionally equivalent code with different implementations). It uses:

- **102 semantic features** per code snippet (204 fused features per pair)
- **XGBoost classification** optimized for high-dimensional feature spaces
- **Tree-sitter CST parsing** for multi-language support (Java, C, Python, C#)
- **Six feature categories**: Traditional, CST, Semantic/PDG-like, Structural Depth, Type Signatures, API Fingerprinting
- **YAML configuration** for simplified usage (v2.0)

---

## ⭐ What's New in v2.0

- **YAML Configuration**: All parameters in `config.yaml` - no complex CLI args!
- **Simplified Usage**: `python train.py` and `python evaluate.py` work out of the box
- **CLI Overrides**: Still available for customization
- **Cleaner Codebase**: ~2000 lines of redundant code removed

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup Instructions](#setup-instructions)
3. [Configuration](#configuration) ⭐ **NEW**
4. [Model Training](#model-training)
5. [Model Evaluation](#model-evaluation)
6. [Running the Service](#running-the-service)
7. [API Usage](#api-usage)
8. [Docker Deployment](#docker-deployment)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference](#quick-reference)

---

## Prerequisites

### System Requirements

- **Python**: 3.11 or higher
- **RAM**: Minimum 4GB (8GB recommended for training)
- **Storage**: 500MB for dependencies + model storage
- **OS**: Linux, macOS, or Windows with WSL

### Required Dependencies

The project uses **Poetry** for dependency management:

```bash
pip install poetry
```

Key runtime dependencies:

| Package | Purpose |
|---------|--------|
| `fastapi`, `uvicorn` | HTTP API |
| `tree-sitter`, `tree-sitter-java/c/python/c-sharp` | CST parsing |
| `xgboost`, `scikit-learn` | Semantic classifier |
| `pandas`, `numpy` | Data processing |
| `rapidfuzz` | String similarity |
| `matplotlib`, `seaborn`, `plotly` | Visualizations |
| `pyyaml` | YAML configuration |

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

## ⭐ Configuration (NEW - v2.0)

All training and evaluation parameters are now managed through **`config.yaml`**.

### Quick Start

```bash
# Simple usage - uses config.yaml defaults
python train.py
python evaluate.py
```

### Configuration File Structure

```yaml
# Dataset paths
datasets:
  codenet:
    path: "/path/to/project-codenet"
  gptclonebench:
    path: "/path/to/gptclonebench_dataset.jsonl"

# Training configuration
training:
  model:
    name: "type4_xgb_codenet.pkl"
    dir: "./models"
  
  dataset:
    language: "java"
    all_languages: false
  
  sample_size: null  # null = full dataset (capped at 500k)
  clone_ratio: 0.5
  hard_negative_ratio: 0.20
  
  visualize: true
  cross_validation: true
  
  xgboost:
    n_estimators: 500
    max_depth: 6
    learning_rate: 0.1

# Evaluation configuration
evaluation:
  model:
    path: "models/type4_xgb_java.pkl"
  
  dataset:
    path: null  # null = use datasets.gptclonebench.path
    format: "gptclonebench"
  
  language: null  # null = all 4 languages
  sample_size: null
  threshold: null  # null = use calibrated
  visualize: true
```

### Override Configuration via CLI

```bash
# Override sample size
python train.py --sample-size 20000

# Full dataset training
python train.py --full-dataset --language java

# Multi-language training
python train.py --all-languages --sample-size 50000

# Use custom config file
python train.py --config /path/to/custom-config.yaml

# Disable visualizations for faster execution
python train.py --no-visualize --no-cv
```

### Example: Quick Test Configuration

Create `quick_test.yaml`:

```yaml
training:
  sample_size: 5000
  language: java
  xgboost:
    n_estimators: 200
    max_depth: 4
  visualize: false
  cross_validation: false

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

The semantic classifier uses **XGBoost** to detect Type-4 clones. Training requires:

- **Dataset**: Project CodeNet with labeled code pairs
- **Feature Extraction**: 102 semantic features per snippet, 204 fused per pair
- **Output**: Trained model saved as `type4_xgb_codenet.pkl`

### Training with Project CodeNet

#### Quick Training (5-10 minutes)

```bash
python train.py --sample-size 5000 --no-visualize --no-cv
```

#### Standard Training (15-30 minutes)

```bash
# Uses config.yaml defaults (Java, 10k samples)
python train.py
```

#### Full Dataset Training (several hours)

Edit `config.yaml`:

```yaml
training:
  sample_size: null  # Use full dataset
  full_dataset: true
```

Then run:

```bash
python train.py --full-dataset --language java
```

#### Multi-Language Training

```bash
# Train on all 4 languages
python train.py --all-languages --sample-size 50000
```

#### With GPTCloneBench Domain Adaptation

```bash
python train.py --include-gptclonebench --gptclonebench-ratio 0.15
```

### Training Output

Expected output:

```
======================================================================
TYPE-IV CODE CLONE DETECTOR - TRAINING
======================================================================
Dataset: /path/to/project-codenet
Language(s): ['java']
Sample size: 10,000
Model output: models/type4_xgb_codenet.pkl
======================================================================

Processing language: java
Loading problem list...
Found 500 problems
Loading submissions...
100%|████████████████| 500/500 [02:30<00:00]

Creating training pairs...
Creating 5,000 clone pairs (same problem)...
Creating 2,000 hard negative pairs...
Creating 3,000 easy negative pairs...
Created 10,000 total pairs

Extracting Sheneamer features...
100%|████████████████| 10000/10000 [05:23<00:00]
Feature matrix: (10000, 204)
Train: 8,000 | Test: 2,000

Training XGBoost classifier...
Cross-validation F1: 0.8523 (+/- 0.0234)

======================================================================
TEST METRICS
======================================================================
accuracy    : 0.8612
precision   : 0.8456
recall      : 0.8734
f1          : 0.8593
roc_auc     : 0.9234

Model saved to: /path/to/models/type4_xgb_codenet.pkl
======================================================================
```

### Training Artifacts

- `models/type4_xgb_codenet.pkl` - Trained model
- `results/train/training_metrics.json` - Metrics
- `results/train/training_report.html` - Interactive visualization report

### Feature Categories

The Sheneamer et al. (2021) framework extracts **102 features** per snippet:

1. **Traditional Features (10)**: LOC, keyword categories
2. **Syntactic/CST Features (40)**: Tree-sitter node frequencies
3. **Semantic/PDG-like Features (20)**: Dependency relationships
4. **Structural Depth Features (8)**: Nesting, depth, density
5. **Type Signature Features (12)**: Parameter/return type patterns
6. **API Fingerprinting Features (12)**: Library usage patterns

**Feature Fusion**: Two feature vectors → **204 features per pair**

---

## Model Evaluation

### Evaluation with GPTCloneBench

#### Quick Evaluation (2-5 minutes)

```bash
python evaluate.py --sample-size 1000 --no-visualize
```

#### Standard Evaluation

```bash
# Uses config.yaml defaults (all 4 languages)
python evaluate.py
```

#### Evaluate Specific Language

```bash
python evaluate.py --model models/type4_xgb_java.pkl --language java
```

#### Evaluate All Languages

```bash
python evaluate.py --all-languages --sample-size 2000
```

#### Custom Threshold

```bash
python evaluate.py --threshold 0.75
```

### Evaluation Output

Expected output:

```
======================================================================
CIPAS SEMANTICS - MODEL EVALUATION
======================================================================
Model: models/type4_xgb_java.pkl
Dataset: /path/to/gptclonebench_dataset.jsonl
Language: java
Sample size: 2,000
======================================================================

Loading model from models/type4_xgb_java.pkl...
Model threshold: 0.683

Loading dataset...
Loaded 2,000 code pairs

Extracting features...
Feature matrix shape: (2000, 204)

Making predictions...

======================================================================
EVALUATION RESULTS
======================================================================

Dataset Statistics:
  Total samples: 2,000
  Clones: 1,000 (50.0%)
  Non-clones: 1,000 (50.0%)

Overall Metrics:
  Accuracy:     0.8612
  Precision:    0.8456
  Recall:       0.8734
  F1 Score:     0.8593
  Macro-F1:     0.8578
  ROC AUC:      0.9234

Confusion Matrix:
  [[  847    153]   [TN   FP]
   [  127    873]]  [FN   TP]

Optimal threshold for F1: 0.672
Optimal threshold for Macro-F1: 0.681
======================================================================
```

### Evaluation Artifacts

- `results/evaluate/metrics_java.json` - Metrics per language
- `results/evaluate/evaluation_report_java.html` - Interactive report
- `results/evaluate/threshold_sweep_results.csv` - Threshold analysis

### Evaluation Metrics Explained

| Metric | Description | Target |
|--------|-------------|--------|
| **Accuracy** | Overall correctness | >0.85 |
| **Precision** | TP / (TP + FP) | >0.85 |
| **Recall** | TP / (TP + FN) | >0.80 |
| **F1 Score** | Harmonic mean | >0.85 |
| **ROC AUC** | Area under ROC curve | >0.90 |

---

## Running the Service

### Development Mode

```bash
python main.py
# or
uvicorn main:app --reload --port 8087
```

### Production Mode

```bash
uvicorn main:app --host 0.0.0.0 --port 8087 --workers 4
```

### Using Environment Variables

```bash
export CIPAS_SEMANTICS_PORT=8087
export CIPAS_SEMANTICS_HOST=0.0.0.0
python main.py
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
  "pipeline_used": "Sheneamer et al. (2021) Type-IV Detector",
  "tokens1_count": 12,
  "tokens2_count": 18,
  "model_available": true
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

Response:

```json
{
  "model": "semantic_type4",
  "features": [
    {"name": "cst_node_freq_45", "importance": 0.0234},
    {"name": "semantic_dep_12", "importance": 0.0198},
    {"name": "depth_nesting_3", "importance": 0.0187}
  ]
}
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

**Solution**: Train the model first:

```bash
python train.py --sample-size 5000
```

#### 2. Tree-sitter Parser Loading Failed

**Error**: `Language not supported`

**Solution**: Reinstall tree-sitter packages:

```bash
poetry install --no-cache
```

#### 3. Feature Extraction Fails

**Error**: `Parsing failed for code snippet`

**Solution**: Verify code syntax is valid for the specified language.

#### 4. Port Already in Use

**Error**: `Address already in use`

**Solution**: Change port:

```bash
export CIPAS_SEMANTICS_PORT=8088
python main.py
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

# Training (uses config.yaml defaults)
python train.py

# Training with overrides
python train.py --sample-size 20000 --language java

# Full dataset training
python train.py --full-dataset --language java

# Multi-language training
python train.py --all-languages --sample-size 50000

# Evaluation (uses config.yaml defaults)
python evaluate.py

# Evaluate specific model/language
python evaluate.py --model models/type4_xgb_java.pkl --language java

# Run service
python main.py
# or
uvicorn main:app --reload --port 8087

# Docker
docker build -t cipas-semantics .
docker run -p 8087:8087 cipas-semantics
```

### File Structure

```
cipas-semantics/
├── config.yaml                 # ⭐ Configuration file
├── train.py                    # Training entry point
├── train_codenet_core.py       # Core training logic
├── evaluate.py                 # Evaluation entry point
├── evaluate_core.py            # Core evaluation logic
├── main.py                     # FastAPI application
├── routes.py                   # API routes
├── schemas.py                  # Pydantic models
├── clone_detection/            # Core library
│   ├── features/
│   │   └── sheneamer_features.py   # 102 semantic features
│   ├── models/
│   │   └── classifiers.py          # SemanticClassifier
│   └── tokenizers/
│       └── tree_sitter_tokenizer.py
├── models/                     # Trained models
├── results/                    # Training outputs
└── evaluation_output/          # Evaluation outputs
```

### Supported Languages

- **Java**
- **C**
- **Python**
- **C#**

### Performance Targets

| Metric | Target |
|--------|--------|
| Accuracy | ≥ 0.85 |
| Precision | ≥ 0.85 |
| Recall | ≥ 0.80 |
| F1 Score | ≥ 0.82 |
| ROC AUC | ≥ 0.90 |

### Performance Benchmarks

| Task | Dataset | Time |
|------|---------|------|
| Training (quick) | CodeNet 5k | 5-10 min |
| Training (standard) | CodeNet 10k | 15-30 min |
| Training (full) | CodeNet 500k | Several hours |
| Evaluation (quick) | GPTCloneBench 1k | 2-5 min |
| Evaluation (all langs) | GPTCloneBench 8k | 15-30 min |

---

## References

- Sheneamer, A., et al. (2021). "A Framework for Semantic Code Clone Detection Using Machine Learning"
- Project CodeNet: "A Large-Scale Code Dataset for Machine Learning"
- GPTCloneBench: "A Benchmark for AI-Generated Code Clone Detection"

---

**Version**: 2.0.0 (Configuration-Based)  
**Last Updated**: March 6, 2026
