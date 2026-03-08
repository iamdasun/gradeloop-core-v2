# CIPAS Semantics Service

Semantic code clone detection for **Type-4 clones** (functionally equivalent code with different implementations) using the Sheneamer et al. (2021) framework.

## 🚀 Quick Start

### 1. Setup
```bash
poetry install
```

### 2. Train the Model
Train a Type-IV clone detector on Project CodeNet dataset.

**Simple usage (uses config.yaml defaults - Java, 10k samples):**
```bash
python train.py
```

**Full dataset training:**
```bash
python train.py --full-dataset --language java
```

**Multi-language training:**
```bash
python train.py --all-languages --sample-size 50000
```

**Quick test (1k samples):**
```bash
python train.py --sample-size 1000
```

**Use custom config:**
```bash
python train.py --config /path/to/custom-config.yaml
```

### 3. Evaluate the Model
Evaluate on GPTCloneBench dataset.

**Simple usage (uses config.yaml defaults):**
```bash
python evaluate.py
```

**Evaluate specific model:**
```bash
python evaluate.py --model models/type4_xgb_java.pkl --language java
```

**Evaluate on all languages:**
```bash
python evaluate.py --all-languages --sample-size 2000
```

### 4. Run the API Service
```bash
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8087
```

---

## 📋 Configuration

All training and evaluation parameters are managed through **`config.yaml`**.

### Training Configuration
```yaml
training:
  model:
    name: "type4_xgb_codenet.pkl"
    dir: "./models"
    
  dataset:
    path: null  # null = use datasets.codenet.path
    language: "java"
    all_languages: false
    
  sample_size: null  # null = full dataset (capped at 500k)
  clone_ratio: 0.5
  hard_negative_ratio: 0.20
  
  include_gptclonebench: false
  gptclonebench:
    ratio: 0.10
    
  visualize: true
  cross_validation: true
  
  xgboost:
    n_estimators: 500
    max_depth: 6
    learning_rate: 0.1
```

### Evaluation Configuration
```yaml
evaluation:
  model:
    path: "models/type4_xgb_java.pkl"
    
  dataset:
    path: null  # null = use datasets.gptclonebench.path
    format: "gptclonebench"
    
  language: null  # null = all 4 languages
  sample_size: null
  
  threshold: null  # null = use calibrated threshold
  threshold_sweep: true
  visualize: true
```

### Dataset Paths
```yaml
datasets:
  codenet:
    path: "/path/to/project-codenet"
  gptclonebench:
    path: "/path/to/gptclonebench_dataset.jsonl"
```

---

## 🛠 Documentation

- **[semantics-summary.md](./semantics-summary.md)** - Feature extraction and model architecture summary
- **[cipas-semantics.md](./cipas-semantics.md)** - Comprehensive setup and usage guide
- **[OUTPUT_FILES_REFERENCE.md](./OUTPUT_FILES_REFERENCE.md)** - Output files reference

## 📂 Project Structure

```
cipas-semantics/
├── config.yaml                    # Main configuration file
├── train.py                       # Training entry point (config-based)
├── train_codenet_core.py          # Core training logic
├── evaluate.py                    # Evaluation entry point (config-based)
├── evaluate_core.py               # Core evaluation logic
├── main.py                        # FastAPI application
├── routes.py                      # API route handlers
├── schemas.py                     # Pydantic models
├── clone_detection/               # Core detection library
│   ├── features/
│   │   └── sheneamer_features.py  # 102 semantic features
│   ├── models/
│   │   └── classifiers.py         # SemanticClassifier
│   └── tokenizers/
│       └── tree_sitter_tokenizer.py
├── models/                        # Trained model storage
├── results/                       # Training/evaluation outputs
└── evaluation_output/             # Evaluation visualizations
```

## 🔧 Advanced Usage

### Custom Training Configuration
```yaml
# quick_train.yaml
training:
  sample_size: 5000
  language: java
  xgboost:
    n_estimators: 200
    max_depth: 4
  visualize: false
  cross_validation: false
```

Run with:
```bash
python train.py --config quick_train.yaml
```

### Domain Adaptation with GPTCloneBench
```yaml
training:
  include_gptclonebench: true
  gptclonebench:
    ratio: 0.10  # 10% GPTCloneBench samples
```

### Production Deployment
```bash
# Build Docker image
docker build -t cipas-semantics:latest .

# Run container
docker run -d -p 8087:8087 \
  -v $(pwd)/models:/app/models \
  --name cipas-semantics \
  cipas-semantics:latest
```

## 📊 Output Files

### Training Outputs
- `models/type4_xgb_codenet.pkl` - Trained model
- `results/train/training_metrics.json` - Training metrics
- `results/train/visualization.html` - Interactive visualization report

### Evaluation Outputs
- `results/evaluate/metrics_{language}.json` - Evaluation metrics per language
- `results/evaluate/evaluation_report_{language}.html` - Evaluation report
- `results/evaluate/threshold_sweep_results.csv` - Threshold analysis

## 🎯 Feature Extraction

The Sheneamer et al. (2021) framework extracts **102 semantic features** per code snippet:

1. **Traditional Features (10)**: LOC, keyword categories
2. **Syntactic/CST Features (40)**: Tree-sitter node frequencies
3. **Semantic/PDG-like Features (20)**: Dependency relationships
4. **Structural Depth Features (8)**: Nesting, depth, density
5. **Type Signature Features (12)**: Parameter/return type patterns
6. **API Fingerprinting Features (12)**: Library usage patterns

**Feature Fusion**: Two feature vectors are fused via concatenation → **204 features per pair**

## 📈 Performance Targets

- **Accuracy**: ≥ 85% on GPTCloneBench
- **Precision**: ≥ 85% for Type-4 detection
- **Recall**: ≥ 80% for Type-4 detection
- **F1 Score**: ≥ 82%

## 🌐 Supported Languages

- Java
- C
- Python
- C#

## 🔬 Detection Method

Type-4 clones are detected using:
- **Semantic feature extraction** (102 features per snippet)
- **Feature fusion** (204 features per pair)
- **XGBoost classification** (optimized for high-dimensional spaces)
- **Probability threshold calibration** (automatic or manual)

```
Code Pair → Feature Extraction (102 × 2) → Fusion (204) → XGBoost → Clone Probability
```

## 📚 References

- Sheneamer, A., et al. (2021). "A Framework for Semantic Code Clone Detection Using Machine Learning"
- Project CodeNet: "A Large-Scale Code Dataset for Machine Learning"
- GPTCloneBench: "A Benchmark for AI-Generated Code Clone Detection"
