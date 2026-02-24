# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/routes/evidence.py
"""
Clone evidence interpretation and visualization API routes.

Implements E15/US10: Clone Evidence Interpretation and Visualization for Instructors.

Endpoints:
  GET /api/v1/cipas/assignments/{assignment_id}/clone-graph
      Return a Sigma.js/Cytoscape.js-compatible graph representation of clone
      relationships for an assignment. Nodes are submissions, edges are clone
      pairs above the threshold.

  GET /api/v1/cipas/assignments/{assignment_id}/clone-classes
      Return clone classes (connected components) identified by Union-Find
      clustering. Each class represents a potential collusion ring.

  GET /api/v1/cipas/submissions/{submission_id}/clone-evidence/{matched_id}
      Return side-by-side code comparison evidence for a specific clone pair.
      Includes normalized code snippets and matching line numbers.

  GET /api/v1/cipas/assignments/{assignment_id}/evidence-report
      Return a comprehensive evidence report combining graph, classes, and
      match statistics in a single call.

Design principles:
  - Routes are thin: validate inputs, delegate to CloneEvidenceService.
  - All responses are JSON and compatible with frontend visualization libraries.
  - Thresholds are respected (only show edges ≥ course's clone_threshold).
  - Student names are redacted in logs; only shown in authenticated responses.

Performance targets:
  - Graph API: <500ms response time
  - Clustering: ≤100ms for 1k submissions
  - Evidence view: <300ms with code snippets
"""

from __future__ import annotations

from typing import Any, Dict, Optional
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from loguru import logger

from cipas.api.v1.deps.db import RepositoryDep
from cipas.api.v1.deps.similarity import SimilarityRepositoryDep
from cipas.similarity.evidence_models import (
    CloneClassListResponse,
    CloneClassSummary,
    CloneEvidenceResponse,
    CloneGraphResponse,
)
from cipas.similarity.evidence_service import CloneEvidenceService

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/cipas",
    tags=["evidence"],
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Service initialising or DB unavailable"
        },
        status.HTTP_404_NOT_FOUND: {
            "description": "Assignment or submission not found"
        },
    },
)


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/assignments/{assignment_id}/clone-graph
# ---------------------------------------------------------------------------


@router.get(
    "/assignments/{assignment_id}/clone-graph",
    summary="Get clone graph for visualization",
    response_model=CloneGraphResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "Graph data compatible with Sigma.js/Cytoscape.js. "
                "Nodes represent submissions, edges represent clone relationships."
            )
        },
        404: {"description": "Assignment not found"},
    },
)
async def get_clone_graph(
    assignment_id: uuid.UUID,
    repository: SimilarityRepositoryDep,
    threshold: float = Query(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score to include an edge",
    ),
    submission_names: Optional[str] = Query(
        default=None,
        description="Comma-separated list of submission_id:name pairs (e.g., 'uuid1:John,uuid2:Jane')",
    ),
) -> CloneGraphResponse:
    """
    Build and return a clone graph for an assignment.

    The graph is compatible with Sigma.js, Cytoscape.js, or D3 force-directed
    layouts. Each node represents a submission, and each edge represents a
    clone relationship with similarity score ≥ threshold.

    Args:
        assignment_id: The assignment UUID.
        threshold: Minimum similarity score to include an edge (default 0.85).
        submission_names: Optional comma-separated submission_id:name mapping.

    Returns:
        CloneGraphResponse with nodes and edges arrays.

    Performance:
        - Target: <500ms response time
        - Fetches all clone matches for the assignment
        - Builds graph in O(n + m) time
    """
    logger.info(
        "get_clone_graph: request",
        assignment_id=str(assignment_id),
        threshold=threshold,
    )

    # Parse submission names if provided
    names_dict: Dict[uuid.UUID, str] | None = None
    if submission_names:
        names_dict = {}
        for pair in submission_names.split(","):
            if ":" in pair:
                sub_id_str, name = pair.split(":", 1)
                try:
                    sub_id = uuid.UUID(sub_id_str.strip())
                    names_dict[sub_id] = name.strip()
                except ValueError:
                    pass  # Skip invalid UUIDs

    # Create service and build graph
    service = CloneEvidenceService(repository)

    try:
        graph = await service.build_clone_graph(
            assignment_id=assignment_id,
            threshold=threshold,
            submission_names=names_dict,
        )
    except Exception as exc:
        logger.error(
            "get_clone_graph: failed to build graph",
            assignment_id=str(assignment_id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "GRAPH_BUILD_ERROR",
                "detail": "Failed to build clone graph. Please try again.",
            },
        ) from exc

    # Check if graph is empty (assignment may not exist or have no clones)
    if graph.total_nodes == 0 and graph.total_edges == 0:
        # Check if assignment has any submissions at all
        # For now, return empty graph (not a 404)
        logger.warning(
            "get_clone_graph: empty graph returned",
            assignment_id=str(assignment_id),
        )

    logger.info(
        "get_clone_graph: complete",
        assignment_id=str(assignment_id),
        nodes=graph.total_nodes,
        edges=graph.total_edges,
    )

    return graph


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/assignments/{assignment_id}/clone-classes
# ---------------------------------------------------------------------------


@router.get(
    "/assignments/{assignment_id}/clone-classes",
    summary="Get clone classes (collusion rings)",
    response_model=CloneClassListResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "List of clone classes identified by Union-Find clustering. "
                "Each class represents a connected component of submissions "
                "linked by clone relationships (potential collusion ring)."
            )
        },
        404: {"description": "Assignment not found"},
    },
)
async def get_clone_classes(
    assignment_id: uuid.UUID,
    repository: SimilarityRepositoryDep,
    threshold: float = Query(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score to include a pair",
    ),
) -> CloneClassListResponse:
    """
    Cluster clone pairs into connected components using Union-Find.

    Each clone class represents a group of submissions connected by clone
    relationships. For example, if A↔B, B↔C, and C↔D are all clone pairs,
    they form a single clone class of size 4 (a potential collusion ring).

    Algorithm:
      - Union-Find with path compression and union by rank
      - Time complexity: O(n * α(n)) where α is inverse Ackermann function
      - For 1k submissions: ≤100ms

    Args:
        assignment_id: The assignment UUID.
        threshold: Minimum similarity score to include a pair (default 0.85).

    Returns:
        CloneClassListResponse with grouped clone classes.

    Example:
        Given 5 submissions forming a ring (A↔B, B↔C, C↔D, D↔E),
        returns 1 clone class with size=5.
    """
    logger.info(
        "get_clone_classes: request",
        assignment_id=str(assignment_id),
        threshold=threshold,
    )

    # Create service and cluster clones
    service = CloneEvidenceService(repository)

    try:
        classes = await service.cluster_clones(
            assignment_id=assignment_id,
            threshold=threshold,
        )
    except Exception as exc:
        logger.error(
            "get_clone_classes: failed to cluster",
            assignment_id=str(assignment_id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "CLUSTERING_ERROR",
                "detail": "Failed to cluster clone pairs. Please try again.",
            },
        ) from exc

    logger.info(
        "get_clone_classes: complete",
        assignment_id=str(assignment_id),
        classes=classes.total_classes,
        submissions=classes.total_submissions_involved,
    )

    return classes


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/submissions/{submission_id}/clone-evidence/{matched_id}
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}/clone-evidence/{matched_id}",
    summary="Get side-by-side code comparison evidence",
    response_model=CloneEvidenceResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "Side-by-side code comparison for a clone pair. "
                "Includes normalized code snippets and matching line numbers."
            )
        },
        404: {"description": "Submission or match not found"},
    },
)
async def get_clone_evidence(
    submission_id: uuid.UUID,
    matched_id: uuid.UUID,
    repository: SimilarityRepositoryDep,
    min_score: float = Query(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Minimum similarity score filter",
    ),
) -> CloneEvidenceResponse:
    """
    Get detailed code evidence for a specific clone pair.

    Returns normalized code snippets from both submissions along with the
    matching lines that contributed to the similarity score. This is the
    primary evidence view for instructors investigating academic integrity.

    Features:
      - Side-by-side normalized code (whitespace/comments removed)
      - Matching line numbers highlighted
      - Similarity score and clone type
      - Granule-level detail (function/class level)

    Args:
        submission_id: The subject submission UUID.
        matched_id: The matched submission UUID.
        min_score: Minimum similarity score filter (default 0.0).

    Returns:
        CloneEvidenceResponse with code snippets and matching lines.

    Performance:
        - Target: <300ms with code snippets
        - Fetches granule details and match data

    Edge cases:
        - No matching lines found → returns empty arrays
        - Multiple matches → returns the highest-scoring pair
    """
    logger.info(
        "get_clone_evidence: request",
        submission_a=str(submission_id),
        submission_b=str(matched_id),
        min_score=min_score,
    )

    # Create service and get evidence
    service = CloneEvidenceService(repository)

    try:
        evidence = await service.get_clone_evidence(
            submission_id=submission_id,
            matched_submission_id=matched_id,
            min_score=min_score,
        )
    except Exception as exc:
        logger.error(
            "get_clone_evidence: failed to fetch evidence",
            submission_a=str(submission_id),
            submission_b=str(matched_id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "EVIDENCE_FETCH_ERROR",
                "detail": "Failed to fetch clone evidence. Please try again.",
            },
        ) from exc

    # Check if evidence is empty (no match found)
    if not evidence.submission_a_code and not evidence.submission_b_code:
        logger.warning(
            "get_clone_evidence: no evidence found",
            submission_a=str(submission_id),
            submission_b=str(matched_id),
        )
        # Return empty evidence (not a 404, as the submissions may exist)

    logger.info(
        "get_clone_evidence: complete",
        submission_a=str(submission_id),
        submission_b=str(matched_id),
        score=evidence.similarity_score,
        clone_type=evidence.clone_type,
    )

    return evidence


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/assignments/{assignment_id}/evidence-report
# ---------------------------------------------------------------------------


@router.get(
    "/assignments/{assignment_id}/evidence-report",
    summary="Get comprehensive evidence report",
    response_model=dict[str, Any],
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "Comprehensive evidence report combining graph, clone classes, "
                "and match statistics in a single call."
            )
        },
        404: {"description": "Assignment not found"},
    },
)
async def get_evidence_report(
    assignment_id: uuid.UUID,
    repository: SimilarityRepositoryDep,
    threshold: float = Query(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Similarity threshold for inclusion",
    ),
) -> dict[str, Any]:
    """
    Get a comprehensive evidence report combining all evidence data.

    This is a convenience endpoint that returns graph data, clone classes,
    and summary statistics in a single call. Useful for dashboards or
    initial page loads.

    Args:
        assignment_id: The assignment UUID.
        threshold: Similarity threshold for inclusion (default 0.85).

    Returns:
        Dict with:
          - assignment_id: UUID
          - graph: CloneGraphResponse
          - clone_classes: CloneClassListResponse
          - total_matches: int
          - threshold: float
          - generated_at: datetime

    Performance:
        - Builds graph and clusters in parallel
        - Target: <600ms total
    """
    logger.info(
        "get_evidence_report: request",
        assignment_id=str(assignment_id),
        threshold=threshold,
    )

    # Create service and get full report
    service = CloneEvidenceService(repository)

    try:
        report = await service.get_full_evidence_report(
            assignment_id=assignment_id,
            threshold=threshold,
        )
    except Exception as exc:
        logger.error(
            "get_evidence_report: failed to build report",
            assignment_id=str(assignment_id),
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "REPORT_BUILD_ERROR",
                "detail": "Failed to build evidence report. Please try again.",
            },
        ) from exc

    logger.info(
        "get_evidence_report: complete",
        assignment_id=str(assignment_id),
        total_matches=report.get("total_matches", 0),
    )

    return report


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = ["router"]
