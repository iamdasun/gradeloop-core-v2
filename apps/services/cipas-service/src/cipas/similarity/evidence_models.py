# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/evidence_models.py
"""
Pydantic models for clone evidence interpretation and visualization.

This module defines the API request/response schemas for:
  - Clone graph visualization (Sigma.js/Cytoscape.js compatible)
  - Side-by-side code comparison evidence
  - Clone class summaries

These models support the E15/US10 user story: transforming raw similarity
scores into interpretable evidence for instructors.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Clone Graph API Models
# ---------------------------------------------------------------------------


class GraphNode(BaseModel):
    """
    A node in the clone graph representing a submission.

    Compatible with Sigma.js and Cytoscape.js node format.

    Attributes:
        id: Submission UUID as string.
        label: Display label (student name or submission ID prefix).
        size: Node size (can represent number of clones, submission size, etc.).
        submission_id: Original UUID for reference.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Submission UUID as string")
    label: str = Field(..., description="Display label (student name or ID)")
    size: int = Field(default=10, ge=5, le=50, description="Node visual size")
    submission_id: UUID = Field(..., description="Original submission UUID")


class GraphEdge(BaseModel):
    """
    An edge in the clone graph representing a clone relationship.

    Compatible with Sigma.js and Cytoscape.js edge format.

    Attributes:
        from_id: Source submission UUID as string.
        to_id: Target submission UUID as string.
        value: Similarity score in [0.0, 1.0].
        clone_type: "type1" (exact) or "type2" (renamed).
    """

    model_config = ConfigDict(from_attributes=True)

    from_id: str = Field(..., description="Source submission UUID")
    to_id: str = Field(..., description="Target submission UUID")
    value: float = Field(..., ge=0.0, le=1.0, description="Similarity score")
    clone_type: str = Field(..., description="Clone type: type1 or type2")


class CloneGraphResponse(BaseModel):
    """
    Response model for GET /api/v1/cipas/assignments/{id}/clone-graph.

    Returns a complete graph representation compatible with Sigma.js,
    Cytoscape.js, or D3 force-directed layouts.

    Attributes:
        assignment_id: The assignment this graph belongs to.
        nodes: List of submission nodes.
        edges: List of clone relationship edges.
        total_nodes: Number of unique submissions in the graph.
        total_edges: Number of clone relationships.
        threshold: The similarity threshold used for edge inclusion.
    """

    model_config = ConfigDict(from_attributes=True)

    assignment_id: str = Field(..., description="Assignment UUID")
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    total_nodes: int = Field(..., description="Number of unique submissions")
    total_edges: int = Field(..., description="Number of clone relationships")
    threshold: float = Field(..., description="Similarity threshold used")


# ---------------------------------------------------------------------------
# Clone Evidence API Models
# ---------------------------------------------------------------------------


class CloneEvidenceRequest(BaseModel):
    """
    Request model for clone evidence (optional, for POST variant).

    Attributes:
        threshold: Minimum similarity score to include (default 0.0).
        include_snippet: Whether to include code snippets (default True).
    """

    model_config = ConfigDict(from_attributes=True)

    threshold: float = Field(default=0.0, ge=0.0, le=1.0)
    include_snippet: bool = Field(default=True)


class CloneEvidenceResponse(BaseModel):
    """
    Response model for GET /api/v1/cipas/submissions/{id}/clone-evidence/{matched_id}.

    Provides side-by-side code comparison for a specific clone pair.

    Attributes:
        submission_id: The subject submission UUID.
        matched_submission_id: The matched submission UUID.
        submission_a_code: Normalized code from submission A.
        submission_b_code: Normalized code from submission B.
        matching_lines: List of line indices (0-based) that match.
        similarity_score: LCS similarity score in [0.0, 1.0].
        clone_type: "type1" (exact) or "type2" (renamed).
        granule_a_id: Granule ID from submission A.
        granule_b_id: Granule ID from submission B.
        snippet_start_line: Start line of the matching snippet.
        snippet_end_line: End line of the matching snippet.
    """

    model_config = ConfigDict(from_attributes=True)

    submission_id: str = Field(..., description="Subject submission UUID")
    matched_submission_id: str = Field(..., description="Matched submission UUID")
    submission_a_code: str = Field(..., description="Normalized code from submission A")
    submission_b_code: str = Field(..., description="Normalized code from submission B")
    matching_lines: List[int] = Field(
        default_factory=list,
        description="0-based line indices that match",
    )
    similarity_score: float = Field(..., ge=0.0, le=1.0)
    clone_type: str = Field(..., description="Clone type: type1 or type2")
    granule_a_id: str = Field(..., description="Granule ID from submission A")
    granule_b_id: str = Field(..., description="Granule ID from submission B")
    snippet_start_line: int = Field(..., ge=1, description="Start line of snippet")
    snippet_end_line: int = Field(..., ge=1, description="End line of snippet")


# ---------------------------------------------------------------------------
# Clone Class Models
# ---------------------------------------------------------------------------


class CloneClassSummary(BaseModel):
    """
    Summary of a clone class (connected component of submissions).

    Attributes:
        id: Clone class UUID.
        assignment_id: Assignment UUID.
        submission_ids: List of submission UUIDs in this class.
        size: Number of submissions in the class.
        avg_similarity: Average similarity score across all edges.
        pair_count: Number of clone pairs in this class.
        created_at: When the clone class was identified.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Clone class UUID")
    assignment_id: str = Field(..., description="Assignment UUID")
    submission_ids: List[str] = Field(..., description="Submission UUIDs in class")
    size: int = Field(..., ge=2, description="Number of submissions")
    avg_similarity: float = Field(..., ge=0.0, le=1.0)
    pair_count: int = Field(..., ge=1)
    created_at: datetime


class CloneClassListResponse(BaseModel):
    """
    Response model for listing clone classes.

    Attributes:
        assignment_id: The assignment these clone classes belong to.
        total_classes: Total number of clone classes.
        total_submissions_involved: Unique submissions across all classes.
        classes: List of clone class summaries.
    """

    model_config = ConfigDict(from_attributes=True)

    assignment_id: str = Field(..., description="Assignment UUID")
    total_classes: int = Field(..., ge=0)
    total_submissions_involved: int = Field(..., ge=0)
    classes: List[CloneClassSummary] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Combined Evidence Report
# ---------------------------------------------------------------------------


class EvidenceReportResponse(BaseModel):
    """
    Comprehensive evidence report combining graph, classes, and matches.

    This is a convenience endpoint that returns all evidence data in one call.

    Attributes:
        assignment_id: The assignment UUID.
        graph: Clone graph data (nodes and edges).
        clone_classes: Grouped clone classes.
        total_matches: Total number of clone pairs detected.
        threshold: Similarity threshold used.
        generated_at: When the report was generated.
    """

    model_config = ConfigDict(from_attributes=True)

    assignment_id: str = Field(..., description="Assignment UUID")
    graph: CloneGraphResponse
    clone_classes: CloneClassListResponse
    total_matches: int = Field(..., ge=0)
    threshold: float = Field(..., ge=0.0, le=1.0)
    generated_at: datetime


__all__ = [
    "GraphNode",
    "GraphEdge",
    "CloneGraphResponse",
    "CloneEvidenceRequest",
    "CloneEvidenceResponse",
    "CloneClassSummary",
    "CloneClassListResponse",
    "EvidenceReportResponse",
]
