# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/evidence_service.py
"""
Clone evidence service for interpretation and visualization.

This service provides the business logic for:
  1. Building clone graphs from similarity data
  2. Clustering clone pairs into classes using Union-Find
  3. Extracting side-by-side code evidence for instructor review

The service acts as a facade over the similarity repository, transforming
raw clone match data into instructor-friendly visualizations.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from loguru import logger

from cipas.similarity.clustering import (
    CloneClass,
    ClonePair,
    build_graph_data,
    cluster_clone_pairs,
)
from cipas.similarity.evidence_models import (
    CloneClassListResponse,
    CloneClassSummary,
    CloneEvidenceResponse,
    CloneGraphResponse,
    GraphEdge,
    GraphNode,
)
from cipas.similarity.models import CloneMatch, CloneType
from cipas.storage.similarity_repository import SimilarityRepository


class CloneEvidenceService:
    """
    Service for transforming raw clone data into interpretable evidence.

    This service is the core of E15/US10, providing:
      - Graph data for visualization libraries (Sigma.js, Cytoscape.js)
      - Union-Find clustering to identify collusion rings
      - Side-by-side code comparison for evidence review

    Performance targets:
      - Graph building: <500ms for 1k submissions
      - Clustering: ≤100ms for 1k submissions
      - Evidence extraction: <300ms per pair
    """

    def __init__(self, repository: SimilarityRepository) -> None:
        """
        Initialize the evidence service.

        Args:
            repository: SimilarityRepository for fetching clone data.
        """
        self.repository = repository

    async def build_clone_graph(
        self,
        assignment_id: UUID,
        threshold: float = 0.0,
        submission_names: Optional[Dict[UUID, str]] = None,
    ) -> CloneGraphResponse:
        """
        Build a clone graph for an assignment.

        Fetches all clone matches for the assignment and builds a graph
        representation compatible with Sigma.js/Cytoscape.js.

        Args:
            assignment_id: The assignment to build the graph for.
            threshold: Minimum similarity score to include an edge.
            submission_names: Optional mapping of submission IDs to student names.

        Returns:
            CloneGraphResponse with nodes and edges.

        Performance:
            - Fetches all clone matches for the assignment
            - Time: O(n + m) where n = submissions, m = matches
            - Target: <500ms response time
        """
        logger.info(
            "build_clone_graph: starting",
            assignment_id=str(assignment_id),
            threshold=threshold,
        )

        # Fetch all clone matches for the assignment
        matches = await self.repository.get_matches_by_assignment(
            assignment_id, min_score=threshold
        )

        # Convert to ClonePair list
        pairs = []
        for match in matches:
            pairs.append(
                ClonePair(
                    submission_id_a=match.submission_id,
                    submission_id_b=match.matched_submission_id,
                    similarity_score=match.similarity_score,
                    clone_type=match.clone_type.value,
                )
            )

        # Build graph data
        graph_data = build_graph_data(
            pairs=pairs,
            submission_names=submission_names,
            min_similarity=threshold,
        )

        # Convert to response models
        nodes = [
            GraphNode(
                id=node["id"],
                label=node["label"],
                size=node["size"],
                submission_id=UUID(node["id"]),
            )
            for node in graph_data["nodes"]
        ]

        edges = [
            GraphEdge(
                from_id=edge["from"],
                to_id=edge["to"],
                value=edge["value"],
                clone_type=self._infer_clone_type(pairs, edge),
            )
            for edge in graph_data["edges"]
        ]

        response = CloneGraphResponse(
            assignment_id=str(assignment_id),
            nodes=nodes,
            edges=edges,
            total_nodes=len(nodes),
            total_edges=len(edges),
            threshold=threshold,
        )

        logger.info(
            "build_clone_graph: complete",
            assignment_id=str(assignment_id),
            nodes=len(nodes),
            edges=len(edges),
        )

        return response

    def _infer_clone_type(self, pairs: List[ClonePair], edge: Dict[str, Any]) -> str:
        """Infer clone type from edge data."""
        sub_a = UUID(edge["from"])
        sub_b = UUID(edge["to"])
        for pair in pairs:
            if (pair.submission_id_a == sub_a and pair.submission_id_b == sub_b) or (
                pair.submission_id_a == sub_b and pair.submission_id_b == sub_a
            ):
                return pair.clone_type
        return "type2"  # Default to type2 if not found

    async def cluster_clones(
        self,
        assignment_id: UUID,
        threshold: float = 0.0,
    ) -> CloneClassListResponse:
        """
        Cluster clone pairs into connected components (collusion rings).

        Uses Union-Find algorithm with path compression and union by rank
        for O(α(n)) efficiency.

        Args:
            assignment_id: The assignment to cluster clones for.
            threshold: Minimum similarity score to include a pair.

        Returns:
            CloneClassListResponse with grouped clone classes.

        Performance:
            - Time: O(n * α(n)) where n = unique submissions
            - Target: ≤100ms for 1k submissions
        """
        logger.info(
            "cluster_clones: starting",
            assignment_id=str(assignment_id),
            threshold=threshold,
        )

        # Fetch all clone matches for the assignment
        matches = await self.repository.get_matches_by_assignment(
            assignment_id, min_score=threshold
        )

        # Convert to ClonePair list
        pairs = []
        for match in matches:
            pairs.append(
                ClonePair(
                    submission_id_a=match.submission_id,
                    submission_id_b=match.matched_submission_id,
                    similarity_score=match.similarity_score,
                    clone_type=match.clone_type.value,
                )
            )

        # Cluster using Union-Find
        clone_classes = cluster_clone_pairs(
            pairs=pairs,
            assignment_id=assignment_id,
            min_similarity=threshold,
        )

        # Convert to response models
        class_summaries = []
        all_submission_ids: set[UUID] = set()

        for clone_class in clone_classes:
            class_summaries.append(
                CloneClassSummary(
                    id=str(clone_class.id),
                    assignment_id=str(clone_class.assignment_id),
                    submission_ids=[str(sid) for sid in clone_class.submission_ids],
                    size=clone_class.size,
                    avg_similarity=clone_class.avg_similarity,
                    pair_count=clone_class.pair_count,
                    created_at=datetime.now(timezone.utc),
                )
            )
            all_submission_ids.update(clone_class.submission_ids)

        response = CloneClassListResponse(
            assignment_id=str(assignment_id),
            total_classes=len(class_summaries),
            total_submissions_involved=len(all_submission_ids),
            classes=class_summaries,
        )

        logger.info(
            "cluster_clones: complete",
            assignment_id=str(assignment_id),
            classes=len(class_summaries),
            submissions=len(all_submission_ids),
        )

        return response

    async def get_clone_evidence(
        self,
        submission_id: UUID,
        matched_submission_id: UUID,
        min_score: float = 0.0,
    ) -> CloneEvidenceResponse:
        """
        Get side-by-side code evidence for a specific clone pair.

        Fetches the granule-level details and normalized code snippets
        that contributed to the similarity score.

        Args:
            submission_id: The subject submission UUID.
            matched_submission_id: The matched submission UUID.
            min_score: Minimum similarity score filter.

        Returns:
            CloneEvidenceResponse with code snippets and matching lines.

        Performance:
            - Fetches granule details and match data
            - Target: <300ms with syntax highlighting

        Edge cases:
            - No matching lines found → returns empty arrays with warning
            - Multiple matches → returns the highest-scoring pair
        """
        logger.info(
            "get_clone_evidence: request",
            submission_a=str(submission_id),
            submission_b=str(matched_submission_id),
        )

        # Fetch the best matching clone pair
        match = await self.repository.get_best_match(
            submission_id, matched_submission_id, min_score=min_score
        )

        if match is None:
            # No match found - return empty evidence
            logger.warning(
                "get_clone_evidence: no match found",
                submission_a=str(submission_id),
                submission_b=str(matched_submission_id),
            )
            return CloneEvidenceResponse(
                submission_id=str(submission_id),
                matched_submission_id=str(matched_submission_id),
                submission_a_code="",
                submission_b_code="",
                matching_lines=[],
                similarity_score=0.0,
                clone_type="type2",
                granule_a_id="",
                granule_b_id="",
                snippet_start_line=1,
                snippet_end_line=1,
            )

        # Fetch granule details for code snippets
        granule_a = await self.repository.get_granule_by_id(match.granule_a_id)
        granule_b = await self.repository.get_granule_by_id(match.granule_b_id)

        # Extract matching lines from snippet
        matching_lines = self._extract_matching_lines_from_snippet(
            match.snippet_match or ""
        )

        # Calculate line numbers from granule metadata
        start_line = granule_a.get("start_line", 1) if granule_a else 1
        end_line = (
            granule_a.get("end_line", start_line + 10) if granule_a else start_line + 10
        )

        response = CloneEvidenceResponse(
            submission_id=str(submission_id),
            matched_submission_id=str(matched_submission_id),
            submission_a_code=granule_a.get("normalized_source", "")
            if granule_a
            else "",
            submission_b_code=granule_b.get("normalized_source", "")
            if granule_b
            else "",
            matching_lines=matching_lines,
            similarity_score=match.similarity_score,
            clone_type=match.clone_type.value,
            granule_a_id=str(match.granule_a_id),
            granule_b_id=str(match.granule_b_id),
            snippet_start_line=start_line,
            snippet_end_line=end_line,
        )

        logger.info(
            "get_clone_evidence: complete",
            submission_a=str(submission_id),
            submission_b=str(matched_submission_id),
            score=match.similarity_score,
            clone_type=match.clone_type.value,
        )

        return response

    def _extract_matching_lines_from_snippet(self, snippet: str) -> List[int]:
        """
        Extract line indices from a code snippet.

        This is a simplified implementation that returns line indices
        for all non-empty lines in the snippet.

        Args:
            snippet: The code snippet from the clone match.

        Returns:
            List of 0-based line indices.
        """
        if not snippet:
            return []

        lines = snippet.split("\n")
        # Return all line indices (in production, would use LCS backtracking)
        return list(range(len(lines)))

    async def get_full_evidence_report(
        self,
        assignment_id: UUID,
        threshold: float = 0.85,
        submission_names: Optional[Dict[UUID, str]] = None,
    ) -> dict:
        """
        Get a comprehensive evidence report combining graph, classes, and matches.

        This is a convenience method that returns all evidence data in one call.

        Args:
            assignment_id: The assignment UUID.
            threshold: Similarity threshold for inclusion.
            submission_names: Optional student name mapping.

        Returns:
            Dict with graph, clone_classes, and summary statistics.
        """
        logger.info(
            "get_full_evidence_report: starting",
            assignment_id=str(assignment_id),
            threshold=threshold,
        )

        # Build graph and clusters in parallel
        graph_task = self.build_clone_graph(
            assignment_id=assignment_id,
            threshold=threshold,
            submission_names=submission_names,
        )

        cluster_task = self.cluster_clones(
            assignment_id=assignment_id,
            threshold=threshold,
        )

        graph, clone_classes = await self.repository.gather_tasks(
            [graph_task, cluster_task]
        )

        # Count total matches
        matches = await self.repository.get_matches_by_assignment(
            assignment_id, min_score=threshold
        )

        report = {
            "assignment_id": str(assignment_id),
            "graph": graph,
            "clone_classes": clone_classes,
            "total_matches": len(matches),
            "threshold": threshold,
            "generated_at": datetime.now(timezone.utc),
        }

        logger.info(
            "get_full_evidence_report: complete",
            assignment_id=str(assignment_id),
            total_matches=len(matches),
        )

        return report


__all__ = ["CloneEvidenceService"]
