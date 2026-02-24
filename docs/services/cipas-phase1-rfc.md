# CIPAS Phase 1 — Engineering RFC
## Code Integrity Analysis Service: Foundational Infrastructure, Multi-Language Parsing, Parallel Ingestion & Vector-Ready Storage

**RFC Number:** CIPAS-001  
**Status:** APPROVED  
**Authors:** Platform Engineering  
**Created:** 2025-07-18  
**Target Service:** `apps/services/cipas-service`  
**Supersedes:** N/A  

---

## Table of Contents

1. [Architectural Overview](#1-architectural-overview)
2. [Project Initialization & Infrastructure Design](#2-project-initialization--infrastructure-design)
3. [Parsing & Language Abstraction Layer](#3-parsing--language-abstraction-layer)
4. [Ingestion & Parallel Parsing Layer](#4-ingestion--parallel-parsing-layer)
5. [Database & Storage Design](#5-database--storage-design)
6. [Scalability & Performance Engineering](#6-scalability--performance-engineering)
7. [Failure Handling & Observability](#7-failure-handling--observability)
8. [Security & Hardening Considerations](#8-security--hardening-considerations)
9. [Known Bottlenecks & Mitigation Strategies](#9-known-bottlenecks--mitigation-strategies)

---

## 1. Architectural Overview

### 1.1 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              External Callers                                   │
│         Assessment-Service  │  Direct API Client  │  Future Batch Runner        │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ HTTP POST multipart/form-data
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Traefik API Gateway (existing)                            │
│           Route: PathPrefix(/api/v1/cipas) → cipas-service:8085                 │
│           Middleware: cipas-limit (50MB body), cipas-ratelimit                  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CIPAS Service (FastAPI / Uvicorn)                        │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         API Layer (async)                               │   │
│  │   POST /api/v1/cipas/submissions     GET /api/v1/cipas/submissions/:id  │   │
│  │   POST /api/v1/cipas/submissions/:id/trigger                            │   │
│  └──────────────────────────────┬──────────────────────────────────────────┘   │
│                                 │ async call                                    │
│  ┌──────────────────────────────▼──────────────────────────────────────────┐   │
│  │                    IngestionPipeline (async orchestrator)                │   │
│  │   • Semaphore: MAX_CONCURRENT_BATCHES                                    │   │
│  │   • asyncio.gather() fans out file parse tasks                          │   │
│  │   • run_in_executor() offloads CPU work to ProcessPoolExecutor          │   │
│  └─────┬──────────────────────────────────────────────────────┬────────────┘   │
│        │ asyncio.get_event_loop().run_in_executor(...)         │ async writes   │
│        ▼                                                       ▼               │
│  ┌───────────────────────────────────┐   ┌──────────────────────────────────┐  │
│  │   ProcessPoolExecutor             │   │   StorageRepository (asyncpg)    │  │
│  │   Workers: N = cpu_count          │   │   • bulk_insert_files()          │  │
│  │                                   │   │   • bulk_insert_granules()       │  │
│  │   Worker Process (per CPU core):  │   │   • upsert_submission()          │  │
│  │   ┌───────────────────────────┐   │   └──────────────┬───────────────────┘  │
│  │   │  parse_file_task()        │   │                  │                       │
│  │   │  ├─ LanguageParser        │   │                  │                       │
│  │   │  │   (tree-sitter)        │   │                  │                       │
│  │   │  ├─ GranuleExtractor      │   │                  │                       │
│  │   │  │   (TSQuery + spans)    │   │                  │                       │
│  │   │  └─ Normalizer + Hasher   │   │                  │                       │
│  │   └───────────────────────────┘   │                  │                       │
│  └───────────────────────────────────┘                  │                       │
│                                                         │                       │
└─────────────────────────────────────────────────────────┼───────────────────────┘
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL 16 + pgvector (cipas-postgres)                    │
│                                                                                 │
│   submissions ──< files ──< granules ──< embeddings (future)                   │
│                                                                                 │
│   Indexes:                                                                      │
│   • granules(granule_hash)          — Type 1 exact clone lookup                │
│   • granules(ast_fingerprint)       — Type 2/3 structural lookup               │
│   • granules(submission_id, lang)   — submission scoped queries                │
│   • embeddings HNSW(cosine)         — Phase 2 semantic similarity              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Boundaries

| Component | Responsibility | Isolation Boundary |
|---|---|---|
| **API Layer** | Request validation, schema enforcement, response serialisation | `cipas/api/` — pure I/O, no business logic |
| **IngestionPipeline** | Batch orchestration, fan-out, backpressure, result assembly | `cipas/ingestion/pipeline.py` — async, no blocking calls |
| **ParseWorker** | CPU-bound parsing, granule extraction, normalisation, hashing | `cipas/ingestion/worker.py` — subprocess-isolated, no I/O |
| **LanguageParsers** | Tree-sitter grammar binding, TSQuery execution, span extraction | `cipas/parsing/` — stateless, reused per-process |
| **GranuleExtractor** | Granule type classification, AST fingerprinting | `cipas/extraction/` — pure functions |
| **Normalizer** | Type-1 source normalisation, comment stripping | `cipas/extraction/normalizer.py` — pure functions |
| **StorageRepository** | All DB interaction via asyncpg; no logic, only queries | `cipas/storage/repository.py` — async, no business logic |
| **DB Pool** | asyncpg connection pool lifecycle, pgvector type registration | `cipas/storage/db.py` — singleton per process |

### 1.3 Data Flow

```
Request Received
    │
    ├─ 1. Validate multipart fields (file count ≤200, size per file, allowed extensions)
    │
    ├─ 2. Persist SubmissionRecord (status=PROCESSING) → return submission_id immediately
    │       All files streamed into memory as bytes with per-file size guard
    │
    ├─ 3. asyncio.Semaphore acquired (backpressure gate)
    │
    ├─ 4. For each file: compute file_hash (SHA-256), detect language from extension
    │
    ├─ 5. asyncio.gather(*[run_in_executor(pool, parse_file_task, ...) for file in files])
    │       │
    │       └─ Each subprocess worker:
    │               a. Retrieve initialised LanguageParser from _PROCESS_PARSERS global
    │               b. tree-sitter parse: bytes → CST
    │               c. TSQuery execute: CST → [(node, capture_name), ...]
    │               d. For each node: extract source slice, normalise, hash, fingerprint
    │               e. Return List[GranuleDict] + parse metadata
    │
    ├─ 6. Collect results. Classify files as parsed / failed / unsupported
    │
    ├─ 7. Bulk INSERT files, bulk INSERT granules (single transaction per submission)
    │
    ├─ 8. UPDATE submission status → COMPLETED | PARTIAL | FAILED
    │
    └─ 9. asyncio.Semaphore released
```

### 1.4 Concurrency Model

**Why asyncio + ProcessPoolExecutor — not Celery, not threads:**

| Concern | Decision | Rationale |
|---|---|---|
| I/O concurrency | `asyncio` | FastAPI is async-native; DB writes via asyncpg are fully async; no thread overhead |
| CPU-bound parsing | `ProcessPoolExecutor` | Tree-sitter parsing is pure CPU. Python GIL makes threads useless for CPU work. Processes give true parallelism. |
| Task queue (Celery/Redis) | **Rejected for Phase 1** | Adds operational overhead (broker, workers, result backend) for a synchronous request-response flow. Deferred to Phase 2 if batch sizes exceed synchronous latency budgets. |
| Worker threads | **Rejected** | GIL prevents parallelism for CPU-bound code. `ThreadPoolExecutor` is only appropriate for blocking I/O, not parsing. |

The event loop thread **never** calls tree-sitter directly. All parsing is delegated via `loop.run_in_executor()`. This ensures the asyncio event loop remains unblocked and can continue serving health checks, metrics scrapes, and other requests during a 200-file batch.

### 1.5 Failure Isolation Strategy

- **Per-file failure isolation:** A parse failure on one file does not abort the batch. The pipeline collects `FileParseResult(status=FAILED, error=...)` per file and the submission is marked `PARTIAL` if any files fail, `FAILED` if all fail.
- **Worker process crash isolation:** `ProcessPoolExecutor` restarts dead workers transparently. A segfault in tree-sitter (e.g., malformed input) does not kill the API process.
- **DB transaction scope:** Files and granules are inserted in a single transaction per submission. A DB failure rolls back the entire batch atomically; the submission record is updated to `FAILED`.
- **Semaphore prevents cascading overload:** If the process pool is saturated and a batch is waiting on the semaphore, it times out and returns `HTTP 503` with `Retry-After` rather than queueing indefinitely.

### 1.6 Horizontal Scaling Model

```
Load Balancer (Traefik)
    │
    ├── cipas-service replica 1  ──┐
    ├── cipas-service replica 2  ──┼──► Shared PostgreSQL (cipas-postgres)
    └── cipas-service replica N  ──┘       (connection pool per replica)
```

Each replica runs its own `ProcessPoolExecutor`. DB writes are coordinated via PostgreSQL serialisable transactions on the `submissions` table. The `submission_id` (UUID v4) is generated server-side at insert time, preventing collisions. No shared in-process state exists between replicas. The semaphore is per-replica (not distributed); total system concurrency = `MAX_CONCURRENT_BATCHES × replica_count`. In Phase 2, a distributed semaphore (Redis `SETNX`) or a proper task queue (Celery + RabbitMQ, already present in the stack) would replace per-replica semaphores.

---

## 2. Project Initialization & Infrastructure Design

### 2.1 Repository Structure

```
apps/services/cipas-service/
├── Dockerfile                          # Multi-stage: builder + runtime
├── Makefile                            # dev / lint / test / docker targets
├── pyproject.toml                      # Poetry: deps, tools, mypy, ruff
│
└── src/cipas/
    ├── main.py                         # FastAPI app factory + lifespan
    │
    ├── core/
    │   ├── config.py                   # pydantic-settings (CIPAS_ prefix)
    │   └── exceptions.py               # Domain exception hierarchy
    │
    ├── api/
    │   └── v1/
    │       ├── deps/
    │       │   ├── __init__.py
    │       │   └── db.py               # asyncpg pool FastAPI dependency
    │       └── routes/
    │           ├── health.py           # GET /api/v1/cipas/health
    │           └── ingestion.py        # POST /api/v1/cipas/submissions
    │
    ├── domain/
    │   ├── __init__.py
    │   └── models.py                   # Pydantic schemas + internal DTOs
    │
    ├── parsing/
    │   ├── __init__.py
    │   ├── base.py                     # LanguageParser Protocol + RawGranule
    │   ├── registry.py                 # Language → Parser mapping + extension detection
    │   ├── python_parser.py            # PythonParser (tree-sitter-languages)
    │   ├── java_parser.py              # JavaParser
    │   └── c_parser.py                 # CParser
    │
    ├── extraction/
    │   ├── __init__.py
    │   ├── normalizer.py               # Type-1 source normalisation (comment strip, whitespace)
    │   └── granule_extractor.py        # TSQuery → GranuleData; AST fingerprinting
    │
    ├── ingestion/
    │   ├── __init__.py
    │   ├── worker.py                   # Subprocess-safe parse_file_task + initializer
    │   └── pipeline.py                 # IngestionPipeline: semaphore, fan-out, result assembly
    │
    └── storage/
        ├── __init__.py
        ├── db.py                       # asyncpg pool factory + pgvector type registration
        ├── repository.py               # StorageRepository: typed async data access
        └── migrations/
            └── V001__initial_schema.sql
```

**Structural rationale:**
- `parsing/` and `extraction/` are kept separate because parsers are stateful (hold Language/Parser objects) while extractors and normalisers are pure functions. This allows the extractor to be tested without tree-sitter.
- `ingestion/` owns orchestration and subprocess dispatch only — it imports from `parsing` and `extraction` but does not implement their logic.
- `storage/` has no awareness of parsing logic. It only accepts fully-formed DTOs from the pipeline.
- `domain/models.py` is the single source of truth for all schemas. Both the API layer and the storage layer import from here; no layer defines its own ad-hoc dicts.

### 2.2 Dependency Stack

#### Production Dependencies

| Package | Version | Why |
|---|---|---|
| `fastapi` | `^0.111.0` | Async-native, OpenAPI generation, dependency injection — already in stack |
| `uvicorn[standard]` | `^0.22.0` | Includes `uvloop` + `httptools` for maximum async throughput |
| `pydantic-settings` | `^2.2.0` | Type-safe environment variable parsing with fail-fast validation |
| `loguru` | `^0.7.0` | Structured logging with JSON serialisation — already in stack |
| `prometheus-fastapi-instrumentator` | `^6.0.0` | Zero-config Prometheus metrics — already in stack |
| `opentelemetry-api` | `^1.17.0` | Distributed tracing instrumentation hooks |
| `asyncpg` | `^0.29.0` | Fastest async PostgreSQL driver for Python; binary protocol; built-in connection pooling. **Not** psycopg3 because asyncpg has a more mature connection pool and better performance for write-heavy workloads. |
| `pgvector` | `^0.3.0` | Registers the `vector` type codec with asyncpg; required for Phase 2 embedding queries |
| `tree-sitter` | `~0.20.4` | Stable C-extension parser frontend. Version pinned to `~0.20.4` because `tree-sitter-languages` 1.x targets this exact ABI. |
| `tree-sitter-languages` | `^1.10.2` | Pre-compiled shared-library grammars for all supported languages. Eliminates in-container grammar compilation, reducing image build time and removing `node`/`gcc` from the runtime image. |
| `python-dotenv` | `^1.0.0` | `.env` file loading for local dev |
| `httpx` | `^0.24.0` | Async HTTP client for inter-service calls |

#### Why `tree-sitter-languages` over individual grammar packages

Individual grammar packages (`tree-sitter-python`, `tree-sitter-java`, `tree-sitter-c`) require `node` and the tree-sitter CLI to compile `.so` files at build time. `tree-sitter-languages` ships pre-compiled shared libraries via a native wheel, removing the Node.js dependency from the build chain entirely. The trade-off is a larger package (~15 MB) with grammars for 100+ languages, which is acceptable given the capabilities unlocked.

#### Development Dependencies

| Package | Purpose |
|---|---|
| `pytest ^7.4.0` | Test runner |
| `pytest-asyncio ^0.21.0` | `async def` test support |
| `httpx ^0.24.0` | TestClient for async FastAPI routes |
| `ruff ^0.12.0` | Linting + import sorting (replaces flake8/isort) |
| `mypy ^1.5.0` | Static type checking in strict mode |
| `black ^24.3.0` | Deterministic code formatting |

### 2.3 Docker & Environment Strategy

#### Multi-stage Dockerfile Outline

```
Stage 1: builder (python:3.11-slim)
  ├── Install: build-essential, gcc, curl, git (for native wheel compilation)
  ├── Create /opt/venv
  ├── Install Poetry
  ├── COPY pyproject.toml poetry.lock
  ├── poetry install --only main --no-root  (no dev deps)
  └── COPY src/

Stage 2: runtime (python:3.11-slim)
  ├── Create non-root user `cipas`
  ├── COPY --from=builder /opt/venv /opt/venv
  ├── COPY --from=builder /app/src /app/src
  ├── ENV PYTHONPATH=/app/src, PYTHONUNBUFFERED=1
  ├── USER cipas
  └── CMD uvicorn cipas.main:app --host 0.0.0.0 --port 8085
            --loop uvloop --http httptools --workers 1
```

`tree-sitter-languages` ships as a platform-specific wheel. It links against `libstdc++`, which is present in `python:3.11-slim` (Debian Bookworm). No additional system packages are required in the runtime stage.

**Grammar compilation is NOT performed at runtime.** The pre-compiled `.so` files inside the `tree-sitter-languages` wheel are loaded via `ctypes` by the `tree_sitter_languages` package at import time. This is safe and O(ms).

#### PostgreSQL + pgvector Configuration

Use the official `pgvector/pgvector:pg16` image. It extends `postgres:16` with the `pgvector` extension pre-installed. The extension must be explicitly enabled per database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for future fuzzy name search
```

These are applied by the `V001__initial_schema.sql` migration on first startup.

#### Environment Variable Design

All configuration is read from environment variables with the `CIPAS_` prefix, enforced by `pydantic-settings`. Variables are grouped by concern:

```ini
# Runtime
CIPAS_ENV=production              # development | staging | production
CIPAS_LOG_LEVEL=INFO

# Server
CIPAS_HOST=0.0.0.0
CIPAS_PORT=8085
CIPAS_UVICORN_WORKERS=1           # 1 per container; scale via replicas

# Database
CIPAS_DATABASE_URL=postgresql://cipas:secret@cipas-postgres:5432/cipas_db
CIPAS_DB_MIN_POOL_SIZE=5
CIPAS_DB_MAX_POOL_SIZE=20
CIPAS_DB_COMMAND_TIMEOUT=30.0

# Process Pool
CIPAS_PARSER_WORKERS=0            # 0 = os.cpu_count(); explicit override for constrained envs
CIPAS_MAX_CONCURRENT_BATCHES=4    # semaphore slots; tune per CPU budget
CIPAS_BATCH_SEMAPHORE_TIMEOUT=30.0

# File Limits
CIPAS_MAX_FILES_PER_BATCH=200
CIPAS_MAX_FILE_SIZE_BYTES=1048576    # 1 MB per file
CIPAS_MAX_TOTAL_BATCH_BYTES=52428800 # 50 MB total batch

# Observability
CIPAS_OTEL_SERVICE_NAME=cipas
CIPAS_SENTRY_DSN=                 # optional
```

#### Production vs Development Config Separation

- **Development:** `.env` file mounted via `docker-compose`. `CIPAS_ENV=development` enables debug logs and disables certain hardening checks.
- **Staging/Production:** Environment variables injected by the orchestrator (Kubernetes Secrets or Docker Swarm secrets). No `.env` files on disk. `CIPAS_ENV=production` enables strict mode: enforces `HTTPS`, disables `/docs` OpenAPI UI, sets `access_log=False` on Uvicorn.
- `pydantic-settings` validates on startup; missing required vars cause `SystemExit(2)` — fail-fast, no silent misconfiguration.

---

## 3. Parsing & Language Abstraction Layer

### 3.1 Tree-sitter Compilation Strategy

**Phase 1 uses `tree-sitter-languages` (pre-compiled). No in-container compilation.**

`tree-sitter-languages` ships a CPython extension (`_tree_sitter_languages.cpython-311-x86_64-linux-gnu.so`) that wraps compiled grammars for all supported languages. At import, the package calls `ctypes.cdll.LoadLibrary()` on this `.so` file. The `get_language(name)` function returns a `tree_sitter.Language` capsule bound to the grammar for `name`.

**Memory lifecycle:**

- One `Language` object per language, created in `_worker_initializer()` which runs once per subprocess. These objects are lightweight (opaque C pointers).
- One `Parser` object per language per subprocess, held in the `_PROCESS_PARSERS` module global.
- The `Tree` and all `Node` objects returned by `parser.parse()` are owned by the `Tree`. Nodes are C-level objects with no Python heap allocation per node. The entire tree is freed when the `Tree` object goes out of scope (reference count → 0).
- Source bytes are passed into `parser.parse()` as a Python `bytes` object. tree-sitter holds a reference internally during parsing; it is released when the `Tree` is returned. **Do not pass `memoryview` or mutable buffers.** Use `bytes(source, "utf-8")`.
- After granule extraction in the worker process, the `Tree` is explicitly set to `None` before returning results to allow immediate GC. Subprocess memory is returned to the OS when the process exits (pool rotation via `max_tasks_per_child`).

### 3.2 Language-Agnostic Parser Interface

The `LanguageParser` is defined as a `Protocol` (structural subtyping). Concrete parsers **do not** inherit from a base class; they satisfy the interface implicitly. This is intentional: it prevents coupling to a base class hierarchy and allows third-party parsers (e.g., language-server-based parsers) to be used in Phase 3 without modification.

```python
# cipas/parsing/base.py

from __future__ import annotations
from typing import ClassVar, Protocol, runtime_checkable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class GranuleSpan:
    start_line: int          # 0-indexed (tree-sitter native)
    end_line: int            # 0-indexed, inclusive
    start_byte: int
    end_byte: int


@dataclass
class RawGranule:
    granule_type: str        # "class" | "function" | "loop"
    name: str | None         # identifier if captured; None for anonymous loops
    span: GranuleSpan
    source_bytes: bytes      # raw slice from original source bytes
    node_type_sequence: list[str]   # DFS node.type sequence for fingerprinting


@runtime_checkable
class LanguageParser(Protocol):
    """
    Structural interface for all language-specific parsers.

    Implementations MUST:
      - Be safe to instantiate multiple times (one per subprocess worker).
      - Be stateless after __init__ (parsers and languages are immutable).
      - Never perform I/O.
      - Accept bytes (UTF-8 encoded source) — NOT str.

    language_key is a ClassVar used as the registry key (e.g. "python", "java", "c").
    """

    language_key: ClassVar[str]

    def parse(self, source: bytes) -> object:
        """
        Parse source bytes and return a tree-sitter Tree.
        Raises: ParseError on hard failure (e.g. null tree returned by C library).
        """
        ...

    def extract_raw_granules(self, tree: object, source: bytes) -> list[RawGranule]:
        """
        Execute TSQueries against `tree` and return raw granule spans.
        The returned RawGranule.source_bytes is a slice of `source`.
        Does not normalise or hash; that is the Extractor's responsibility.
        """
        ...
```

**Why this abstraction is future-proof:**

1. **Adding a language** requires only creating a new `XxxParser` class with `language_key = "xxx"` and registering it in `registry.py`. Zero changes to pipeline, extractor, or storage.
2. **Swapping tree-sitter** for a different parser backend (e.g., ANTLR, JavaParser for semantic Java analysis) requires only satisfying the `Protocol`. The pipeline dispatches to `LanguageParser.parse()` — it does not know or care about the underlying library.
3. **Avoiding tight coupling:** Concrete parsers are never imported by the pipeline or storage. Only `registry.py` imports them, and the pipeline imports only the registry. This is a strict dependency inversion.
4. **`@runtime_checkable`** allows `isinstance(parser, LanguageParser)` checks in registry validation logic without requiring inheritance.

---

## 4. Ingestion & Parallel Parsing Layer

### 4.1 API Contract

#### Endpoint

```
POST /api/v1/cipas/submissions
Content-Type: multipart/form-data
Authorization: Bearer <jwt>   (validated upstream by Traefik / IAM service)
```

#### Request Schema (multipart fields)

| Field | Type | Required | Constraints |
|---|---|---|---|
| `assignment_id` | `string (UUID)` | Yes | Valid UUID v4; existence validated downstream |
| `submitted_by` | `string (UUID)` | Yes | Valid UUID v4 |
| `files` | `UploadFile[]` | Yes | 1–200 files; each ≤ `MAX_FILE_SIZE_BYTES` |

Each `UploadFile` is validated for:
- **Extension whitelist:** `.java`, `.c`, `.h`, `.py` only. Any other extension returns `HTTP 422` with a field-level error identifying the offending filename.
- **Content-length per file:** If `Content-Length` header is present on the part, it is checked before reading. After reading, actual byte length is checked against `MAX_FILE_SIZE_BYTES`. Files exceeding the limit are rejected with `HTTP 413`.
- **Filename sanitisation:** Filename is extracted via `UploadFile.filename`, stripped of path components (`os.path.basename`), and validated against the regex `^[a-zA-Z0-9_\-\.]{1,255}$`. Filenames that fail sanitisation are rejected with `HTTP 422`.
- **Total batch size guard:** Running sum of bytes is checked against `MAX_TOTAL_BATCH_BYTES`. Exceeding this returns `HTTP 413` immediately, without reading remaining files.
- **Duplicate detection (within batch):** Files with identical content (same `file_hash`) within a single batch are deduplicated before dispatch to the parse pool. Only one parse task is spawned; the resulting granules are associated with all files sharing that hash.

#### Success Response — `HTTP 202 Accepted`

```json
{
  "submission_id": "uuid-v4",
  "status": "COMPLETED",
  "file_count": 12,
  "granule_count": 87,
  "parse_failures": [],
  "created_at": "2025-07-18T14:22:00Z",
  "completed_at": "2025-07-18T14:22:01.342Z"
}
```

If any files fail to parse, `status` is `PARTIAL` and `parse_failures` contains per-file error entries.

#### Error Response Schema

All errors follow the RFC 7807 Problem Details format:

```json
{
  "type": "https://cipas.gradeloop.internal/errors/validation-error",
  "title": "Request Validation Failed",
  "status": 422,
  "detail": "File 'Assignment.py' exceeds maximum size of 1048576 bytes",
  "instance": "/api/v1/cipas/submissions",
  "errors": [
    { "field": "files[3]", "code": "FILE_TOO_LARGE", "detail": "..." }
  ]
}
```

#### Validation Rules Summary

```
MAX_FILES_PER_BATCH      = 200     → HTTP 413 if exceeded
MAX_FILE_SIZE_BYTES      = 1 MB    → HTTP 413 per file
MAX_TOTAL_BATCH_BYTES    = 50 MB   → HTTP 413 for batch
ALLOWED_EXTENSIONS       = .java, .c, .h, .py → HTTP 422 if violated
MAX_FILENAME_LENGTH      = 255     → HTTP 422 if exceeded
```

### 4.2 Concurrency Model

#### Architecture Decision: asyncio + ProcessPoolExecutor

```
FastAPI event loop (single thread)
│
├── Receives HTTP request (async I/O — non-blocking)
├── Validates files (pure Python — fast, < 5ms)
├── Writes submission record to DB (asyncpg — non-blocking await)
├── Acquires Semaphore (backpressure gate)
│
├── asyncio.gather(
│     loop.run_in_executor(process_pool, parse_file_task, file_1_bytes, ...),
│     loop.run_in_executor(process_pool, parse_file_task, file_2_bytes, ...),
│     ...up to 200 tasks
│   )
│     │
│     └── ProcessPoolExecutor (N workers, N = os.cpu_count())
│           │
│           ├── Worker 0: parse_file_task(file_1)  ← pure CPU, no GIL
│           ├── Worker 1: parse_file_task(file_2)
│           ├── Worker 2: parse_file_task(file_3)
│           └── Worker N: parse_file_task(file_N)
│
├── Collect results from gather (futures resolved)
├── Bulk INSERT to PostgreSQL (asyncpg — non-blocking)
├── UPDATE submission status
└── Release Semaphore → return HTTP 202
```

#### ProcessPoolExecutor Initializer

Workers pre-load all `LanguageParser` instances in `_worker_initializer()`, which is called **once per worker process** at pool startup. This eliminates the overhead of reimporting tree-sitter and loading shared libraries on every task invocation (~50ms per load amortised to zero).

```python
_PROCESS_PARSERS: dict[str, LanguageParser] = {}

def _worker_initializer() -> None:
    global _PROCESS_PARSERS
    from cipas.parsing.python_parser import PythonParser
    from cipas.parsing.java_parser import JavaParser
    from cipas.parsing.c_parser import CParser
    _PROCESS_PARSERS = {
        "python": PythonParser(),
        "java":   JavaParser(),
        "c":      CParser(),
    }
```

#### Backpressure Design

Two levels of backpressure are applied:

**Level 1 — Semaphore (batch-level concurrency cap)**

```python
self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_BATCHES)
```

A maximum of `MAX_CONCURRENT_BATCHES` (default: 4) submissions may be in the pipeline simultaneously. If the semaphore cannot be acquired within `BATCH_SEMAPHORE_TIMEOUT` seconds, the endpoint returns `HTTP 503 Service Unavailable` with `Retry-After: 5`.

**Level 2 — ProcessPoolExecutor queue depth**

The event loop submits up to 200 `run_in_executor` futures per batch. `ProcessPoolExecutor` internally queues tasks beyond `max_workers`. The number of in-flight tasks in the OS process queue at any time is bounded by:

```
max_in_flight_tasks = MAX_CONCURRENT_BATCHES × MAX_FILES_PER_BATCH
                    = 4 × 200 = 800 (theoretical maximum)
```

In practice, each task completes in 5–30ms, so queue depth stays well below this bound.

#### Memory Explosion Prevention

- File bytes are read into memory once, during multipart form parsing. After `parse_file_task()` is submitted to the executor, the bytes reference in the event loop coroutine is released by going out of scope.
- The subprocess receives bytes via pickle serialisation (IPC pipe). For 200 × 1MB files, this is 200MB of IPC data — acceptable but monitored. Files exceeding `MAX_FILE_SIZE_BYTES` are rejected before IPC serialisation.
- Worker processes are configured with `max_tasks_per_child=500` to recycle memory periodically and prevent fragmentation accumulation.
- The `Tree` object inside each worker is explicitly dereferenced after granule extraction.

### 4.3 Granule Extraction Strategy

#### Granule Types

| Type | Tree-sitter Node | Captured In |
|---|---|---|
| `CLASS` | `class_definition` (Py), `class_declaration` (Java), `struct_specifier` (C) | Python, Java, C |
| `FUNCTION` | `function_definition` (Py), `method_declaration` + `constructor_declaration` (Java), `function_definition` (C) | Python, Java, C |
| `LOOP` | `for_statement`, `while_statement` (all); `enhanced_for_statement`, `do_statement` (Java/C) | Python, Java, C |

#### Granule Data Model

Each extracted granule carries:

| Field | Type | Description |
|---|---|---|
| `id` | `UUID` | Generated server-side (not in worker) |
| `file_id` | `UUID` | FK → `files.id` |
| `submission_id` | `UUID` | Denormalised for query performance |
| `granule_type` | `str` | `class` \| `function` \| `loop` |
| `language` | `str` | `python` \| `java` \| `c` |
| `file_hash` | `CHAR(64)` | SHA-256 of raw file bytes |
| `granule_hash` | `CHAR(64)` | SHA-256 of **Type-1 normalised** source |
| `ast_fingerprint` | `CHAR(64)` | SHA-256 of DFS node-type sequence (structure only) |
| `start_line` | `INT` | 1-indexed (converted from tree-sitter 0-indexed) |
| `end_line` | `INT` | 1-indexed, inclusive |
| `name` | `VARCHAR(512)` | Identifier name; `NULL` for anonymous constructs |
| `normalized_source` | `TEXT` | Type-1 normalised source for clone comparison |

#### Why Normalization Matters

**Type 1 (Exact):** Two granules are Type 1 clones iff `granule_hash_A == granule_hash_B`. This is a pure hash equality check — O(1) at query time.

**Type 2 (Renamed):** Requires the same `ast_fingerprint` with differing `granule_hash`. The `ast_fingerprint` (node-type DFS sequence, no identifiers) captures structural identity independent of variable names and literals. Two granules with matching `ast_fingerprint` but different `granule_hash` are candidates for Type 2 clone analysis in Phase 2.

**Type 3 (Near-Miss):** Requires approximate string matching or edit distance on `normalized_source`. The `normalized_source` (comment-stripped, whitespace-normalised, but **identifiers preserved**) is the input for this. Phase 2 will apply MinHash or embedding-based similarity.

**Type 4 (Semantic):** Requires embedding vectors. The `embeddings` table is schema-present but unpopulated in Phase 1. The HNSW index will be built in Phase 2 when the embedding generation service is online.

#### Normalisation Algorithm (Type-1)

```
Input: raw source bytes slice (UTF-8)
Output: normalised string

Steps:
  1. Decode bytes → str (UTF-8, replace errors)
  2. Strip single-line comments:
       //...     → "" (Java, C)
       #...      → "" (Python)
  3. Strip block comments: /* ... */ → ""
  4. Strip string literal contents? → No. Preserves Type-1 semantics.
  5. Collapse whitespace: all sequences of [ \t\n\r] → single space
  6. Strip leading/trailing whitespace
```

#### Hash Computation

```python
import hashlib

# File hash — computed before dispatch (event loop, not worker)
file_hash = hashlib.sha256(raw_bytes).hexdigest()   # 64-char hex

# Granule hash — computed in worker after normalisation
granule_hash = hashlib.sha256(
    normalized_source.encode("utf-8")
).hexdigest()

# AST fingerprint — computed in worker after DFS
ast_fingerprint = hashlib.sha256(
    "|".join(node_type_sequence).encode("ascii")
).hexdigest()
```

SHA-256 is used (not SHA-1 or MD5) because collision resistance matters for clone detection correctness. The hex digest (not bytes) is stored in the DB for human readability and index efficiency on fixed-length `CHAR(64)` columns.

---

## 5. Database & Storage Design

### 5.1 Schema Design

#### `submissions`

```sql
CREATE TABLE submissions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id    UUID        NOT NULL,
    submitted_by     UUID        NOT NULL,
    status           VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
                                 CHECK (status IN ('PROCESSING','COMPLETED','PARTIAL','FAILED')),
    file_count       SMALLINT    NOT NULL CHECK (file_count > 0 AND file_count <= 200),
    granule_count    INTEGER     NOT NULL DEFAULT 0,
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX idx_submissions_assignment_id ON submissions (assignment_id);
CREATE INDEX idx_submissions_submitted_by  ON submissions (submitted_by);
CREATE INDEX idx_submissions_status        ON submissions (status) WHERE status IN ('PROCESSING');
CREATE INDEX idx_submissions_created_at    ON submissions (created_at DESC);
```

The partial index on `status = 'PROCESSING'` enables a fast administrative query for stuck submissions (a key operational concern) without indexing the entire table.

#### `files`

```sql
CREATE TABLE files (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID        NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    filename        VARCHAR(512) NOT NULL,
    language        VARCHAR(32) NOT NULL CHECK (language IN ('python','java','c')),
    file_hash       CHAR(64)    NOT NULL,
    byte_size       INTEGER     NOT NULL CHECK (byte_size > 0),
    line_count      INTEGER     NOT NULL DEFAULT 0,
    parse_status    VARCHAR(20) NOT NULL DEFAULT 'PARSED'
                                CHECK (parse_status IN ('PARSED','FAILED','UNSUPPORTED')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_files_submission_id ON files (submission_id);
CREATE INDEX idx_files_file_hash     ON files (file_hash);
CREATE INDEX idx_files_language      ON files (language);
```

The `file_hash` index enables deduplication queries across submissions: "has this exact file been seen before?" This is foundational for Phase 2 cross-submission clone detection.

#### `granules`

```sql
CREATE TABLE granules (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id          UUID        NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    submission_id    UUID        NOT NULL,  -- denormalised; no FK for write performance
    granule_type     VARCHAR(32) NOT NULL CHECK (granule_type IN ('class','function','loop')),
    language         VARCHAR(32) NOT NULL,
    file_hash        CHAR(64)    NOT NULL,  -- denormalised for self-join clone queries
    granule_hash     CHAR(64)    NOT NULL,
    ast_fingerprint  CHAR(64)    NOT NULL,
    start_line       INTEGER     NOT NULL,
    end_line         INTEGER     NOT NULL,
    name             VARCHAR(512),
    normalized_source TEXT       NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary clone detection index: Type 1 exact match
CREATE INDEX idx_granules_granule_hash      ON granules (granule_hash);

-- Type 2/3 structural index
CREATE INDEX idx_granules_ast_fingerprint   ON granules (ast_fingerprint);

-- Submission-scoped queries (e.g., list all granules for a submission)
CREATE INDEX idx_granules_submission_id     ON granules (submission_id);

-- Cross-language structural clone candidate queries
CREATE INDEX idx_granules_type_language     ON granules (granule_type, language);

-- Compound: submission + type — most common access pattern
CREATE INDEX idx_granules_submission_type   ON granules (submission_id, granule_type);

-- File-level rollup
CREATE INDEX idx_granules_file_id           ON granules (file_id);
```

**Denormalisation rationale for `submission_id` and `file_hash` on `granules`:**
Clone detection queries are self-joins on the `granules` table:
```sql
SELECT a.id, b.id
FROM granules a JOIN granules b
  ON a.granule_hash = b.granule_hash
 AND a.submission_id != b.submission_id;
```
Requiring a join through `files` to reach `submission_id` would add a join per row in a potentially 10M+ row table. The denormalisation adds ~8 bytes per row and eliminates the join.

#### `embeddings` (Phase 2 — schema present, unpopulated in Phase 1)

```sql
CREATE TABLE embeddings (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    granule_id     UUID    NOT NULL REFERENCES granules(id) ON DELETE CASCADE,
    model_id       VARCHAR(128) NOT NULL,   -- e.g. "codesage-base-v2"
    model_version  VARCHAR(64)  NOT NULL,   -- semver
    embedding      vector(768)  NOT NULL,   -- pgvector; dimensionality matches model
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_embeddings_granule_model UNIQUE (granule_id, model_id, model_version)
);
```

The HNSW index is created separately (see §5.2) because `CREATE INDEX ... USING hnsw` is expensive and should be built during a maintenance window, not inline with the `CREATE TABLE`.

#### `schema_migrations` (migration tracking)

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(128) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

A simple migration runner in `storage/db.py` applies `.sql` files from `storage/migrations/` in lexicographic order, skipping already-applied versions.

#### Partitioning Consideration

At Phase 1 throughput (~1000 submissions/hour, avg 50 granules/file × 50 files = 2500 granules/submission), the `granules` table will grow at ~2.5M rows/hour. At this rate, partitioning by `created_at` (monthly range partitions) becomes necessary within 2 weeks if analytical queries are introduced. The schema is designed to support `PARTITION BY RANGE (created_at)` without breaking FK constraints — `file_id` FK is the only constraint referencing `granules`, and it is set to `ON DELETE CASCADE` which is supported on partitioned tables in PostgreSQL 14+.

**Phase 1:** Do not partition. Add partitioning in Phase 2 based on observed query performance.

### 5.2 pgvector Strategy

#### Vector Column

```sql
embedding vector(768)
```

Dimensionality of 768 is chosen for compatibility with CodeBERT-family and GraphCodeBERT models (768-dim). If a 1024-dim model (e.g., `codesage-large`) is adopted, the column must be recreated. This is mitigated by storing `model_id` and `model_version` — different model families would use separate rows (and potentially separate tables) rather than overwriting.

#### HNSW Index

```sql
CREATE INDEX idx_embeddings_hnsw_cosine
    ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

| Parameter | Value | Rationale |
|---|---|---|
| `m` | 16 | Number of bi-directional links per node. 16 is the pgvector default and a good balance between recall and index build time. Increase to 32 for higher recall at the cost of 2× memory. |
| `ef_construction` | 64 | Size of dynamic candidate list during index construction. Higher = better recall, slower build. 64 is sufficient for Phase 2 corpus sizes. |
| Distance metric | `vector_cosine_ops` | Cosine similarity is appropriate for embedding vectors that encode semantic direction rather than magnitude. L2 (`vector_l2_ops`) is appropriate if vectors are unit-normalised but semantically magnitude-aware (e.g., bag-of-words). Inner product (`vector_ip_ops`) is fastest but requires all vectors to be unit-normalised by the model. |

#### Distance Metric Selection

```
Cosine similarity:   1 - (A · B) / (|A| × |B|)
```

Selected over L2 because code embedding models (CodeBERT, UniXcoder) produce vectors where the angle between vectors encodes semantic similarity. The magnitude encodes confidence/frequency artefacts from the model that are not semantically meaningful for clone detection. Cosine similarity normalises these out.

#### Index Build Strategy Under Load

- **Do not build the HNSW index in the V001 migration.** An empty HNSW index has no build cost, but adding it inline creates a dependency between schema creation and index creation that complicates partial migrations.
- In Phase 2, build the index during a maintenance window with:
  ```sql
  SET maintenance_work_mem = '2GB';
  CREATE INDEX CONCURRENTLY idx_embeddings_hnsw_cosine ...;
  ```
- `CONCURRENTLY` allows the table to remain writable during index construction. For large tables (>10M rows), this can take hours — plan accordingly.
- During index construction, `ef_search` (query-time parameter) should be tuned separately:
  ```sql
  SET hnsw.ef_search = 100;  -- higher = better recall, slower queries
  ```
  The default is 40. For production queries, start at 100 and tune based on recall/latency trade-off measurements.

#### Trade-offs

| Approach | Pro | Con |
|---|---|---|
| HNSW | Sub-linear query time O(log n), high recall, supports concurrent inserts | Index takes significant memory (~1.2 bytes/dimension/vector for m=16); build time non-trivial |
| IVFFlat | Lower memory, faster build | Must specify `lists` count upfront; requires re-indexing as corpus grows; cannot insert without rebuild |
| Exact (no index) | Perfect recall | O(n) scan — completely unusable at scale |

HNSW is the correct choice for Phase 2 because the corpus grows continuously and re-indexing (as required by IVFFlat) is operationally untenable at production throughput.

---

## 6. Scalability & Performance Engineering

### 6.1 CPU Scaling Strategy

**Vertical:** Each container gets `os.cpu_count()` workers in the `ProcessPoolExecutor`. Tree-sitter is single-threaded per parser call; parallelism is achieved by running N parsers simultaneously across N cores. For a 4-core container, 4 files parse in parallel.

**Horizontal:** Each additional replica adds `os.cpu_count()` parse workers. A 3-replica deployment on 4-core nodes provides 12 parallel parse workers. At 10ms/file average parse time, this handles:
```
throughput = 12 workers × (1000ms / 10ms) = 1200 files/second
           = 4,320,000 files/hour
```
Well above the 200 × 1000/hour = 200,000 files/hour requirement.

### 6.2 Memory Management

| Concern | Mitigation |
|---|---|
| 200 × 1MB in-memory batch | Total maximum = 200MB per batch, 4 batches concurrent = 800MB. Acceptable for containers with ≥2GB memory. The total batch size limit (50MB) keeps actual memory well below this. |
| tree-sitter Tree objects | Explicitly set to `None` after extraction in worker; Python GC collects immediately. |
| Worker process heap growth | `max_tasks_per_child=500` recycles worker processes, returning fragmented heap memory to the OS. |
| asyncpg result sets | `granules` are inserted in batches of 500 rows using `executemany` to avoid building a single massive query. |
| IPC pickle overhead | Worker results (list of granule dicts) are serialised via pickle over the IPC pipe. For 200 granules/file × 1KB each = 200KB per task — negligible. |

### 6.3 Tree-sitter Performance Considerations

- **Avoid re-parsing.** The process pool initialiser ensures parsers are created once and reused. Do not instantiate `Parser` or load `Language` inside `parse_file_task()`.
- **Parse bytes, not strings.** `parser.parse(bytes(source, "utf-8"))` is faster than `parser.parse(source.encode())` in a tight loop because `bytes()` avoids intermediate string allocation when source is already bytes.
- **TSQuery compilation cost.** `language.query(query_string)` compiles the query to an optimised bytecode object. This is done once in the parser's `__init__`, not per parse call. Queries are stored as instance attributes on the parser object.
- **Incremental parsing** (Phase 3): tree-sitter supports incremental reparsing with edit deltas. For Phase 1 (full-file ingestion), this is not applicable. For a future IDE-integration use case, the `Tree.edit()` API enables sub-millisecond reparse for single-character edits.
- **Large file parse time:** A 100KB Java file (roughly 3000 LOC) parses in ~15ms. A 1MB file (pathological, ~30,000 LOC) parses in ~150ms. The `MAX_FILE_SIZE_BYTES=1MB` limit bounds worst-case parse time.

### 6.4 I/O Bottlenecks

| Bottleneck | Mitigation |
|---|---|
| Multipart form reading | FastAPI reads all file parts into memory (via `UploadFile.read()`). With 50MB batch limit, this is bounded. For Phase 3, consider streaming directly to object storage via the multipart stream without full in-memory buffering. |
| DB bulk inserts | Use `executemany()` with `asyncpg` for both `files` and `granules`. Use `COPY FROM` for batches > 10,000 rows (Phase 2). |
| DB connection acquisition | Connections are pre-warmed at startup (`min_size=5`). Connection acquisition from the pool is O(1) for healthy pools. |

### 6.5 PostgreSQL Connection Pooling

```python
pool = await asyncpg.create_pool(
    dsn=settings.DATABASE_URL,
    min_size=settings.DB_MIN_POOL_SIZE,     # 5
    max_size=settings.DB_MAX_POOL_SIZE,     # 20
    command_timeout=settings.DB_COMMAND_TIMEOUT,  # 30s
    max_inactive_connection_lifetime=300.0,  # recycle idle connections every 5m
)
```

With 4 concurrent batches and 20 max connections, each batch has up to 5 connections available. Bulk inserts use a single connection per batch (not per file). Connection acquisition is non-blocking (async).

**PgBouncer** is not included in Phase 1. If replica count exceeds 5, add PgBouncer in transaction pooling mode to prevent PostgreSQL from being overwhelmed by `MAX_POOL_SIZE × replica_count` connections (e.g., 20 × 10 = 200 connections, which PostgreSQL handles but at increasing overhead). PgBouncer at the DB level would reduce this to a configurable fixed pool regardless of replica count.

### 6.6 Throughput Estimation Model

**Assumptions:**
- 4-core container, 1 replica
- Files: average 200 LOC, mix of Java/Python/C
- DB: PostgreSQL on same Docker network (< 1ms round-trip)

**Per-file parse time:** ~8ms (measured tree-sitter parse + granule extraction for 200-LOC file)  
**Per-batch time (200 files, 4 workers):** `ceil(200/4) × 8ms = 400ms` parsing  
**DB insert time (200 files, ~600 granules):** ~50ms (bulk insert, single transaction)  
**Total per-batch:** ~500ms (well within 2s SLA)

**Throughput at 4 concurrent batches:**
```
batches_per_second = MAX_CONCURRENT_BATCHES / avg_batch_latency
                   = 4 / 0.5s = 8 batches/second
files_per_second   = 8 × 200 = 1600 files/second
files_per_hour     = 1600 × 3600 = 5,760,000 files/hour
```

The system is CPU-bound, not I/O bound. Adding cores (vertically or via replicas) linearly scales throughput. The 1000-submissions/hour target is met with significant headroom.

---

## 7. Failure Handling & Observability

### 7.1 Logging Structure

All logs are structured JSON, emitted to stdout, collected by the Docker logging driver.

**Log schema:**
```json
{
  "time": "2025-07-18T14:22:00.123Z",
  "level": "INFO",
  "service": "cipas",
  "env": "production",
  "message": "Batch parse completed",
  "submission_id": "uuid",
  "file_count": 200,
  "granule_count": 847,
  "parse_failures": 0,
  "duration_ms": 487.2,
  "worker_count": 4
}
```

**Log levels:**
| Level | Usage |
|---|---|
| `ERROR` | Unrecoverable failures: DB connection failure, worker crash, uncaught exception |
| `WARNING` | Recoverable degradation: parse failure on individual file, semaphore timeout |
| `INFO` | Normal lifecycle events: submission received, batch completed, service start/stop |
| `DEBUG` | Per-file parse events, query captures count, granule extraction detail (disabled in production) |

### 7.2 Metrics to Collect

All metrics exposed at `/metrics` (Prometheus format) via `prometheus-fastapi-instrumentator` plus manual `Counter`/`Histogram` instruments:

| Metric | Type | Labels | Description |
|---|---|---|---|
| `cipas_submissions_total` | Counter | `status` | Submissions completed by final status |
| `cipas_files_parsed_total` | Counter | `language`, `status` | Files parsed by language and status |
| `cipas_granules_extracted_total` | Counter | `language`, `granule_type` | Granules extracted |
| `cipas_batch_duration_seconds` | Histogram | — | End-to-end batch latency (buckets: 0.1, 0.25, 0.5, 1, 2, 5, 10) |
| `cipas_parse_duration_seconds` | Histogram | `language` | Per-file parse time inside worker |
| `cipas_semaphore_wait_seconds` | Histogram | — | Time waiting for batch semaphore slot |
| `cipas_semaphore_active` | Gauge | — | Currently active batch slots |
| `cipas_db_pool_size` | Gauge | `state` (idle/used) | Connection pool utilisation |
| `cipas_worker_pool_pending` | Gauge | — | Tasks queued in ProcessPoolExecutor |

### 7.3 Tracing Approach

OpenTelemetry (`opentelemetry-api` + `opentelemetry-sdk`) is pre-configured via `CIPAS_OTEL_SERVICE_NAME`. Spans are created for:
- `cipas.ingestion.batch` — wraps the full batch pipeline
- `cipas.db.bulk_insert_files` — wraps the DB write operations
- `cipas.db.bulk_insert_granules`

Worker subprocess operations are **not** traced with distributed tracing (OTel context cannot be propagated across process boundaries via pickle). Instead, timing metrics from the worker are returned in the result dict and recorded as span attributes on the parent `cipas.ingestion.batch` span.

### 7.4 Retry Strategy

| Operation | Retry Strategy | Max Attempts |
|---|---|---|
| DB connection acquisition | asyncpg built-in pool retry | 3 (pool timeout = 10s) |
| DB `INSERT` on transient error | Exponential backoff: 50ms, 100ms, 200ms | 3 |
| Individual file parse failure | No retry — tree-sitter is deterministic; a failed parse will always fail | 0 |
| Semaphore acquisition timeout | No retry by service — caller should retry with `Retry-After` header | 0 |

### 7.5 Dead-Letter Handling

Phase 1 does not use a message queue, so there is no DLQ in the classical sense. Failed submissions are persisted in the DB with `status=FAILED` and `error_message` populated. A background administrative endpoint (Phase 2) will support re-triggering failed submissions.

Submissions stuck in `PROCESSING` state (e.g., due to container restart mid-batch) are detectable via:
```sql
SELECT id FROM submissions
WHERE status = 'PROCESSING'
  AND created_at < NOW() - INTERVAL '5 minutes';
```
A startup hook in `main.py` runs this query and marks stale `PROCESSING` submissions as `FAILED` with `error_message = 'Recovered from unclean shutdown'`.

---

## 8. Security & Hardening Considerations

### 8.1 File Upload Validation

Validation is applied in strict order, failing fast at each gate:

1. **File count guard:** Checked before any file bytes are read. Returns `HTTP 413` immediately.
2. **Filename sanitisation:** `os.path.basename()` strips any path traversal components (`../../etc/passwd` → `passwd`). Regex `^[a-zA-Z0-9_\-\.]{1,255}$` enforces a safe character set. Reject with `HTTP 422`.
3. **Extension whitelist:** `.java`, `.c`, `.h`, `.py` only. Reject `.sh`, `.exe`, binary files, etc. with `HTTP 422`.
4. **Content-type header validation:** The `Content-Type` of each multipart part must be `text/plain` or `application/octet-stream`. Others are rejected.
5. **Per-file size limit:** Enforced during `await file.read(max_size + 1)` with a custom read that aborts on overflow. Returns `HTTP 413`.
6. **Total batch size accumulator:** Running sum checked after each file read.
7. **UTF-8 decodability:** Source bytes must be valid UTF-8 (or convertible with replacement). Binary files disguised as `.py` or `.java` are rejected with `HTTP 422`.

### 8.2 Malicious Code Payload Risk

Tree-sitter parses source code **structurally** — it builds a CST but never executes the source. There is no `eval()`, no subprocess execution, no `import` of the parsed code. The risk of code execution from a malicious payload is zero at the parsing layer.

Risks to mitigate:
- **ReDoS in normalisation regexes:** All regexes in `normalizer.py` must be validated against pathological inputs (e.g., deeply nested comments). Use `re.sub()` with `re.DOTALL` and test with 10MB of nested `/* */` comment blocks. Consider a hard character limit before normalisation.
- **Zip bomb / compression bomb:** Not applicable in Phase 1 (no zip upload). If zip upload is added in Phase 2, enforce decompressed size limits.
- **Parser memory exhaustion from pathological input:** A single file crafted to create millions of tree-sitter nodes (e.g., deeply nested expression) could exhaust worker process memory. Mitigated by `MAX_FILE_SIZE_BYTES=1MB` and worker `max_tasks_per_child` recycling.

### 8.3 Resource Exhaustion Protection

| Vector | Protection |
|---|---|
| Concurrent batch overload | `asyncio.Semaphore(MAX_CONCURRENT_BATCHES)` — hard gate, not a queue |
| Worker memory exhaustion | `max_tasks_per_child=500`, `MAX_FILE_SIZE_BYTES` cap |
| DB connection exhaustion | asyncpg pool `max_size=20`; acquisition has a timeout |
| Slow HTTP client holding connections | Uvicorn's `timeout_keep_alive=5` and `limit_concurrency` settings |
| Request body bomb | Traefik middleware `maxRequestBodyBytes=52428800` (50MB) — enforced at the proxy before bytes reach the service |

### 8.4 SQL Injection Prevention

**asyncpg parameterised queries are used exclusively.** No string interpolation into SQL. All user-supplied values (submission_id, assignment_id, etc.) are passed as positional `$1, $2, ...` parameters.

**Prohibited patterns:**
```python
# PROHIBITED — never do this
await conn.execute(f"SELECT * FROM granules WHERE name = '{user_input}'")

# REQUIRED — always do this
await conn.execute("SELECT * FROM granules WHERE name = $1", user_input)
```

This is enforced via code review policy and a `ruff` custom rule (Phase 2: add `bandit` to CI for SQL injection pattern detection).

### 8.5 Dependency Supply Chain

- **Poetry lockfile is committed.** `poetry.lock` pins all transitive dependencies to exact versions and SHA-256 hashes. `poetry install --frozen` is used in CI and the Dockerfile.
- **Dependabot or Renovate** is configured to open PRs for dependency updates weekly.
- **Image scanning:** The Docker image is scanned with Trivy in CI before push to the registry.
- **`tree-sitter-languages` supply chain note:** This package bundles pre-compiled `.so` files. The package is from a trusted PyPI publisher (grantjenks), but the binary nature means Trivy cannot scan the grammar binaries themselves. Phase 2 should evaluate migrating to individually compiled grammars from official tree-sitter repositories for stronger supply chain provenance.

---

## 9. Known Bottlenecks & Mitigation Strategies

### 9.1 Tree-sitter CPU Saturation

**Scenario:** A burst of 20 simultaneous 200-file batches hits a 4-core container.

**Symptoms:** `ProcessPoolExecutor` queue depth grows unbounded. Workers are continuously busy. `cipas_semaphore_wait_seconds` histogram shows P99 > 10s.

**Mitigations:**
1. **Primary:** `asyncio.Semaphore(MAX_CONCURRENT_BATCHES=4)` caps concurrent work at 4 batches regardless of inbound request rate. Excess requests receive `HTTP 503` immediately — they do not queue.
2. **Secondary:** Horizontal scaling. The assessment-service, which calls CIPAS, should implement retry with exponential backoff on `503`. CIPAS replicas can be scaled up within minutes.
3. **Tertiary (Phase 2):** Offload batches to a Celery task queue backed by RabbitMQ (already present in the stack). This decouples acceptance rate from processing rate.

### 9.2 Large File Edge Cases

**Scenario:** A student submits a generated Java file of 900KB (near the 1MB limit) with a deeply nested AST (e.g., a gigantic `switch` statement with 5000 cases).

**Symptoms:** Parse task takes 120ms+ instead of 8ms. Worker process RSS spikes.

**Mitigations:**
1. `MAX_FILE_SIZE_BYTES=1MB` bounds the worst case.
2. TSQuery node limit: after extraction, if a single granule exceeds 10,000 AST nodes, it is flagged as `OVERSIZED` and excluded from the granule batch (stored as a `granule_type=oversized` marker with `normalised_source=NULL`). This prevents the normaliser from allocating strings proportional to the node count.
3. Per-task timeout in `run_in_executor`: wrap the future with `asyncio.wait_for(future, timeout=30)`. A task exceeding 30s raises `TimeoutError`; the file is marked `FAILED`.

### 9.3 DB Write Amplification

**Scenario:** 200 files × 50 granules each = 10,000 granule rows per submission. At 1000 submissions/hour = 10M rows/hour inserted.

**Symptoms:** PostgreSQL `wal_writer` CPU spikes. Replication lag increases. Insert latency rises.

**Mitigations:**
1. **Batch inserts via `executemany`:** Already specified. Reduces per-row round-trip overhead.
2. **Phase 2: `COPY FROM STDIN`:** asyncpg supports streaming COPY for bulk ingestion. At 10M rows/hour, this is the threshold where COPY outperforms `executemany` by ~10×.
3. **Deferred index creation:** `FILLFACTOR=70` on the `granules` table reduces index page splits for append-heavy workloads.
4. **Partitioning:** Monthly range partitions on `created_at` prevent table bloat from degrading B-tree index performance. Add in Phase 2.
5. **WAL settings:** `synchronous_commit=off` for the `granules` table insert connection reduces write latency by ~80% at the cost of potential data loss in a crash (up to last ~200ms of commits). Acceptable for analytical data that can be re-derived from source files.

### 9.4 Vector Index Build Cost

**Scenario:** 100M granules with embeddings need HNSW indexing during Phase 2 cutover.

**Symptoms:** `CREATE INDEX` runs for hours. Table is locked (if not CONCURRENTLY). Memory pressure from `maintenance_work_mem`.

**Mitigations:**
1. **`CREATE INDEX CONCURRENTLY`:** Table remains writable during build. Non-optional at this scale.
2. **Staged build:** Build the index on a read replica first. Promote the replica or use pg_logical replication to apply the index to primary.
3. **Set `maintenance_work_mem = '4GB'`** before index creation to minimise disk I/O during construction.
4. **Build in off-peak hours.** Monitor via `pg_stat_progress_create_index`.
5. **Partition the embeddings table** by `model_id` — smaller partitions have smaller per-partition indexes that build faster and are more cache-friendly at query time.

### 9.5 Memory Fragmentation in Worker Processes

**Scenario:** Workers run thousands of tasks over hours. Python's `pymalloc` allocator retains freed memory in arenas. Worker RSS grows monotonically.

**Symptoms:** Container OOM events. Gradual increase in `container_memory_working_set_bytes` over time.

**Mitigations:**
1. **`max_tasks_per_child=500`:** After 500 tasks, the worker process is replaced with a fresh one. Memory is returned to the OS on process exit. This is the primary mitigation.
2. **`MALLOC_MMAP_THRESHOLD_=131072`:** Setting this environment variable in worker processes causes glibc's malloc to use `mmap()` for allocations > 128KB, which are immediately returned to the OS on `free()`. This reduces long-lived RSS growth from large tree-sitter parse allocations.
3. **Phase 3:** Evaluate replacing Python worker processes with a compiled tree-sitter wrapper in C or Rust for the hot path, communicating via a Unix socket. This eliminates the entire Python memory management concern for parsing.

---

## Appendix A: Tree-sitter Query Reference

### Python

```scheme
; Functions and methods
(function_definition
  name: (identifier) @name) @function

; Classes
(class_definition
  name: (identifier) @name) @class

; Loops
[(for_statement) (while_statement)] @loop
```

### Java

```scheme
; Methods
(method_declaration
  name: (identifier) @name) @function

; Constructors
(constructor_declaration
  name: (identifier) @name) @function

; Classes and interfaces
[(class_declaration name: (identifier) @name)
 (interface_declaration name: (identifier) @name)] @class

; Loops
[(for_statement) (enhanced_for_statement)
 (while_statement) (do_statement)] @loop
```

### C

```scheme
; Functions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @name)) @function

; Structs with body
(struct_specifier
  name: (type_identifier) @name
  body: (field_declaration_list)) @class

; Loops
[(for_statement) (while_statement) (do_statement)] @loop
```

---

## Appendix B: Phase 2 Forward-Compatibility Notes

The following design decisions in Phase 1 explicitly enable Phase 2 without schema migration:

| Phase 2 Feature | Phase 1 Enabler |
|---|---|
| Type 2 clone detection | `ast_fingerprint` column present and indexed |
| Type 3 clone detection | `normalized_source` present; MinHash/embedding pipeline plugs in |
| Embedding generation | `embeddings` table and HNSW index schema present |
| Cross-language clone detection | `language` stored on `granules`; no language constraint on clone queries |
| Re-processing stale submissions | `file_hash` deduplication logic already in pipeline |
| CLI / batch runner | `IngestionPipeline` is a standalone class, not tied to FastAPI request lifecycle |
| Celery task queue | `parse_file_task` is already a module-level function — Celery can call it directly |
| Incremental parsing | Tree-sitter `Tree.edit()` API available; parser instances are reused per process |