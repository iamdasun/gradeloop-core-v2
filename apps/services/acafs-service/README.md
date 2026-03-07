# ACAFS Service

Automated Code Analysis & Feedback System for Gradeloop.

## Overview

ACAFS Service is a Python microservice that performs AST (Abstract Syntax Tree) extraction and structural analysis on student code submissions. It integrates with the existing Gradeloop backend architecture via RabbitMQ event consumption.

## Features

- **Event-Driven Architecture**: Consumes `submission.created` events from RabbitMQ
- **Multi-Language Support**: C, C++, Java, Python, JavaScript, C#
- **AST Extraction**: Uses tree-sitter for deterministic parsing
- **Blueprint Generation**: Creates structured JSON blueprints of code
- **MinIO Integration**: Retrieves source code from object storage
- **PostgreSQL Persistence**: Stores AST blueprints for downstream analysis

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Submission     │────▶│   RabbitMQ  │────▶│  ACAFS Service  │
│  Service (Go)   │     │   Exchange  │     │   (Python)      │
└─────────────────┘     └─────────────┘     └─────────────────┘
                                                    │
                       ┌─────────────┐             │
                       │    MinIO    │◀────────────┤
                       │   (Code)    │             │
                       └─────────────┘             │
                                                  │
                       ┌─────────────┐             │
                       │  PostgreSQL │◀────────────┘
                       │  (AST JSONB)│
                       └─────────────┘
```

## Quick Start

### Prerequisites

- Python 3.11+
- Poetry
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
poetry install

# Run the service
poetry run uvicorn app.main:app --reload

# Or with Docker
docker-compose -f docker-compose.yaml up -d acafs-service
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `RABBITMQ_URL`: AMQP connection string
- `DATABASE_URL`: PostgreSQL DSN
- `MINIO_ENDPOINT`: MinIO server endpoint
- `AST_MAX_LINES`: Maximum lines to parse (default: 5000)
- `AST_TIMEOUT_SECONDS`: Parse timeout (default: 2)

LLM / Socratic tutor variables (for live tutoring)
-----------------------------------------------
- `OPENROUTER_API_KEY`: API key for OpenRouter / Arcee (required for Socratic chat). Default placeholder is `SET_YOUR_API_KEY_HERE` in config.
- `OPENROUTER_MODEL`: Model identifier; default `arcee-ai/trinity-large-preview:free`.
- `OPENROUTER_BASE_URL`: Base URL for OpenRouter (default: `https://openrouter.ai/api/v1`).
- `GEMINI_API_KEY`: API key for Gemini rubric grading (optional if using mock grading).
- `GEMINI_MODEL`: Gemini model id used for rubric grading (default: `gemini-2.5-flash`).

Notes:
- If `OPENROUTER_API_KEY` is left as the placeholder, the Socratic tutor will return a mock hint explaining the key must be set.
- Ensure the API key is provided via environment variables injected by your deployment (docker-compose, k8s secret, or CI runtime).

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /ready` | Readiness probe |
| `GET /metrics` | Service metrics |
| `GET /languages` | List supported languages |

## AST Blueprint Schema

```json
{
  "schema_version": "1.0.0",
  "language": "python",
  "functions": [...],
  "classes": [...],
  "variables": [...],
  "control_flow": [...],
  "operators": [...],
  "imports": [...],
  "metadata": {
    "ast_truncated": false,
    "parser_timeout": false,
    "lines_of_code": 42,
    "extraction_duration_ms": 15.3
  }
}
```

## Message Contract

### Input: SubmissionEvent

```json
{
  "submission_id": "uuid",
  "assignment_id": "uuid",
  "code": "source code (optional)",
  "language": "python",
  "language_id": 71,
  "storage_path": "submissions/{assignment_id}/{submission_id}/code.txt",
  "user_id": "...",
  "username": "...",
  "ip_address": "...",
  "user_agent": "...",
  "enqueued_at": "2024-01-01T00:00:00Z"
}
```

### Output: acafs_results Table

| Column | Type | Description |
|--------|------|-------------|
| submission_id | UUID | Primary key |
| assignment_id | UUID | Assignment reference |
| language | VARCHAR | Programming language |
| ast_blueprint | JSONB | Extracted AST |
| extraction_status | VARCHAR | success/parse_failed |
| parse_failure | JSONB | Error details |
| created_at | TIMESTAMP | Creation time |

## Future Extensions

- LLM Gateway for feedback generation
- Socratic Hint Bot integration
- Rubric Engine integration (US04)
- Semantic code analysis

## License

Proprietary - GradeLoop Team
