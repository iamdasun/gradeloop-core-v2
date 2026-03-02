"""
Graph-Based Collusion Discovery — Phase 4.

Builds a weighted student graph from clone matches and computes Connected
Components to identify "collusion rings."

Graph model
───────────
  Nodes  : student IDs
  Edges  : a clone detection event between fragments from student A and
           student B, weighted by the maximum confidence score across all
           matching fragment pairs.
  Groups : connected components of the graph (a group = likely collusion ring).

Algorithm choice: Connected Components
  • O(V + E) via union-find — scales easily to thousands of students.
  • Correct for chained sharing (A→B→C) — a chain is one group.
  • Faster than hierarchical clustering and simpler to update incrementally.

Usage
-----
    from clone_detection.collusion_graph import CollusionGraph

    graph = CollusionGraph()

    # Add edges from DB-persisted clone matches
    for match in db_matches:
        graph.add_match(
            student_a=match.student_a,
            student_b=match.student_b,
            clone_type=match.clone_type,
            confidence=match.confidence,
        )

    groups = graph.connected_components()
    for group in groups:
        print(group.member_ids, group.max_confidence)
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional


# ────────────────────────────────────────────────────────────────────────────
# Data classes
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class CloneEdge:
    """Weighted edge between two students."""
    student_a: str
    student_b: str
    clone_type: str          # "Type-1" | "Type-2" | "Type-3"
    confidence: float        # max confidence across fragment pairs
    frag_a_ids: list[str] = field(default_factory=list)
    frag_b_ids: list[str] = field(default_factory=list)
    match_count: int = 1


@dataclass
class CollusionGroup:
    """A connected component in the student graph."""
    group_id: int
    member_ids: list[str]
    edges: list[CloneEdge] = field(default_factory=list)
    max_confidence: float = 0.0
    dominant_type: str = "Unknown"   # most severe clone type in the group

    @property
    def size(self) -> int:
        return len(self.member_ids)

    def summary(self) -> dict:
        return {
            "group_id": self.group_id,
            "member_count": self.size,
            "member_ids": self.member_ids,
            "max_confidence": round(self.max_confidence, 4),
            "dominant_type": self.dominant_type,
            "edge_count": len(self.edges),
        }


# ────────────────────────────────────────────────────────────────────────────
# Union-Find (Disjoint Set Union)
# ────────────────────────────────────────────────────────────────────────────

class _UnionFind:
    def __init__(self) -> None:
        self._parent: dict[str, str] = {}
        self._rank: dict[str, int] = {}

    def find(self, x: str) -> str:
        if x not in self._parent:
            self._parent[x] = x
            self._rank[x] = 0
        if self._parent[x] != x:
            self._parent[x] = self.find(self._parent[x])  # path compression
        return self._parent[x]

    def union(self, x: str, y: str) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self._rank[rx] < self._rank[ry]:
            rx, ry = ry, rx
        self._parent[ry] = rx
        if self._rank[rx] == self._rank[ry]:
            self._rank[rx] += 1

    def components(self) -> dict[str, list[str]]:
        groups: dict[str, list[str]] = defaultdict(list)
        for node in self._parent:
            groups[self.find(node)].append(node)
        return dict(groups)


# ────────────────────────────────────────────────────────────────────────────
# CollusionGraph
# ────────────────────────────────────────────────────────────────────────────

_TYPE_SEVERITY: dict[str, int] = {"Type-1": 3, "Type-2": 2, "Type-3": 1}


class CollusionGraph:
    """
    Incremental student–level clone graph.

    ``add_match`` can be called any number of times (from worker results or
    DB replay).  Call ``connected_components`` whenever the instructor
    requests an up-to-date collusion report; the result is recomputed from
    the current edge set.
    """

    def __init__(self, min_confidence: float = 0.0) -> None:
        """
        Parameters
        ----------
        min_confidence: Only include edges whose confidence ≥ this value.
        """
        self._min_confidence = min_confidence
        # (sorted student pair) → CloneEdge
        self._edges: dict[tuple[str, str], CloneEdge] = {}
        # All student nodes
        self._nodes: set[str] = set()

    # ── Edge management ─────────────────────────────────────────────────────

    def add_match(
        self,
        student_a: str,
        student_b: str,
        clone_type: str,
        confidence: float,
        frag_a_id: Optional[str] = None,
        frag_b_id: Optional[str] = None,
    ) -> None:
        """
        Add (or update) a clone-match edge between two students.

        If an edge already exists, it is updated with the higher confidence
        and the more severe clone type.
        """
        if student_a == student_b:
            return
        if confidence < self._min_confidence:
            return

        key = (min(student_a, student_b), max(student_a, student_b))
        self._nodes.update([student_a, student_b])

        if key in self._edges:
            existing = self._edges[key]
            # Keep the most severe type
            if _TYPE_SEVERITY.get(clone_type, 0) > _TYPE_SEVERITY.get(existing.clone_type, 0):
                existing.clone_type = clone_type
            # Keep max confidence
            existing.confidence = max(existing.confidence, confidence)
            existing.match_count += 1
            if frag_a_id:
                existing.frag_a_ids.append(frag_a_id)
            if frag_b_id:
                existing.frag_b_ids.append(frag_b_id)
        else:
            self._edges[key] = CloneEdge(
                student_a=student_a,
                student_b=student_b,
                clone_type=clone_type,
                confidence=confidence,
                frag_a_ids=[frag_a_id] if frag_a_id else [],
                frag_b_ids=[frag_b_id] if frag_b_id else [],
            )

    def remove_student(self, student_id: str) -> None:
        """Remove all edges involving a student (e.g. appeal resolved)."""
        to_delete = [k for k in self._edges if student_id in k]
        for k in to_delete:
            del self._edges[k]
        self._nodes.discard(student_id)

    # ── Connected components ────────────────────────────────────────────────

    def connected_components(
        self,
        min_group_size: int = 2,
        min_confidence: Optional[float] = None,
    ) -> list[CollusionGroup]:
        """
        Compute connected components and return CollusionGroup objects.

        Parameters
        ----------
        min_group_size: Exclude singleton / isolated nodes (default 2).
        min_confidence: Override instance-level threshold for this call.

        Returns list of groups sorted by size (descending), then by max
        confidence (descending).
        """
        threshold = min_confidence if min_confidence is not None else self._min_confidence
        uf = _UnionFind()

        # Ensure every node is registered even if it has no edges
        for node in self._nodes:
            uf.find(node)

        # Build components from edges that pass the threshold
        active_edges: list[CloneEdge] = []
        for edge in self._edges.values():
            if edge.confidence >= threshold:
                uf.union(edge.student_a, edge.student_b)
                active_edges.append(edge)

        raw_components = uf.components()

        groups: list[CollusionGroup] = []
        for gid, (_, members) in enumerate(raw_components.items()):
            if len(members) < min_group_size:
                continue

            member_set = set(members)
            group_edges = [
                e for e in active_edges
                if e.student_a in member_set or e.student_b in member_set
            ]

            max_conf = max((e.confidence for e in group_edges), default=0.0)
            dominant: str = "Unknown"
            if group_edges:
                dominant = max(
                    group_edges,
                    key=lambda e: (_TYPE_SEVERITY.get(e.clone_type, 0), e.confidence),
                ).clone_type

            groups.append(CollusionGroup(
                group_id=gid,
                member_ids=sorted(members),
                edges=group_edges,
                max_confidence=max_conf,
                dominant_type=dominant,
            ))

        groups.sort(key=lambda g: (-g.size, -g.max_confidence))
        # Re-number after sort
        for i, g in enumerate(groups):
            g.group_id = i + 1

        return groups

    # ── Convenience accessors ───────────────────────────────────────────────

    def edge_count(self) -> int:
        return len(self._edges)

    def node_count(self) -> int:
        return len(self._nodes)

    def get_neighbours(self, student_id: str) -> list[str]:
        """Return direct neighbours (students connected by an edge)."""
        result = []
        for (a, b), _edge in self._edges.items():
            if a == student_id:
                result.append(b)
            elif b == student_id:
                result.append(a)
        return result

    def get_edge(self, student_a: str, student_b: str) -> Optional[CloneEdge]:
        key = (min(student_a, student_b), max(student_a, student_b))
        return self._edges.get(key)

    def to_adjacency_dict(self) -> dict[str, list[dict]]:
        """Serialisable adjacency list for the instructor dashboard."""
        adj: dict[str, list[dict]] = defaultdict(list)
        for edge in self._edges.values():
            entry = {
                "neighbour": edge.student_b,
                "clone_type": edge.clone_type,
                "confidence": edge.confidence,
                "match_count": edge.match_count,
            }
            adj[edge.student_a].append(entry)
            mirrored = dict(entry)
            mirrored["neighbour"] = edge.student_a
            adj[edge.student_b].append(mirrored)
        return dict(adj)
