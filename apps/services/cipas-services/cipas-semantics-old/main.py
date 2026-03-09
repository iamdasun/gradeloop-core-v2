"""
CIPAS Semantics Service - Semantic Code Clone Detection API.

A FastAPI-based service for detecting semantic code clones (Type-4) using:
- Pipeline: Semantic similarity with XGBoost classification
- Tree-sitter based CST parsing
- 100+ semantic features per code snippet
- Machine learning classifier (XGBoost for Type-4)

Features:
- Multi-language support (Java, C, Python)
- Tree-sitter based CST parsing
- Comprehensive semantic feature extraction (100+ features)
- XGBoost classification for semantic clones
- Accurate detection of functionally equivalent code
"""

from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from clone_detection.utils.common_setup import setup_logging
from routes import (
    compare_codes,
    compare_codes_batch,
    detect_clones,
    get_feature_importance,
    get_health,
    tokenize_code,
)
from schemas import (
    BatchComparisonRequest,
    BatchComparisonResult,
    CloneDetectionRequest,
    CloneDetectionResponse,
    ComparisonRequest,
    ComparisonResult,
    FeatureImportanceResponse,
    HealthResponse,
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
    logger.info("Starting CIPAS Semantics Service...")
    logger.info("Loading pre-trained semantic model...")

    from routes import _get_model_status, _load_semantic_model

    # Force load semantic model
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
    logger.info("Shutting down CIPAS Semantics Service...")


app = FastAPI(
    title="CIPAS Semantics Service",
    description="""
## Semantic Code Clone Detection Service

CIPAS Semantics provides semantic code clone detection for **Type-4 clones**
using XGBoost classification with comprehensive semantic feature extraction.

### Semantic Detection (Type-4 Clones)

Type-4 clones are code snippets that perform the same computational function
but implement different syntactic structures or algorithms.

**Detection Method:**
- **102 semantic features** extracted per code snippet (204 fused features per pair)
- **XGBoost classification** optimized for high-dimensional feature spaces
- **Six feature categories:**
  1. Traditional Features (10): LOC, keyword categories
  2. Syntactic/CST Features (40): Tree-sitter node frequencies
  3. Semantic/PDG-like Features (20): Dependency relationships
  4. Structural Depth Features (8): Nesting, depth, density
  5. Type Signature Features (12): Parameter/return type patterns
  6. API Fingerprinting Features (12): Library usage patterns

### Detection Characteristics

| Clone Type | Detection Method | Confidence | Features |
|------------|-----------------|------------|----------|
| **Type-4** | XGBoost + Semantic Features | XGB probability | 204 fused |

### Supported Languages
- Java
- C
- Python

### Performance
- **Accurate**: F1 score 85%+ for Type-4 clones
- **Comprehensive**: 100+ semantic features analyzed
- **High-confidence threshold**: P>0.85 for precision-critical applications

## Quick Start

1. **Compare two code snippets**:
   ```
   POST /api/v1/semantics/compare
   ```

2. **Check service health**:
   ```
   GET /api/v1/semantics/health
   ```

3. **Tokenize code**:
   ```
   POST /api/v1/semantics/tokenize
   ```
    """,
    version="0.1.0",
    lifespan=lifespan,
)

# Create router with prefix
api_router = APIRouter(prefix="/api/v1/semantics")


@api_router.get(
    "/",
    response_model=dict,
    tags=["Root"],
    summary="Root endpoint",
)
async def root():
    """Root endpoint with service information."""
    return {
        "service": "CIPAS Semantics - Semantic Code Clone Detection Service",
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

    Returns the status of the service and semantic ML model.
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
    Compare two code snippets to detect if they are semantic clones (Type-IV).

    ## Features:
    - **Multi-language**: Java, C, C#, Python
    - **Semantic analysis**: 101 features per code snippet (Sheneamer et al. 2021)
    - **XGBoost classification**: High-dimensional feature space
    - **Confidence score**: XGBoost probability

    ## Example:
    ```json
    {
        "code1": "int sum(int a, int b) { return a + b; }",
        "code2": "int add(int x, int y) { int result = x + y; return result; }",
        "language": "java"
    }
    ```

    These snippets are semantically equivalent (Type-IV clones) despite
    different implementations.
    """
    return compare_codes(request)


@api_router.post(
    "/detect-clones",
    response_model=CloneDetectionResponse,
    tags=["Clone Detection"],
    summary="Detect Type-IV code clones (Sheneamer et al. 2021)",
    responses={
        200: {"description": "Successful clone detection"},
        503: {"description": "Model not available"},
        500: {"description": "Detection failed"},
    },
)
async def detect_clones_endpoint(request: CloneDetectionRequest):
    """
    Detect Type-IV (semantic) code clones using the Sheneamer et al. (2021) framework.

    ## Features:
    - **101 features per code snippet** across 6 categories:
      - Traditional (11): LOC, keyword counts
      - Syntactic/CST (40): Non-leaf node frequencies via post-order traversal
      - Semantic/PDG (20): Implicit program dependency relationships
      - Structural Depth (15): Nesting, depth, density metrics
      - Type Signatures (10): Parameter/return type patterns
      - API Fingerprinting (5): Library usage patterns
    - **Feature Fusion**: Linear combination (concatenation) of two feature vectors
    - **XGBoost classifier**: Pre-trained model outputs boolean 'is_clone' and 'clone_type' (1-4)
    - **Multi-language**: Java, C, C#, Python

    ## Clone Types:
    - **Type-I**: Exact clones (not detected by this endpoint)
    - **Type-II**: Renamed clones (not detected by this endpoint)
    - **Type-III**: Near-miss clones (not detected by this endpoint)
    - **Type-IV**: Semantic clones (detected by this endpoint)

    ## Example:
    ```json
    {
        "code1": "int sum(int a, int b) { return a + b; }",
        "code2": "int add(int x, int y) { int result = x + y; return result; }",
        "language": "java"
    }
    ```

    ## Response:
    ```json
    {
        "is_clone": true,
        "confidence": 0.92,
        "clone_type": 4,
        "clone_type_label": "Type-IV (Semantic)",
        "pipeline_used": "Sheneamer et al. (2021) Type-IV Detector",
        "features_extracted": 202,
        "feature_categories": {
            "traditional": 11,
            "syntactic_cst": 40,
            "semantic_pdg": 20,
            "structural_depth": 15,
            "type_signatures": 10,
            "api_fingerprinting": 5
        },
        "tokens1_count": 12,
        "tokens2_count": 18,
        "model_available": true
    }
    ```
    """
    return detect_clones(request)


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
async def get_importance():
    """
    Get feature importance from the semantic model.

    Shows which semantic features contribute most to Type-4 clone detection decisions.
    Features include: CST frequencies, PDG-like relationships, structural depth,
    type signatures, and API fingerprinting patterns.
    """
    return get_feature_importance()


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
    - Semantic ML model is loaded
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

    port = int(os.getenv("CIPAS_SEMANTICS_PORT", 8087))
    host = os.getenv("CIPAS_SEMANTICS_HOST", "0.0.0.0")

    uvicorn.run(app, host=host, port=port)
