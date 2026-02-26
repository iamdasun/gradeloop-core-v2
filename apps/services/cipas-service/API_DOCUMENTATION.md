# CIPAS Service API Documentation

## Overview

The CIPAS (Code Clone Detection and Analysis Service) provides REST API endpoints for comparing code snippets using machine learning-powered clone detection.

## Features

- **Multi-language Support**: Java, C, Python
- **Two Detection Pipelines**:
  - **Pipeline A (Syntactic)**: Type-1/2/3 clones using Random Forest
  - **Pipeline B (Semantic)**: Type-4 clones using XGBoost
- **Real-time Comparison**: Compare two code snippets instantly
- **Batch Processing**: Compare multiple code pairs in one request
- **Tokenization**: Get tokenized code with optional identifier abstraction

## Quick Start

### 1. Start the Service

```bash
cd /home/iamdasun/Projects/4yrg/gradeloop-core-v2/apps/services/cipas-service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Access Interactive Docs

Open your browser and navigate to:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Health Check

#### `GET /health`

Check service health and model availability.

**Response:**
```json
{
  "status": "healthy",
  "service": "cipas-service",
  "version": "0.1.0",
  "models": {
    "syntactic_type3": {
      "model_name": "type3_rf.pkl",
      "available": true,
      "loaded": true,
      "error": null
    },
    "semantic_type4": {
      "model_name": "type4_xgb.pkl",
      "available": true,
      "loaded": true,
      "error": null
    }
  }
}
```

---

### Compare Two Codes

#### `POST /compare`

Compare two code snippets to detect if they are clones.

**Request Body:**
```json
{
  "code1": "public int foo(int x) { return x + 1; }",
  "code2": "public int bar(int y) { return y + 1; }",
  "language": "java",
  "pipeline": "both"
}
```

**Parameters:**
- `code1` (string, required): First code snippet
- `code2` (string, required): Second code snippet
- `language` (enum, optional): Programming language (`java`, `c`, `python`). Default: `java`
- `pipeline` (enum, optional): Comparison pipeline (`syntactic`, `semantic`, `both`). Default: `both`

**Response:**
```json
{
  "is_clone": true,
  "confidence": 1.0,
  "clone_type": "Type-1",
  "pipeline_used": "syntactic",
  "syntactic_features": {
    "jaccard_similarity": 1.0,
    "dice_coefficient": 1.0,
    "levenshtein_distance": 0,
    "levenshtein_ratio": 1.0,
    "jaro_similarity": 1.0,
    "jaro_winkler_similarity": 1.0
  },
  "semantic_features": null,
  "tokens1_count": 14,
  "tokens2_count": 14
}
```

**Response Fields:**
- `is_clone` (boolean): Whether the codes are clones
- `confidence` (float): Confidence score (0-1)
- `clone_type` (string): Type of clone detected (Type-1, Type-2, Type-3, Type-4)
- `pipeline_used` (string): Which pipeline was used
- `syntactic_features` (object): Detailed syntactic features (if Pipeline A was used)
- `semantic_features` (object): Semantic features metadata (if Pipeline B was used)
- `tokens1_count` (integer): Number of tokens in code1
- `tokens2_count` (integer): Number of tokens in code2

---

### Batch Compare

#### `POST /compare/batch`

Compare multiple code pairs in a single request.

**Request Body:**
```json
{
  "pairs": [
    {
      "code1": "int x = 1;",
      "code2": "int y = 1;",
      "language": "java",
      "pipeline": "syntactic"
    },
    {
      "code1": "return a + b;",
      "code2": "return a - b;",
      "language": "java",
      "pipeline": "syntactic"
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "is_clone": true,
      "confidence": 1.0,
      "clone_type": "Type-1",
      "pipeline_used": "syntactic",
      "syntactic_features": { ... },
      "tokens1_count": 5,
      "tokens2_count": 5
    },
    {
      "is_clone": true,
      "confidence": 0.834,
      "clone_type": "Type-3",
      "pipeline_used": "syntactic",
      "syntactic_features": { ... },
      "tokens1_count": 5,
      "tokens2_count": 5
    }
  ],
  "total_pairs": 2
}
```

---

### Tokenize Code

#### `POST /tokenize`

Tokenize source code using Tree-sitter CST parsing.

**Request Body:**
```json
{
  "code": "public static void main(String[] args) { System.out.println(\"Hello\"); }",
  "language": "java",
  "abstract_identifiers": true
}
```

**Parameters:**
- `code` (string, required): Source code to tokenize
- `language` (enum, optional): Programming language. Default: `java`
- `abstract_identifiers` (boolean, optional): Whether to abstract identifiers to 'V'. Default: `true`

**Response:**
```json
{
  "tokens": [
    "public", "static", "void", "V", "(", "V", "[", "]", "V", ")",
    "{", "V", ".", "V", ".", "V", "(", ")", ";", "}"
  ],
  "token_count": 20,
  "language": "java"
}
```

---

### Feature Importance

#### `GET /feature-importance`

Get feature importance scores from trained models.

**Query Parameters:**
- `pipeline` (enum, required): Which pipeline's model to query (`syntactic` or `semantic`)

**Example Request:**
```bash
curl "http://localhost:8000/feature-importance?pipeline=syntactic"
```

**Response:**
```json
{
  "model": "type3_rf.pkl",
  "features": {
    "jaccard_similarity": 0.188,
    "dice_coefficient": 0.146,
    "levenshtein_distance": 0.032,
    "levenshtein_ratio": 0.438,
    "jaro_similarity": 0.099,
    "jaro_winkler_similarity": 0.097
  }
}
```

---

### Model Status

#### `GET /models`

Get detailed status of all ML models.

**Response:**
```json
{
  "models": {
    "syntactic_type3": {
      "model_name": "type3_rf.pkl",
      "available": true,
      "loaded": true,
      "error": null
    },
    "semantic_type4": {
      "model_name": "type4_xgb.pkl",
      "available": true,
      "loaded": true,
      "error": null
    }
  }
}
```

---

## Clone Types

The service detects four types of code clones:

| Type | Description | Detection Method |
|------|-------------|------------------|
| **Type-1** | Exact clones (copy-paste with different formatting) | Syntactic Pipeline |
| **Type-2** | Renamed clones (different identifiers) | Syntactic Pipeline |
| **Type-3** | Modified clones (statements added/removed) | Syntactic Pipeline |
| **Type-4** | Semantic clones (different implementation, same functionality) | Semantic Pipeline |

## Pipeline Selection Guide

### Use Syntactic Pipeline When:
- You want to detect copy-paste clones
- Code structure is similar
- You need fast results
- Working with Type-1/2/3 clones

### Use Semantic Pipeline When:
- You want to detect functionally equivalent code
- Implementation differs but logic is same
- You need deeper semantic understanding
- Working with Type-4 clones

### Use Both Pipelines When:
- You want comprehensive analysis
- You're unsure about clone type
- Maximum accuracy is needed

## Example Usage

### cURL Examples

#### 1. Compare Java Methods
```bash
curl -X POST http://localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "public int sum(int a, int b) { return a + b; }",
    "code2": "public int add(int x, int y) { return x + y; }",
    "language": "java",
    "pipeline": "syntactic"
  }'
```

#### 2. Compare Python Functions
```bash
curl -X POST http://localhost:8000/compare \
  -H "Content-Type: application/json" \
  -d '{
    "code1": "def factorial(n): return 1 if n <= 1 else n * factorial(n-1)",
    "code2": "def fact(n): \n    if n <= 1: return 1\n    return n * fact(n-1)",
    "language": "python",
    "pipeline": "both"
  }'
```

#### 3. Tokenize C Code
```bash
curl -X POST http://localhost:8000/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "code": "int main() { printf(\"Hello\"); return 0; }",
    "language": "c",
    "abstract_identifiers": false
  }'
```

### Python Example

```python
import requests

# Compare two code snippets
response = requests.post(
    "http://localhost:8000/compare",
    json={
        "code1": "int x = 5; if (x > 0) { x++; }",
        "code2": "int y = 10; if (y < 0) { y--; }",
        "language": "java",
        "pipeline": "both"
    }
)

result = response.json()
print(f"Is Clone: {result['is_clone']}")
print(f"Confidence: {result['confidence']:.2%}")
print(f"Clone Type: {result['clone_type']}")
```

## Error Handling

The API returns standard HTTP status codes:

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid parameters) |
| 422 | Validation Error (Pydantic validation failed) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (model not trained) |

**Error Response Format:**
```json
{
  "detail": "Error message describing what went wrong"
}
```

## Performance

- **Syntactic Pipeline**: ~65x faster than neural approaches
- **Semantic Pipeline**: CPU-optimized with XGBoost
- **Typical Response Time**: < 100ms for single comparison
- **Batch Processing**: Efficient parallel processing

## Technical Details

### Syntactic Features (Pipeline A)
- Jaccard Similarity
- Dice Coefficient
- Levenshtein Distance & Ratio
- Jaro Similarity
- Jaro-Winkler Similarity

### Semantic Features (Pipeline B)
- **Traditional**: LOC, keyword counts
- **Syntactic (CST)**: Tree-sitter node frequencies
- **Semantic (PDG-like)**: Dependency relationships

### Supported Languages
- **Java**: Full support with Tree-sitter-java
- **C**: Full support with Tree-sitter-c
- **Python**: Full support with Tree-sitter-python

## Troubleshooting

### Model Not Available
If you see "Model not available" errors, train the models first:

```bash
# Train syntactic model (Type-3)
python scripts/train_type3.py --test

# Train semantic model (Type-4)
python scripts/train_type4.py --test
```

### Tokenization Fails
Ensure Tree-sitter parsers are installed:

```bash
pip install tree-sitter-java tree-sitter-c tree-sitter-python
```

### High Memory Usage
For large batch operations, reduce the batch size or process in chunks.

## License

Part of the Gradeloop Core project.
