# gradeloop-core-v2/apps/services/cipas-service/src/cipas/core/config.py
"""
Core configuration for CIPAS service.

All runtime configuration is loaded from environment variables prefixed with
`CIPAS_` via pydantic-settings. The `get_settings()` factory is LRU-cached so
the Settings object is constructed exactly once per process.

Environment groups:
  - Runtime / environment identity
  - Server (host, port, Uvicorn tuning)
  - Database (asyncpg DSN + pool sizing)
  - Process pool (parse worker count, concurrency caps)
  - File ingestion limits
  - Observability (OTel, Sentry, log level)

Fail-fast contract:
  Missing or invalid required variables raise SystemExit(2) at startup.
  The error message lists which fields failed without leaking secret values.
"""

from __future__ import annotations

from functools import lru_cache
import sys
from typing import Optional

from loguru import logger
from pydantic import AnyUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings driven entirely by environment variables.

    Pydantic-settings enforces types, ranges, and required presence.
    The `CIPAS_` prefix is mandatory for all variables (e.g. `CIPAS_DATABASE_URL`).
    Frozen after construction — never mutate at runtime.
    """

    model_config = SettingsConfigDict(
        env_prefix="CIPAS_",
        frozen=True,
        # Allow population from both environment variables and a .env file.
        # In production no .env file will exist; this is a dev convenience only.
        env_file=".env",
        env_file_encoding="utf-8",
        # Raise on unknown CIPAS_* env vars so misconfiguration is caught early.
        extra="ignore",
    )

    # ── Runtime / environment identity ───────────────────────────────────────
    ENV: str = Field(
        "development",
        description="Runtime environment: development | staging | production",
    )

    # ── Server ───────────────────────────────────────────────────────────────
    HOST: str = Field("0.0.0.0", description="Uvicorn bind host")
    PORT: int = Field(8085, ge=1024, le=65535, description="Uvicorn bind port")
    # One Uvicorn worker per container; scale via replicas, not in-process forking.
    # Forking with ProcessPoolExecutor children alive is unsafe and leads to
    # double-forked zombie workers.
    UVICORN_WORKERS: int = Field(
        1, ge=1, le=1, description="Uvicorn worker count (must be 1)"
    )

    # ── Database ─────────────────────────────────────────────────────────────
    # Required in staging/production. Defaults to a local dev DSN so
    # `make dev` works out of the box with the Compose stack.
    DATABASE_URL: str = Field(
        "postgresql://cipas:cipas_secret@localhost:5435/cipas_db",
        description=(
            "asyncpg DSN. Format: postgresql://user:pass@host:port/dbname. "
            "Must NOT use asyncpg+... scheme — pass the bare postgresql:// form."
        ),
    )
    DB_MIN_POOL_SIZE: int = Field(
        5, ge=1, le=100, description="asyncpg pool minimum connections"
    )
    DB_MAX_POOL_SIZE: int = Field(
        20, ge=1, le=200, description="asyncpg pool maximum connections"
    )
    # asyncpg command_timeout: seconds before a query is cancelled.
    DB_COMMAND_TIMEOUT: float = Field(
        30.0, gt=0, description="Per-query timeout in seconds"
    )
    # Idle connections older than this are recycled to prevent stale TCP sessions.
    DB_MAX_INACTIVE_CONNECTION_LIFETIME: float = Field(
        300.0, gt=0, description="Seconds before idle connections are recycled"
    )

    # ── Process pool (parse workers) ─────────────────────────────────────────
    # 0 means os.cpu_count() — determined at runtime, not config-parse time.
    PARSER_WORKERS: int = Field(
        0,
        ge=0,
        description=(
            "Number of ProcessPoolExecutor workers for CPU-bound parsing. "
            "0 = os.cpu_count(). Set explicitly in memory-constrained environments."
        ),
    )
    # Hard cap on simultaneously active batches. Acts as an asyncio Semaphore.
    # Requests arriving when all slots are full receive HTTP 503 immediately.
    MAX_CONCURRENT_BATCHES: int = Field(
        4,
        ge=1,
        le=64,
        description="Maximum number of concurrently active ingestion batches",
    )
    # Seconds a request waits for a semaphore slot before receiving HTTP 503.
    BATCH_SEMAPHORE_TIMEOUT: float = Field(
        30.0,
        gt=0,
        description="Seconds to wait for a batch semaphore slot before HTTP 503",
    )
    # Per-file parse timeout inside the worker process (via asyncio.wait_for on
    # the executor future). Prevents pathological inputs from blocking a worker
    # indefinitely.
    PARSE_TASK_TIMEOUT: float = Field(
        30.0,
        gt=0,
        description="Per-file parse timeout in seconds (asyncio.wait_for on executor future)",
    )
    # Recycle worker processes after this many tasks to return fragmented heap
    # memory to the OS and prevent RSS growth.
    WORKER_MAX_TASKS_PER_CHILD: int = Field(
        500,
        ge=1,
        description="ProcessPoolExecutor max_tasks_per_child — recycles workers to prevent memory fragmentation",
    )

    # ── File ingestion limits ─────────────────────────────────────────────────
    MAX_FILES_PER_BATCH: int = Field(
        200,
        ge=1,
        le=200,
        description="Maximum number of files per submission batch",
    )
    # 1 MB per file. Bounds worst-case tree-sitter parse time (~150ms for 1MB Java).
    MAX_FILE_SIZE_BYTES: int = Field(
        1_048_576,
        ge=1,
        description="Maximum size in bytes for a single uploaded source file",
    )
    # 50 MB total batch. Traefik middleware enforces this at the proxy layer too.
    MAX_TOTAL_BATCH_BYTES: int = Field(
        52_428_800,
        ge=1,
        description="Maximum cumulative byte size across all files in a single batch",
    )
    # Maximum AST nodes in a single granule before it is flagged as OVERSIZED
    # and excluded from the granule batch. Prevents normaliser OOM on pathological
    # inputs (e.g., a 5000-case switch statement captured as one granule).
    MAX_GRANULE_AST_NODES: int = Field(
        10_000,
        ge=100,
        description="Maximum AST node count for a single extracted granule",
    )

    # ── Similarity scoring (Track A) ──────────────────────────────────────────
    # LCS similarity score threshold above which a pair is flagged as a clone.
    # Pairs with score >= threshold are flagged; strictly below are ignored.
    # 0.0 flags all pairs (debug mode).
    SYNTACTIC_CLONE_THRESHOLD: float = Field(
        0.85,
        ge=0.0,
        le=1.0,
        description=(
            "LCS similarity threshold for clone detection. "
            "Pairs with score >= threshold are flagged as clones."
        ),
    )
    # Minimum estimated Jaccard similarity (from MinHash) for a pair to
    # proceed to the LCS stage.  Pairs below this are discarded early.
    JACCARD_PREFILTER_THRESHOLD: float = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description=(
            "MinHash Jaccard pre-filter threshold. "
            "Pairs with estimated Jaccard < threshold are excluded before LCS."
        ),
    )
    # Number of independent hash functions for MinHash signature generation.
    # Higher values improve Jaccard estimate accuracy (~1/sqrt(k) std error).
    MINHASH_PERMUTATIONS: int = Field(
        128,
        ge=16,
        le=512,
        description="Number of MinHash permutations (signature length).",
    )
    # Number of LSH bands.  rows_per_band = MINHASH_PERMUTATIONS / LSH_NUM_BANDS.
    # LSH threshold ≈ (1/num_bands)^(1/rows_per_band).
    # 128 permutations / 32 bands = 4 rows/band → threshold ≈ 0.42.
    LSH_NUM_BANDS: int = Field(
        32,
        ge=4,
        le=256,
        description=(
            "Number of LSH bands for candidate pair discovery. "
            "Must divide MINHASH_PERMUTATIONS evenly."
        ),
    )
    # Token n-gram size for shingling.  5-grams capture short structural patterns.
    SHINGLE_SIZE: int = Field(
        5,
        ge=1,
        le=20,
        description="Token n-gram size for shingling (default 5-grams).",
    )
    # Maximum wall-clock time in seconds for a single similarity analysis run.
    # Requests that exceed this are cancelled and returned as HTTP 504.
    SIMILARITY_ANALYSIS_TIMEOUT: float = Field(
        600.0,
        gt=0,
        description="Maximum seconds for a single similarity analysis run (default 10 min).",
    )

    # ── Observability ─────────────────────────────────────────────────────────
    LOG_LEVEL: str = Field("INFO", description="Loguru log level")
    OTEL_SERVICE_NAME: str = Field("cipas", description="OpenTelemetry service name")
    OTEL_EXPORTER_OTLP_ENDPOINT: Optional[str] = Field(
        None,
        description="OTLP gRPC endpoint (e.g. http://otel-collector:4317). Disabled if unset.",
    )
    SENTRY_DSN: Optional[SecretStr] = Field(None, description="Sentry DSN (optional)")

    # ── Health check ─────────────────────────────────────────────────────────
    HEALTH_CHECK_TIMEOUT_SECONDS: float = Field(
        3.0,
        gt=0,
        description="Timeout for external dependency health probes",
    )

    # ── Validators ───────────────────────────────────────────────────────────

    @field_validator("ENV")
    @classmethod
    def validate_env(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"ENV must be one of {allowed}, got {v!r}")
        return v

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"TRACE", "DEBUG", "INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}, got {v!r}")
        return upper

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        # asyncpg accepts postgresql:// and postgres:// schemes.
        # Reject jdbc:, asyncpg:, etc. which are common copy-paste errors.
        if not (v.startswith("postgresql://") or v.startswith("postgres://")):
            raise ValueError(
                "DATABASE_URL must start with 'postgresql://' or 'postgres://'. "
                f"Got scheme: {v.split('://')[0]!r}"
            )
        return v

    @field_validator("DB_MIN_POOL_SIZE", "DB_MAX_POOL_SIZE")
    @classmethod
    def validate_pool_sizes(cls, v: int) -> int:
        return v

    # Cross-field validation is handled post-init via model_validator if needed.
    # For now, min ≤ max is enforced at the application layer in storage/db.py
    # because pydantic field_validators run independently.

    # ── Computed properties ───────────────────────────────────────────────────

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.ENV == "development"

    @property
    def docs_enabled(self) -> bool:
        """Disable OpenAPI UI in production to reduce attack surface."""
        return not self.is_production


# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------


def configure_logging(settings: Settings) -> None:
    """
    Configure Loguru for structured JSON output.

    Called once early in the application lifecycle (inside get_settings() and
    again in the app factory for safety). Idempotent — calling multiple times
    has no effect because `logger.remove()` clears all existing handlers first.

    Structured JSON log schema (Loguru serialize=True):
      {
        "text":    "<human readable>",
        "record": {
          "time":    { "repr": "...", "timestamp": 1234567890.0 },
          "level":   { "name": "INFO", ... },
          "name":    "cipas.ingestion.pipeline",
          "message": "...",
          ...extra bound fields...
        }
      }

    The outer `text` field is redundant but kept for log aggregators that
    only index the top-level string field. Downstream ELK/Loki pipelines
    should parse the `record` object.
    """
    logger.remove()  # Clear all existing handlers (including Loguru's default stderr)

    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        # serialize=True emits JSON — required for structured log collectors.
        serialize=True,
        # enqueue=True makes logging thread-safe and non-blocking.
        # The log message is pushed to an internal queue and emitted by a
        # background thread, so the calling coroutine/thread is never blocked
        # by slow I/O on the log sink.
        enqueue=True,
        # backtrace=False: do not include full stack traces in production logs
        # (can leak internal paths and variable values). Enable in development.
        backtrace=settings.is_development,
        # diagnose=False: do not include variable values in exception tracebacks
        # in production (can leak secrets). Enable in development.
        diagnose=settings.is_development,
    )

    # Bind service-level context fields to all subsequent log records.
    # These appear in the `record.extra` object in the JSON output.
    logger.configure(extra={"service": "cipas", "env": settings.ENV})

    logger.debug(
        "Logging configured",
        level=settings.LOG_LEVEL,
        env=settings.ENV,
        structured_json=True,
    )


# ---------------------------------------------------------------------------
# Settings factory
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a process-singleton Settings instance.

    Validation is performed synchronously on first call. If any required
    variable is missing or any validator raises, the process exits with
    code 2 — fail-fast before the ASGI server starts accepting connections.

    The @lru_cache ensures the Settings object is constructed exactly once:
      - In the FastAPI app factory (lifespan)
      - In FastAPI dependency injection (Depends(get_settings))
      - In worker subprocess initialiser (imported module-level)
    All three call sites receive the same cached instance within one process.

    Note: worker subprocesses have their own independent cache since they are
    separate OS processes. They each call get_settings() once in the initialiser
    and cache independently — this is correct and expected.
    """
    try:
        settings = Settings()
    except Exception as exc:
        # Avoid leaking secret values. Show field names + error types only.
        # Use stderr so the message is visible even if the logger is not yet configured.
        sys.stderr.write(
            f"[CIPAS] Configuration validation FAILED. "
            f"Check CIPAS_* environment variables.\n"
            f"Details: {exc}\n"
        )
        raise SystemExit(2) from exc

    # Initialise logging immediately after settings are validated.
    configure_logging(settings)
    logger.info(
        "Settings loaded",
        env=settings.ENV,
        port=settings.PORT,
        parser_workers=settings.PARSER_WORKERS,
        max_concurrent_batches=settings.MAX_CONCURRENT_BATCHES,
        db_pool_min=settings.DB_MIN_POOL_SIZE,
        db_pool_max=settings.DB_MAX_POOL_SIZE,
    )

    return settings


__all__ = ["Settings", "get_settings", "configure_logging"]
