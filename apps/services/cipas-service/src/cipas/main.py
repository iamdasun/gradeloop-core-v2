# gradeloop-core-v2/apps/services/cipas-service/src/cipas/main.py
"""
CIPAS FastAPI application factory.

This module is the composition root for the service.  It wires together:
  - Settings (pydantic-settings, CIPAS_* env vars)
  - asyncpg connection pool (PostgreSQL + pgvector)
  - StorageRepository (typed async data access)
  - IngestionPipeline (async orchestrator + ProcessPoolExecutor)
  - FastAPI application with lifespan, middleware, and route registration
  - Global exception handlers (CIPASError → RFC 7807 ProblemDetail)
  - Prometheus metrics instrumentation
  - OpenTelemetry tracing hooks

Lifespan sequence (startup):
    1. Load and validate Settings via get_settings()
    2. Configure structured JSON logging via configure_logging()
    3. Create asyncpg pool → run schema migrations → recover stale submissions
    4. Instantiate StorageRepository(pool)
    5. Instantiate IngestionPipeline(settings, repository)
    6. Await pipeline.start()  → spawn ProcessPoolExecutor workers
                                → warm up tree-sitter grammars
    7. Store pool, repository, pipeline on app.state
    8. Service is now READY

Lifespan sequence (shutdown):
    1. Await pipeline.stop()   → graceful ProcessPoolExecutor shutdown
    2. Await close_pool(pool)  → graceful asyncpg pool teardown
    3. Log shutdown complete

Route registration:
    /api/v1/cipas/health          GET  — liveness probe
    /api/v1/cipas/ready           GET  — readiness probe
    /api/v1/cipas/metrics/pool    GET  — pool stats
    /api/v1/cipas/submissions     POST — batch ingestion
    /api/v1/cipas/submissions/:id GET  — submission status
    /api/v1/cipas/submissions/:id/clones          GET — Type-1 clones
    /api/v1/cipas/submissions/:id/clones/type2    GET — Type-2 candidates
    /metrics                      GET  — Prometheus metrics

Global exception handlers:
    CIPASError     → RFC 7807 ProblemDetail JSON + correct HTTP status
    RequestValidationError → 422 with field-level errors
    HTTPException  → pass-through (FastAPI default shape preserved)
    Exception      → 500 Internal Server Error (structured, no stack trace leak)

Design decisions:
  - Single Uvicorn worker per container (UVICORN_WORKERS=1).
    ProcessPoolExecutor provides CPU parallelism within one process.
    Horizontal scale via container replicas, not in-process forking.
    Rationale: forking a process that already has live asyncpg connections and
    a running ProcessPoolExecutor is unsafe and leads to resource double-open.

  - app.state carries all shared infrastructure objects.
    Route handlers access them via FastAPI dependency injection (deps/db.py).
    This keeps handlers testable and decouples them from global imports.

  - Docs UI is disabled in production (docs_url=None, redoc_url=None).
    Enabled in development (docs_url="/docs", redoc_url="/redoc").
    Controlled by settings.docs_enabled.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
import sys
from typing import Any, AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from prometheus_fastapi_instrumentator import Instrumentator
import uvicorn

from cipas.api.v1.routes.evidence import router as evidence_router
from cipas.api.v1.routes.health import router as health_router
from cipas.api.v1.routes.ingestion import router as ingestion_router
from cipas.api.v1.routes.similarity import router as similarity_router
from cipas.core.config import Settings, configure_logging, get_settings
from cipas.core.exceptions import CapacityError, CIPASError
from cipas.domain.models import ProblemDetail
from cipas.ingestion.pipeline import IngestionPipeline
from cipas.similarity.scorer import SimilarityScoringPipeline
from cipas.storage.db import close_pool, create_pool
from cipas.storage.repository import StorageRepository
from cipas.storage.similarity_repository import SimilarityRepository as SimilarityRepo

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI lifespan context manager.

    Replaces the deprecated @app.on_event("startup") / ("shutdown") pattern.
    Everything before `yield` runs on startup; everything after on shutdown.

    The lifespan is attached to the app in create_app() via the `lifespan`
    parameter of FastAPI().

    On startup failure (DB unreachable, migration error, worker spawn failure),
    the exception propagates and Uvicorn exits with a non-zero code.  The
    container orchestrator will restart the container.
    """
    settings: Settings = app.state.settings

    # ── 1. Create asyncpg pool ────────────────────────────────────────────────
    logger.info("CIPAS startup: creating DB pool")
    try:
        pool = await create_pool(settings)
    except Exception as exc:
        logger.error(
            "CIPAS startup FAILED: could not create DB pool",
            error=str(exc),
            database_url_redacted=True,
        )
        raise

    app.state.db_pool = pool

    # ── 2. Instantiate StorageRepository ─────────────────────────────────────
    repository = StorageRepository(pool=pool)
    app.state.repository = repository
    logger.info("CIPAS startup: StorageRepository initialised")

    # ── 3. Instantiate and start IngestionPipeline ────────────────────────────
    logger.info(
        "CIPAS startup: starting IngestionPipeline",
        parser_workers=settings.PARSER_WORKERS or "os.cpu_count()",
        max_concurrent_batches=settings.MAX_CONCURRENT_BATCHES,
    )
    pipeline = IngestionPipeline(settings=settings, repository=repository)
    try:
        await pipeline.start()
    except Exception as exc:
        logger.error(
            "CIPAS startup FAILED: could not start IngestionPipeline",
            error=str(exc),
        )
        # Attempt pool cleanup before re-raising so we don't leave dangling
        # connections behind.
        try:
            await close_pool(pool)
        except Exception:
            pass
        raise

    app.state.pipeline = pipeline

    # ── 4. Instantiate SimilarityRepository ──────────────────────────────────
    similarity_repository = SimilarityRepo(pool=pool)
    app.state.similarity_repository = similarity_repository
    logger.info("CIPAS startup: SimilarityRepository initialised")

    # ── 5. Instantiate and start SimilarityScoringPipeline ───────────────────
    lcs_worker_count = settings.PARSER_WORKERS or 0  # reuse same count as parse workers
    logger.info(
        "CIPAS startup: starting SimilarityScoringPipeline",
        lcs_workers=lcs_worker_count or "os.cpu_count()",
    )
    similarity_pipeline = SimilarityScoringPipeline(worker_count=lcs_worker_count)
    try:
        await similarity_pipeline.start()
    except Exception as exc:
        logger.error(
            "CIPAS startup FAILED: could not start SimilarityScoringPipeline",
            error=str(exc),
        )
        try:
            await pipeline.stop()
            await close_pool(pool)
        except Exception:
            pass
        raise

    app.state.similarity_pipeline = similarity_pipeline

    logger.info(
        "CIPAS startup complete — service is READY",
        env=settings.ENV,
        port=settings.PORT,
        worker_count=pipeline.worker_count,
        lcs_workers=similarity_pipeline.worker_count,
        max_concurrent_batches=settings.MAX_CONCURRENT_BATCHES,
    )

    # ── Yield: service is running ─────────────────────────────────────────────
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("CIPAS shutdown initiated")

    # Stop the similarity scoring pipeline (drains in-flight LCS tasks).
    try:
        await similarity_pipeline.stop()
    except Exception as exc:
        logger.warning(
            "Error during similarity pipeline shutdown (non-fatal)", error=str(exc)
        )

    # Stop the ingestion pipeline (drains in-flight parse tasks).
    try:
        await pipeline.stop()
    except Exception as exc:
        logger.warning("Error during pipeline shutdown (non-fatal)", error=str(exc))

    # Close the asyncpg pool (waits for in-flight queries).
    try:
        await close_pool(pool)
    except Exception as exc:
        logger.warning("Error during pool shutdown (non-fatal)", error=str(exc))

    logger.info("CIPAS shutdown complete")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app(settings: Settings | None = None) -> FastAPI:
    """
    FastAPI application factory.

    Creates and configures the FastAPI application with all middleware,
    routes, exception handlers, and observability instrumentation.

    Args:
        settings: Optional Settings instance.  If None, the cached singleton
                  from get_settings() is used.  Passing a custom Settings
                  instance is useful in tests to override configuration
                  without touching environment variables.

    Returns:
        A fully configured FastAPI application instance.
    """
    if settings is None:
        settings = get_settings()

    configure_logging(settings)

    # ── FastAPI app ───────────────────────────────────────────────────────────
    app = FastAPI(
        title="CIPAS — Code Integrity Analysis Service",
        description=(
            "Multi-language source code clone detection platform. "
            "Phase 1: structural parsing, granule extraction, and vector-ready storage."
        ),
        version="0.2.0",
        # OpenAPI UI is disabled in production to reduce attack surface.
        # Re-enabled in development for interactive exploration.
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        # Attach lifespan for startup/shutdown resource management.
        lifespan=lifespan,
        # Contact and license metadata for OpenAPI schema.
        contact={
            "name": "Platform Engineering",
            "email": "platform-team@gradeloop.internal",
        },
        license_info={
            "name": "MIT",
        },
    )

    # Store settings on app.state immediately (before lifespan runs) so
    # the lifespan function can access it via app.state.settings.
    app.state.settings = settings

    # ── Prometheus metrics ────────────────────────────────────────────────────
    # Instrumentator auto-instruments all routes with request count, duration,
    # and response size histograms.  Metrics are exposed at GET /metrics.
    # include_in_schema=False hides /metrics from OpenAPI to prevent it
    # from cluttering the API documentation.
    Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        should_respect_env_var=True,
        env_var_name="ENABLE_METRICS",
        excluded_handlers=["/metrics", "/api/v1/cipas/health", "/api/v1/cipas/ready"],
    ).instrument(app).expose(
        app,
        include_in_schema=False,
        tags=["observability"],
    )

    # ── Middleware ────────────────────────────────────────────────────────────
    _register_middleware(app, settings)

    # ── Routes ────────────────────────────────────────────────────────────────
    _register_routes(app)

    # ── Exception handlers ────────────────────────────────────────────────────
    _register_exception_handlers(app)

    # ── Root redirect ─────────────────────────────────────────────────────────
    @app.get("/", include_in_schema=False)
    async def _root() -> dict[str, Any]:
        """Minimal root response for service discovery probes."""
        return {
            "service": "cipas",
            "version": "0.2.0",
            "status": "running",
            "docs": "/docs" if settings.docs_enabled else "disabled in production",
        }

    return app


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------


def _register_routes(app: FastAPI) -> None:
    """
    Register all API routers with the application.

    Route prefix hierarchy:
        /api/v1/cipas/...   → health_router (health, ready, metrics/pool)
        /api/v1/cipas/...   → ingestion_router (submissions, clones)
        /api/v1/cipas/...   → similarity_router (similarity analysis)
        /api/v1/cipas/...   → evidence_router (clone evidence, graph, classes)

    Both routers use prefix="/cipas" internally; we mount them under
    /api/v1 so the full paths are /api/v1/cipas/health, etc.
    This matches Traefik's routing rule:
        PathPrefix(`/api/v1/cipas`)
    """
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(ingestion_router, prefix="/api/v1")
    app.include_router(similarity_router, prefix="/api/v1")
    app.include_router(evidence_router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Middleware registration
# ---------------------------------------------------------------------------


def _register_middleware(app: FastAPI, settings: Settings) -> None:
    """
    Register middleware in the correct order.

    Middleware is applied in reverse registration order (last registered
    runs first for requests, last for responses).  The order here is:
        1. Structured request logging (innermost — runs last in request, first in response)

    Note: Traefik handles TLS termination, rate limiting, and request size
    limiting BEFORE the request reaches this service.  We do not duplicate
    those concerns here.
    """
    # Structured request logging middleware.
    # Logs every request with method, path, status, and duration_ms.
    # Disabled in production to reduce log volume (Traefik access logs cover this).
    if settings.is_development:
        from starlette.middleware.base import BaseHTTPMiddleware

        app.add_middleware(BaseHTTPMiddleware, dispatch=_log_request_middleware)


async def _log_request_middleware(
    request: Request,
    call_next: Any,
) -> Any:
    """
    Development-only request logging middleware.

    Logs the request method, path, status code, and elapsed time in ms.
    Only active when CIPAS_ENV=development.

    In production, request logging is handled by Traefik access logs and
    the structured JSON logs emitted by route handlers and the pipeline.
    """
    import time

    start = time.monotonic()
    response = await call_next(request)
    elapsed_ms = round((time.monotonic() - start) * 1000, 2)

    logger.debug(
        "Request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=elapsed_ms,
        client=request.client.host if request.client else "unknown",
    )
    return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def _register_exception_handlers(app: FastAPI) -> None:
    """
    Register global exception handlers for structured error responses.

    Handler priority (FastAPI evaluates most-specific first):
        1. CIPASError       → RFC 7807 ProblemDetail + correct HTTP status
        2. RequestValidationError → 422 with field-level error list
        3. HTTPException    → pass-through (FastAPI's own shape)
        4. Exception        → 500 Internal Server Error (no stack trace leak)
    """

    @app.exception_handler(CIPASError)
    async def cipas_error_handler(
        request: Request,
        exc: CIPASError,
    ) -> JSONResponse:
        """
        Translate CIPASError (and all subclasses) to RFC 7807 ProblemDetail.

        Sets Retry-After header for CapacityError subclasses (HTTP 503) so
        callers know when to retry.

        Example response (FileTooLargeError):
        HTTP 413
        {
            "type":     "https://cipas.gradeloop.internal/errors/file-too-large",
            "title":    "FileTooLargeError",
            "status":   413,
            "detail":   "File 'Main.java' is 2,097,152 bytes which exceeds ...",
            "instance": "/api/v1/cipas/submissions",
            "errors":   []
        }
        """
        problem = ProblemDetail.from_cipas_error(exc, instance=str(request.url.path))

        headers: dict[str, str] = {}
        # CapacityError subclasses (e.g. SemaphoreTimeoutError) carry a
        # retry_after attribute indicating how many seconds to wait.
        if isinstance(exc, CapacityError):
            headers["Retry-After"] = str(exc.retry_after)

        logger.warning(
            "CIPASError handled",
            error_code=exc.code,
            http_status=exc.http_status,
            detail=exc.detail,
            path=request.url.path,
        )

        return JSONResponse(
            status_code=exc.http_status,
            content=problem.model_dump(),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        """
        Translate pydantic RequestValidationError to RFC 7807 ProblemDetail.

        FastAPI's default 422 response uses a different shape.  We override
        it to produce consistent RFC 7807 responses across all error types.

        Field errors from pydantic are mapped to the `errors` list with
        `field`, `code`, and `detail` keys.
        """
        from cipas.domain.models import ErrorDetail

        errors = [
            ErrorDetail(
                field=" → ".join(str(loc) for loc in e.get("loc", [])),
                code=e.get("type", "validation_error").upper(),
                detail=e.get("msg", "Validation failed"),
            )
            for e in exc.errors()
        ]

        problem = ProblemDetail(
            type="https://cipas.gradeloop.internal/errors/validation-error",
            title="Request Validation Failed",
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more request fields failed validation.",
            instance=str(request.url.path),
            errors=errors,
        )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=problem.model_dump(),
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        """
        Translate FastAPI HTTPException to RFC 7807 ProblemDetail.

        Preserves the status code and detail from the original exception.
        HTTPExceptions are raised directly by route handlers for simple
        4xx errors (404 not found, 400 bad request, etc.) where a full
        CIPASError subclass is not warranted.
        """
        # If the detail is already a dict (our structured format from some
        # route handlers), use it directly.  Otherwise wrap it.
        if isinstance(exc.detail, dict):
            content = {
                "type": f"https://cipas.gradeloop.internal/errors/http-{exc.status_code}",
                "title": f"HTTP {exc.status_code}",
                "status": exc.status_code,
                "detail": exc.detail.get("detail", str(exc.detail)),
                "instance": str(request.url.path),
                "errors": [],
                **{k: v for k, v in exc.detail.items() if k not in ("detail",)},
            }
        else:
            content = {
                "type": f"https://cipas.gradeloop.internal/errors/http-{exc.status_code}",
                "title": f"HTTP {exc.status_code}",
                "status": exc.status_code,
                "detail": str(exc.detail),
                "instance": str(request.url.path),
                "errors": [],
            }

        headers = dict(exc.headers) if exc.headers else {}

        return JSONResponse(
            status_code=exc.status_code,
            content=content,
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        """
        Catch-all handler for unexpected exceptions.

        Returns HTTP 500 with a structured body.  Does NOT include the
        exception stack trace or message in the response body — that would
        leak internal implementation details to callers.

        The full exception is logged with logger.exception() so the stack
        trace is available in the container logs / log aggregator.
        """
        logger.exception(
            "Unhandled exception",
            path=request.url.path,
            method=request.method,
            exception_type=type(exc).__name__,
        )

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "type": "https://cipas.gradeloop.internal/errors/internal-server-error",
                "title": "Internal Server Error",
                "status": 500,
                "detail": (
                    "An unexpected error occurred. "
                    "Please contact support with the request ID from the logs."
                ),
                "instance": str(request.url.path),
                "errors": [],
            },
        )


# ---------------------------------------------------------------------------
# Top-level app instance
# ---------------------------------------------------------------------------
# This is the ASGI application object imported by Uvicorn via the CMD in the
# Dockerfile:
#   uvicorn cipas.main:app --host 0.0.0.0 --port 8085 ...
#
# create_app() is called once at module import time with the cached Settings
# singleton.  In tests, import the factory function directly:
#   from cipas.main import create_app
#   app = create_app(settings=test_settings)

app: FastAPI = create_app()


# ---------------------------------------------------------------------------
# Development entrypoint
# ---------------------------------------------------------------------------
# Called when running:
#   python -m cipas.main
# or:
#   make dev  (via poetry run uvicorn cipas.main:app --reload ...)
#
# In production, Uvicorn is launched directly via CMD in the Dockerfile.
# This __main__ block is only for local development convenience.

if __name__ == "__main__":
    _settings = get_settings()
    configure_logging(_settings)

    logger.info(
        "Starting CIPAS development server",
        host=_settings.HOST,
        port=_settings.PORT,
        env=_settings.ENV,
        reload=True,
    )

    uvicorn.run(
        "cipas.main:app",
        host=_settings.HOST,
        port=_settings.PORT,
        # reload=True enables hot-reload on source changes.
        # ONLY use this in development — it forks the process in a way that
        # is incompatible with ProcessPoolExecutor workers (double-fork issue).
        # In production, the Dockerfile CMD uses reload=False (the default).
        reload=_settings.is_development,
        # Disable the Uvicorn access log — we log requests via our own
        # middleware (in dev) or not at all (in prod, Traefik handles it).
        access_log=False,
        # Use uvloop event loop (faster than asyncio's default proactor).
        # Requires uvicorn[standard] which installs uvloop as a dependency.
        loop="uvloop",
        # Use httptools HTTP/1.1 parser (faster than h11).
        http="httptools",
        # Only one worker in dev to match the production single-worker model
        # and keep ProcessPoolExecutor state predictable.
        workers=1,
        # Suppress Uvicorn's own structured log config (we configure Loguru).
        log_config=None,
    )
