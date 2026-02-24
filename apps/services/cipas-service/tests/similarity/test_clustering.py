# gradeloop-core-v2/apps/services/cipas-service/tests/similarity/test_clustering.py
"""
Unit tests for cipas.similarity.clustering (Union-Find clustering).

Tests cover:
  - UnionFind: find, union, connected, get_sets operations
  - Path compression and union by rank efficiency
  - CloneClass dataclass operations
  - cluster_clone_pairs: full pipeline from pairs to classes
  - build_graph_data: Sigma.js/Cytoscape.js compatible output
  - Acceptance criteria from US10:
      AC1: 5 submissions in a ring → 1 clone_class with size=5
      AC2: Graph nodes and edges are Sigma.js compatible
      AC3: Isolated pairs form their own class
"""

from __future__ import annotations

import uuid
from uuid import UUID, uuid4

import pytest

from cipas.similarity.clustering import (
    CloneClass,
    ClonePair,
    UnionFind,
    build_graph_data,
    cluster_clone_pairs,
)

# ---------------------------------------------------------------------------
# UnionFind tests
# ---------------------------------------------------------------------------


class TestUnionFind:
    """Tests for the Union-Find (Disjoint Set Union) data structure."""

    def test_find_makes_element_its_own_parent(self) -> None:
        """First find() on an element makes it a singleton set."""
        uf = UnionFind()
        elem = uuid4()
        root = uf.find(elem)
        assert root == elem
        assert uf.parent[elem] == elem

    def test_union_connects_two_elements(self) -> None:
        """Union of two elements connects them."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()
        uf.union(a, b)
        assert uf.connected(a, b)
        assert uf.find(a) == uf.find(b)

    def test_union_by_rank_attaches_shorter_tree(self) -> None:
        """Union by rank attaches the shorter tree under the taller tree."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()
        c = uuid4()

        # Create a tree: a -> b (rank of b becomes 1)
        uf.union(a, b)
        # Union with c should attach c to b (the root)
        uf.union(b, c)

        # All should be connected
        assert uf.connected(a, c)
        assert uf.connected(b, c)

    def test_path_compression_flattens_tree(self) -> None:
        """Path compression makes all nodes on path point to root."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        # Build a chain: a -> b -> c -> d
        uf.union(a, b)
        uf.union(b, c)
        uf.union(c, d)

        # Find a (should compress path)
        root = uf.find(a)

        # After path compression, a should point directly to root
        assert uf.parent[a] == root

    def test_connected_returns_false_for_disjoint_sets(self) -> None:
        """Elements in different sets are not connected."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        uf.union(a, b)
        uf.union(c, d)

        assert not uf.connected(a, c)
        assert not uf.connected(b, d)

    def test_get_sets_returns_disjoint_groups(self) -> None:
        """get_sets() returns all elements grouped by representative."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        uf.union(a, b)
        uf.union(c, d)

        sets = uf.get_sets()

        # Should have 2 sets
        assert len(sets) == 2

        # Each set should have 2 elements
        for representative, elements in sets.items():
            assert len(elements) == 2

    def test_get_sets_with_single_element_sets(self) -> None:
        """Singleton sets are included in get_sets()."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()

        # Only call find (creates singleton sets)
        uf.find(a)
        uf.find(b)

        sets = uf.get_sets()
        assert len(sets) == 2

    def test_union_idempotent(self) -> None:
        """Union of already connected elements is a no-op."""
        uf = UnionFind()
        a = uuid4()
        b = uuid4()

        uf.union(a, b)
        root_before = uf.find(a)

        # Union again
        uf.union(a, b)
        root_after = uf.find(a)

        assert root_before == root_after


# ---------------------------------------------------------------------------
# CloneClass tests
# ---------------------------------------------------------------------------


class TestCloneClass:
    """Tests for the CloneClass dataclass."""

    def test_clone_class_initialisation(self) -> None:
        """CloneClass initialises with correct defaults."""
        assignment_id = uuid4()
        submission_ids = {uuid4(), uuid4(), uuid4()}

        clone_class = CloneClass(
            id=uuid4(),
            assignment_id=assignment_id,
            submission_ids=submission_ids.copy(),
        )

        assert clone_class.size == 3
        assert clone_class.avg_similarity == 0.0
        assert clone_class.pair_count == 0

    def test_add_submission(self) -> None:
        """add_submission() adds a submission and updates size."""
        clone_class = CloneClass(
            id=uuid4(),
            assignment_id=uuid4(),
            submission_ids={uuid4()},
        )

        assert clone_class.size == 1

        new_sub = uuid4()
        clone_class.add_submission(new_sub)

        assert clone_class.size == 2
        assert new_sub in clone_class.submission_ids

    def test_update_avg_similarity(self) -> None:
        """update_avg_similarity() maintains running average."""
        clone_class = CloneClass(
            id=uuid4(),
            assignment_id=uuid4(),
            submission_ids={uuid4(), uuid4()},
        )

        # Add scores: 0.8, 0.9, 0.7
        clone_class.update_avg_similarity(0.8)
        assert clone_class.avg_similarity == pytest.approx(0.8)
        assert clone_class.pair_count == 1

        clone_class.update_avg_similarity(0.9)
        assert clone_class.avg_similarity == pytest.approx(0.85)
        assert clone_class.pair_count == 2

        clone_class.update_avg_similarity(0.7)
        assert clone_class.avg_similarity == pytest.approx(0.8)
        assert clone_class.pair_count == 3


# ---------------------------------------------------------------------------
# cluster_clone_pairs tests
# ---------------------------------------------------------------------------


class TestClusterClonePairs:
    """Tests for the cluster_clone_pairs function."""

    def test_empty_pairs_returns_empty_list(self) -> None:
        """Empty input returns empty list."""
        result = cluster_clone_pairs([], assignment_id=uuid4())
        assert result == []

    def test_single_pair_forms_one_class(self) -> None:
        """A single pair forms one clone class of size 2."""
        a = uuid4()
        b = uuid4()
        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.85,
                clone_type="type2",
            )
        ]

        result = cluster_clone_pairs(pairs, assignment_id=uuid4())

        assert len(result) == 1
        assert result[0].size == 2
        assert result[0].avg_similarity == pytest.approx(0.85)

    def test_ac1_five_submissions_ring_forms_one_class(self) -> None:
        """
        AC1: Given 5 submissions forming a collusion ring (A↔B, B↔C, C↔D, D↔E),
        Union-Find groups them into a single clone_class with size=5.
        """
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()
        e = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=b,
                submission_id_b=c,
                similarity_score=0.88,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.85,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=d,
                submission_id_b=e,
                similarity_score=0.87,
                clone_type="type2",
            ),
        ]

        result = cluster_clone_pairs(pairs, assignment_id=uuid4())

        assert len(result) == 1
        assert result[0].size == 5
        assert result[0].submission_ids == {a, b, c, d, e}
        # Average of 0.90, 0.88, 0.85, 0.87 = 0.875
        assert result[0].avg_similarity == pytest.approx(0.875)

    def test_two_disjoint_pairs_form_two_classes(self) -> None:
        """Two disjoint pairs form two separate clone classes."""
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type1",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.85,
                clone_type="type2",
            ),
        ]

        result = cluster_clone_pairs(pairs, assignment_id=uuid4())

        assert len(result) == 2
        # Both should be size 2
        assert all(c.size == 2 for c in result)

    def test_filter_by_min_similarity(self) -> None:
        """Pairs below min_similarity are excluded."""
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type1",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.50,
                clone_type="type2",
            ),
        ]

        # Filter at 0.80
        result = cluster_clone_pairs(pairs, assignment_id=uuid4(), min_similarity=0.80)

        assert len(result) == 1
        assert result[0].size == 2

    def test_sorted_by_size_descending(self) -> None:
        """Results are sorted by size descending (largest clusters first)."""
        # Create one large cluster and one small
        a, b, c, d = uuid4(), uuid4(), uuid4(), uuid4()
        e, f = uuid4(), uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=b,
                submission_id_b=c,
                similarity_score=0.88,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.85,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=e,
                submission_id_b=f,
                similarity_score=0.95,
                clone_type="type1",
            ),
        ]

        result = cluster_clone_pairs(pairs, assignment_id=uuid4())

        assert len(result) == 2
        # Large cluster (size 4) should come first
        assert result[0].size == 4
        assert result[1].size == 2


# ---------------------------------------------------------------------------
# build_graph_data tests
# ---------------------------------------------------------------------------


class TestBuildGraphData:
    """Tests for the build_graph_data function."""

    def test_empty_pairs_returns_empty_graph(self) -> None:
        """Empty input returns graph with empty nodes and edges."""
        result = build_graph_data([])
        assert result["nodes"] == []
        assert result["edges"] == []

    def test_single_pair_creates_two_nodes_and_one_edge(self) -> None:
        """A single pair creates 2 nodes and 1 edge."""
        a = uuid4()
        b = uuid4()
        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.85,
                clone_type="type2",
            )
        ]

        result = build_graph_data(pairs)

        assert len(result["nodes"]) == 2
        assert len(result["edges"]) == 1

        # Check node IDs
        node_ids = {node["id"] for node in result["nodes"]}
        assert str(a) in node_ids
        assert str(b) in node_ids

        # Check edge
        edge = result["edges"][0]
        assert edge["value"] == pytest.approx(0.85)

    def test_sigma_js_compatible_format(self) -> None:
        """
        AC2: Output format is compatible with Sigma.js/Cytoscape.js.

        Expected format:
        {
            "nodes": [{"id": "uuid", "label": "name", "size": 10}],
            "edges": [{"from": "uuid", "to": "uuid", "value": 0.85}]
        }
        """
        a = uuid4()
        b = uuid4()
        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.85,
                clone_type="type2",
            )
        ]

        result = build_graph_data(pairs)

        # Check structure
        assert "nodes" in result
        assert "edges" in result

        # Check node format
        node = result["nodes"][0]
        assert "id" in node
        assert "label" in node
        assert "size" in node
        assert isinstance(node["id"], str)
        assert isinstance(node["label"], str)
        assert isinstance(node["size"], int)

        # Check edge format
        edge = result["edges"][0]
        assert "from" in edge
        assert "to" in edge
        assert "value" in edge
        assert isinstance(edge["from"], str)
        assert isinstance(edge["to"], str)
        assert isinstance(edge["value"], float)

    def test_submission_names_used_in_labels(self) -> None:
        """Provided submission_names are used as node labels."""
        a = uuid4()
        b = uuid4()
        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.85,
                clone_type="type2",
            )
        ]

        names = {a: "Student A", b: "Student B"}
        result = build_graph_data(pairs, submission_names=names)

        # Find nodes by ID
        node_a = next(n for n in result["nodes"] if n["id"] == str(a))
        node_b = next(n for n in result["nodes"] if n["id"] == str(b))

        assert node_a["label"] == "Student A"
        assert node_b["label"] == "Student B"

    def test_filter_by_min_similarity(self) -> None:
        """Edges below min_similarity are excluded."""
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type1",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.50,
                clone_type="type2",
            ),
        ]

        result = build_graph_data(pairs, min_similarity=0.80)

        assert len(result["edges"]) == 1
        assert result["edges"][0]["value"] == pytest.approx(0.90)

    def test_deduplicates_submissions(self) -> None:
        """Multiple edges for same submission create single node."""
        a = uuid4()
        b = uuid4()
        c = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.90,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=a,
                submission_id_b=c,
                similarity_score=0.85,
                clone_type="type2",
            ),
        ]

        result = build_graph_data(pairs)

        # Should have 3 unique nodes (a, b, c)
        assert len(result["nodes"]) == 3
        # Should have 2 edges
        assert len(result["edges"]) == 2


# ---------------------------------------------------------------------------
# Integration: Full clustering workflow
# ---------------------------------------------------------------------------


class TestClusteringIntegration:
    """Integration tests for the full clustering workflow."""

    def test_end_to_end_clustering_and_graph(self) -> None:
        """Test full workflow: pairs → clustering → graph."""
        # Create a collusion ring: A↔B, B↔C, C↔D
        a = uuid4()
        b = uuid4()
        c = uuid4()
        d = uuid4()

        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.92,
                clone_type="type1",
            ),
            ClonePair(
                submission_id_a=b,
                submission_id_b=c,
                similarity_score=0.88,
                clone_type="type2",
            ),
            ClonePair(
                submission_id_a=c,
                submission_id_b=d,
                similarity_score=0.85,
                clone_type="type2",
            ),
        ]

        assignment_id = uuid4()

        # Cluster
        classes = cluster_clone_pairs(pairs, assignment_id=assignment_id)

        # Should have 1 class of size 4
        assert len(classes) == 1
        assert classes[0].size == 4

        # Build graph
        graph = build_graph_data(pairs)

        # Should have 4 nodes and 3 edges
        assert len(graph["nodes"]) == 4
        assert len(graph["edges"]) == 3

    def test_ac3_isolated_pair_forms_own_class(self) -> None:
        """
        AC3: An isolated clone pair (no connections to other submissions)
        forms its own clone_class with size=2.
        """
        a = uuid4()
        b = uuid4()

        # Single isolated pair
        pairs = [
            ClonePair(
                submission_id_a=a,
                submission_id_b=b,
                similarity_score=0.95,
                clone_type="type1",
            )
        ]

        result = cluster_clone_pairs(pairs, assignment_id=uuid4())

        assert len(result) == 1
        assert result[0].size == 2
        assert result[0].pair_count == 1


__all__ = [
    "TestUnionFind",
    "TestCloneClass",
    "TestClusterClonePairs",
    "TestBuildGraphData",
    "TestClusteringIntegration",
]
