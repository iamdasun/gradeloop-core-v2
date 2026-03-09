"""
CIPAS AI Detection Service - FastAPI Application
Detects AI-generated code likelihood using a UniXcoder-based classifier.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse

from src.models import AIDetectionModel
from src.schemas import CodeSnippetRequest, AIDetectionResponse, HealthResponse

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Global model instance
detection_model: AIDetectionModel = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - load model on startup."""
    global detection_model

    model_dir = os.getenv("CIPAS_AI_MODEL_DIR", "./model")
    device = os.getenv("CIPAS_AI_DEVICE", "cpu")

    logger.info(f"Loading AI detection model from {model_dir} on device {device}")

    try:
        detection_model = AIDetectionModel(model_dir=model_dir, device=device)
        detection_model.load()
        logger.info("✅ AI detection model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        raise

    yield

    logger.info("Shutting down AI detection service")


# Create FastAPI app
app = FastAPI(
    title="CIPAS AI Detection Service",
    description="Detects AI-generated code likelihood using a UniXcoder-based classifier",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/api/v1/ai/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        model_loaded=detection_model.is_ready() if detection_model else False,
    )


@app.get("/api/v1/ai/ready", response_model=HealthResponse, tags=["Health"])
async def readiness_check():
    """Readiness check - verifies model is loaded and ready."""
    if detection_model is None or not detection_model.is_ready():
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "model_loaded": False},
        )

    return HealthResponse(status="ready", model_loaded=True)


@app.post(
    "/api/v1/ai/detect",
    response_model=AIDetectionResponse,
    tags=["Detection"],
    summary="Detect AI-generated code",
    description="Analyzes a code snippet and returns the likelihood that it was AI-generated",
)
async def detect_ai_code(request: CodeSnippetRequest) -> AIDetectionResponse:
    """
    Detect whether a code snippet is AI-generated.

    Args:
        request: CodeSnippetRequest containing the code to analyze

    Returns:
        AIDetectionResponse with prediction and confidence scores

    Raises:
        HTTPException: If model is not loaded or prediction fails
    """
    if detection_model is None or not detection_model.is_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI detection model is not loaded",
        )

    try:
        is_ai, confidence, ai_likelihood, human_likelihood = detection_model.predict(
            request.code
        )

        return AIDetectionResponse(
            is_ai_generated=is_ai,
            confidence=confidence,
            ai_likelihood=ai_likelihood,
            human_likelihood=human_likelihood,
        )

    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}",
        )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with service information."""
    return {
        "service": "CIPAS AI Detection Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/v1/ai/health",
            "ready": "/api/v1/ai/ready",
            "detect": "/api/v1/ai/detect",
        },
    }


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("CIPAS_AI_HOST", "0.0.0.0")
    port = int(os.getenv("CIPAS_AI_PORT", "8087"))

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=os.getenv("ENVIRONMENT", "production") == "development",
    )
