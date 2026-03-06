# CIPAS Syntactics Service

Syntactic code clone detection for **Type-1, Type-2, and Type-3 clones** using a hybrid tiered pipeline.

## 🚀 Quick Start

### 1. Setup
```bash
poetry install
```

### 2. Train the Model
The XGBoost-based Type-3 detector is trained on the TOMA dataset.

**Simple usage (uses config.yaml defaults):**
```bash
python train.py
```

**Override specific parameters:**
```bash
python train.py --sample-size 10000 --n-estimators 300
```

**Use custom config file:**
```bash
python train.py --config /path/to/custom-config.yaml
```

### 3. Evaluate the Pipeline
Measure the performance on the BigCloneBench Balanced dataset.

**Simple usage (uses config.yaml defaults):**
```bash
python evaluate.py
```

**Override specific parameters:**
```bash
python evaluate.py --sample-size 2000 --threshold 0.35
```

**Evaluate on full dataset with parallel processing:**
```bash
python evaluate_parallel.py --dataset full --workers 16
```

### 4. Run the API Service
```bash
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8086
```

---

## 📋 Configuration

All training and evaluation parameters are now managed through **`config.yaml`**. This eliminates the need for complex command-line arguments.

### Key Configuration Sections:

#### Training Configuration
```yaml
training:
  model:
    name: "clone_detector_xgb.pkl"
    output_dir: "./results/train"
    
  xgboost:
    n_estimators: 500
    max_depth: 8
    learning_rate: 0.05
    scale_pos_weight: 2.0
    
  dataset_config:
    - ["type-1.csv", 1, 8000, 1.5]
    - ["type-3.csv", 1, 20000, 2.0]
    - ["nonclone.csv", 0, 20000, 1.0]
```

#### Evaluation Configuration
```yaml
evaluation:
  model:
    path: "clone_detector_xgb.pkl"
    output_dir: "./results/evaluate"
    
  clone_types: [1, 2, 3]
  sample_size: null  # null = full dataset
  threshold: null    # null = use calibrated threshold
```

### Dataset Paths
Configure dataset locations in the `datasets` section:
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

---

## 🛠 Documentation

- **[PIPELINE.md](./PIPELINE.md)** - Detailed technical documentation of the detection architecture, feature extraction, and tiered routing logic.
- **[cipas-syntactics.md](./cipas-syntactics.md)** - Original architecture guide.

## 📂 Project Structure

```
cipas-syntactics/
├── config.yaml              # Main configuration file
├── train.py                 # Training entry point (config-based)
├── train_core.py            # Core training logic
├── evaluate.py              # Evaluation entry point (config-based)
├── evaluate_core.py         # Core evaluation logic
├── evaluate_parallel.py     # Parallel evaluation on full dataset
├── evaluate_clustering.py   # Clustering evaluation on CodeNet
├── main.py                  # FastAPI application
├── routes.py                # API route handlers
├── schemas.py               # Pydantic models
├── clone_detection/         # Core detection library
│   ├── pipelines/           # Tiered detection logic
│   ├── features/            # Feature extractors
│   ├── models/              # XGBoost wrapper
│   ├── normalizers/         # NiCAD-style normalization
│   └── type3_filter.py      # Type-3 boundary filter
├── models/                  # Trained model storage
└── results/                 # Training/evaluation outputs
```

## 🔧 Advanced Usage

### Custom Training Configuration
Create a custom YAML file for different training scenarios:
```yaml
# quick_train.yaml
training:
  sample_size: 5000
  xgboost:
    n_estimators: 200
    max_depth: 6
  visualize: false
```

Run with:
```bash
python train.py --config quick_train.yaml
```

### Production Deployment
```bash
# Build Docker image
docker build -t cipas-syntactics:latest .

# Run container
docker run -d -p 8086:8086 \
  -v $(pwd)/models:/app/models \
  --name cipas-syntactics \
  cipas-syntactics:latest
```

## 📊 Output Files

### Training Outputs
- `models/clone_detector_xgb.pkl` - Trained model
- `results/train/training_metrics.json` - Training metrics
- `results/train/visualizations/` - Training plots

### Evaluation Outputs
- `results/evaluate/evaluation_metrics.json` - Evaluation metrics
- `results/evaluate/visualizations/` - Evaluation plots

## 🎯 Detection Pipeline

The service uses a tiered detection approach:

1. **Type-1 Clones**: Exact clones via literal CST comparison (Jaccard ≥ 0.98)
2. **Type-2 Clones**: Renamed clones via blinded CST comparison (threshold ≥ 0.95)
3. **Type-3 Clones**: Near-miss clones via XGBoost + Type-3 Filter

```
Submission → Phase 1 (NiCAD) → Type-1/2 detected?
              ↓ No
           Phase 2 (XGBoost) → Clone probability
              ↓ High probability
           Phase 3 (Type-3 Filter) → Type-3 confirmed
```

## 📈 Performance Targets

- **Type-3 Recall**: ≥ 40% at Precision ≥ 80%
- **Type-1/2 Detection**: Near-perfect via NiCAD phase
- **Overall F1**: Optimized through threshold calibration
