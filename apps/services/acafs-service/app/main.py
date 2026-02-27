"""FastAPI application for ACAFS Service."""

import asyncio
import signal
import sys
from contextlib import asynccontextmanager
from threading import Thread
from typing import AsyncGenerator

from fastapi import APIRouter, FastAPI, status
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.logging_config import configure_logging, get_logger
from app.schemas import SubmissionEvent
from app.services.messaging.rabbitmq_consumer import RabbitMQConsumer
from app.services.storage.minio_client import MinIOClient
from app.services.storage.postgres_client import PostgresClient
from app.workers.eval_worker import EvaluationWorker

logger = get_logger(__name__)

# Global state
consumer: RabbitMQConsumer | None = None
worker: EvaluationWorker | None = None
postgres_client: PostgresClient | None = None


async def process_message(event: SubmissionEvent) -> None:
    """Process a submission event from RabbitMQ.
    
    Args:
        event: Submission event
    """
    if worker:
        await worker.process_event(event)


def run_consumer() -> None:
    """Run RabbitMQ consumer in a separate thread."""
    global consumer
    settings = get_settings()
    
    consumer = RabbitMQConsumer(
        settings=settings,
        message_handler=lambda event: asyncio.run(process_message(event)),
    )
    
    try:
        consumer.start()
    except Exception as e:
        logger.error("consumer_thread_error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """Application lifespan manager.
    
    Handles startup and shutdown events.
    """
    global worker, postgres_client
    
    # Startup
    settings = get_settings()
    configure_logging(settings.log_level, settings.environment)
    
    logger.info(
        "acafs_service_starting",
        service=settings.service_name,
        version="0.1.0",
        environment=settings.environment,
    )
    
    # Initialize PostgreSQL client
    postgres_client = PostgresClient(settings.database_dsn)
    await postgres_client.connect()
    await postgres_client.ensure_tables()
    
    # Initialize MinIO client
    minio_client = MinIOClient(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket_name=settings.minio_bucket,
        use_ssl=settings.minio_use_ssl,
    )
    
    # Initialize evaluation worker
    worker = EvaluationWorker(
        settings=settings,
        minio_client=minio_client,
        postgres_client=postgres_client,
    )
    
    # Start RabbitMQ consumer in background thread
    consumer_thread = Thread(target=run_consumer, daemon=True)
    consumer_thread.start()
    
    logger.info("acafs_service_ready")
    
    yield
    
    # Shutdown
    logger.info("acafs_service_shutting_down")
    
    if consumer:
        consumer.stop()
    
    if worker:
        worker.close()
    
    if postgres_client:
        await postgres_client.close()
    
    logger.info("acafs_service_shutdown_complete")


# Load settings early for use in route handlers
settings = get_settings()


# Create API router with prefix
api_router = APIRouter(prefix="/api/v1/acafs")


@api_router.get("/health", tags=["health"])
async def health_check() -> JSONResponse:
    """Health check endpoint.
    
    Returns:
        Health status response
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": "0.1.0",
        },
    )


@api_router.get("/ready", tags=["health"])
async def readiness_check() -> JSONResponse:
    """Readiness check endpoint.
    
    Returns:
        Readiness status response
    """
    healthy = True
    checks = {}
    
    # Check PostgreSQL
    if postgres_client:
        try:
            # Simple connectivity check
            checks["postgres"] = "ok"
        except Exception as e:
            healthy = False
            checks["postgres"] = f"error: {e}"
    else:
        healthy = False
        checks["postgres"] = "not_initialized"
    
    # Check consumer
    if consumer:
        checks["rabbitmq_consumer"] = "running"
    else:
        healthy = False
        checks["rabbitmq_consumer"] = "not_running"
    
    status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if healthy else "not_ready",
            "checks": checks,
        },
    )


@api_router.get("/metrics", tags=["observability"])
async def metrics() -> JSONResponse:
    """Metrics endpoint for monitoring.
    
    Returns:
        Basic metrics response
    """
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "service": settings.service_name,
            "version": "0.1.0",
            # TODO: Add actual metrics (processed count, error rate, etc.)
        },
    )


@api_router.get("/languages", tags=["info"])
async def supported_languages() -> JSONResponse:
    """Get list of supported programming languages.
    
    Returns:
        List of supported languages
    """
    from app.services.evaluation.language_router import LanguageRouter
    
    router = LanguageRouter()
    languages = router.get_supported_languages()
    
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "languages": languages,
            "count": len(languages),
        },
    )


def signal_handler(sig, frame) -> None:
    """Handle shutdown signals gracefully."""
    logger.info("shutdown_signal_received", signal=sig)
    sys.exit(0)


# Create FastAPI app
app = FastAPI(
    title="ACAFS Service",
    description="Automated Code Analysis & Feedback System Engine for Gradeloop",
    version="0.1.0",
    lifespan=lifespan,
)

# Include API router
app.include_router(api_router)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


if __name__ == "__main__":
    import uvicorn
    
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.service_host,
        port=settings.service_port,
        log_level=settings.log_level.lower(),
        reload=settings.environment == "development",
    )
