# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/deps/db.py
"""
FastAPI dependency providers for database and pipeline access.

All route handlers receive infrastructure objects via FastAPI's dependency
injection system rather than importing globals or using module-level state.
This keeps route handlers testable (swap out the dependency in test fixtures)
and enforces the rule that infrastructure is always initialised before use.

Dependency providers defined here:
  - get_db_pool()       → asyncpg.Pool
  - get_repository()    → StorageRepository
  - get_pipeline()      → IngestionPipeline
  - get_settings()      → Settings  (re-exported for route convenience)

All providers read from `request.app.state`, which is populated during the
FastAPI lifespan in main.py.  If any of these objects are not present on
app.state (e.g. due to a startup failure), the provider raises HTTP 503
with a structured error body rather than propagating an AttributeError.

Usage in route handlers:

    from cipas.api.v1.deps.db import get_repository, get_pipeline
    from cipas.storage import StorageRepository
    from cipas.ingestion import IngestionPipeline

    @router.post("/submissions")
    async def submit(
        repository: StorageRepository = Depends(get_repository),
        pipeline: IngestionPipeline   = Depends(get_pipeline),
    ) -> SubmissionResponse:
        ...

Design notes:
  - Providers use `Request` (not `Annotated[..., Depends(...)]`) because
    they read from app.state which is a request-level attribute.
  - Each provider is an async generator (or async function) returning the
    dependency.  FastAPI handles lifecycle automatically.
  - `get_settings()` is re-exported from cipas.core.config so route handlers
    import from one place (this deps module) rather than multiple config modules.
"""

from __future__ import annotations

from typing import Annotated, AsyncGenerator

import asyncpg  # type: ignore[import]
from fastapi import Depends, HTTPException, Request, status

from cipas.core.config import Settings
from cipas.core.config import get_settings as _get_settings
from cipas.ingestion.pipeline import IngestionPipeline
from cipas.storage.repository import StorageRepository

# ---------------------------------------------------------------------------
# asyncpg pool dependency
# ---------------------------------------------------------------------------


async def get_db_pool(request: Request) -> AsyncGenerator[asyncpg.Pool, None]:
    """
    FastAPI dependency: yield the application-wide asyncpg connection pool.

    The pool is stored on app.state.db_pool by the lifespan function in
    main.py.  If it is not present (startup failed), returns HTTP 503.

    Yields:
        asyncpg.Pool — the live connection pool.

    Raises:
        HTTP 503: If the pool is not initialised.
    """
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "DB_POOL_UNAVAILABLE",
                "detail": (
                    "The database connection pool is not available. "
                    "The service may still be starting up."
                ),
            },
        )
    yield pool


# ---------------------------------------------------------------------------
# Repository dependency
# ---------------------------------------------------------------------------


async def get_repository(request: Request) -> StorageRepository:
    """
    FastAPI dependency: return the application-wide StorageRepository instance.

    The repository is stored on app.state.repository by the lifespan function
    in main.py.  If it is not present (startup failed), returns HTTP 503.

    Returns:
        StorageRepository — the typed async data access layer.

    Raises:
        HTTP 503: If the repository is not initialised.
    """
    repository: StorageRepository | None = getattr(
        request.app.state, "repository", None
    )
    if repository is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "REPOSITORY_UNAVAILABLE",
                "detail": (
                    "The storage repository is not available. "
                    "The service may still be starting up or the database "
                    "connection failed during initialisation."
                ),
            },
        )
    return repository


# ---------------------------------------------------------------------------
# IngestionPipeline dependency
# ---------------------------------------------------------------------------


async def get_pipeline(request: Request) -> IngestionPipeline:
    """
    FastAPI dependency: return the application-wide IngestionPipeline instance.

    The pipeline is stored on app.state.pipeline by the lifespan function
    in main.py.  If it is not present (startup failed), returns HTTP 503.

    The pipeline holds a live ProcessPoolExecutor.  Injecting it via
    dependency injection (rather than importing a module-level global) ensures:
      - Tests can inject a mock pipeline with no subprocess overhead.
      - The pipeline is cleanly shut down in the lifespan teardown, not in
        a global atexit handler.

    Returns:
        IngestionPipeline — the async batch parse orchestrator.

    Raises:
        HTTP 503: If the pipeline is not initialised.
    """
    pipeline: IngestionPipeline | None = getattr(request.app.state, "pipeline", None)
    if pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "PIPELINE_UNAVAILABLE",
                "detail": (
                    "The ingestion pipeline is not available. "
                    "The service may still be warming up the worker pool."
                ),
            },
        )
    return pipeline


# ---------------------------------------------------------------------------
# Settings dependency (re-export for route handler convenience)
# ---------------------------------------------------------------------------


def get_settings_dep() -> Settings:
    """
    FastAPI dependency: return the cached Settings singleton.

    Re-exports cipas.core.config.get_settings() so route handlers can import
    from `cipas.api.v1.deps.db` exclusively rather than reaching into the
    core package directly.

    This also makes it trivial to override settings in tests:
        app.dependency_overrides[get_settings_dep] = lambda: test_settings

    Returns:
        Settings — the validated, cached application configuration.
    """
    return _get_settings()


# ---------------------------------------------------------------------------
# Annotated type aliases (FastAPI 0.111+ convenience syntax)
# ---------------------------------------------------------------------------
# Route handlers can use these type aliases for cleaner signatures:
#
#   async def submit(
#       repository: RepositoryDep,
#       pipeline:   PipelineDep,
#   ) -> SubmissionResponse:
#       ...
#
# instead of the more verbose:
#
#   async def submit(
#       repository: StorageRepository = Depends(get_repository),
#       pipeline:   IngestionPipeline  = Depends(get_pipeline),
#   ) -> SubmissionResponse:
#       ...

RepositoryDep = Annotated[StorageRepository, Depends(get_repository)]
PipelineDep = Annotated[IngestionPipeline, Depends(get_pipeline)]
SettingsDep = Annotated[Settings, Depends(get_settings_dep)]


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    # Dependency provider functions
    "get_db_pool",
    "get_repository",
    "get_pipeline",
    "get_settings_dep",
    # Annotated type aliases
    "RepositoryDep",
    "PipelineDep",
    "SettingsDep",
]
