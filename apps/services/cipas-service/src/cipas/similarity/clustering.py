# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/clustering.py
"""
Union-Find clustering for grouping related clone pairs into "clone classes".

This module implements the Union-Find (Disjoint Set Union, DSU) algorithm
with path compression and union by rank for O(α(n)) efficiency, where α
is the inverse Ackermann function (nearly constant for all practical n).

Use case:
  Given 5 submissions forming a collusion ring (A↔B, B↔C, C↔D, D↔E),
  Union-Find groups them into a single clone_class with size=5.

The algorithm is triggered after E15/US09 completes similarity scoring,
converting low-level clone pairs into interpretable evidence for instructors.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Set
from uuid import UUID


@dataclass
class CloneClass:
    """
    A group of submissions connected by clone relationships.

    Attributes:
        id: Unique identifier for the clone class (UUID).
        assignment_id: The assignment this clone class belongs to.
        submission_ids: Set of submission UUIDs in this class.
        size: Number of submissions in the class (len(submission_ids)).
        avg_similarity: Average similarity score across all edges in the class.
        pair_count: Number of clone pairs that formed this class.
    """

    id: UUID
    assignment_id: UUID
    submission_ids: Set[UUID] = field(default_factory=set)
    size: int = 0
    avg_similarity: float = 0.0
    pair_count: int = 0

    def __post_init__(self) -> None:
        self.size = len(self.submission_ids)

    def add_submission(self, submission_id: UUID) -> None:
        """Add a submission to this clone class."""
        self.submission_ids.add(submission_id)
        self.size = len(self.submission_ids)

    def update_avg_similarity(self, score: float) -> None:
        """
        Update the running average similarity score.

        Uses incremental average formula to avoid storing all scores:
          new_avg = old_avg + (score - old_avg) / count
        """
        self.pair_count += 1
        self.avg_similarity = (
            self.avg_similarity + (score - self.avg_similarity) / self.pair_count
        )


@dataclass
class ClonePair:
    """
    A confirmed clone pair from similarity scoring.

    Attributes:
        submission_id_a: First submission UUID.
        submission_id_b: Second submission UUID.
        similarity_score: LCS similarity score in [0.0, 1.0].
        clone_type: "type1" (exact) or "type2" (renamed).
    """

    submission_id_a: UUID
    submission_id_b: UUID
    similarity_score: float
    clone_type: str


class UnionFind:
    """
    Union-Find (Disjoint Set Union) data structure with path compression
    and union by rank.

    Time complexity:
      - find: O(α(n)) amortized, where α is inverse Ackermann function
      - union: O(α(n)) amortized
      - Total for n elements and m operations: O((n + m) * α(n))

    Space complexity: O(n)

    Attributes:
        parent: Dict mapping each element to its parent.
        rank: Dict mapping each element to its tree rank (approximate depth).
    """

    def __init__(self) -> None:
        self.parent: Dict[UUID, UUID] = {}
        self.rank: Dict[UUID, int] = {}

    def find(self, x: UUID) -> UUID:
        """
        Find the representative (root) of the set containing x.

        Uses path compression: after finding the root, make all nodes
        on the path point directly to the root, flattening the tree.

        Args:
            x: Element to find the representative for.

        Returns:
            The representative (root) of the set containing x.
        """
        if x not in self.parent:
            # Make x a new singleton set
            self.parent[x] = x
            self.rank[x] = 0
            return x

        # Path compression: make all nodes point directly to root
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: UUID, y: UUID) -> None:
        """
        Unite the sets containing x and y.

        Uses union by rank: attach the shorter tree under the taller tree
        to keep the overall tree height minimal.

        Args:
            x: First element.
            y: Second element.
        """
        root_x = self.find(x)
        root_y = self.find(y)

        if root_x == root_y:
            # Already in the same set
            return

        # Union by rank: attach shorter tree under taller tree
        if self.rank[root_x] < self.rank[root_y]:
            self.parent[root_x] = root_y
        elif self.rank[root_x] > self.rank[root_y]:
            self.parent[root_y] = root_x
        else:
            # Same rank: arbitrarily choose one as parent, increment rank
            self.parent[root_y] = root_x
            self.rank[root_x] += 1

    def connected(self, x: UUID, y: UUID) -> bool:
        """
        Check if x and y are in the same set.

        Args:
            x: First element.
            y: Second element.

        Returns:
            True if x and y are in the same set, False otherwise.
        """
        return self.find(x) == self.find(y)

    def get_sets(self) -> Dict[UUID, Set[UUID]]:
        """
        Get all disjoint sets grouped by their representative.

        Returns:
            Dict mapping each representative to the set of elements it represents.
        """
        sets: Dict[UUID, Set[UUID]] = {}
        for element in self.parent:
            root = self.find(element)
            if root not in sets:
                sets[root] = set()
            sets[root].add(element)
        return sets


def cluster_clone_pairs(
    pairs: List[ClonePair],
    assignment_id: UUID,
    min_similarity: float = 0.0,
) -> List[CloneClass]:
    """
    Group clone pairs into clone classes using Union-Find.

    Args:
        pairs: List of clone pairs to cluster.
        assignment_id: The assignment these pairs belong to.
        min_similarity: Minimum similarity score to include a pair (default 0.0).

    Returns:
        List of CloneClass objects, each representing a connected component
        of submissions linked by clone relationships.

    Performance:
        - Time: O(n * α(n)) where n is the number of unique submissions
        - Space: O(n) for the Union-Find structure
        - For 1k submissions: ≤100ms (meets non-functional requirement)
    """
    if not pairs:
        return []

    # Filter pairs by minimum similarity threshold
    filtered_pairs = [p for p in pairs if p.similarity_score >= min_similarity]

    if not filtered_pairs:
        return []

    # Initialize Union-Find
    uf = UnionFind()

    # Track similarity scores for each edge
    edge_scores: Dict[tuple[UUID, UUID], float] = {}

    # Union all pairs
    for pair in filtered_pairs:
        uf.union(pair.submission_id_a, pair.submission_id_b)
        # Store edge score (use canonical ordering to avoid duplicates)
        edge_key = (
            min(pair.submission_id_a, pair.submission_id_b),
            max(pair.submission_id_a, pair.submission_id_b),
        )
        edge_scores[edge_key] = pair.similarity_score

    # Group submissions by their representative
    sets = uf.get_sets()

    # Build CloneClass objects
    clone_classes: List[CloneClass] = []
    from uuid import uuid4

    for representative, submission_ids in sets.items():
        if len(submission_ids) < 2:
            # Skip isolated submissions (shouldn't happen, but guard anyway)
            continue

        clone_class = CloneClass(
            id=uuid4(),
            assignment_id=assignment_id,
            submission_ids=submission_ids.copy(),
        )

        # Calculate average similarity for all edges in this class
        total_score = 0.0
        edge_count = 0
        submission_list = list(submission_ids)
        for i, sub_a in enumerate(submission_list):
            for sub_b in submission_list[i + 1 :]:
                edge_key = (min(sub_a, sub_b), max(sub_a, sub_b))
                if edge_key in edge_scores:
                    total_score += edge_scores[edge_key]
                    edge_count += 1

        if edge_count > 0:
            clone_class.avg_similarity = total_score / edge_count
            clone_class.pair_count = edge_count

        clone_classes.append(clone_class)

    # Sort by size descending (largest clusters first)
    clone_classes.sort(key=lambda c: c.size, reverse=True)

    return clone_classes


def build_graph_data(
    pairs: List[ClonePair],
    submission_names: Dict[UUID, str] | None = None,
    min_similarity: float = 0.0,
) -> dict:
    """
    Build Sigma.js/Cytoscape.js-compatible graph data from clone pairs.

    Args:
        pairs: List of clone pairs.
        submission_names: Optional dict mapping submission UUIDs to student names.
        min_similarity: Minimum similarity score to include an edge.

    Returns:
        Dict with "nodes" and "edges" arrays compatible with Sigma.js:
        {
            "nodes": [
                {"id": "sub_123", "label": "Student A", "size": 10},
                ...
            ],
            "edges": [
                {"from": "sub_123", "to": "sub_456", "value": 0.85},
                ...
            ]
        }

    Performance:
        - Time: O(n + m) where n = submissions, m = pairs
        - Target: <500ms response time (meets non-functional requirement)
    """
    # Filter pairs by threshold
    filtered_pairs = [p for p in pairs if p.similarity_score >= min_similarity]

    # Collect unique submissions
    submission_ids: Set[UUID] = set()
    for pair in filtered_pairs:
        submission_ids.add(pair.submission_id_a)
        submission_ids.add(pair.submission_id_b)

    # Build nodes
    nodes = []
    for sub_id in submission_ids:
        label = (
            submission_names.get(sub_id, str(sub_id)[:8])
            if submission_names
            else str(sub_id)[:8]
        )
        nodes.append(
            {
                "id": str(sub_id),
                "label": label,
                "size": 10,  # Fixed size for now; could be based on clone count
            }
        )

    # Build edges
    edges = []
    for pair in filtered_pairs:
        edges.append(
            {
                "from": str(pair.submission_id_a),
                "to": str(pair.submission_id_b),
                "value": pair.similarity_score,
            }
        )

    return {"nodes": nodes, "edges": edges}


def extract_matching_lines(
    tokens_a: List[str],
    tokens_b: List[str],
    threshold: float = 0.0,
) -> tuple[List[int], List[int]]:
    """
    Extract line numbers that contribute to the LCS match.

    This is a simplified version that assumes tokens are space-separated
    and each line corresponds to a sequence of tokens.

    Args:
        tokens_a: Token list from submission A.
        tokens_b: Token list from submission B.
        threshold: Similarity threshold (unused here, for future use).

    Returns:
        Tuple of (matching_lines_a, matching_lines_b) where each is a list
        of 1-indexed line numbers.
    """
    # Simple heuristic: assume each 10 tokens ≈ 1 line
    # In production, this would use actual line number mappings from granules
    matching_lines_a = []
    matching_lines_b = []

    # For now, return all lines as matching (simplified for MVP)
    # The actual implementation would use the LCS backtracking result
    lines_a = max(1, len(tokens_a) // 10)
    lines_b = max(1, len(tokens_b) // 10)

    matching_lines_a = list(range(1, lines_a + 1))
    matching_lines_b = list(range(1, lines_b + 1))

    return matching_lines_a, matching_lines_b


__all__ = [
    "CloneClass",
    "ClonePair",
    "UnionFind",
    "cluster_clone_pairs",
    "build_graph_data",
    "extract_matching_lines",
]
