# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/routes/similarity.py
"""
Similarity scoring route handlers for the CIPAS Track A API.

Endpoints:
  POST   /api/v1/cipas/submissions/{submission_id}/similarity-analysis
      Trigger a syntactic similarity scoring run comparing a subject submission
      against a second submission.  Runs the full three-stage pipeline
      (pre-filter → LCS → thresholding) and returns the completed report.

  GET    /api/v1/cipas/similarity-reports/{report_id}
      Return the full SimilarityReport by ID, including metrics and a summary
      of how many matches were found.

  GET    /api/v1/cipas/similarity-reports/{report_id}/matches
      Return the paginated list of CloneMatch entries for a report.
      Supports filtering by min_score and clone_type.

  GET    /api/v1/cipas/submissions/{submission_id}/similarity-reports
      List all similarity reports involving a given submission.

Design principles:
  - Route handlers are thin: validate inputs, delegate to the pipeline and
    repository, return shaped responses.  No scoring logic lives here.
  - The POST handler runs the pipeline synchronously within the HTTP request
    (matching the pattern of the ingestion pipeline).  For the POC batch-only
    scope this is acceptable.  A future async job pattern can be layered on top
    by changing the response to 202 Accepted and storing a job_id.
  - GranuleRecord objects are fetched from the DB by SimilarityRepository
    (not passed in the request body) to keep the request payload small.
  - All CIPASError subclasses are translated to RFC 7807 ProblemDetail by the
    global exception handler in main.py.

Error handling:
  - 404 when either submission_id or comparison_submission_id has no granules
    (checked before pipeline dispatch).
  - 400 when submission_id == comparison_submission_id (self-comparison guard).
  - 422 for Pydantic validation failures on the request body.
  - 503 when the DB pool or similarity pipeline is unavailable.
  - 500 for unexpected pipeline failures (wrapped as ScoringError).
"""

from __future__ import annotations

from typing import Any, Optional
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from loguru import logger

from cipas.api.v1.deps.db import RepositoryDep, SettingsDep
from cipas.api.v1.deps.similarity import SimilarityPipelineDep, SimilarityRepositoryDep
from cipas.core.exceptions import CIPASError
from cipas.similarity.models import (
    CloneMatchResponse,
    GranuleRecord,
    ScoringConfig,
    ScoringMetrics,
    SimilarityAnalysisRequest,
    SimilarityAnalysisResponse,
    SimilarityReport,
    SimilarityReportResponse,
    SimilarityReportStatus,
)

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/cipas",
    tags=["similarity"],
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Service initialising or DB unavailable"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Submission or report not found"},
        status.HTTP_422_UNPROCESSABLE_ENTITY: {
            "description": "Request validation failed"
        },
    },
)


# ---------------------------------------------------------------------------
# POST /api/v1/cipas/submissions/{submission_id}/similarity-analysis
# ---------------------------------------------------------------------------


@router.post(
    "/submissions/{submission_id}/similarity-analysis",
    summary="Trigger syntactic similarity analysis between two submissions",
    response_model=SimilarityAnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "Analysis complete. Returns the report ID, metrics, and clone count."
            )
        },
        400: {
            "description": (
                "Invalid request: submission_id equals comparison_submission_id, "
                "or a submission has no analysable granules."
            )
        },
        404: {"description": "One or both submission IDs not found in the system"},
        503: {"description": "Pipeline or database unavailable"},
    },
)
async def run_similarity_analysis(
    submission_id: uuid.UUID,
    body: SimilarityAnalysisRequest,
    settings: SettingsDep,
    repository: RepositoryDep,
    similarity_repository: SimilarityRepositoryDep,
    similarity_pipeline: SimilarityPipelineDep,
) -> SimilarityAnalysisResponse:
    """
    Run the three-stage syntactic similarity scoring pipeline.

    Processing flow:
        1. Validate that submission_id ≠ comparison_submission_id.
        2. Fetch GranuleRecord lists for both submissions from the DB.
        3. Guard: if either list is empty, return 400.
        4. Build ScoringConfig from request body + service defaults.
        5. Create a RUNNING SimilarityReport row in the DB.
        6. Run SimilarityScoringPipeline.run() (synchronous; holds the connection).
        7. Persist the completed report (COMPLETED or FAILED) and its matches.
        8. Return SimilarityAnalysisResponse.

    The response is returned synchronously after the pipeline completes.
    For large batches the client should set an appropriate HTTP timeout
    (recommended: 15 minutes for 1,000-granule corpora).

    Args:
        submission_id: UUID of the subject submission (from URL path).
        body:          Request body with comparison target and optional overrides.

    Returns:
        SimilarityAnalysisResponse with report_id, status, metrics, and
        clones_flagged count.
    """
    # ── Guard: self-comparison ────────────────────────────────────────────────
    if submission_id == body.comparison_submission_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SELF_COMPARISON",
                "detail": (
                    "submission_id and comparison_submission_id must be different. "
                    "Self-comparison is not supported."
                ),
            },
        )

    logger.info(
        "similarity-analysis: request received",
        submission_a=str(submission_id),
        submission_b=str(body.comparison_submission_id),
        assignment_id=str(body.assignment_id),
        threshold_override=body.syntactic_clone_threshold,
    )

    # ── Fetch granules for both submissions ───────────────────────────────────
    raw_granules_a = await similarity_repository.fetch_granules_for_submission(
        submission_id
    )
    raw_granules_b = await similarity_repository.fetch_granules_for_submission(
        body.comparison_submission_id
    )

    if not raw_granules_a:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SUBMISSION_NOT_FOUND",
                "detail": (
                    f"Submission {submission_id} has no analysable granules. "
                    "Ensure the submission was processed successfully before "
                    "running similarity analysis."
                ),
            },
        )

    if not raw_granules_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "COMPARISON_SUBMISSION_NOT_FOUND",
                "detail": (
                    f"Comparison submission {body.comparison_submission_id} has "
                    "no analysable granules. Ensure the submission was processed "
                    "successfully before running similarity analysis."
                ),
            },
        )

    # ── Build GranuleRecord lists ─────────────────────────────────────────────
    granules_a = [_row_to_granule_record(r) for r in raw_granules_a]
    granules_b = [_row_to_granule_record(r) for r in raw_granules_b]

    logger.info(
        "similarity-analysis: granules loaded",
        granules_a=len(granules_a),
        granules_b=len(granules_b),
    )

    # ── Build ScoringConfig ───────────────────────────────────────────────────
    # Per-request overrides take precedence over service defaults.
    base_threshold = settings.SYNTACTIC_CLONE_THRESHOLD
    base_jaccard = settings.JACCARD_PREFILTER_THRESHOLD

    config = ScoringConfig(
        syntactic_clone_threshold=(
            body.syntactic_clone_threshold
            if body.syntactic_clone_threshold is not None
            else base_threshold
        ),
        jaccard_prefilter_threshold=(
            body.jaccard_prefilter_threshold
            if body.jaccard_prefilter_threshold is not None
            else base_jaccard
        ),
        minhash_num_permutations=settings.MINHASH_PERMUTATIONS,
        lsh_num_bands=settings.LSH_NUM_BANDS,
        shingle_size=settings.SHINGLE_SIZE,
        lcs_worker_count=0,  # uses pipeline's configured worker count
    )

    # ── Create RUNNING report row ─────────────────────────────────────────────
    report_id = uuid.uuid4()
    running_report = SimilarityReport(
        id=report_id,
        submission_a_id=submission_id,
        submission_b_id=body.comparison_submission_id,
        assignment_id=body.assignment_id,
        config=config,
        status=SimilarityReportStatus.RUNNING,
    )

    await similarity_repository.create_report(running_report)

    logger.info(
        "similarity-analysis: report created, pipeline starting",
        report_id=str(report_id),
    )

    # ── Run the scoring pipeline ──────────────────────────────────────────────
    try:
        completed_report = await similarity_pipeline.run(
            report_id=report_id,
            submission_a_id=submission_id,
            submission_b_id=body.comparison_submission_id,
            assignment_id=body.assignment_id,
            granules_a=granules_a,
            granules_b=granules_b,
            config=config,
        )
    except Exception as exc:
        # Unexpected pipeline failure — mark report as FAILED and re-raise.
        logger.error(
            "similarity-analysis: pipeline raised unexpected exception",
            report_id=str(report_id),
            error=str(exc),
        )
        try:
            await similarity_repository.fail_report(report_id, f"Pipeline error: {exc}")
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SCORING_PIPELINE_ERROR",
                "detail": "The similarity scoring pipeline encountered an unexpected error.",
            },
        ) from exc

    # ── Persist completed report ──────────────────────────────────────────────
    try:
        await similarity_repository.complete_report(completed_report)
    except Exception as exc:
        logger.error(
            "similarity-analysis: failed to persist completed report",
            report_id=str(report_id),
            error=str(exc),
        )
        # Still return the in-memory result to the caller even if DB write failed.
        # The report row may be stale in the DB, but the client gets the result.

    logger.info(
        "similarity-analysis: complete",
        report_id=str(report_id),
        status=completed_report.status.value,
        clones_flagged=completed_report.metrics.clones_flagged
        if completed_report.metrics
        else 0,
    )

    return SimilarityAnalysisResponse(
        report_id=completed_report.id,
        submission_id=submission_id,
        comparison_submission_id=body.comparison_submission_id,
        assignment_id=body.assignment_id,
        status=completed_report.status,
        created_at=completed_report.created_at,
        metrics=completed_report.metrics,
        clones_flagged=(
            completed_report.metrics.clones_flagged if completed_report.metrics else 0
        ),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/similarity-reports/{report_id}
# ---------------------------------------------------------------------------


@router.get(
    "/similarity-reports/{report_id}",
    summary="Retrieve a similarity report by ID",
    response_model=SimilarityReportResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Report found and returned"},
        404: {"description": "Report not found"},
    },
)
async def get_similarity_report(
    report_id: uuid.UUID,
    similarity_repository: SimilarityRepositoryDep,
) -> SimilarityReportResponse:
    """
    Return the full SimilarityReport by primary key, including metrics.

    Does not return the match list inline (use GET /matches for that).

    Args:
        report_id: UUID of the report to retrieve.

    Returns:
        SimilarityReportResponse with status, config, and metrics.

    Raises:
        HTTP 404: Report not found.
    """
    row = await similarity_repository.get_report(report_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "REPORT_NOT_FOUND",
                "detail": f"Similarity report {report_id} does not exist.",
            },
        )

    return _row_to_report_response(row)


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/similarity-reports/{report_id}/matches
# ---------------------------------------------------------------------------


@router.get(
    "/similarity-reports/{report_id}/matches",
    summary="List clone matches for a similarity report",
    response_model=list[CloneMatchResponse],
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "List of clone matches (may be empty)"},
        404: {"description": "Report not found"},
    },
)
async def get_similarity_matches(
    report_id: uuid.UUID,
    similarity_repository: SimilarityRepositoryDep,
    limit: int = Query(
        default=100,
        ge=1,
        le=1000,
        description="Maximum number of matches to return",
    ),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    min_score: float = Query(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Only return matches with similarity_score >= min_score",
    ),
    clone_type: Optional[str] = Query(
        default=None,
        description='Filter by clone type: "type1" or "type2"',
        pattern="^(type1|type2)$",
    ),
) -> list[CloneMatchResponse]:
    """
    Return a paginated list of CloneMatch entries for a given report.

    Matches are always ordered by similarity_score descending (highest
    confidence first).

    Args:
        report_id:  UUID of the parent report.
        limit:      Page size (1–1000, default 100).
        offset:     Row offset for pagination.
        min_score:  Minimum similarity score filter.
        clone_type: Optional "type1" or "type2" filter.

    Returns:
        List of CloneMatchResponse, potentially empty.

    Raises:
        HTTP 404: Report not found (checked separately from empty match list).
    """
    # Verify report exists before querying matches.
    report_row = await similarity_repository.get_report(report_id)
    if report_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "REPORT_NOT_FOUND",
                "detail": f"Similarity report {report_id} does not exist.",
            },
        )

    rows = await similarity_repository.get_matches(
        report_id,
        limit=limit,
        offset=offset,
        min_score=min_score,
        clone_type=clone_type,
    )

    return [_row_to_match_response(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/submissions/{submission_id}/similarity-reports
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}/similarity-reports",
    summary="List all similarity reports involving a submission",
    response_model=list[dict[str, Any]],
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "List of report summaries (may be empty)"},
    },
)
async def list_submission_similarity_reports(
    submission_id: uuid.UUID,
    similarity_repository: SimilarityRepositoryDep,
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Maximum number of reports to return",
    ),
) -> list[dict[str, Any]]:
    """
    List all similarity reports where this submission is either the subject
    (submission_a) or the comparison target (submission_b).

    Reports are ordered by created_at descending (most recent first).

    Args:
        submission_id: UUID of the submission to look up.
        limit:         Maximum number of reports to return (1–200, default 50).

    Returns:
        List of report summary dicts.  Each dict contains:
          report_id, submission_a_id, submission_b_id, assignment_id,
          status, clones_flagged, pre_filter_rejection_rate,
          lcs_comparisons_run, duration_seconds, created_at, completed_at.
        Returns an empty list if no reports exist (not a 404).
    """
    rows = await similarity_repository.list_reports_for_submission(
        submission_id, limit=limit
    )
    # Normalise UUID fields to strings for JSON serialisation.
    return [_normalise_row(r) for r in rows]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _row_to_granule_record(row: dict[str, Any]) -> GranuleRecord:
    """Convert a raw DB row dict to a GranuleRecord."""
    return GranuleRecord(
        granule_id=uuid.UUID(str(row["granule_id"])),
        submission_id=uuid.UUID(str(row["submission_id"])),
        granule_hash=row["granule_hash"],
        granule_type=row["granule_type"],
        language=row["language"],
        normalized_source=row["normalized_source"] or "",
        start_line=row["start_line"],
        end_line=row["end_line"],
        name=row.get("name"),
    )


def _row_to_report_response(row: dict[str, Any]) -> SimilarityReportResponse:
    """Convert a similarity_reports DB row to a SimilarityReportResponse."""
    import json as _json

    config_raw = row.get("config_json") or {}
    if isinstance(config_raw, str):
        config_raw = _json.loads(config_raw)

    config = ScoringConfig(
        syntactic_clone_threshold=config_raw.get("syntactic_clone_threshold", 0.85),
        jaccard_prefilter_threshold=config_raw.get("jaccard_prefilter_threshold", 0.3),
        minhash_num_permutations=config_raw.get("minhash_num_permutations", 128),
        lsh_num_bands=config_raw.get("lsh_num_bands", 32),
        shingle_size=config_raw.get("shingle_size", 5),
        lcs_worker_count=config_raw.get("lcs_worker_count", 0),
    )

    metrics: Optional[ScoringMetrics] = None
    if row.get("total_pairs") is not None:
        metrics = ScoringMetrics(
            total_granule_pairs=int(row["total_pairs"]),
            pre_filter_candidates=int(row.get("pre_filter_candidates") or 0),
            lcs_comparisons_run=int(row.get("lcs_comparisons_run") or 0),
            pre_filter_rejection_rate=float(
                row.get("pre_filter_rejection_rate") or 0.0
            ),
            clones_flagged=int(row.get("clones_flagged") or 0),
            duration_seconds=float(row.get("duration_seconds") or 0.0),
        )

    return SimilarityReportResponse(
        report_id=uuid.UUID(str(row["id"])),
        submission_a_id=uuid.UUID(str(row["submission_a_id"])),
        submission_b_id=uuid.UUID(str(row["submission_b_id"])),
        assignment_id=uuid.UUID(str(row["assignment_id"])),
        status=SimilarityReportStatus(row["status"]),
        config=config,
        metrics=metrics,
        created_at=row["created_at"],
        completed_at=row.get("completed_at"),
        error_message=row.get("error_message"),
    )


def _row_to_match_response(row: dict[str, Any]) -> CloneMatchResponse:
    """Convert a clone_matches DB row to a CloneMatchResponse."""
    from cipas.similarity.models import CloneType

    return CloneMatchResponse(
        match_id=uuid.UUID(str(row["id"])),
        report_id=uuid.UUID(str(row["report_id"])),
        submission_id=uuid.UUID(str(row["submission_id"])),
        matched_submission_id=uuid.UUID(str(row["matched_submission_id"])),
        granule_a_id=uuid.UUID(str(row["granule_a_id"])),
        granule_b_id=uuid.UUID(str(row["granule_b_id"])),
        similarity_score=float(row["similarity_score"]),
        clone_type=CloneType(row["clone_type"]),
        snippet_match=row.get("snippet_match") or "",
        created_at=row["created_at"],
    )


def _normalise_row(row: dict[str, Any]) -> dict[str, Any]:
    """Normalise UUID and datetime fields in a raw DB dict for JSON output."""
    return {
        k: str(v) if hasattr(v, "hex") else v  # UUID → str
        for k, v in row.items()
    }


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = ["router"]
