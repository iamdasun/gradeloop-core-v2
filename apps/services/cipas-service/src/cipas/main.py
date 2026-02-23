from __future__ import annotations

from typing import Any, Optional

import uvicorn
from fastapi import FastAPI
from loguru import logger
from prometheus_fastapi_instrumentator import Instrumentator

from cipas.api.v1.routes.health import router as health_router
from cipas.core.config import Settings, configure_logging, get_settings


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    """
    Application factory for a minimal CIPAS service.
    """
    settings = settings or get_settings()

    # Configure logging once early
    configure_logging(settings)

    app = FastAPI(
        title="CIPAS - Code Integrity Analysis Service",
        version="0.1.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    # Instrumentation: Prometheus metrics on /metrics
    Instrumentator().instrument(app).expose(app, include_in_schema=False)

    # Include API v1 routers
    app.include_router(health_router, prefix="/api/v1")

    # attach settings for easy access
    app.state.settings = settings

    @app.on_event("startup")
    async def _startup() -> None:
        logger.info("cipas starting up (env=%s)", settings.ENV)

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        logger.info("cipas shutting down")

    @app.get("/", include_in_schema=False)
    async def _root() -> dict[str, Any]:
        return {"service": "cipas", "status": "running", "version": "0.1.0"}

    return app


# create top-level app for Uvicorn
app = create_app()


if __name__ == "__main__":
    settings = get_settings()
    configure_logging(settings)
    uvicorn.run("cipas.main:app", host="0.0.0.0", port=8000, log_config=None)
