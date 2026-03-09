"""
API endpoints for semantic clone detection
"""

import logging

from fastapi import APIRouter, HTTPException, status

from ..core.config import settings
from ..models.inference import SemanticCloneDetector
from ..schemas.schemas import (
    BatchCloneDetectionRequest,
    BatchCloneDetectionResponse,
    CloneDetectionRequest,
    CloneDetectionResponse,
    HealthResponse,
    ModelInfoResponse,
    SimilarityScoreRequest,
    SimilarityScoreResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Global detector instance (initialized on startup)
detector: SemanticCloneDetector = None


def get_detector() -> SemanticCloneDetector:
    """Get the detector instance"""
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model not loaded"
        )
    return detector


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint
    """
    try:
        det = get_detector()
        return HealthResponse(status="healthy", model_loaded=True, device=det.device)
    except HTTPException:
        return HealthResponse(
            status="unhealthy", model_loaded=False, device=settings.DEVICE
        )


@router.get("/ready", response_model=HealthResponse, tags=["Health"])
async def readiness_check():
    """
    Readiness check endpoint
    """
    try:
        det = get_detector()
        return HealthResponse(status="ready", model_loaded=True, device=det.device)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded",
        )


@router.get("/model/info", response_model=ModelInfoResponse, tags=["Model"])
async def get_model_info():
    """
    Get model information and configuration
    """
    det = get_detector()
    return ModelInfoResponse(
        model_name=det.config.get("model_name", settings.MODEL_NAME),
        max_length=det.config.get("max_length", settings.MAX_LENGTH),
        hidden_size=det.config.get("hidden_size", settings.HIDDEN_SIZE),
        dropout_rate=det.config.get("dropout_rate", settings.DROPOUT_RATE),
        device=det.device,
        threshold=det.threshold,
    )


@router.post(
    "/detect",
    response_model=CloneDetectionResponse,
    tags=["Detection"],
    summary="Detect semantic clones",
)
async def detect_clone(request: CloneDetectionRequest):
    """
    Detect whether two code snippets are semantic clones.

    This endpoint analyzes the semantic similarity between two code snippets
    using GraphCodeBERT-based model to determine if they implement the same
    functionality despite potential syntactic differences.
    """
    try:
        det = get_detector()
        result = det.predict(request.code1, request.code2)

        return CloneDetectionResponse(
            is_clone=result["is_clone"],
            confidence=result["confidence"],
            clone_probability=result["clone_probability"],
            not_clone_probability=result["not_clone_probability"],
        )
    except Exception as e:
        logger.error(f"Error during clone detection: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clone detection failed: {str(e)}",
        )


@router.post(
    "/detect/batch",
    response_model=BatchCloneDetectionResponse,
    tags=["Detection"],
    summary="Batch detect semantic clones",
)
async def detect_clone_batch(request: BatchCloneDetectionRequest):
    """
    Detect semantic clones for multiple code pairs in batch.

    This endpoint processes multiple pairs of code snippets efficiently
    using batch inference.
    """
    try:
        det = get_detector()

        # Convert request format to list of tuples
        pairs = [(pair[0], pair[1]) for pair in request.pairs]

        # Run batch prediction
        results = det.predict_batch(pairs)

        # Format responses
        responses = [
            CloneDetectionResponse(
                is_clone=r["is_clone"],
                confidence=r["confidence"],
                clone_probability=r["clone_probability"],
                not_clone_probability=r["not_clone_probability"],
            )
            for r in results
        ]

        return BatchCloneDetectionResponse(
            results=responses,
            total_pairs=len(responses),
            clone_count=sum(1 for r in responses if r.is_clone),
        )
    except Exception as e:
        logger.error(f"Error during batch clone detection: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch clone detection failed: {str(e)}",
        )


@router.post(
    "/similarity",
    response_model=SimilarityScoreResponse,
    tags=["Similarity"],
    summary="Get semantic similarity score",
)
async def get_similarity_score(request: SimilarityScoreRequest):
    """
    Get raw semantic similarity score between two code snippets.

    Returns a continuous score between 0 and 1, where 1 indicates
    identical semantics.
    """
    try:
        det = get_detector()
        score = det.get_similarity_score(request.code1, request.code2)

        return SimilarityScoreResponse(similarity_score=score)
    except Exception as e:
        logger.error(f"Error during similarity calculation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Similarity calculation failed: {str(e)}",
        )
