"""
CIPAS Service - Code Clone Detection API.

A FastAPI-based service for detecting code clones using:
- Pipeline A: Syntactic similarity (Type-1/2/3 clones)
- Pipeline B: Semantic similarity (Type-4 clones)

Features:
- Multi-language support (Java, C, Python)
- Tree-sitter based CST parsing
- Machine learning classifiers (Random Forest, XGBoost)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, status

from clone_detection.utils.common_setup import setup_logging
from routes import (
    compare_codes,
    compare_codes_batch,
    get_feature_importance,
    get_health,
    tokenize_code,
)
from schemas import (
    BatchComparisonRequest,
    BatchComparisonResult,
    ComparisonRequest,
    ComparisonResult,
    FeatureImportanceResponse,
    HealthResponse,
    PipelineEnum,
    TokenizeRequest,
    TokenizeResponse,
)

# Configure logging
logger = setup_logging(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Runs setup on startup and cleanup on shutdown.
    """
    # Startup: Load models
    logger.info("Starting CIPAS Service...")
    logger.info("Loading pre-trained models...")

    from routes import (
        _get_model_status,
        _load_semantic_model,
        _load_syntactic_model,
    )

    # Force load both models
    _load_syntactic_model()
    _load_semantic_model()

    models = _get_model_status()
    for model_name, model_status in models.items():
        if model_status.available:
            logger.info(
                f"Model {model_name}: available={model_status.available}, loaded={model_status.loaded}"
            )
        else:
            logger.warning(f"Model {model_name}: not available ({model_status.error})")

    yield

    # Shutdown: Cleanup
    logger.info("Shutting down CIPAS Service...")


app = FastAPI(
    title="CIPAS Service",
    description="""
## Code Clone Detection Service

CIPAS (Code Clone Detection and Analysis Service) provides ML-powered code clone detection
using two complementary pipelines:

### Pipeline A: Syntactic Similarity (Type-1/2/3 Clones)
- Uses **Random Forest** classifier
- Features: Jaccard, Dice, Levenshtein, Jaro, Jaro-Winkler similarities
- Detects: Exact, renamed, and modified clones
- **Fast** (~65x faster than neural approaches)

### Pipeline B: Semantic Similarity (Type-4 Clones)
- Uses **XGBoost** classifier
- Features: 100+ fused features (CST + PDG-like)
- Detects: Semantic clones with different implementations
- **Accurate** for functionally equivalent code

### Supported Languages
- Java
- C
- Python

## Quick Start

1. **Compare two code snippets**:
   ```
   POST /api/v1/cipas/compare
   ```

2. **Check service health**:
   ```
   GET /api/v1/cipas/health
   ```

3. **Tokenize code**:
   ```
   POST /api/v1/cipas/tokenize
   ```
    """,
    version="0.1.0",
    lifespan=lifespan,
)

# Create router with prefix
api_router = APIRouter(prefix="/api/v1/cipas")


@api_router.get(
    "/",
    response_model=dict,
    tags=["Root"],
    summary="Root endpoint",
)
async def root():
    """Root endpoint with service information."""
    return {
        "service": "CIPAS - Code Clone Detection Service",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }


@api_router.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Health check",
)
async def health_check():
    """
    Check service health and model availability.

    Returns the status of the service and all ML models.
    """
    return get_health()


@api_router.post(
    "/compare",
    response_model=ComparisonResult,
    tags=["Comparison"],
    summary="Compare two code snippets",
    responses={
        200: {"description": "Successful comparison"},
        503: {"description": "Model not available"},
        500: {"description": "Comparison failed"},
    },
)
async def compare_two_codes(request: ComparisonRequest):
    """
    Compare two code snippets to detect if they are clones.

    ## Features:
    - **Multi-language**: Java, C, Python
    - **Two pipelines**: Syntactic (Type-1/2/3) and Semantic (Type-4)
    - **Confidence score**: ML-based probability
    - **Clone type**: Automatic classification

    ## Example:
    ```json
    {
        "code1": "public int foo(int x) { return x + 1; }",
        "code2": "public int bar(int y) { return y + 1; }",
        "language": "java",
        "pipeline": "both"
    }
    ```
    """
    return compare_codes(request)


@api_router.post(
    "/compare/batch",
    response_model=BatchComparisonResult,
    tags=["Comparison"],
    summary="Batch compare multiple code pairs",
)
async def compare_codes_batch_endpoint(request: BatchComparisonRequest):
    """
    Compare multiple code pairs in a single request.

    Useful for bulk analysis or dataset processing.
    Each pair is processed independently, and errors in one pair
    won't affect others.
    """
    return compare_codes_batch(request)


@api_router.get(
    "/feature-importance",
    response_model=FeatureImportanceResponse,
    tags=["Models"],
    summary="Get feature importance scores",
)
async def get_importance(pipeline: PipelineEnum):
    """
    Get feature importance from trained models.

    Shows which features contribute most to clone detection decisions.
    Useful for understanding model behavior and debugging.
    """
    return get_feature_importance(pipeline)


@api_router.post(
    "/tokenize",
    response_model=TokenizeResponse,
    tags=["Utilities"],
    summary="Tokenize source code",
)
async def tokenize_code_endpoint(request: TokenizeRequest):
    """
    Tokenize source code using Tree-sitter CST parsing.

    ## Features:
    - Language-aware tokenization
    - Optional identifier abstraction (variables → 'V')
    - Handles Java, C, and Python

    ## Example:
    ```json
    {
        "code": "int x = calculate(a, b);",
        "language": "java",
        "abstract_identifiers": true
    }
    ```

    Returns: `["int", "V", "=", "V", "(", "V", ",", "V", ")"]`
    """
    return tokenize_code(request)


# Additional helper endpoints
@api_router.get(
    "/models",
    response_model=dict,
    tags=["Models"],
    summary="Get model status",
)
async def get_models_status():
    """Get detailed status of all ML models."""
    from routes import _get_model_status

    return {"models": _get_model_status()}


@api_router.get(
    "/ready",
    response_model=dict,
    tags=["Health"],
    summary="Readiness check",
)
async def readiness_check():
    """
    Check if the service is ready to accept requests.

    This endpoint verifies that:
    - The application is running
    - ML models are loaded
    - All dependencies are available
    """
    from routes import _get_model_status

    models = _get_model_status()
    all_models_ready = all(
        model_status.available and model_status.loaded
        for model_status in models.values()
    )

    if all_models_ready:
        return {"status": "ready", "models_loaded": True}
    else:
        return {
            "status": "starting",
            "models_loaded": False,
            "details": models,
        }


# Include router in app
app.include_router(api_router)


if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.getenv("CIPAS_PORT", 8085))
    host = os.getenv("CIPAS_HOST", "0.0.0.0")

    uvicorn.run(app, host=host, port=port)
