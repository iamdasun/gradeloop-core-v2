# Semantic Clone Detection API

FastAPI-based service for detecting semantic clones in code using GraphCodeBERT-based deep learning model.

## Overview

This API detects **semantic clones** - code snippets that implement the same functionality despite potential syntactic differences. The model is based on **GraphCodeBERT** with a custom classification head that analyzes:

- Code embeddings from both snippets
- Absolute difference between embeddings
- Element-wise product of embeddings

## Features

- ✅ **Single Pair Detection**: Detect if two code snippets are semantic clones
- ✅ **Batch Processing**: Process multiple code pairs efficiently
- ✅ **Similarity Scoring**: Get raw semantic similarity scores (0-1)
- ✅ **GPU Acceleration**: Optimized for NVIDIA GPUs with mixed precision
- ✅ **RESTful API**: OpenAPI-compliant with automatic documentation
- ✅ **Docker Support**: Containerized deployment ready

## Quick Start

### Prerequisites

- Python 3.11+
- CUDA-compatible GPU (optional, for acceleration)

### Installation

1. **Clone the repository**
   ```bash
   cd cipas-semantics
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or
   .\venv\Scripts\activate  # Windows
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment** (optional)
   ```bash
   cp .env.example .env
   # Edit .env as needed
   ```

5. **Run the API**
   ```bash
   cd api
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

### Using Docker

```bash
# Build the image
docker build -t cipas-semantics .

# Run the container
docker run -p 8000:8000 cipas-semantics

# Run with GPU support (requires NVIDIA Container Toolkit)
docker run --gpus all -p 8000:8000 cipas-semantics
```

## API Endpoints

### Health Check

```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "device": "cuda"
}
```

### Model Information

```http
GET /api/v1/model/info
```

**Response:**
```json
{
  "model_name": "microsoft/graphcodebert-base",
  "max_length": 512,
  "hidden_size": 768,
  "dropout_rate": 0.3,
  "device": "cuda",
  "threshold": 0.5
}
```

### Detect Semantic Clone

```http
POST /api/v1/detect
Content-Type: application/json

{
  "code1": "def add(a, b):\n    return a + b",
  "code2": "def sum(a, b):\n    return a + b"
}
```

**Response:**
```json
{
  "is_clone": true,
  "confidence": 0.95,
  "clone_probability": 0.95,
  "not_clone_probability": 0.05
}
```

### Batch Detection

```http
POST /api/v1/detect/batch
Content-Type: application/json

{
  "pairs": [
    ["def add(a, b): return a + b", "def sum(a, b): return a + b"],
    ["def mul(a, b): return a * b", "def add(a, b): return a + b"]
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "is_clone": true,
      "confidence": 0.95,
      "clone_probability": 0.95,
      "not_clone_probability": 0.05
    },
    {
      "is_clone": false,
      "confidence": 0.92,
      "clone_probability": 0.08,
      "not_clone_probability": 0.92
    }
  ],
  "total_pairs": 2,
  "clone_count": 1
}
```

### Similarity Score

```http
POST /api/v1/similarity
Content-Type: application/json

{
  "code1": "def add(a, b):\n    return a + b",
  "code2": "def sum(a, b):\n    return a + b"
}
```

**Response:**
```json
{
  "similarity_score": 0.95
}
```

## API Documentation

Once the server is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `API_HOST` | API host address | `0.0.0.0` |
| `API_PORT` | API port | `8000` |
| `DEBUG` | Enable debug mode | `false` |
| `DEVICE` | Device for inference (`cuda`/`cpu`) | `cuda` |
| `USE_CUDA` | Enable CUDA | `true` |
| `USE_MIXED_PRECISION` | Enable mixed precision | `true` |
| `CLONE_THRESHOLD` | Clone detection threshold (0-1) | `0.5` |
| `LOG_LEVEL` | Logging level | `INFO` |

## Model Architecture

The model uses **GraphCodeBERT-base** as the encoder with a custom classification head:

```
Code1 ──┐
        ├──> GraphCodeBERT ──> Embedding1 ──┐
Code2 ──┘                                   │
                                            ├──> [e1, e2, |e1-e2|, e1*e2] ──> Classifier ──> Prediction
        ┌──> GraphCodeBERT ──> Embedding2 ──┘
Code2 ──┘
```

**Classification Head:**
- Input: 4 × 768 = 3072 (concatenated embeddings)
- Layer 1: Linear(3072 → 512) + LayerNorm + Dropout + ReLU
- Layer 2: Linear(512 → 128) + LayerNorm + Dropout + ReLU
- Output: Linear(128 → 2) for binary classification

## Performance

- **Batch Size**: 16 (training), 32 (inference)
- **Max Sequence Length**: 512 tokens
- **GPU Memory**: ~2GB for inference on RTX 6000
- **Inference Time**: ~50ms per pair (GPU), ~200ms per pair (CPU)

## Example Usage

### Python Client

```python
import requests

# Single detection
response = requests.post(
    "http://localhost:8000/api/v1/detect",
    json={
        "code1": "def add(a, b):\n    return a + b",
        "code2": "def sum(a, b):\n    return a + b"
    }
)
result = response.json()
print(f"Is clone: {result['is_clone']}")
print(f"Confidence: {result['confidence']}")

# Batch detection
response = requests.post(
    "http://localhost:8000/api/v1/detect/batch",
    json={
        "pairs": [
            ["def add(a, b): return a + b", "def sum(a, b): return a + b"],
            ["def mul(a, b): return a * b", "def add(a, b): return a + b"]
        ]
    }
)
results = response.json()
print(f"Clones found: {results['clone_count']}/{results['total_pairs']}")
```

### cURL

```bash
# Single detection
curl -X POST "http://localhost:8000/api/v1/detect" \
  -H "Content-Type: application/json" \
  -d '{"code1": "def add(a, b):\n    return a + b", "code2": "def sum(a, b):\n    return a + b"}'

# Batch detection
curl -X POST "http://localhost:8000/api/v1/detect/batch" \
  -H "Content-Type: application/json" \
  -d '{"pairs": [["def add(a, b): return a + b", "def sum(a, b): return a + b"]]}'
```

## Troubleshooting

### Model Not Found

Ensure the `model/` directory contains:
- `config.json`
- `model.pt`
- `tokenizer/` directory with tokenizer files

### CUDA Out of Memory

Reduce batch size or set `DEVICE=cpu` in environment variables.

### Slow Inference

- Enable GPU acceleration: `DEVICE=cuda`
- Enable mixed precision: `USE_MIXED_PRECISION=true`
- Use batch processing for multiple pairs

## License

Part of the GradeLoop CIPAS project.

## Authors

GradeLoop CIPAS Team

## Citation

If you use this model in your research, please cite the training script located in `scripts/train/train.py`.
