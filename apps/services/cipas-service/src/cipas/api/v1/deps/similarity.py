# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/deps/similarity.py
"""
FastAPI dependency providers for the similarity scoring pipeline.

Mirrors the pattern established in cipas/api/v1/deps/db.py for the ingestion
pipeline:  infrastructure objects are stored on app.state during the FastAPI
lifespan and accessed here via typed dependency provider functions.

Dependency providers defined here:
  - get_similarity_repository()  → SimilarityRepository
  - get_similarity_pipeline()    → SimilarityScoringPipeline

Both providers read from `request.app.state`.  If the object is not present
(service still starting, or startup failed), the provider raises HTTP 503
with a structured error body rather than propagating an AttributeError.

Usage in route handlers:

    from cipas.api.v1.deps.similarity import (
        SimilarityRepositoryDep,
        SimilarityPipelineDep,
    )

    @router.post("/submissions/{id}/similarity-analysis")
    async def run_analysis(
        id: UUID,
        body: SimilarityAnalysisRequest,
        sim_repo: SimilarityRepositoryDep,
        sim_pipeline: SimilarityPipelineDep,
    ) -> SimilarityAnalysisResponse:
        ...
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from cipas.similarity.scorer import SimilarityScoringPipeline
from cipas.storage.similarity_repository import SimilarityRepository

# ---------------------------------------------------------------------------
# SimilarityRepository dependency
# ---------------------------------------------------------------------------


async def get_similarity_repository(request: Request) -> SimilarityRepository:
    """
    FastAPI dependency: return the application-wide SimilarityRepository instance.

    The repository is stored on app.state.similarity_repository by the lifespan
    function in main.py.  If it is not present (startup failed or not yet
    complete), returns HTTP 503 with a structured error body.

    Returns:
        SimilarityRepository — the typed async data access layer for similarity
        scoring records (similarity_reports, clone_matches, granule fetching).

    Raises:
        HTTP 503: If the repository is not initialised.
    """
    repository: SimilarityRepository | None = getattr(
        request.app.state, "similarity_repository", None
    )
    if repository is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SIMILARITY_REPOSITORY_UNAVAILABLE",
                "detail": (
                    "The similarity repository is not available. "
                    "The service may still be starting up or the database "
                    "connection failed during initialisation."
                ),
            },
        )
    return repository


# ---------------------------------------------------------------------------
# SimilarityScoringPipeline dependency
# ---------------------------------------------------------------------------


async def get_similarity_pipeline(request: Request) -> SimilarityScoringPipeline:
    """
    FastAPI dependency: return the application-wide SimilarityScoringPipeline instance.

    The pipeline is stored on app.state.similarity_pipeline by the lifespan
    function in main.py.  It holds a live ProcessPoolExecutor for parallel LCS
    workers.  If it is not present (startup failed or warm-up still in progress),
    returns HTTP 503.

    Returns:
        SimilarityScoringPipeline — the async orchestrator for the three-stage
        scoring pipeline (pre-filter → LCS → thresholding).

    Raises:
        HTTP 503: If the pipeline is not initialised.
    """
    pipeline: SimilarityScoringPipeline | None = getattr(
        request.app.state, "similarity_pipeline", None
    )
    if pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SIMILARITY_PIPELINE_UNAVAILABLE",
                "detail": (
                    "The similarity scoring pipeline is not available. "
                    "The service may still be warming up the LCS worker pool."
                ),
            },
        )
    return pipeline


# ---------------------------------------------------------------------------
# Annotated type aliases (FastAPI 0.111+ convenience syntax)
# ---------------------------------------------------------------------------

SimilarityRepositoryDep = Annotated[
    SimilarityRepository, Depends(get_similarity_repository)
]
SimilarityPipelineDep = Annotated[
    SimilarityScoringPipeline, Depends(get_similarity_pipeline)
]


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "get_similarity_repository",
    "get_similarity_pipeline",
    "SimilarityRepositoryDep",
    "SimilarityPipelineDep",
]
