"""
CIPAS Syntactics Service - Syntactic Code Clone Detection API.

A FastAPI-based service for detecting syntactic code clones (Type-1/2/3) using:
- Pipeline: Syntactic similarity with automatic cascade detection
- Tree-sitter based CST parsing
- Machine learning classifier (XGBoost for Type-3)

Features:
- Multi-language support (Java, C, Python)
- Tree-sitter based CST parsing
- NiCad-style normalization for Type-1/2 detection
- TOMA approach with XGBoost for Type-3 detection
- Fast (~65x faster than neural approaches)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException, status

from clone_detection.utils.common_setup import setup_logging
from routes import (
    cluster_assignment,
    compare_codes,
    compare_codes_batch,
    get_collusion_report,
    get_feature_importance,
    get_health,
    get_index_status,
    ingest_submission,
    register_template,
    tokenize_code,
    get_similarity_report,
    create_annotation,
    get_annotations,
    update_annotation,
    get_annotation_stats,
    export_similarity_report_csv,
)
from schemas import (
    AssignmentClusterRequest,
    AssignmentClusterResponse,
    BatchComparisonRequest,
    BatchComparisonResult,
    CollusionReportResponse,
    ComparisonRequest,
    ComparisonResult,
    FeatureImportanceResponse,
    HealthResponse,
    IndexStatusResponse,
    IngestionResponse,
    SubmissionIngestRequest,
    TemplateRegisterRequest,
    TemplateRegisterResponse,
    TokenizeRequest,
    TokenizeResponse,
    CreateAnnotationRequest,
    UpdateAnnotationRequest,
    AnnotationResponse,
    AnnotationStatsResponse,
    SimilarityReportMetadata,
)

# Configure logging
logger = setup_logging(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.

    Runs setup on startup and cleanup on shutdown.
    """
    # Startup: Load models and initialize database
    logger.info("Starting CIPAS Syntactics Service...")
    logger.info("Loading pre-trained syntactic model...")

    from routes import _get_model_status, _load_syntactic_model
    from database import init_db_pool, close_db_pool

    # Initialize database connection pool
    try:
        await init_db_pool()
        logger.info("Database connection pool initialized successfully")
    except Exception as e:
        logger.warning(f"Failed to initialize database pool: {e}. Running without persistence.")

    # Force load syntactic model
    _load_syntactic_model()

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
    logger.info("Shutting down CIPAS Syntactics Service...")
    try:
        await close_db_pool()
        logger.info("Database connection pool closed successfully")
    except Exception as e:
        logger.warning(f"Error closing database pool: {e}")


app = FastAPI(
    title="CIPAS Syntactics Service",
    description="""
## Syntactic Code Clone Detection Service

CIPAS Syntactics provides syntactic code clone detection for **Type-1, Type-2, and Type-3 clones**
using an automatic cascade detection pipeline.

### Automatic Cascade Detection

The service uses a three-tier cascade strategy:

**Phase One: NiCad-Style Normalization**
- **Pass A**: Literal comparison (Type-1, threshold ≥ 0.98)
- **Pass B**: Blinded comparison (Type-2, threshold ≥ 0.95)

**Phase Two: TOMA Approach (Type-3)**
- Token Frequency Vector + Token Sequence Stream
- XGBoost classification with 6 syntactic features

### Detection Characteristics

| Clone Type | Detection Method | Confidence |
|------------|-----------------|------------|
| **Type-1** | Literal CST comparison | 1.0 (exact) |
| **Type-2** | Blinded CST comparison | ~0.95-0.99 |
| **Type-3** | TOMA + XGBoost | XGBoost probability |

### Supported Languages
- Java
- C
- Python

### Performance
- **Fast**: ~65x faster than neural network approaches
- **Accurate**: F1 score 90%+ for Type-3 clones
- **Early Exit**: Type-1/2 clones detected in <10ms

## Quick Start

1. **Compare two code snippets**:
   ```
   POST /api/v1/syntactics/compare
   ```

2. **Check service health**:
   ```
   GET /api/v1/syntactics/health
   ```

3. **Tokenize code**:
   ```
   POST /api/v1/syntactics/tokenize
   ```
    """,
    version="0.1.0",
    lifespan=lifespan,
)

# Create router with prefix
api_router = APIRouter(prefix="/api/v1/syntactics")


@api_router.get(
    "/",
    response_model=dict,
    tags=["Root"],
    summary="Root endpoint",
)
async def root():
    """Root endpoint with service information."""
    return {
        "service": "CIPAS Syntactics - Syntactic Code Clone Detection Service",
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

    Returns the status of the service and syntactic ML model.
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
    Compare two code snippets to detect if they are syntactic clones.

    ## Features:
    - **Multi-language**: Java, C, Python
    - **Automatic cascade**: Type-1 → Type-2 → Type-3 detection
    - **Confidence score**: ML-based probability
    - **Clone type**: Automatic classification (Type-1/2/3)

    ## Example:
    ```json
    {
        "code1": "public int foo(int x) { return x + 1; }",
        "code2": "public int bar(int y) { return y + 1; }",
        "language": "java"
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
async def get_importance():
    """
    Get feature importance from the syntactic model.

    Shows which features contribute most to Type-3 clone detection decisions.
    Features include: Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler.
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
    - Syntactic ML model is loaded
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


# ── Phase 1–4 Pipeline Endpoints ────────────────────────────────────────────

@api_router.post(
    "/submissions/ingest",
    response_model=IngestionResponse,
    tags=["Pipeline"],
    summary="Ingest a student submission",
    responses={
        200: {"description": "Submission processed successfully"},
        500: {"description": "Ingestion failed"},
    },
)
async def ingest_submission_endpoint(request: SubmissionIngestRequest):
    """
    Run a student submission through the full Phase 1–4 pipeline:

    1. **Segmentation** — structural blocks + sliding windows
    2. **Template Filtering** — discard instructor skeleton fragments
    3. **LSH Indexing** — 128-permutation MinHash signature + bucket insertion
    4. **Candidate Retrieval** — query LSH buckets (O(1), ~95 % reduction)
    5. **Cascade Detection** — Type-1 → Type-2 → Type-3 (XGBoost)
    6. **Graph Update** — add confirmed edges to the collusion graph

    Returns fragment count, candidate pairs, and confirmed clone matches.
    """
    return ingest_submission(request)


@api_router.post(
    "/templates/register",
    response_model=TemplateRegisterResponse,
    tags=["Pipeline"],
    summary="Register instructor skeleton code",
)
async def register_template_endpoint(request: TemplateRegisterRequest):
    """
    Register instructor-provided skeleton / starter code for an assignment.

    Student fragments whose abstract token Jaccard similarity against any
    template fragment is ≥ 0.90 are silently discarded during ingestion,
    preventing false positives from shared starter code.
    """
    return register_template(request)


@api_router.get(
    "/collusion-report",
    response_model=CollusionReportResponse,
    tags=["Pipeline"],
    summary="Get collusion groups (connected components)",
)
async def collusion_report_endpoint(
    assignment_id: str | None = None,
    min_confidence: float = 0.0,
):
    """
    Compute connected components of the student clone graph.

    Each group represents a **potential collusion ring**: students whose
    submissions share confirmed clone fragments (Type-1, 2, or 3).

    Groups are ordered by size (largest first) then by maximum edge confidence.

    - ``min_confidence`` — filter out low-confidence edges (e.g. set 0.7 to
      see only high-confidence Type-3 matches).
    """
    return get_collusion_report(assignment_id=assignment_id, min_confidence=min_confidence)


@api_router.get(
    "/index/status",
    response_model=IndexStatusResponse,
    tags=["Pipeline"],
    summary="MinHash LSH index statistics",
)
async def index_status_endpoint():
    """
    Return statistics about the in-memory MinHash LSH index.

    Shows how many fragments are indexed, the Jaccard threshold used for
    bucketing, and the number of permutations in each signature.
    """
    return get_index_status()


@api_router.post(
    "/assignments/cluster",
    response_model=AssignmentClusterResponse,
    tags=["Pipeline"],
    summary="Cluster all submissions for an assignment",
    responses={
        200: {"description": "Clustering completed successfully"},
        500: {"description": "Clustering failed"},
    },
)
async def cluster_assignment_endpoint(request: AssignmentClusterRequest):
    """
    Send all student submissions for one assignment and receive back
    the **clone clusters** (potential collusion groups).

    ## Pipeline (per submission)
    1. **Segmentation** — split into structural blocks + sliding windows
    2. **Template Filtering** — discard fragments matching the instructor template
    3. **LSH Indexing** — 128-permutation MinHash + bucket insertion
    4. **Candidate Retrieval** — O(1) LSH query (~95 % workload reduction)
    5. **Cascade Detection** — Type-1 → Type-2 → Type-3 (XGBoost)
    6. **Graph Update** — confirmed pairs added to an isolated collusion graph

    Each call uses a **fresh, isolated pipeline** — results are self-contained
    and do not affect the global incremental-ingestion index.

    ## Example
    ```json
    {
      "assignment_id": "hw3",
      "language": "java",
      "instructor_template": "public class Solution { /* starter */ }",
      "submissions": [
        { "submission_id": "s1", "student_id": "alice", "source_code": "..." },
        { "submission_id": "s2", "student_id": "bob",   "source_code": "..." }
      ]
    }
    ```

    ## Response
    - `collusion_groups` — connected components of the clone graph; each group
      lists the students and the clone edges between them.
    - `per_submission` — fragment / candidate / clone counts per student.
    """
    return cluster_assignment(request)


# ── Similarity Reports & Annotations ────────────────────────────────────────

@api_router.get(
    "/reports/{assignment_id}",
    response_model=AssignmentClusterResponse,
    tags=["Reports"],
    summary="Get cached similarity report",
    responses={
        200: {"description": "Cached report retrieved successfully"},
        404: {"description": "Report not found"},
        500: {"description": "Database error"},
    },
)
async def get_similarity_report_endpoint(assignment_id: str):
    """
    Retrieve a cached similarity report for an assignment.

    Returns the full AssignmentClusterResponse if a report has been
    previously generated and persisted. If no report exists, returns 404.

    Use this endpoint to avoid re-running expensive clustering analysis
    when displaying the similarity dashboard to instructors.
    """
    return await get_similarity_report(assignment_id)


@api_router.get(
    "/reports/{assignment_id}/metadata",
    response_model=SimilarityReportMetadata,
    tags=["Reports"],
    summary="Get similarity report metadata",
    responses={
        200: {"description": "Report metadata retrieved"},
        404: {"description": "Report not found"},
    },
)
async def get_report_metadata_endpoint(assignment_id: str):
    """
    Get metadata about a cached similarity report without loading
    the full report data.

    Returns summary information like submission count, clone pairs,
    processing time, etc. Useful for dashboard previews.
    """
    from repositories import SimilarityReportRepository
    
    metadata = await SimilarityReportRepository.get_report_metadata(assignment_id)
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No similarity report found for assignment {assignment_id}"
        )
    return metadata


@api_router.post(
    "/annotations",
    response_model=AnnotationResponse,
    tags=["Annotations"],
    summary="Create instructor annotation",
    responses={
        201: {"description": "Annotation created successfully"},
        400: {"description": "Invalid request"},
        500: {"description": "Database error"},
    },
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation_endpoint(request: CreateAnnotationRequest):
    """
    Create a new instructor annotation for a clone match or plagiarism group.

    Instructors can mark matches as:
    - **Pending Review**: Needs further investigation
    - **Confirmed Plagiarism**: Academic integrity violation confirmed
    - **False Positive**: Not actually plagiarism
    - **Acceptable Collaboration**: Within allowed collaboration guidelines
    - **Requires Investigation**: Flagged for deeper review

    Either `match_id` or `group_id` must be provided.
    """
    return await create_annotation(request)


@api_router.patch(
    "/annotations/{annotation_id}",
    response_model=AnnotationResponse,
    tags=["Annotations"],
    summary="Update instructor annotation",
    responses={
        200: {"description": "Annotation updated successfully"},
        404: {"description": "Annotation not found"},
        500: {"description": "Database error"},
    },
)
async def update_annotation_endpoint(
    annotation_id: str,
    request: UpdateAnnotationRequest
):
    """
    Update an existing instructor annotation.

    Can update status, comments, and/or action taken.
    """
    return await update_annotation(annotation_id, request)


@api_router.get(
    "/annotations/assignment/{assignment_id}",
    response_model=list[AnnotationResponse],
    tags=["Annotations"],
    summary="Get annotations for assignment",
    responses={
        200: {"description": "Annotations retrieved successfully"},
        500: {"description": "Database error"},
    },
)
async def get_annotations_for_assignment_endpoint(
    assignment_id: str,
    status: str | None = None
):
    """
    Get all instructor annotations for an assignment.

    Optionally filter by annotation status (e.g., 'confirmed_plagiarism').
    """
    return await get_annotations(assignment_id, status)


@api_router.get(
    "/annotations/assignment/{assignment_id}/stats",
    response_model=AnnotationStatsResponse,
    tags=["Annotations"],
    summary="Get annotation statistics",
    responses={
        200: {"description": "Statistics retrieved successfully"},
        500: {"description": "Database error"},
    },
)
async def get_annotation_stats_endpoint(assignment_id: str):
    """
    Get statistics about annotations for an assignment.

    Returns counts by status: pending_review, confirmed_plagiarism,
    false_positive, acceptable_collaboration, requires_investigation.
    """
    return await get_annotation_stats(assignment_id)


@api_router.get(
    "/reports/{assignment_id}/export.csv",
    summary="Export similarity report as CSV",
    tags=["Similarity Reports"],
    responses={
        200: {"description": "CSV file downloaded", "content": {"text/csv": {}}},
        404: {"description": "Report not found"},
        500: {"description": "Export failed"},
    },
)
async def export_report_csv_endpoint(assignment_id: str):
    """
    Export the similarity report for an assignment as a CSV file.

    The CSV includes cluster information and all edges with their
    similarity scores, clone types, and related metadata.
    """
    return await export_similarity_report_csv(assignment_id)


# Include router in app
app.include_router(api_router)


if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.getenv("CIPAS_SYNTACTICS_PORT", 8086))
    host = os.getenv("CIPAS_SYNTACTICS_HOST", "0.0.0.0")

    uvicorn.run(app, host=host, port=port)
