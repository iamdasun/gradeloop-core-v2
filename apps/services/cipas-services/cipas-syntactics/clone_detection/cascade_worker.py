"""
CIPAS Syntactic Cascade Worker — Pipeline Orchestration (Phases 1–4).

Coordinates the full ingestion flow for a single student submission:

  Phase 1 — Segmentation + Template Filtering
      Fragmenter → multi-granularity blocks + sliding windows
      TemplateFilter → discard skeleton/starter fragments

  Phase 2 — LSH Indexing + Candidate Retrieval
      MinHashIndexer.index()        → store fragment, get signature bytes
      MinHashIndexer.query()        → retrieve candidate fragment IDs
      generate_candidate_pairs()    → dedup pairs

  Phase 3 — CIPAS Syntactic Cascade
      TieredPipeline.detect()       → Type-1 / Type-2 / Type-3 / Non-Syntactic
      Results stored in-memory and returned to caller

  Phase 4 — Graph Update
      CollusionGraph.add_match()    → update student graph with each confirmed clone

The worker is deliberately *stateless* in that it receives its dependencies
via constructor injection so it can be embedded in a Celery task, a FastAPI
background task, or called directly from tests.

A companion ``db`` interface is expected to provide the following interface
(duck-typed; any object with these methods works):

    db.save_fragment(fragment: Fragment) → str          # returns fragment_id
    db.get_fragment(fragment_id: str) → Optional[Fragment]
    db.get_fragments_by_ids(ids: list[str]) → list[Fragment]
    db.save_clone_match(match: CloneMatch) → str        # returns match_id
    db.get_assignments_templates(assignment_id) → list[frozenset[str]]
    db.get_all_fragment_signatures() → Iterable[tuple[str, bytes]]
    db.save_plagiarism_group(group: CollusionGroup) → str

A simple in-memory implementation ``InMemoryDB`` is provided for tests.

Usage
-----
    from clone_detection.cascade_worker import CascadeWorker, InMemoryDB
    from clone_detection.collusion_graph import CollusionGraph
    from clone_detection.lsh_index import MinHashIndexer

    db = InMemoryDB()
    indexer = MinHashIndexer()
    graph = CollusionGraph()
    worker = CascadeWorker(db=db, indexer=indexer, graph=graph)

    result = worker.process_submission(
        source_code=student_code,
        language="java",
        submission_id="sub_001",
        student_id="stu_42",
        assignment_id="hw3",
    )
    print(result.clone_matches)
    groups = graph.connected_components()
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional, Protocol, runtime_checkable

from .collusion_graph import CollusionGraph
from .lsh_index import MinHashIndexer, generate_candidate_pairs
from .pipelines import TieredPipeline
from .preprocessor import Fragment, Fragmenter, TemplateFilter
from .utils.common_setup import setup_logging

logger = setup_logging(__name__)


# ────────────────────────────────────────────────────────────────────────────
# DB interface protocol (duck-typed)
# ────────────────────────────────────────────────────────────────────────────

@runtime_checkable
class CIPASDatabase(Protocol):
    def save_fragment(self, fragment: Fragment) -> str: ...
    def get_fragment(self, fragment_id: str) -> Optional[Fragment]: ...
    def get_fragments_by_ids(self, ids: list[str]) -> list[Fragment]: ...
    def save_clone_match(self, match: "CloneMatch") -> str: ...
    def get_assignment_templates(
        self, assignment_id: str
    ) -> list[frozenset[str]]: ...
    def get_all_fragment_signatures(
        self,
    ) -> Iterable[tuple[str, bytes]]: ...
    def save_plagiarism_group(self, group: Any) -> str: ...


# ────────────────────────────────────────────────────────────────────────────
# Result data classes
# ────────────────────────────────────────────────────────────────────────────

@dataclass
class CloneMatch:
    """Persisted result of the cascade for a candidate fragment pair."""
    id: Optional[str] = None
    frag_a_id: str = ""
    frag_b_id: str = ""
    student_a: str = ""
    student_b: str = ""
    clone_type: str = "Non-Syntactic"
    confidence: float = 0.0
    is_clone: bool = False
    features: Optional[dict] = None          # serialised syntactic features
    normalized_code_a: Optional[str] = None
    normalized_code_b: Optional[str] = None


@dataclass
class IngestionResult:
    """Summary of a single submission's ingestion."""
    submission_id: str
    student_id: str
    assignment_id: str
    fragment_count: int = 0
    candidate_pair_count: int = 0
    clone_matches: list[CloneMatch] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def confirmed_clone_count(self) -> int:
        return sum(1 for m in self.clone_matches if m.is_clone)


# ────────────────────────────────────────────────────────────────────────────
# In-memory DB (for tests / standalone use)
# ────────────────────────────────────────────────────────────────────────────

class InMemoryDB:
    """Simple dict-backed store; satisfies ``CIPASDatabase`` protocol."""

    def __init__(self) -> None:
        self._fragments: dict[str, Fragment] = {}
        self._matches: dict[str, CloneMatch] = {}
        self._templates: dict[str, list[frozenset[str]]] = {}
        self._groups: dict[str, Any] = {}

    def save_fragment(self, fragment: Fragment) -> str:
        fid = fragment.fragment_id or str(uuid.uuid4())
        fragment.fragment_id = fid
        self._fragments[fid] = fragment
        return fid

    def get_fragment(self, fragment_id: str) -> Optional[Fragment]:
        return self._fragments.get(fragment_id)

    def get_fragments_by_ids(self, ids: list[str]) -> list[Fragment]:
        return [self._fragments[i] for i in ids if i in self._fragments]

    def save_clone_match(self, match: CloneMatch) -> str:
        mid = match.id or str(uuid.uuid4())
        match.id = mid
        self._matches[mid] = match
        return mid

    def get_assignment_templates(
        self, assignment_id: str
    ) -> list[frozenset[str]]:
        return self._templates.get(assignment_id, [])

    def register_template_tokens(
        self,
        assignment_id: str,
        token_sets: list[frozenset[str]],
    ) -> None:
        self._templates.setdefault(assignment_id, []).extend(token_sets)

    def get_all_fragment_signatures(
        self,
    ) -> Iterable[tuple[str, bytes]]:
        for fid, frag in self._fragments.items():
            if frag.lsh_signature is not None:
                yield fid, frag.lsh_signature

    def save_plagiarism_group(self, group: Any) -> str:
        gid = str(group.group_id)
        self._groups[gid] = group
        return gid

    # Convenience: list all stored matches
    def all_matches(self) -> list[CloneMatch]:
        return list(self._matches.values())


# ────────────────────────────────────────────────────────────────────────────
# CascadeWorker
# ────────────────────────────────────────────────────────────────────────────

class CascadeWorker:
    """
    Orchestrates Phase 1–4 for a single student submission.

    Parameters
    ----------
    db:         Storage backend (implements ``CIPASDatabase``).
    indexer:    Shared ``MinHashIndexer`` instance (injected so multiple
                workers can share the same in-memory index, or it can be
                rebuilt from DB on startup).
    graph:      Shared ``CollusionGraph`` instance.
    pipeline:   Tiered detection pipeline (loaded once and reused).
    tpl_filter: Pre-populated ``TemplateFilter``; if None, one is created
                and populated from ``db`` on first use.
    """

    def __init__(
        self,
        db: CIPASDatabase,
        indexer: MinHashIndexer,
        graph: CollusionGraph,
        pipeline: Optional[TieredPipeline] = None,
        tpl_filter: Optional[TemplateFilter] = None,
    ) -> None:
        self._db = db
        self._indexer = indexer
        self._graph = graph
        self._pipeline = pipeline or TieredPipeline()
        self._tpl_filter: Optional[TemplateFilter] = tpl_filter

    # ── Public API ──────────────────────────────────────────────────────────

    def process_submission(
        self,
        source_code: str,
        language: str,
        submission_id: str,
        student_id: str,
        assignment_id: str,
    ) -> IngestionResult:
        """
        Full pipeline for a single student submission.

        Thread-safe as long as the injected ``indexer`` and ``graph`` are
        accessed under locks in multi-threaded environments.
        """
        result = IngestionResult(
            submission_id=submission_id,
            student_id=student_id,
            assignment_id=assignment_id,
        )

        # ── Phase 1a: Segmentation ───────────────────────────────────────
        try:
            fragmenter = Fragmenter(language)
            raw_fragments = fragmenter.segment(
                source=source_code,
                submission_id=submission_id,
                student_id=student_id,
                assignment_id=assignment_id,
            )
        except Exception as exc:
            msg = f"Segmentation failed: {exc}"
            logger.error(msg)
            result.errors.append(msg)
            return result

        # ── Phase 1b: Template filtering ────────────────────────────────
        tpl_filter = self._get_template_filter(assignment_id)
        clean_fragments = tpl_filter.filter(raw_fragments)
        result.fragment_count = len(clean_fragments)
        logger.info(
            "[%s] %d fragments after template filter (was %d)",
            submission_id, len(clean_fragments), len(raw_fragments),
        )

        # Assign IDs and persist fragments
        for frag in clean_fragments:
            frag.fragment_id = str(uuid.uuid4())
            try:
                self._db.save_fragment(frag)
            except Exception as exc:
                result.errors.append(f"DB save_fragment failed: {exc}")

        # ── Phase 2a: LSH Indexing ───────────────────────────────────────
        for frag in clean_fragments:
            try:
                self._indexer.index(frag)
            except Exception as exc:
                result.errors.append(f"LSH index failed for {frag.fragment_id}: {exc}")

        # ── Phase 2b: Candidate Retrieval ────────────────────────────────
        candidate_pairs = generate_candidate_pairs(self._indexer, clean_fragments)
        result.candidate_pair_count = len(candidate_pairs)
        logger.info(
            "[%s] %d candidate pairs generated",
            submission_id, len(candidate_pairs),
        )

        # ── Phase 3: CIPAS Syntactic Cascade ────────────────────────────
        for frag_a_id, frag_b_id in candidate_pairs:
            match = self._run_cascade(frag_a_id, frag_b_id)
            if match is None:
                continue
            result.clone_matches.append(match)

            if match.is_clone:
                # ── Phase 4: Update graph ────────────────────────────────
                self._graph.add_match(
                    student_a=match.student_a,
                    student_b=match.student_b,
                    clone_type=match.clone_type,
                    confidence=match.confidence,
                    frag_a_id=frag_a_id,
                    frag_b_id=frag_b_id,
                )

        confirmed = result.confirmed_clone_count
        logger.info(
            "[%s] cascade complete: %d / %d matches confirmed as clones",
            submission_id, confirmed, len(candidate_pairs),
        )
        return result

    def rebuild_index_from_db(self) -> int:
        """
        Reload the MinHash LSH index from persisted fragment signatures.

        Call once on service startup so the index is warm for new submissions.
        """
        records = self._db.get_all_fragment_signatures()
        count = self._indexer.rebuild_from_db(records)
        logger.info("Index rebuilt: %d fragments loaded from DB", count)
        return count

    def build_collusion_report(
        self,
        assignment_id: Optional[str] = None,
        min_confidence: float = 0.0,
    ) -> list[dict]:
        """
        Compute connected components and return serialisable group summaries.

        ``assignment_id`` filtering must be done at the DB/graph layer;
        this method assumes the graph already contains only relevant edges.
        """
        groups = self._graph.connected_components(
            min_group_size=2, min_confidence=min_confidence
        )
        return [g.summary() for g in groups]

    # ── Private helpers ─────────────────────────────────────────────────────

    def _get_template_filter(self, assignment_id: str) -> TemplateFilter:
        if self._tpl_filter is None:
            self._tpl_filter = TemplateFilter()
        # Load templates from DB if available
        try:
            template_sets = self._db.get_assignment_templates(assignment_id)
            if template_sets:
                self._tpl_filter.register_hashes(assignment_id, template_sets)
        except Exception as exc:
            logger.warning("Could not load templates for %s: %s", assignment_id, exc)
        return self._tpl_filter

    def _run_cascade(
        self,
        frag_a_id: str,
        frag_b_id: str,
    ) -> Optional[CloneMatch]:
        """
        Fetch both fragments and run the TieredPipeline.

        Returns a CloneMatch (is_clone may be False for Non-Syntactic).
        Returns None only if fragments cannot be retrieved.
        """
        frags = self._db.get_fragments_by_ids([frag_a_id, frag_b_id])
        if len(frags) < 2:
            logger.warning("Could not fetch fragments %s, %s", frag_a_id, frag_b_id)
            return None

        frag_a = next((f for f in frags if f.fragment_id == frag_a_id), None)
        frag_b = next((f for f in frags if f.fragment_id == frag_b_id), None)
        if frag_a is None or frag_b is None:
            return None

        # Determine common language for cross-language comparison
        lang = frag_a.language if frag_a.language == frag_b.language else "java"

        try:
            detection = self._pipeline.detect(
                frag_a.raw_source,
                frag_b.raw_source,
                language=lang,
            )
        except Exception as exc:
            logger.warning(
                "Pipeline error for (%s, %s): %s", frag_a_id, frag_b_id, exc
            )
            return None

        # Serialise syntactic features for evidence view
        features_dict: Optional[dict] = None
        if detection.syntactic_features is not None:
            feats = detection.syntactic_features
            feature_names = [
                "jaccard", "dice", "lev_dist", "lev_ratio", "jaro", "jaro_winkler"
            ]
            features_dict = {
                name: float(feats[i])
                for i, name in enumerate(feature_names)
                if i < len(feats)
            }
            # Add edge weight (confidence) as named field
            features_dict["confidence"] = detection.confidence

        match = CloneMatch(
            frag_a_id=frag_a_id,
            frag_b_id=frag_b_id,
            student_a=frag_a.student_id,
            student_b=frag_b.student_id,
            clone_type=detection.clone_type,
            confidence=detection.confidence,
            is_clone=detection.is_clone,
            features=features_dict,
            normalized_code_a=detection.normalized_code1 or detection.blinded_code1,
            normalized_code_b=detection.normalized_code2 or detection.blinded_code2,
        )

        try:
            self._db.save_clone_match(match)
        except Exception as exc:
            logger.warning("DB save_clone_match failed: %s", exc)

        return match
