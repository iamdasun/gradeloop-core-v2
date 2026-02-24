# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/routes/health.py
"""
Health and readiness endpoints for the CIPAS service.

Endpoints:
  GET /api/v1/cipas/health        Liveness probe — is the process alive?
  GET /api/v1/cipas/ready         Readiness probe — are all dependencies healthy?
  GET /api/v1/cipas/metrics/pool  Internal: connection pool statistics

Probe semantics:
  /health  (liveness)
    Returns HTTP 200 as long as the FastAPI event loop is accepting connections.
    Does NOT check external dependencies.  If this returns non-200, the
    container orchestrator should RESTART the container (it is dead).
    Intentionally cheap: no DB call, no I/O.

  /ready   (readiness)
    Returns HTTP 200 only when ALL of the following are true:
      - asyncpg pool is initialised and responsive (SELECT 1)
      - IngestionPipeline is initialised and the process pool is running
    If this returns non-200, the container orchestrator should STOP sending
    traffic (remove from load balancer) but NOT restart the container.
    Used by Kubernetes readinessProbe / Traefik healthcheck.

Probe response schema:
  {
    "status":   "ok" | "degraded" | "unhealthy",
    "service":  "cipas",
    "version":  "0.2.0",
    "env":      "production",
    "checks":   {
      "database":  { "status": "ok",        "latency_ms": 1.2  },
      "pipeline":  { "status": "ok",        "workers": 4       },
      "pool":      { "status": "ok",        "used": 2, "free": 18, "size": 20 }
    }
  }

Design principles:
  - Health checks are synchronous-first (fast path: no I/O → HTTP 200 <1ms).
  - Readiness checks have a timeout (HEALTH_CHECK_TIMEOUT_SECONDS) so a
    slow DB does not cause the probe to hang indefinitely.
  - All dependency objects (pool, pipeline, settings) are read from
    app.state — the same dependency injection pattern used by route handlers.
  - No authentication is required on health endpoints (they are internal
    probe targets, not user-facing).
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from loguru import logger

from cipas.core.config import Settings, get_settings

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/cipas",
    tags=["health"],
    # Health endpoints are excluded from the default response model to allow
    # returning variable-shape dicts depending on dependency status.
    include_in_schema=True,
)

# ---------------------------------------------------------------------------
# Service metadata
# ---------------------------------------------------------------------------

_SERVICE_NAME = "cipas"
_SERVICE_VERSION = "0.2.0"


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/health  (liveness probe)
# ---------------------------------------------------------------------------


@router.get(
    "/health",
    summary="Liveness probe — process health",
    status_code=status.HTTP_200_OK,
    response_description="Service is alive",
)
async def liveness(request: Request) -> dict[str, Any]:
    """
    Liveness probe.

    Returns HTTP 200 as long as the FastAPI event loop is processing requests.
    Does NOT check external dependencies (DB, pipeline).

    Orchestrators (Kubernetes livenessProbe, Docker HEALTHCHECK) use this
    endpoint to determine whether to restart the container.

    Response time: < 1ms (no I/O).
    """
    settings: Settings = get_settings()

    return {
        "status": "ok",
        "service": _SERVICE_NAME,
        "version": _SERVICE_VERSION,
        "env": settings.ENV,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/ready  (readiness probe)
# ---------------------------------------------------------------------------


@router.get(
    "/ready",
    summary="Readiness probe — all dependencies healthy",
    # Status code is set dynamically based on dependency health.
    # FastAPI default is 200; we override with JSONResponse when degraded.
    status_code=status.HTTP_200_OK,
    response_description="Service is ready to accept traffic",
    responses={
        200: {"description": "All dependencies healthy — service is ready"},
        503: {"description": "One or more dependencies are unhealthy — not ready"},
    },
)
async def readiness(request: Request) -> JSONResponse:
    """
    Readiness probe.

    Checks all external dependencies that must be healthy before the service
    accepts production traffic:
      - PostgreSQL via asyncpg pool (SELECT 1 query)
      - IngestionPipeline (process pool is initialised and running)

    Returns HTTP 200 if all checks pass, HTTP 503 if any check fails.

    Orchestrators (Kubernetes readinessProbe) use this to decide whether to
    route traffic to this pod.  A 503 removes the pod from the load balancer
    without restarting it.

    Response time: up to HEALTH_CHECK_TIMEOUT_SECONDS (default 3s) in worst case.
    Typical response time when healthy: 1–5ms (DB round-trip on same network).
    """
    settings: Settings = get_settings()
    timeout = settings.HEALTH_CHECK_TIMEOUT_SECONDS

    checks: dict[str, dict[str, Any]] = {}
    overall_status = "ok"

    # ── Database check ────────────────────────────────────────────────────────
    db_status = await _check_database(request=request, timeout=timeout)
    checks["database"] = db_status
    if db_status["status"] != "ok":
        overall_status = "unhealthy"

    # ── Pipeline check ────────────────────────────────────────────────────────
    pipeline_status = _check_pipeline(request=request)
    checks["pipeline"] = pipeline_status
    if pipeline_status["status"] != "ok":
        if overall_status == "ok":
            overall_status = "degraded"

    # ── Connection pool stats (informational, non-blocking) ───────────────────
    pool_status = _check_pool_stats(request=request)
    checks["pool"] = pool_status

    # ── Build response ────────────────────────────────────────────────────────
    body: dict[str, Any] = {
        "status": overall_status,
        "service": _SERVICE_NAME,
        "version": _SERVICE_VERSION,
        "env": settings.ENV,
        "checks": checks,
    }

    http_status = (
        status.HTTP_200_OK
        if overall_status == "ok"
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )

    if overall_status != "ok":
        logger.warning(
            "Readiness probe failed",
            overall_status=overall_status,
            checks={k: v.get("status") for k, v in checks.items()},
        )

    return JSONResponse(content=body, status_code=http_status)


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/metrics/pool  (internal observability endpoint)
# ---------------------------------------------------------------------------


@router.get(
    "/metrics/pool",
    summary="Connection pool statistics",
    status_code=status.HTTP_200_OK,
    response_description="Current asyncpg pool statistics",
    include_in_schema=True,
)
async def pool_metrics(request: Request) -> dict[str, Any]:
    """
    Return detailed asyncpg connection pool statistics.

    Intended for internal monitoring dashboards and debugging.
    Not exposed publicly (Traefik routing does not forward this path externally).

    Returns pool size, idle count, in-use count, and pipeline state.
    """
    pool_stats = _check_pool_stats(request=request)

    pipeline = getattr(request.app.state, "pipeline", None)
    pipeline_info: dict[str, Any] = {}
    if pipeline is not None:
        pipeline_info = {
            "active_batches": getattr(pipeline, "active_batches", "unknown"),
            "worker_count": getattr(pipeline, "worker_count", "unknown"),
        }

    return {
        "service": _SERVICE_NAME,
        "pool": pool_stats,
        "pipeline": pipeline_info,
    }


# ---------------------------------------------------------------------------
# Dependency check helpers
# ---------------------------------------------------------------------------


async def _check_database(
    *,
    request: Request,
    timeout: float,
) -> dict[str, Any]:
    """
    Verify DB connectivity by executing SELECT 1 through the asyncpg pool.

    Args:
        request: FastAPI Request (used to access app.state.repository).
        timeout: Maximum seconds to wait for the DB response.

    Returns:
        Check result dict:
          {"status": "ok",       "latency_ms": float}
          {"status": "unhealthy", "error": str}
          {"status": "unavailable", "error": "pool not initialised"}
    """
    repository = getattr(request.app.state, "repository", None)
    if repository is None:
        return {
            "status": "unavailable",
            "error": "StorageRepository not initialised on app.state",
        }

    t0 = time.monotonic()
    try:
        result = await asyncio.wait_for(
            repository.ping(),
            timeout=timeout,
        )
        latency_ms = round((time.monotonic() - t0) * 1000, 2)

        if result:
            return {"status": "ok", "latency_ms": latency_ms}
        else:
            return {
                "status": "unhealthy",
                "latency_ms": latency_ms,
                "error": "DB ping returned unexpected result",
            }

    except asyncio.TimeoutError:
        return {
            "status": "unhealthy",
            "error": f"DB ping timed out after {timeout}s",
        }
    except Exception as exc:
        return {
            "status": "unhealthy",
            "error": f"DB ping failed: {type(exc).__name__}: {exc}",
        }


def _check_pipeline(*, request: Request) -> dict[str, Any]:
    """
    Verify that the IngestionPipeline is initialised and its process pool is live.

    This is a synchronous check (no I/O) — it inspects pipeline._process_pool
    to confirm the ProcessPoolExecutor is not None and has not been shut down.

    Args:
        request: FastAPI Request (used to access app.state.pipeline).

    Returns:
        Check result dict:
          {"status": "ok",          "workers": int, "active_batches": int}
          {"status": "degraded",    "error": str}
          {"status": "unavailable", "error": str}
    """
    pipeline = getattr(request.app.state, "pipeline", None)
    if pipeline is None:
        return {
            "status": "unavailable",
            "error": "IngestionPipeline not initialised on app.state",
        }

    # Check if the ProcessPoolExecutor is alive.
    # _process_pool is set to None in stop() — if it is None here, the
    # pipeline was shut down or never started.
    process_pool = getattr(pipeline, "_process_pool", None)
    if process_pool is None:
        return {
            "status": "degraded",
            "error": "ProcessPoolExecutor is None — pipeline not started or already stopped",
        }

    return {
        "status": "ok",
        "workers": getattr(pipeline, "worker_count", -1),
        "active_batches": getattr(pipeline, "active_batches", -1),
    }


def _check_pool_stats(*, request: Request) -> dict[str, Any]:
    """
    Return asyncpg connection pool statistics without executing a query.

    Reads pool size and idle count from the pool object directly (O(1), no I/O).

    Args:
        request: FastAPI Request (used to access app.state.db_pool).

    Returns:
        Stats dict or unavailable indicator.
    """
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        return {"status": "unavailable", "error": "pool not initialised"}

    try:
        size = pool.get_size()
        idle = pool.get_idle_size()
        used = size - idle
        return {
            "status": "ok",
            "size": size,
            "idle": idle,
            "used": used,
            "min_size": pool.get_min_size(),
            "max_size": pool.get_max_size(),
        }
    except Exception as exc:
        return {"status": "degraded", "error": str(exc)}
