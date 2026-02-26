# Clone Detection System - Quick Start Guide

## Prerequisites

- Python 3.14+
- Poetry (recommended) or pip

## Installation

### Option 1: Using Poetry (Recommended)

```bash
cd apps/services/cipas-service

# Install all dependencies
poetry install

# Activate virtual environment
source .venv/bin/activate
```

### Option 2: Using setup script

```bash
cd apps/services/cipas-service

# Run the setup script
bash scripts/setup_env.sh

# Activate virtual environment
source .venv/bin/activate
```

---

## Quick Start

### 1. Train Models (Recommended Sample Sizes)

```bash
# Train Type-1/2/3 model (includes Strong + Moderate Type-3)
python scripts/train_type3.py --sample-size 15000 --test

# Train Type-4 model (semantic clones)
python scripts/train_type4.py --sample-size 5000 --test
```

### 2. Calibrate Thresholds (For New Datasets)

```bash
# Find optimal decision thresholds
python scripts/calibrate_thresholds.py --sample-size 200
```

### 3. Evaluate

```bash
# Evaluate on BigCloneBench
python scripts/evaluate_bcb.py --sample-size 500
```

---

## Full Pipeline (All-in-One)

```bash
# Run everything: setup → train Type-3 → train Type-4 → evaluate
python scripts/run_pipeline.py --all

# With custom sample sizes (faster)
python scripts/run_pipeline.py --all \
  --type3-samples 5000 \
  --type4-samples 2000 \
  --eval-samples 200
```

---

## Individual Commands

### Environment Check

```bash
python scripts/run_pipeline.py --setup
```

### Train Only

```bash
# Type-1/2/3 model
python scripts/run_pipeline.py --train-type3 --type3-samples 10000

# Type-4 model  
python scripts/run_pipeline.py --train-type4 --type4-samples 5000
```

### Evaluate Only

```bash
python scripts/run_pipeline.py --evaluate --eval-samples 500
```

---

## Dataset Structure

| File | Clone Type | Used For |
|------|------------|----------|
| `type-1.csv` | Exact clones | Type-3 training |
| `type-2.csv` | Renamed clones | Type-3 training |
| `type-3.csv` | **Strong Type-3** | Type-3 training ✓ |
| `type-4.csv` | **Moderate Type-3** | Type-3 training ✓ |
| `type-5.csv` | Type-4 (semantic) | Type-4 training ✓ |
| `nonclone.csv` | Non-clones | Both (negatives) |

**Note:** Type-3 training merges `type-3.csv` (Strong) + `type-4.csv` (Moderate) for better coverage.

---

## Expected Performance

### TOMA Dataset (In-Distribution)

| Model | F1 Score | Training Time |
|-------|----------|---------------|
| Type-1/2/3 (RF) | **99.95%** | ~4s |
| Type-4 (XGB) | **99.30%** | ~4s |

### BigCloneBench (Cross-Dataset)

| Model | F1 Score | Notes |
|-------|----------|-------|
| Type-3 (RF) | 0% | Domain shift - needs fine-tuning |
| Type-4 (XGB) | **94.89%** | With threshold calibration (0.85) |

---

## Troubleshooting

### Missing Packages

```bash
# If using Poetry
poetry install

# If using pip
pip install -e .
```

### Tree-sitter Parser Issues

```bash
# Reinstall language packages
pip install --force-reinstall \
  tree-sitter \
  tree-sitter-java \
  tree-sitter-c \
  tree-sitter-python
```

### Model Not Found

```bash
# Train models first
python scripts/run_pipeline.py --train-type3 --train-type4
```

### Memory Issues

Reduce sample sizes:

```bash
python scripts/train_type3.py --sample-size 5000
python scripts/train_type4.py --sample-size 2000
```

---

## Output Files

After training, models are saved to:

```
clone_detection/models/saved/
├── type3_rf.pkl    # Random Forest for Type-1/2/3
└── type4_xgb.pkl   # XGBoost for Type-4
```

Thresholds are saved to:
```
scripts/thresholds.json
```

---

## Key Features

✅ **Multi-language**: Java, C, Python  
✅ **15 Token Types**: Covering 99.7% of code  
✅ **6 Syntactic Features**: Jaccard, Dice, Levenshtein, Jaro  
✅ **78 Semantic Features**: CST + PDG-like fusion  
✅ **Fast CPU Training**: ~4 seconds per model  
✅ **High Accuracy**: 99%+ F1 on TOMA dataset  

---

## Next Steps

1. **Start with training**: `python scripts/run_pipeline.py --all`
2. **Review results**: Check `EVALUATION_RESULTS.md`
3. **Calibrate for your data**: `python scripts/calibrate_thresholds.py`
4. **Integrate with your LMS**: See `CLONE_DETECTION_README.md`
5. **Use the REST API**: See `API_DOCUMENTATION.md`

---

## REST API Usage

The service provides a FastAPI-based REST API for real-time code comparison.

### Start the API Server

```bash
cd apps/services/cipas-service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Access Interactive Docs

Open your browser:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Quick API Examples

```bash
# Health check
curl http://localhost:8000/health

# Compare two code snippets
curl -X POST http://localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "public int foo(int x) { return x + 1; }",
    "code2": "public int bar(int y) { return y + 1; }",
    "language": "java",
    "pipeline": "syntactic"
  }'

# Tokenize code
curl -X POST http://localhost:8000/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "code": "int x = calculate(a, b);",
    "language": "java"
  }'
```

For complete API documentation, see `API_DOCUMENTATION.md`.

---

## Documentation

- `CLONE_DETECTION_README.md` - Full technical documentation
- `EVALUATION_RESULTS.md` - Performance metrics and analysis
- `pyproject.toml` - Dependencies and project configuration
