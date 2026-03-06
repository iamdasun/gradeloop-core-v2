# CIPAS Services - Quick Reference Guide

## 🚀 Quick Start Commands

### cipas-syntactics

```bash
cd apps/services/cipas-services/cipas-syntactics

# Install dependencies
poetry install

# Train model (uses config.yaml defaults)
python train.py

# Evaluate model
python evaluate.py

# Run API service
python main.py
# or
uvicorn main:app --port 8086
```

### cipas-semantics

```bash
cd apps/services/cipas-services/cipas-semantics

# Install dependencies
poetry install

# Train model (uses config.yaml defaults)
python train.py

# Evaluate model
python evaluate.py

# Run API service
python main.py
# or
uvicorn main:app --port 8087
```

---

## 📋 Common CLI Overrides

### Training Overrides

```bash
# Override sample size
python train.py --sample-size 10000

# Override model name
python train.py --model-name custom_model.pkl

# Disable visualizations (faster)
python train.py --no-visualize

# Use custom config file
python train.py --config /path/to/config.yaml

# Multiple overrides
python train.py --sample-size 15000 --n-estimators 300 --no-visualize
```

### Evaluation Overrides

```bash
# Override sample size
python evaluate.py --sample-size 2000

# Override threshold
python evaluate.py --threshold 0.35

# Disable visualizations
python evaluate.py --no-visualize

# Specific clone types (syntactics only)
python evaluate.py --clone-types 3

# Use custom config file
python evaluate.py --config /path/to/config.yaml
```

---

## 🔧 Configuration File Locations

### cipas-syntactics
- **Config**: `apps/services/cipas-services/cipas-syntactics/config.yaml`
- **Models**: `apps/services/cipas-services/cipas-syntactics/models/`
- **Results**: `apps/services/cipas-services/cipas-syntactics/results/`

### cipas-semantics
- **Config**: `apps/services/cipas-services/cipas-semantics/config.yaml`
- **Models**: `apps/services/cipas-services/cipas-semantics/models/`
- **Results**: `apps/services/cipas-services/cipas-semantics/results/`

---

## 📊 Dataset Paths (Update in config.yaml)

### cipas-syntactics
```yaml
datasets:
  toma:
    path: "/path/to/toma-dataset"
  bigclonebench_balanced:
    path: "/path/to/bigclonebench_balanced.json"
  bigclonebench_full:
    path: "/path/to/bigclonebench.jsonl"
  codenet:
    path: "/path/to/project-codenet"
```

### cipas-semantics
```yaml
datasets:
  codenet:
    path: "/path/to/project-codenet"
  gptclonebench:
    path: "/path/to/gptclonebench_dataset.jsonl"
```

---

## 🎯 Typical Workflows

### Workflow 1: Quick Test (cipas-syntactics)

```bash
cd cipas-syntactics

# 1. Quick training (5-10 minutes)
python train.py --sample-size 5000 --no-visualize

# 2. Quick evaluation
python evaluate.py --sample-size 1000 --no-visualize

# 3. Check results
cat results/train/training_metrics.json | python -m json.tool
cat results/evaluate/evaluation_metrics.json | python -m json.tool
```

### Workflow 2: Production Training (cipas-syntactics)

```bash
cd cipas-syntactics

# 1. Edit config.yaml - set sample_size: null for full dataset
# 2. Full training (1-2 hours)
python train.py

# 3. Full evaluation
python evaluate.py

# 4. Parallel evaluation on full BigCloneBench
python evaluate_parallel.py --dataset full --workers 16
```

### Workflow 3: Multi-Language Training (cipas-semantics)

```bash
cd cipas-semantics

# 1. Edit config.yaml - set all_languages: true
# 2. Multi-language training (several hours)
python train.py --all-languages --sample-size 50000

# 3. Evaluate all languages
python evaluate.py --all-languages --sample-size 2000
```

---

## 🐛 Troubleshooting

### Config File Not Found
```bash
# Make sure you're in the correct directory
cd apps/services/cipas-services/cipas-syntactics
# or
cd apps/services/cipas-services/cipas-semantics

# Verify config exists
ls -la config.yaml
```

### Dataset Not Found
```bash
# Update dataset paths in config.yaml
# Use absolute paths for reliability
```

### Dependencies Missing
```bash
# Reinstall dependencies
poetry install --no-cache
```

### Model Not Found
```bash
# Train a model first
python train.py

# Or specify correct model path in evaluate.py
python evaluate.py --model /path/to/model.pkl
```

---

## 📁 File Structure Reference

### cipas-syntactics
```
cipas-syntactics/
├── config.yaml               # Main configuration ⭐
├── train.py                  # Training entry point
├── train_core.py             # Core training logic
├── evaluate.py               # Evaluation entry point
├── evaluate_core.py          # Core evaluation logic
├── evaluate_parallel.py      # Parallel evaluation
├── evaluate_clustering.py    # Clustering evaluation
├── main.py                   # FastAPI service
├── routes.py                 # API routes
├── schemas.py                # Pydantic models
├── clone_detection/          # Core library
├── models/                   # Trained models
└── results/                  # Output files
```

### cipas-semantics
```
cipas-semantics/
├── config.yaml               # Main configuration ⭐
├── train.py                  # Training entry point
├── train_codenet_core.py     # Core training logic
├── evaluate.py               # Evaluation entry point
├── evaluate_core.py          # Core evaluation logic
├── main.py                   # FastAPI service
├── routes.py                 # API routes
├── schemas.py                # Pydantic models
├── clone_detection/          # Core library
├── models/                   # Trained models
├── results/                  # Training outputs
└── evaluation_output/        # Evaluation outputs
```

---

## 📚 Documentation Files

### cipas-syntactics
- `README.md` - Main documentation
- `PIPELINE.md` - Technical architecture
- `cipas-syntactics.md` - Comprehensive guide
- `clone_detection_summary.md` - Dataset summary

### cipas-semantics
- `README.md` - Main documentation
- `semantics-summary.md` - Feature summary
- `cipas-semantics.md` - Comprehensive guide
- `OUTPUT_FILES_REFERENCE.md` - Output reference

---

## 🔗 Related Documentation

- Main refactoring summary: `../cipas-services-REFACTORING-SUMMARY.md`
- This quick reference: `QUICK_REFERENCE.md`

---

**Last Updated**: March 6, 2026  
**Version**: 2.0.0 (Configuration-Based)
