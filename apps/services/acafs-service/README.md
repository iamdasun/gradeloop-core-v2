# ACAFS Service

Automated Code Analysis & Feedback System for Gradeloop.

## Overview

ACAFS is a Python/FastAPI microservice that:
1. Consumes `submission.created` events from RabbitMQ
2. Retrieves student code from MinIO and extracts an AST blueprint (tree-sitter)
3. Runs deterministic test-case scoring via Judge0
4. Grades every rubric criterion through a **two-pass LLM pipeline** (Qwen3 reasoning → Gemini structured output)
5. Persists the grade to PostgreSQL and exposes it via REST
6. Powers the Socratic chat tutor for live hint generation

## Architecture

```
Submission Service (Go)
        |  submission.created (RabbitMQ)
        v
+-----------------------------------------------------+
|                   eval_worker.py                    |
|                                                     |
|  Step A  MinIO -> code retrieval                    |
|  Step B  tree-sitter AST extraction                 |
|  Step C  Judge0 deterministic test-case scoring     |
|  Step D  Two-pass LLM grading                       |
|          Pass 1: Qwen3-VL-235B-Thinking (reasoning) |
|          Pass 2: Gemini 2.5 Flash (structured JSON) |
|  Step E  Persist grade -> PostgreSQL                |
+-----------------------------------------------------+
        |
        +-- GET  /api/v1/acafs/grades/:submissionId
        +-- PUT  /api/v1/acafs/grades/:submissionId/override
        `-- POST /api/v1/acafs/chat
```

## Quick Start

### Prerequisites

- Python 3.11+ / Poetry
- Docker & Docker Compose

```bash
# Install dependencies
poetry install

# Run locally
poetry run uvicorn app.main:app --reload

# Or via Docker Compose (recommended)
docker compose up --build acafs-service -d
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | — | AMQP connection string |
| `DATABASE_URL` | — | PostgreSQL DSN |
| `MINIO_ENDPOINT` | — | MinIO server endpoint |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `JUDGE0_BASE_URL` | — | Judge0 API base URL |
| `JUDGE0_API_KEY` | — | Judge0 Rapid API key (optional) |
| `AST_MAX_LINES` | `5000` | Max lines to parse before truncation |
| `AST_TIMEOUT_SECONDS` | `2` | tree-sitter parse timeout |
| `ACAFS_GEMINI_API_KEY` | — | Gemini API key for Pass 2 grading |
| `ACAFS_GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model identifier |
| `OPENROUTER_API_KEY` | — | OpenRouter key (Pass 1 reasoning + Socratic chat) |
| `OPENROUTER_REASONER_MODEL` | `qwen/qwen3-vl-235b-a22b-thinking` | Pass 1 reasoning model |
| `OPENROUTER_MODEL` | `arcee-ai/trinity-large-preview:free` | Socratic chat model |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter base URL |

> **Key management**: A blank or placeholder value for any `*_API_KEY` causes the
> service to fall back to mock responses rather than silently using a wrong key.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ready` | Readiness probe |
| `GET` | `/metrics` | Service metrics |
| `GET` | `/languages` | Supported Judge0 languages |
| `GET` | `/api/v1/acafs/grades/:submissionId` | Fetch grade for a submission |
| `PUT` | `/api/v1/acafs/grades/:submissionId/override` | Apply instructor score/feedback override |
| `POST` | `/api/v1/acafs/chat` | Socratic chat message |

See [`docs/grading-pipeline.md`](docs/grading-pipeline.md) for the full grading flow.

## Grade Response Schema

```json
{
  "submission_id": "uuid",
  "assignment_id": "uuid",
  "total_score": 72.5,
  "max_total_score": 100,
  "criteria_scores": [
    {
      "name": "Recursive base case handling",
      "score": 15,
      "max_score": 20,
      "grading_mode": "deterministic",
      "reason": "Passed 3/4 linked test cases. TC#2 (negative input) failed.",
      "band_selected": "good",
      "confidence": 0.95,
      "instructor_override_score": null,
      "instructor_override_reason": null
    }
  ],
  "holistic_feedback": "## What you achieved\n...",
  "graded_at": "2026-03-08T10:00:00Z",
  "instructor_override_score": null,
  "instructor_holistic_feedback": null,
  "override_by": null,
  "overridden_at": null
}
```

## Override Endpoint

`PUT /api/v1/acafs/grades/:submissionId/override`

Applies instructor adjustments **alongside** the AI-generated grade. Original AI scores
are never mutated — overrides are stored in separate columns and surfaced in the response.

```json
{
  "criteria_overrides": [
    {
      "criterion_name": "Recursive base case handling",
      "override_score": 18,
      "override_reason": "Student demonstrated correct logic in oral examination."
    }
  ],
  "instructor_holistic_feedback": "Good effort overall. Review edge cases.",
  "override_by": "dr.smith@university.edu"
}
```

## Message Contract

### Input: SubmissionEvent (RabbitMQ)

```json
{
  "submission_id": "uuid",
  "assignment_id": "uuid",
  "code": "source code (optional — fetched from MinIO if absent)",
  "language": "python",
  "language_id": 71,
  "storage_path": "submissions/{assignment_id}/{submission_id}/code.txt",
  "user_id": "...",
  "rubric_criteria": [...],
  "test_cases": [
    {
      "test_case_id": "uuid",
      "description": "Handles negative input",
      "input": "-1",
      "expected_output": "0"
    }
  ],
  "objective": "Implement a recursive factorial function",
  "enqueued_at": "2026-01-01T00:00:00Z"
}
```

### Output: acafs_results Table

| Column | Type | Description |
|--------|------|-------------|
| `submission_id` | UUID PK | Primary key |
| `assignment_id` | UUID | Assignment reference |
| `language` | VARCHAR | Programming language |
| `total_score` | NUMERIC | Weighted total score |
| `max_total_score` | NUMERIC | Maximum possible score |
| `criteria_scores` | JSONB | Per-criterion scores, bands, confidence |
| `holistic_feedback` | TEXT | Markdown student-facing feedback |
| `graded_at` | TIMESTAMPTZ | When grading completed |
| `instructor_override_score` | NUMERIC | Instructor-adjusted total (nullable) |
| `instructor_holistic_feedback` | TEXT | Instructor comment (nullable) |
| `override_by` | TEXT | Instructor identifier (nullable) |
| `overridden_at` | TIMESTAMPTZ | Override timestamp (nullable) |

## Documentation

- [`docs/grading-pipeline.md`](docs/grading-pipeline.md) — Two-pass grading architecture
- [`docs/ast-extraction-guide.md`](docs/ast-extraction-guide.md) — AST blueprint reference

## License

Proprietary — GradeLoop Team
