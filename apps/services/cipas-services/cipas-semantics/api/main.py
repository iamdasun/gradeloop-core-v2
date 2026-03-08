"""
Semantic Clone Detection API - Main Application

FastAPI-based service for detecting semantic clones in code
using GraphCodeBERT-based deep learning model.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .endpoints.detection import router as detection_router
from .models.inference import SemanticCloneDetector

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s | %(name)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup/shutdown events
    """
    # Startup
    logger.info("=" * 60)
    logger.info("🚀 Starting Semantic Clone Detection API")
    logger.info("=" * 60)

    try:
        logger.info(f"📦 Loading model from: {settings.MODEL_DIR}")
        logger.info(f"💻 Using device: {settings.DEVICE}")

        # Initialize detector
        global detector
        detector = SemanticCloneDetector(
            model_dir=settings.MODEL_DIR,
            device=settings.DEVICE,
            threshold=settings.CLONE_THRESHOLD,
        )

        logger.info("✓ Model loaded successfully")
        logger.info(f"📊 Model: {detector.config.get('model_name')}")
        logger.info(f"📏 Max length: {detector.config.get('max_length')}")
        logger.info(f"🎯 Threshold: {settings.CLONE_THRESHOLD}")

    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        raise

    yield

    # Shutdown
    logger.info("👋 Shutting down Semantic Clone Detection API")


def create_app() -> FastAPI:
    """
    Application factory for creating FastAPI app instance
    """
    app = FastAPI(
        title=settings.API_TITLE,
        version=settings.API_VERSION,
        description=settings.API_DESCRIPTION,
        lifespan=lifespan,
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure appropriately for production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(detection_router, prefix="/api/v1")

    # Root endpoint
    @app.get("/", tags=["Root"])
    async def root():
        """Root endpoint with API information"""
        return {
            "name": settings.API_TITLE,
            "version": settings.API_VERSION,
            "docs": "/docs",
            "health": "/api/v1/health",
        }

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG
    )
