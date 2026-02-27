# CIPAS Syntactics Service

Syntactic code clone detection for **Type-1, Type-2, and Type-3 clones** using a hybrid tiered pipeline.

## 🚀 Quick Start

### 1. Setup
```bash
poetry install
```

### 2. Train the Model
The XGBoost-based Type-3 detector is trained on the TOMA dataset.
```bash
poetry run python train.py
```

### 3. Evaluate the Pipeline
Measure the performance on the BigCloneBench Balanced dataset.
```bash
poetry run python evaluate.py
```

### 4. Run the API Service
```bash
poetry run uvicorn main:app --reload --port 8086
```

---

## 🛠 Documentation

- **[PIPELINE.md](./PIPELINE.md)** - Detailed technical documentation of the detection architecture, feature extraction, and tiered routing logic.
- **[cipas-syntactics.md](./cipas-syntactics.md)** - Original architecture guide (Note: Some details may be outdated).

## 📂 Project Structure

- `train.py`: Training script for the XGBoost model using the TOMA dataset.
- `evaluate.py`: Evaluation script using BigCloneBench Balanced, implementing the two-stage routing logic.
- `main.py` / `routes.py`: FastAPI application and endpoints.
- `clone_detection/`: Core library for clone detection.
  - `pipelines/`: Tiered detection logic (Type-1 → Type-2 → Type-3).
  - `features/`: hybrid String + AST feature extractors.
  - `models/`: XGBoost wrapper and serialization.
  - `normalizers/`: NiCAD-style structural normalization.
  - `type3_filter.py`: Post-classifier boundary check for Type-3 recall optimization.
