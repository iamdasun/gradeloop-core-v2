# CIPAS Syntactics Service - Setup, Training & Evaluation Guide

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
3. [Model Training](#model-training)
4. [Model Evaluation](#model-evaluation)
5. [Pipeline Evaluation on Project CodeNet](#pipeline-evaluation-on-project-codenet)
6. [Running the Service](#running-the-service)
7. [API Usage](#api-usage)
8. [Docker Deployment](#docker-deployment)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference](#quick-reference)

---

## Prerequisites

### System Requirements

- **Python**: 3.14 or higher
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
| `tqdm`, `rich`, `textual` | Progress bars and TUI |

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

> **Important**: always run tests with the project venv (`poetry run pytest` or `.venv/bin/python -m pytest`).
> Using the wrong venv (e.g. `cipas-ai/.venv`) causes `ModuleNotFoundError: No module named 'datasketch'`.

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

The training script is **`train.py`** and supports the TOMA dataset format.

#### TOMA Dataset Structure

The TOMA dataset at `datasets/toma-dataset/` contains:
- `clone.csv`: Clone pairs with function IDs and clone types
- `nonclone.csv`: Non-clone pairs with function IDs
- `id2sourcecode/`: Individual `.java` files named by function ID

#### Running Training (TOMA Dataset)

```bash
# Train with full TOMA dataset (may take several hours)
poetry run python train.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_xgb.pkl

# Train with sampled data (faster, for testing)
poetry run python train.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_xgb.pkl \
  --sample-size 10000

# Train with specific clone types (e.g., Type-3 only)
poetry run python train.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --model-name type3_xgb.pkl \
  --clone-types 3 \
  --sample-size 5000
```

#### Training with Custom JSON Dataset

```bash
poetry run python train.py \
  --dataset /path/to/dataset.json \
  --dataset-format json \
  --language java \
  --model-name type3_xgb.pkl
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

---

## Model Evaluation

The evaluation script is **`evaluate.py`** and supports BigCloneBench, TOMA, and JSON formats.

### Evaluation with BigCloneBench Dataset

```bash
# Full dataset
poetry run python evaluate.py \
  --model models/type3_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# Sampled data (faster)
poetry run python evaluate.py \
  --model models/type3_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java \
  --sample-size 5000
```

### Evaluation with TOMA Dataset

```bash
poetry run python evaluate.py \
  --model models/type3_xgb.pkl \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --sample-size 5000
```

### Evaluation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Accuracy** | Overall correctness | > 0.90 |
| **Precision** | TP / (TP + FP) | > 0.90 |
| **Recall** | TP / (TP + FN) | > 0.90 |
| **F1 Score** | Harmonic mean of precision and recall | > 0.90 |
| **ROC AUC** | Area under ROC curve | > 0.95 |

### Cascade Detection Performance

| Phase | Clone Type | Avg. Detection Time |
|-------|------------|---------------------|
| Pass A (Literal) | Type-1 | < 5 ms |
| Pass B (Blinded) | Type-2 | < 10 ms |
| Phase Two (TOMA + XGBoost) | Type-3 | ~ 50 ms |

---

## Pipeline Evaluation on Project CodeNet

**`evaluate_clustering.py`** benchmarks the full Phase 1–6 pipeline (segmentation → LSH → cascade → collusion graph) against the [Project CodeNet](https://github.com/IBM/Project_CodeNet) dataset. It measures:

- **LSH candidate recall** — fraction of true clone pairs surfaced by MinHash buckets
- **LSH precision / workload reduction** — quality of the candidate filter
- **Adjusted Rand Index (ARI)** — clustering quality vs brute-force ground truth
- **Throughput** — submissions / second end-to-end

### Dataset Location

```
datasets/project-codenet/
├── data/            # per-language source files  (data/<problem_id>/<language>/<submission>.java)
├── metadata/        # CSV metadata per problem
└── problem_descriptions/
```

### Running the Pipeline Evaluator

```bash
# Quick smoke test (LSH-only, fast)
.venv/bin/python evaluate_clustering.py \
  --n-problems 5 \
  --max-submissions 15 \
  --max-source-kb 8 \
  --language java \
  --lsh-only

# Full run with cascade (10 problems, up to 20 submissions each)
.venv/bin/python evaluate_clustering.py \
  --n-problems 10 \
  --max-submissions 20 \
  --max-source-kb 8 \
  --language java

# Multi-language, save JSON results
.venv/bin/python evaluate_clustering.py \
  --n-problems 20 \
  --max-submissions 50 \
  --language java python c \
  --output-json results/codenet_eval.json

# From workspace root
CIPAS=apps/services/cipas-services/cipas-syntactics
$CIPAS/.venv/bin/python $CIPAS/evaluate_clustering.py \
  --n-problems 10 --max-submissions 20 --max-source-kb 8 --language java --lsh-only
```

### CLI Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--n-problems N` | 20 | Number of CodeNet problems to sample |
| `--language LANG [...]` | `java` | Language(s): `java python c csharp` |
| `--max-submissions N` | 100 | Max submissions per (problem, language) pair |
| `--lsh-threshold T` | 0.3 | MinHashLSH Jaccard threshold |
| `--lsh-perm K` | 128 | Number of MinHash permutations |
| `--lsh-only` | off | Skip Phase 3 cascade; only measure LSH metrics |
| `--skip-brute-force` | off | Skip O(N²) ground-truth step |
| `--max-cascade-pairs N` | none | Cap Phase 3 calls per problem |
| `--full-gt` | off | Use full TieredPipeline for ground truth |
| `--all-statuses` | off | Include non-Accepted submissions |
| `--max-source-kb N` | 16 | Skip files larger than N KB |
| `--output-json PATH` | none | Write per-problem + summary JSON |
| `--seed S` | 42 | RNG seed for reproducible sampling |
| `--verbose` | off | Enable DEBUG-level logging |

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

- **Swagger UI**: http://localhost:8086/docs
- **ReDoc**: http://localhost:8086/redoc

### All Endpoints

| Method | Path | Tag | Description |
|--------|------|-----|-------------|
| `GET` | `/api/v1/syntactics/` | Root | Service info |
| `GET` | `/api/v1/syntactics/health` | Health | Health + model status |
| `GET` | `/api/v1/syntactics/ready` | Health | Readiness probe |
| `GET` | `/api/v1/syntactics/models` | Models | Model status detail |
| `GET` | `/api/v1/syntactics/feature-importance` | Models | XGBoost feature importances |
| `POST` | `/api/v1/syntactics/compare` | Comparison | Compare two snippets |
| `POST` | `/api/v1/syntactics/compare/batch` | Comparison | Batch compare pairs |
| `POST` | `/api/v1/syntactics/tokenize` | Utilities | Tokenize source code |
| `POST` | `/api/v1/syntactics/submissions/ingest` | Pipeline | Ingest one submission (global index) |
| `POST` | `/api/v1/syntactics/templates/register` | Pipeline | Register instructor template |
| `GET` | `/api/v1/syntactics/collusion-report` | Pipeline | Get collusion groups (global index) |
| `GET` | `/api/v1/syntactics/index/status` | Pipeline | LSH index statistics |
| `POST` | `/api/v1/syntactics/assignments/cluster` | Pipeline | **Cluster all submissions for an assignment** |

---

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
      "model_name": "type3_xgb.pkl",
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

```json
{
  "model": "type3_xgb.pkl",
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

```json
{
  "tokens": ["int", "V", "=", "V", "(", "V", ",", "V", ")"],
  "token_count": 9,
  "language": "java"
}
```

---

#### 6. Ingest a Submission (Incremental Pipeline)

Runs one student submission through the full pipeline and adds results to the global shared index + collusion graph.

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/submissions/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "submission_id": "sub-001",
    "student_id": "alice",
    "assignment_id": "hw3",
    "source_code": "public class Solution { ... }",
    "language": "java"
  }'
```

```json
{
  "submission_id": "sub-001",
  "student_id": "alice",
  "assignment_id": "hw3",
  "fragment_count": 5,
  "candidate_pair_count": 12,
  "confirmed_clone_count": 3,
  "clone_matches": [],
  "errors": []
}
```

---

#### 7. Register Instructor Template

Fragments matching the template (Jaccard ≥ 0.90) are discarded from all student submissions to prevent false positives from shared starter code.

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/templates/register \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "hw3",
    "source_code": "public class Solution { /* TODO */ }",
    "language": "java"
  }'
```

---

#### 8. Get Collusion Report (Global Index)

Returns connected components of the global student clone graph — available after incremental ingestion.

```bash
curl "http://localhost:8086/api/v1/syntactics/collusion-report?assignment_id=hw3&min_confidence=0.7"
```

```json
{
  "assignment_id": "hw3",
  "group_count": 1,
  "total_flagged_students": 3,
  "groups": [
    {
      "group_id": 0,
      "member_ids": ["alice", "bob", "carol"],
      "member_count": 3,
      "max_confidence": 0.98,
      "dominant_type": "Type-2",
      "edge_count": 3,
      "edges": [
        { "student_a": "alice", "student_b": "bob", "clone_type": "Type-2", "confidence": 0.98, "match_count": 4 }
      ]
    }
  ]
}
```

---

#### 9. Cluster All Submissions for an Assignment ★

**The preferred endpoint for batch analysis.** Each call uses a **fresh, isolated pipeline** — results are self-contained and do not modify the global index.

```bash
curl -X POST http://localhost:8086/api/v1/syntactics/assignments/cluster \
  -H "Content-Type: application/json" \
  -d '{
    "assignment_id": "hw3",
    "language": "java",
    "lsh_threshold": 0.3,
    "min_confidence": 0.0,
    "instructor_template": "public class Solution { /* starter */ }",
    "submissions": [
      { "submission_id": "s1", "student_id": "alice", "source_code": "..." },
      { "submission_id": "s2", "student_id": "bob",   "source_code": "..." },
      { "submission_id": "s3", "student_id": "carol", "source_code": "..." }
    ]
  }'
```

**Request schema** (`AssignmentClusterRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assignment_id` | string | ✓ | Assignment identifier |
| `language` | enum | — | `java` (default), `python`, `c`, `csharp` |
| `submissions` | array | ✓ | Min 2 × `{ submission_id, student_id, source_code }` |
| `instructor_template` | string | — | Starter code to filter out before indexing |
| `lsh_threshold` | float | — | MinHash Jaccard threshold (default: 0.3) |
| `min_confidence` | float | — | Minimum clone confidence for graph edges (default: 0.0) |

**Response schema** (`AssignmentClusterResponse`):

```json
{
  "assignment_id": "hw3",
  "language": "java",
  "submission_count": 3,
  "processed_count": 3,
  "failed_count": 0,
  "total_clone_pairs": 12,
  "collusion_groups": [
    {
      "group_id": 0,
      "member_ids": ["alice", "bob", "carol"],
      "member_count": 3,
      "max_confidence": 0.98,
      "dominant_type": "Type-2",
      "edge_count": 3,
      "edges": [
        { "student_a": "alice", "student_b": "bob", "clone_type": "Type-2", "confidence": 0.98, "match_count": 4 }
      ]
    }
  ],
  "per_submission": [
    { "submission_id": "s1", "student_id": "alice", "fragment_count": 5, "candidate_pair_count": 8, "confirmed_clone_count": 4, "errors": [] }
  ]
}
```

> **Note**: `member_ids` and `edge.student_a/b` contain **`student_id`** values (not `submission_id`).

---

#### 10. LSH Index Status

```bash
curl http://localhost:8086/api/v1/syntactics/index/status
```

```json
{
  "indexed_fragment_count": 142,
  "lsh_threshold": 0.3,
  "num_permutations": 128
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
      test: ["CMD", "curl", "-f", "http://localhost:8086/api/v1/syntactics/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Troubleshooting

### Common Issues

#### 1. `ModuleNotFoundError: No module named 'datasketch'`

Running tests or the service with the wrong virtualenv (e.g. `cipas-ai/.venv`).

**Fix**: Always use the project's own venv:
```bash
cd apps/services/cipas-services/cipas-syntactics
.venv/bin/python -m pytest tests/ -q
# or
poetry run pytest tests/ -q
```

#### 2. Model Not Found

**Error**: `Model file not found: type3_xgb.pkl`

**Fix**: Train the model first:
```bash
poetry run python train.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java
```

#### 3. Tree-sitter Parser Loading Failed

**Error**: `Language not supported`

**Fix**: Reinstall dependencies:
```bash
poetry install
```

#### 4. Port Already in Use

**Fix**: Change port via env var:
```bash
export CIPAS_SYNTACTICS_PORT=8089
poetry run uvicorn main:app --port 8089
```

#### 5. CORS Errors from Web UI

The browser cannot make cross-origin requests directly to `localhost:8086`.

**Fix**: Use the Next.js API proxy route (`app/api/cipas/assignments/cluster/route.ts`) which forwards server-side. Set `CIPAS_SYNTACTICS_URL` in `apps/web/.env.local`:
```
CIPAS_SYNTACTICS_URL=http://localhost:8086/api/v1/syntactics
```

### Getting Help

Check logs for detailed error messages:
```bash
docker logs cipas-syntactics
```

---

## Quick Reference

### Commands Summary

```bash
# ── Setup ──────────────────────────────────────────────────────────────────
cd apps/services/cipas-services/cipas-syntactics
poetry install
mkdir -p models

# ── Tests ──────────────────────────────────────────────────────────────────
poetry run pytest tests/ -q                        # 39 tests, all should pass

# ── Training ───────────────────────────────────────────────────────────────
poetry run python train.py \
  --dataset ../../../../datasets/toma-dataset \
  --dataset-format toma \
  --language java \
  --sample-size 10000

# ── Evaluation (classifier) ────────────────────────────────────────────────
poetry run python evaluate.py \
  --model models/type3_xgb.pkl \
  --dataset ../../../../datasets/bigclonebench/bigclonebench.jsonl \
  --dataset-format bigclonebench \
  --language java

# ── Pipeline evaluation (Project CodeNet) ──────────────────────────────────
poetry run python evaluate_clustering.py \
  --n-problems 10 \
  --max-submissions 20 \
  --max-source-kb 8 \
  --language java \
  --lsh-only

# ── Run service ────────────────────────────────────────────────────────────
poetry run uvicorn main:app --reload --port 8086

# ── Docker ─────────────────────────────────────────────────────────────────
docker build -t cipas-syntactics .
docker run -p 8086:8086 -v $(pwd)/models:/app/models cipas-syntactics
```

### File Structure

```
cipas-syntactics/
├── main.py                      # FastAPI application + all route registrations
├── routes.py                    # Route handler implementations
├── schemas.py                   # Pydantic request/response models
├── train.py                     # XGBoost model training (TOMA / JSON datasets)
├── evaluate.py                  # Classifier evaluation (BigCloneBench / TOMA / JSON)
├── evaluate_clustering.py       # Full pipeline benchmark on Project CodeNet
├── tui.py                       # Textual TUI for interactive service control
├── pyproject.toml               # Poetry dependencies + pytest config
├── Dockerfile
├── PIPELINE.md                  # Architecture deep-dive
├── clone_detection_summary.md   # Dataset & benchmark summary
├── clone_detection/
│   ├── cascade_worker.py        # Phase 1–6 orchestrator; InMemoryDB; CollusionGraph
│   ├── collusion_graph.py       # Connected-component graph (networkx)
│   ├── lsh_index.py             # MinHashIndexer (datasketch); Phase 3 candidate retrieval
│   ├── preprocessor.py          # Segmentation: structural blocks + sliding windows
│   ├── type3_filter.py          # Template-based fragment filter
│   ├── features/
│   │   └── syntactic_features.py    # 6 syntactic feature extractors (rapidfuzz)
│   ├── models/
│   │   ├── classifiers.py           # XGBoost wrapper
│   │   ├── feature_list.json        # Feature order for model I/O
│   │   └── threshold.json           # Clone-type decision thresholds
│   ├── normalizers/
│   │   ├── structural_normalizer.py # NiCad-style Type-1/2 normalization
│   │   └── universal_mapper.py      # Cross-language identifier blinding
│   ├── pipelines/
│   │   └── __init__.py              # TieredPipeline (Type-1 → Type-2 → Type-3)
│   ├── tokenizers/
│   │   └── tree_sitter_tokenizer.py # Tree-sitter CST tokenizer
│   └── utils/
│       └── common_setup.py          # Logging setup helpers
├── db_migrations/
│   └── V001__add_fragments_and_matches.sql
├── models/                      # Trained model files (e.g. type3_xgb.pkl)
├── results/                     # evaluate_clustering.py JSON output
├── scripts/
│   └── train_evaluate_pipeline.sh
└── tests/
    └── test_pipeline_phases.py  # 39 unit tests (all phases)
```

**Datasets** (workspace root):
- `datasets/toma-dataset/` — Training dataset (TOMA format, Java)
- `datasets/bigclonebench/bigclonebench.jsonl` — Classifier evaluation dataset
- `datasets/project-codenet/` — Pipeline benchmark dataset

### Clone Detection Thresholds

| Clone Type | Jaccard | Levenshtein | Token Delta |
|------------|---------|-------------|-------------|
| **Type-1** | ≥ 0.98 | ≥ 0.98 | 0 % |
| **Type-2** | ≥ 0.95 | ≥ 0.95 | ≤ 5 % |
| **Type-3** | XGBoost classification | — | — |

### Performance Benchmarks

| Metric | Value |
|--------|-------|
| Type-1 Detection | < 5 ms |
| Type-2 Detection | < 10 ms |
| Type-3 Detection | ~ 50 ms |
| LSH Workload Reduction | ~ 95 % |
| Speed vs Neural | ~ 65× faster |
| F1 Score (Type-3) | 90 %+ |
