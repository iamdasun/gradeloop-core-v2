"""
evaluate_clustering.py — Evaluate the Phase 1–4 clustering pipeline on Project CodeNet.

What is being evaluated
───────────────────────
The *clustering pipeline* introduced in Phases 1–4 is distinct from the pair-wise
clone detector in evaluate.py.  Its job is to:

  Phase 1  Segment each submission into structural fragments + sliding windows
           and filter out instructor-template fragments.
  Phase 2  Index fragments with MinHash + LSH so only O(k·N) candidate pairs
           (rather than O(N²)) are forwarded to the expensive cascade.
  Phase 3  Run the CIPAS Syntactic Cascade (NiCAD + XGBoost) on each candidate.
  Phase 4  Build / update the student collusion graph and extract groups.

Key metrics
───────────
  LSH candidate recall     % of true clone pairs surfaced by Phase 2
  LSH candidate precision  % of Phase 2 candidates that are true clones
  Workload reduction       1 - (Phase 2 candidates / N² brute-force pairs)
  End-to-end recall        % of true clone pairs detected by Phase 3-4
  End-to-end precision     % of Phase 3-4 detections that are true clones
  End-to-end F1            Harmonic mean of the two above
  Cluster purity           Fraction of largest-class members per collusion group
  Adjusted Rand Index      Similarity between detected groups and GT groups
                           (requires sklearn ≥ 1.0)

Ground truth
────────────
The script runs the *brute-force* TieredPipeline on ALL within-problem pairs
to obtain the ground-truth clone set.  This is the same pipeline that the
CascadeWorker calls internally — making the Phase 2 candidate-recall metric a
direct measure of "how much of the expensive work can the LSH stage skip without
missing true positives."

Dataset structure (Project CodeNet)
────────────────────────────────────
  data/{problem_id}/{language}/{submission_id}.{ext}
  metadata/{problem_id}.csv   (columns: submission_id, user_id, status, …)

Usage
─────
    # Quick smoke test — 5 problems, 50 submissions each
    poetry run python evaluate_clustering.py --n-problems 5 --max-submissions 50

    # Full Java run on 50 problems
    poetry run python evaluate_clustering.py --n-problems 50 --language java

    # Multi-language, verbose
    poetry run python evaluate_clustering.py --language java python \\
        --n-problems 20 --max-submissions 100 --verbose

    # Skip brute-force GT (only measure LSH candidate recall w/ cascade results
    # as partial proxy)
    poetry run python evaluate_clustering.py --skip-brute-force
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import logging
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

import numpy as np
from sklearn.metrics import adjusted_rand_score
from tqdm import tqdm

from clone_detection.cascade_worker import CascadeWorker, IngestionResult, InMemoryDB
from clone_detection.collusion_graph import CollusionGraph, CollusionGroup
from clone_detection.lsh_index import MinHashIndexer
from clone_detection.pipelines import TieredPipeline
from clone_detection.preprocessor import TemplateFilter
from clone_detection.utils.common_setup import setup_logging

logger = setup_logging(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

CODENET_ROOT = Path(
    "/home/iamdasun/Projects/4yrg/gradeloop-core-v2/datasets/project-codenet"
)
CODENET_DATA = CODENET_ROOT / "data"
CODENET_META = CODENET_ROOT / "metadata"

# Language → file extension map (matching CodeNet directory names)
LANG_DIR: dict[str, str] = {
    "java": "Java",
    "python": "Python",
    "c": "C",
    "csharp": "C#",
}
LANG_EXT: dict[str, str] = {
    "java": ".java",
    "python": ".py",
    "c": ".c",
    "csharp": ".cs",
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Submission:
    submission_id: str
    problem_id: str
    user_id: str
    language: str
    source_code: str
    status: str = "Accepted"


@dataclass
class ProblemResult:
    problem_id: str
    language: str
    n_submissions: int
    n_total_pairs: int
    n_gt_clone_pairs: int

    # Phase 2 — LSH candidate quality
    n_lsh_candidates: int
    lsh_candidate_recall: float
    lsh_candidate_precision: float
    workload_reduction: float

    # Phase 3-4 — end-to-end quality
    n_detected_clone_pairs: int
    e2e_recall: float
    e2e_precision: float
    e2e_f1: float

    # Phase 4 — cluster quality
    n_collusion_groups: int
    cluster_purity: float  # macro-averaged purity across groups
    adjusted_rand_index: float  # ARI vs GT clusters (−1 to 1; 1 = perfect)

    elapsed_brute_force_s: float
    elapsed_pipeline_s: float


# ---------------------------------------------------------------------------
# Dataset loading
# ---------------------------------------------------------------------------


def list_problems(n: int | None = None, seed: int = 42) -> list[str]:
    """Return a (possibly sampled) list of problem IDs present in the dataset."""
    problems = sorted(p.name for p in CODENET_DATA.iterdir() if p.is_dir())
    if n is not None and n < len(problems):
        rng = random.Random(seed)
        problems = rng.sample(problems, n)
    return sorted(problems)


def load_submissions(
    problem_id: str,
    language: str,
    max_submissions: int | None = None,
    accepted_only: bool = True,
    max_source_bytes: int = 16384,
    seed: int = 42,
) -> list[Submission]:
    """
    Load submission source files for a given (problem_id, language) pair.

    Parameters
    ----------
    problem_id:        e.g. "p00000"
    language:          "java" | "python" | "c" | "csharp"
    max_submissions:   cap to avoid O(N²) blowup; None = no cap
    accepted_only:     filter to Accepted submissions using metadata CSV
    max_source_bytes:  skip submissions whose source exceeds this byte length
                       (very large files cause slow tree-sitter parsing and produce
                       many fragments that skew LSH metrics; default: 16 KB)
    seed:              RNG seed for reproducible sampling

    Returns
    -------
    List of Submission objects with source_code populated.
    """
    lang_dir = LANG_DIR.get(language)
    lang_ext = LANG_EXT.get(language)
    if lang_dir is None or lang_ext is None:
        raise ValueError(f"Unsupported language: {language!r}")

    source_dir = CODENET_DATA / problem_id / lang_dir
    if not source_dir.exists():
        return []

    # Read acceptance status from metadata CSV
    accepted_ids: set[str] | None = None
    if accepted_only:
        meta_csv = CODENET_META / f"{problem_id}.csv"
        if meta_csv.exists():
            accepted_ids = set()
            with open(meta_csv, newline="", encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    if row.get("status") == "Accepted":
                        accepted_ids.add(row["submission_id"])

    files = sorted(source_dir.glob(f"*{lang_ext}"))
    if accepted_ids is not None:
        files = [f for f in files if f.stem in accepted_ids]

    if max_submissions is not None and len(files) > max_submissions:
        rng = random.Random(seed)
        files = rng.sample(files, max_submissions)

    submissions: list[Submission] = []
    for path in files:
        try:
            source = path.read_text(encoding="utf-8", errors="replace").strip()
            if not source:
                continue
            if max_source_bytes and len(source.encode()) > max_source_bytes:
                logger.debug(
                    "Skipping %s: source too large (%d bytes)",
                    path.name,
                    len(source.encode()),
                )
                continue
            submissions.append(
                Submission(
                    submission_id=path.stem,
                    problem_id=problem_id,
                    user_id=path.stem,  # use submission_id as user proxy
                    language=language,
                    source_code=source,
                )
            )
        except OSError:
            logger.debug("Could not read %s", path)

    return submissions


# ---------------------------------------------------------------------------
# Brute-force ground truth
# ---------------------------------------------------------------------------


def _pair_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def compute_brute_force_ground_truth(
    submissions: list[Submission],
    language: str,
    pipeline: TieredPipeline | None = None,
    phase1_only: bool = True,
) -> set[tuple[str, str]]:
    """
    Run TieredPipeline on every pair within *submissions* and return the set
    of (submission_id_a, submission_id_b) pairs classified as clones.

    This is the ground-truth oracle for evaluating Phase 2–4.

    Args:
        submissions: List of submissions to compare.
        language: Programming language.
        pipeline: Pre-built TieredPipeline (created fresh if None).
        phase1_only: If True (default), only use Phase 1 (NiCAD-style Type-1/Type-2)
            for ground truth.  Phase 2 (ToMa tokenizer) can be very slow on some
            files so it is skipped by default.  Set to False to include Type-3 clones
            (requires a fast machine and ``--max-source-kb`` to be very small).

    WARNING: This is O(N²) and can be slow for N > 200 submissions.  Use
    ``max_submissions`` to control N.
    """
    if pipeline is None:
        pipeline = TieredPipeline(classifier=None)

    gt_pairs: set[tuple[str, str]] = set()
    pairs = list(itertools.combinations(submissions, 2))

    for sub_a, sub_b in pairs:
        try:
            if phase1_only:
                # Use only Phase 1 (NiCAD-style normalizer) — fast, no tree-sitter tokenizer
                result = pipeline._phase_one_nicad(
                    sub_a.source_code, sub_b.source_code, language
                )
                if result.clone_type in ("Type-1", "Type-2"):
                    gt_pairs.add(_pair_key(sub_a.submission_id, sub_b.submission_id))
            else:
                result = pipeline.detect(sub_a.source_code, sub_b.source_code, language)
                if result.clone_type not in ("Non-Syntactic", "Non-Clone", None, ""):
                    gt_pairs.add(_pair_key(sub_a.submission_id, sub_b.submission_id))
        except Exception as exc:
            logger.debug(
                "Brute-force pair failed %s/%s: %s",
                sub_a.submission_id,
                sub_b.submission_id,
                exc,
            )

    return gt_pairs


# ---------------------------------------------------------------------------
# Clustering pipeline run
# ---------------------------------------------------------------------------


@dataclass
class PipelineRun:
    """All artefacts produced by one clustering pipeline run on a problem."""

    db: InMemoryDB
    indexer: MinHashIndexer
    graph: CollusionGraph
    results: list[IngestionResult]
    candidate_pairs: set[tuple[str, str]]  # from LSH (Phase 2)
    detected_pairs: set[tuple[str, str]]  # confirmed clones (Phase 3-4)
    # submission_id → student_id (in our case they're the same)
    submission_map: dict[str, str] = field(default_factory=dict)


def run_clustering_pipeline(
    submissions: list[Submission],
    language: str,
    assignment_id: str,
    lsh_num_perm: int = 128,
    lsh_threshold: float = 0.3,
    lsh_only: bool = False,
    max_cascade_pairs: int | None = None,
) -> PipelineRun:
    """
    Ingest all submissions for one problem through the CascadeWorker pipeline.

    Phases executed per submission:
      1  Segment → fragments
      2  Index with MinHashIndexer → candidate pairs accumulated
      3  TieredPipeline cascade on candidates  (skipped when lsh_only=True)
      4  Update CollusionGraph                 (skipped when lsh_only=True)

    Parameters
    ----------
    lsh_only:           When True, only Phases 1-2 are run; cascade is skipped and
                        candidate pairs are compared directly to GT for recall/reduction.
    max_cascade_pairs:  Cap total cascade calls per problem (avoids O(N²) blowup for
                        large submission sets).  None = no cap.

    Returns PipelineRun with all DB, indexer, graph, and metric artefacts.
    """
    db = InMemoryDB()
    indexer = MinHashIndexer(num_perm=lsh_num_perm, threshold=lsh_threshold)
    graph = CollusionGraph()

    if lsh_only:
        # Phase 1-2 only: fragment + index, no cascade
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter(language=language)
        results: list[IngestionResult] = []
        for sub in submissions:
            try:
                frags = fragmenter.segment(
                    source=sub.source_code,
                    submission_id=sub.submission_id,
                    student_id=sub.submission_id,
                    assignment_id=assignment_id,
                )
                for frag in frags:
                    db.save_fragment(frag)  # assigns fragment_id
                    sig_bytes = indexer.index(frag)
                    frag.lsh_signature = sig_bytes
                results.append(
                    IngestionResult(
                        submission_id=sub.submission_id,
                        student_id=sub.submission_id,
                        assignment_id=assignment_id,
                        fragment_count=len(frags),
                    )
                )
            except Exception as exc:
                logger.warning(
                    "LSH-only indexing failed for %s: %s", sub.submission_id, exc
                )

        # Collect candidate pairs: query each fragment against the index.
        # We use the internal MinHash store to skip re-building hashes.
        frag_to_sub: dict[str, str] = {
            fid: frag.submission_id
            for fid, frag in db._fragments.items()
            if frag.submission_id
        }
        candidate_pairs: set[tuple[str, str]] = set()
        # Only query once per unique (sub_a, fragment) to avoid O(F²) scanning
        seen_fid: set[str] = set()
        for fid, frag in db._fragments.items():
            sub_a = frag_to_sub.get(fid)
            if not sub_a or fid in seen_fid:
                continue
            seen_fid.add(fid)
            try:
                # Use stored MinHash directly to avoid recomputing
                minhash = indexer._store.get(fid)
                if minhash is None:
                    continue
                raw_candidates = indexer._lsh.query(minhash)
                for cid in raw_candidates:
                    if cid == fid:
                        continue
                    sub_b = frag_to_sub.get(cid)
                    if sub_b and sub_a != sub_b:
                        candidate_pairs.add(_pair_key(sub_a, sub_b))
            except Exception:
                pass

        return PipelineRun(
            db=db,
            indexer=indexer,
            graph=graph,
            results=results,
            candidate_pairs=candidate_pairs,
            detected_pairs=set(),
            submission_map={s.submission_id: s.submission_id for s in submissions},
        )

    worker = CascadeWorker(db=db, indexer=indexer, graph=graph)

    results: list[IngestionResult] = []
    candidate_pairs: set[tuple[str, str]] = set()
    total_cascade_calls = 0
    cascade_cap_hit = False

    for sub in submissions:
        if max_cascade_pairs is not None and total_cascade_calls >= max_cascade_pairs:
            if not cascade_cap_hit:
                logger.debug(
                    "max_cascade_pairs=%d reached — remaining submissions skipped",
                    max_cascade_pairs,
                )
                cascade_cap_hit = True
            break
        try:
            result = worker.process_submission(
                source_code=sub.source_code,
                language=language,
                submission_id=sub.submission_id,
                student_id=sub.submission_id,  # use submission_id as student proxy
                assignment_id=assignment_id,
            )
            results.append(result)
            total_cascade_calls += result.candidate_pair_count
        except Exception as exc:
            logger.warning("CascadeWorker failed for %s: %s", sub.submission_id, exc)

    # Reconstruct submission-level candidate pairs using stored MinHash hashes
    # directly (avoids re-building hashes for every fragment).
    frag_to_sub: dict[str, str] = {
        fid: frag.submission_id
        for fid, frag in db._fragments.items()
        if frag.submission_id
    }

    for fid, sub_a in frag_to_sub.items():
        try:
            minhash = indexer._store.get(fid)
            if minhash is None:
                continue
            for cid in indexer._lsh.query(minhash):
                if cid == fid:
                    continue
                sub_b = frag_to_sub.get(cid)
                if sub_b and sub_a != sub_b:
                    candidate_pairs.add(_pair_key(sub_a, sub_b))
        except Exception:
            pass

    # Collect confirmed clone pairs from stored matches
    detected_pairs: set[tuple[str, str]] = set()
    for match in db.all_matches():
        if match.is_clone and match.student_a != match.student_b:
            detected_pairs.add(_pair_key(match.student_a, match.student_b))

    return PipelineRun(
        db=db,
        indexer=indexer,
        graph=graph,
        results=results,
        candidate_pairs=candidate_pairs,
        detected_pairs=detected_pairs,
        submission_map={s.submission_id: s.submission_id for s in submissions},
    )


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------


def _safe_div(num: float, den: float, default: float = 0.0) -> float:
    return num / den if den > 0 else default


def compute_lsh_metrics(
    candidate_pairs: set[tuple[str, str]],
    gt_clone_pairs: set[tuple[str, str]],
    n_total_pairs: int,
) -> dict[str, float]:
    true_positives_hit = candidate_pairs & gt_clone_pairs
    return {
        "lsh_candidate_recall": _safe_div(len(true_positives_hit), len(gt_clone_pairs)),
        "lsh_candidate_precision": _safe_div(
            len(true_positives_hit), len(candidate_pairs)
        ),
        "workload_reduction": _safe_div(
            n_total_pairs - len(candidate_pairs), n_total_pairs
        ),
        "n_lsh_candidates": len(candidate_pairs),
        "n_lsh_tp_covered": len(true_positives_hit),
    }


def compute_e2e_metrics(
    detected_pairs: set[tuple[str, str]],
    gt_clone_pairs: set[tuple[str, str]],
) -> dict[str, float]:
    tp = len(detected_pairs & gt_clone_pairs)
    fp = len(detected_pairs - gt_clone_pairs)
    fn = len(gt_clone_pairs - detected_pairs)

    recall = _safe_div(tp, tp + fn)
    precision = _safe_div(tp, tp + fp)
    f1 = _safe_div(2 * precision * recall, precision + recall)
    return {
        "e2e_recall": recall,
        "e2e_precision": precision,
        "e2e_f1": f1,
        "e2e_tp": tp,
        "e2e_fp": fp,
        "e2e_fn": fn,
    }


def compute_cluster_quality(
    groups: list[CollusionGroup],
    gt_clone_pairs: set[tuple[str, str]],
    all_submissions: list[str],
) -> dict[str, float]:
    """
    Compute cluster quality metrics by comparing detected collusion groups
    to ground-truth clusters derived from the clone pair graph.

    GT clusters: connected components of the brute-force clone pair graph.
    Predicted clusters: connected components from CollusionGraph.

    Returns ARI and macro-averaged purity against the GT clusters.
    """
    if not all_submissions:
        return {"cluster_purity": 0.0, "adjusted_rand_index": 0.0, "n_groups": 0}

    sub_to_int = {s: i for i, s in enumerate(all_submissions)}
    n = len(all_submissions)

    # Build GT cluster labels using Union-Find on gt_clone_pairs
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for sa, sb in gt_clone_pairs:
        ia, ib = sub_to_int.get(sa, -1), sub_to_int.get(sb, -1)
        if ia >= 0 and ib >= 0:
            union(ia, ib)

    gt_labels = [find(i) for i in range(n)]

    # Build predicted labels from CollusionGraph components
    pred_labels = list(range(n))  # default: each submission = its own cluster
    for gidx, group in enumerate(groups):
        for member in group.member_ids:
            idx = sub_to_int.get(member, -1)
            if idx >= 0:
                pred_labels[idx] = -(gidx + 1)  # negative = in a collusion group

    # ARI
    try:
        ari = float(adjusted_rand_score(gt_labels, pred_labels))
    except Exception:
        ari = 0.0

    # Purity: for each predicted cluster, find the most common GT label
    from collections import Counter

    cluster_members: dict[int, list[int]] = {}
    for idx, lbl in enumerate(pred_labels):
        cluster_members.setdefault(lbl, []).append(idx)

    total_correct = 0
    for cluster_idxs in cluster_members.values():
        gt_lbls_in_cluster = [gt_labels[i] for i in cluster_idxs]
        most_common_count = Counter(gt_lbls_in_cluster).most_common(1)[0][1]
        total_correct += most_common_count
    purity = _safe_div(total_correct, n)

    return {
        "cluster_purity": purity,
        "adjusted_rand_index": ari,
        "n_groups": len(groups),
    }


# ---------------------------------------------------------------------------
# Single-problem evaluation
# ---------------------------------------------------------------------------


def evaluate_problem(
    problem_id: str,
    language: str,
    max_submissions: int,
    lsh_num_perm: int,
    lsh_threshold: float,
    accepted_only: bool,
    skip_brute_force: bool,
    brute_force_pipeline: TieredPipeline | None,
    lsh_only: bool,
    max_cascade_pairs: int | None,
    max_source_bytes: int,
    seed: int,
    phase1_only_gt: bool = True,
) -> ProblemResult | None:
    """
    Run the full evaluation for one (problem_id, language) pair.

    Returns None if fewer than 2 submissions are found.
    """
    submissions = load_submissions(
        problem_id=problem_id,
        language=language,
        max_submissions=max_submissions,
        accepted_only=accepted_only,
        max_source_bytes=max_source_bytes,
        seed=seed,
    )

    if len(submissions) < 2:
        logger.debug("%s/%s: fewer than 2 submissions — skipping", problem_id, language)
        return None

    n = len(submissions)
    n_total_pairs = n * (n - 1) // 2
    sub_ids = [s.submission_id for s in submissions]

    logger.debug(
        "%s/%s: %d submissions → %d total pairs", problem_id, language, n, n_total_pairs
    )

    # ── Brute-force ground truth ──────────────────────────────────────────
    gt_clone_pairs: set[tuple[str, str]] = set()
    elapsed_bf = 0.0
    if not skip_brute_force:
        t0 = time.perf_counter()
        gt_clone_pairs = compute_brute_force_ground_truth(
            submissions=submissions,
            language=language,
            pipeline=brute_force_pipeline,
            phase1_only=phase1_only_gt,
        )
        elapsed_bf = time.perf_counter() - t0
        logger.debug(
            "%s/%s: brute-force found %d clone pairs in %.1fs",
            problem_id,
            language,
            len(gt_clone_pairs),
            elapsed_bf,
        )

    # ── Clustering pipeline ───────────────────────────────────────────────
    t1 = time.perf_counter()
    run = run_clustering_pipeline(
        submissions=submissions,
        language=language,
        assignment_id=f"{problem_id}_{language}",
        lsh_num_perm=lsh_num_perm,
        lsh_threshold=lsh_threshold,
        lsh_only=lsh_only,
        max_cascade_pairs=max_cascade_pairs,
    )
    elapsed_pipeline = time.perf_counter() - t1

    # ── LSH phase 2 metrics ───────────────────────────────────────────────
    lsh_m = compute_lsh_metrics(
        candidate_pairs=run.candidate_pairs,
        gt_clone_pairs=gt_clone_pairs,
        n_total_pairs=n_total_pairs,
    )

    # ── End-to-end metrics ────────────────────────────────────────────────
    e2e_m = compute_e2e_metrics(
        detected_pairs=run.detected_pairs,
        gt_clone_pairs=gt_clone_pairs,
    )

    # ── Cluster quality ───────────────────────────────────────────────────
    groups = run.graph.connected_components()
    cluster_m = compute_cluster_quality(
        groups=groups,
        gt_clone_pairs=gt_clone_pairs,
        all_submissions=sub_ids,
    )

    return ProblemResult(
        problem_id=problem_id,
        language=language,
        n_submissions=n,
        n_total_pairs=n_total_pairs,
        n_gt_clone_pairs=len(gt_clone_pairs),
        n_lsh_candidates=lsh_m["n_lsh_candidates"],
        lsh_candidate_recall=lsh_m["lsh_candidate_recall"],
        lsh_candidate_precision=lsh_m["lsh_candidate_precision"],
        workload_reduction=lsh_m["workload_reduction"],
        n_detected_clone_pairs=len(run.detected_pairs),
        e2e_recall=e2e_m["e2e_recall"],
        e2e_precision=e2e_m["e2e_precision"],
        e2e_f1=e2e_m["e2e_f1"],
        n_collusion_groups=cluster_m["n_groups"],
        cluster_purity=cluster_m["cluster_purity"],
        adjusted_rand_index=cluster_m["adjusted_rand_index"],
        elapsed_brute_force_s=elapsed_bf,
        elapsed_pipeline_s=elapsed_pipeline,
    )


# ---------------------------------------------------------------------------
# Aggregate evaluation
# ---------------------------------------------------------------------------


def evaluate(
    n_problems: int = 20,
    languages: list[str] | None = None,
    max_submissions: int = 100,
    lsh_num_perm: int = 128,
    lsh_threshold: float = 0.3,
    accepted_only: bool = True,
    skip_brute_force: bool = False,
    lsh_only: bool = False,
    max_cascade_pairs: int | None = None,
    max_source_bytes: int = 16384,
    output_json: Path | None = None,
    seed: int = 42,
    phase1_only_gt: bool = True,
) -> dict:
    if languages is None:
        languages = ["java"]

    logger.info("=" * 80)
    logger.info("Clustering Pipeline Evaluation — Project CodeNet")
    logger.info("=" * 80)
    logger.info(f"Problems        : {n_problems}")
    logger.info(f"Languages       : {', '.join(languages)}")
    logger.info(f"Max submissions : {max_submissions} per problem/language")
    logger.info(f"LSH perm        : {lsh_num_perm}   threshold: {lsh_threshold}")
    logger.info(f"Accepted only   : {accepted_only}")
    logger.info(
        f"Ground truth    : {'SKIPPED' if skip_brute_force else ('PHASE-1 ONLY (Type-1/2)' if phase1_only_gt else 'FULL TieredPipeline (Type-1/2/3)')}"
    )
    logger.info(
        f"Mode            : {'LSH Phase 2 only (no cascade)' if lsh_only else f'full cascade (cap={max_cascade_pairs})'}"
    )
    logger.info("=" * 80)

    problems = list_problems(n=n_problems, seed=seed)
    logger.info(f"\nSelected {len(problems)} problems from {CODENET_DATA}")

    # Build a shared brute-force pipeline (no XGBoost — NiCAD only for speed)
    bf_pipeline: TieredPipeline | None = None
    if not skip_brute_force:
        logger.info("Initialising brute-force TieredPipeline (NiCAD-only) …")
        bf_pipeline = TieredPipeline(classifier=None)

    all_results: list[ProblemResult] = []

    with tqdm(
        total=len(problems) * len(languages),
        desc="Evaluating problems",
        unit="prob",
    ) as pbar:
        for pid in problems:
            for lang in languages:
                pbar.set_description(f"{pid}/{lang}")
                try:
                    result = evaluate_problem(
                        problem_id=pid,
                        language=lang,
                        max_submissions=max_submissions,
                        lsh_num_perm=lsh_num_perm,
                        lsh_threshold=lsh_threshold,
                        accepted_only=accepted_only,
                        skip_brute_force=skip_brute_force,
                        brute_force_pipeline=bf_pipeline,
                        lsh_only=lsh_only,
                        max_cascade_pairs=max_cascade_pairs,
                        max_source_bytes=max_source_bytes,
                        seed=seed,
                        phase1_only_gt=phase1_only_gt,
                    )
                    if result is not None:
                        all_results.append(result)
                except Exception as exc:
                    logger.warning("Problem %s/%s failed: %s", pid, lang, exc)
                pbar.update(1)

    if not all_results:
        logger.error(
            "No problems produced results — check dataset path and language selection."
        )
        return {}

    # ── Aggregate ─────────────────────────────────────────────────────────
    def _mean(vals: list[float]) -> float:
        return float(np.mean(vals)) if vals else 0.0

    def _median(vals: list[float]) -> float:
        return float(np.median(vals)) if vals else 0.0

    summary = {
        "n_problems_evaluated": len(all_results),
        "total_submissions": sum(r.n_submissions for r in all_results),
        "total_pairs": sum(r.n_total_pairs for r in all_results),
        "total_gt_clones": sum(r.n_gt_clone_pairs for r in all_results),
        "total_candidates": sum(r.n_lsh_candidates for r in all_results),
        "total_detected": sum(r.n_detected_clone_pairs for r in all_results),
        # LSH Phase 2
        "mean_lsh_candidate_recall": _mean(
            [r.lsh_candidate_recall for r in all_results]
        ),
        "median_lsh_candidate_recall": _median(
            [r.lsh_candidate_recall for r in all_results]
        ),
        "mean_lsh_candidate_precision": _mean(
            [r.lsh_candidate_precision for r in all_results]
        ),
        "mean_workload_reduction": _mean([r.workload_reduction for r in all_results]),
        # End-to-end Phase 3-4
        "mean_e2e_recall": _mean([r.e2e_recall for r in all_results]),
        "mean_e2e_precision": _mean([r.e2e_precision for r in all_results]),
        "mean_e2e_f1": _mean([r.e2e_f1 for r in all_results]),
        # Cluster quality
        "mean_cluster_purity": _mean([r.cluster_purity for r in all_results]),
        "mean_adjusted_rand_index": _mean([r.adjusted_rand_index for r in all_results]),
        # Efficiency
        "total_elapsed_pipeline_s": sum(r.elapsed_pipeline_s for r in all_results),
        "total_elapsed_brute_force_s": sum(
            r.elapsed_brute_force_s for r in all_results
        ),
    }

    # ── Print report ───────────────────────────────────────────────────────
    logger.info("\n" + "=" * 80)
    logger.info("EVALUATION REPORT — Clustering Pipeline on Project CodeNet")
    logger.info("=" * 80)
    logger.info(f"Problems evaluated    : {summary['n_problems_evaluated']}")
    logger.info(f"Total submissions     : {summary['total_submissions']:,}")
    logger.info(f"Total pairs (N²/2)   : {summary['total_pairs']:,}")
    logger.info(f"Total GT clone pairs  : {summary['total_gt_clones']:,}")
    logger.info("-" * 80)

    logger.info("\nPhase 2 — LSH Candidate Retrieval")
    logger.info(f"  Total candidates           : {summary['total_candidates']:,}")
    logger.info(
        f"  Mean candidate recall      : {summary['mean_lsh_candidate_recall']:.4f}   (target ≥ 0.90)"
    )
    logger.info(
        f"  Median candidate recall    : {summary['median_lsh_candidate_recall']:.4f}"
    )
    logger.info(
        f"  Mean candidate precision   : {summary['mean_lsh_candidate_precision']:.4f}"
    )
    logger.info(
        f"  Mean workload reduction    : {summary['mean_workload_reduction']:.4f}   (target ≥ 0.90)"
    )

    logger.info("\nPhase 3-4 — End-to-End Clone Detection")
    logger.info(f"  Mean recall    : {summary['mean_e2e_recall']:.4f}")
    logger.info(f"  Mean precision : {summary['mean_e2e_precision']:.4f}")
    logger.info(f"  Mean F1        : {summary['mean_e2e_f1']:.4f}")

    logger.info("\nPhase 4 — Cluster Quality")
    logger.info(f"  Mean cluster purity       : {summary['mean_cluster_purity']:.4f}")
    logger.info(
        f"  Mean Adjusted Rand Index  : {summary['mean_adjusted_rand_index']:.4f}"
    )

    logger.info("\nEfficiency")
    logger.info(
        f"  Pipeline elapsed          : {summary['total_elapsed_pipeline_s']:.1f}s"
    )
    if not skip_brute_force:
        speedup = _safe_div(
            summary["total_elapsed_brute_force_s"], summary["total_elapsed_pipeline_s"]
        )
        logger.info(
            f"  Brute-force elapsed       : {summary['total_elapsed_brute_force_s']:.1f}s"
        )
        logger.info(f"  Speed-up factor           : {speedup:.1f}×")

    # Per-problem breakdown (show every problem if n ≤ 20, else sample)
    if len(all_results) <= 30:
        logger.info("\n" + "=" * 80)
        logger.info("Per-Problem Breakdown")
        logger.info("=" * 80)
        hdr = f"  {'problem':<10} {'lang':<7} {'n':>5} {'pairs':>7} {'gtClones':>8} {'candRec':>8} {'wkRed':>7} {'e2eF1':>7} {'ARI':>7}  {'pipelineS':>10}"
        logger.info(hdr)
        logger.info("  " + "-" * (len(hdr) - 2))
        for r in all_results:
            logger.info(
                f"  {r.problem_id:<10} {r.language:<7} {r.n_submissions:>5} "
                f"{r.n_total_pairs:>7} {r.n_gt_clone_pairs:>8} "
                f"{r.lsh_candidate_recall:>8.4f} {r.workload_reduction:>7.4f} "
                f"{r.e2e_f1:>7.4f} {r.adjusted_rand_index:>7.4f}  "
                f"{r.elapsed_pipeline_s:>9.2f}s"
            )

    # ── JSON output ────────────────────────────────────────────────────────
    if output_json is None:
        output_json = Path("./results/evaluate/clustering_results.json")

    if output_json:
        payload = {
            "summary": summary,
            "per_problem": [
                {
                    "problem_id": r.problem_id,
                    "language": r.language,
                    "n_submissions": r.n_submissions,
                    "n_total_pairs": r.n_total_pairs,
                    "n_gt_clone_pairs": r.n_gt_clone_pairs,
                    "n_lsh_candidates": r.n_lsh_candidates,
                    "lsh_candidate_recall": r.lsh_candidate_recall,
                    "lsh_candidate_precision": r.lsh_candidate_precision,
                    "workload_reduction": r.workload_reduction,
                    "n_detected_clone_pairs": r.n_detected_clone_pairs,
                    "e2e_recall": r.e2e_recall,
                    "e2e_precision": r.e2e_precision,
                    "e2e_f1": r.e2e_f1,
                    "n_collusion_groups": r.n_collusion_groups,
                    "cluster_purity": r.cluster_purity,
                    "adjusted_rand_index": r.adjusted_rand_index,
                    "elapsed_brute_force_s": r.elapsed_brute_force_s,
                    "elapsed_pipeline_s": r.elapsed_pipeline_s,
                }
                for r in all_results
            ],
        }
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(payload, indent=2))
        logger.info(f"\nJSON results written to {output_json}")

    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate the Phase 1–4 clustering pipeline on Project CodeNet.\n\n"
            "Metrics:\n"
            "  Phase 2  LSH candidate recall / precision / workload reduction\n"
            "  Phase 3-4  End-to-end clone recall / precision / F1\n"
            "  Phase 4  Cluster purity + Adjusted Rand Index\n\n"
            f"Dataset root: {CODENET_ROOT}"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--n-problems",
        type=int,
        default=20,
        metavar="N",
        help="Number of problems to sample from CodeNet (default: 20).",
    )
    parser.add_argument(
        "--language",
        nargs="+",
        default=["java"],
        choices=["java", "python", "c", "csharp"],
        metavar="LANG",
        help="Language(s) to evaluate.  Choices: java python c csharp  (default: java).",
    )
    parser.add_argument(
        "--max-submissions",
        type=int,
        default=100,
        metavar="N",
        help=(
            "Maximum submissions per (problem, language) pair.  "
            "Brute-force GT scales as O(N²) so keep ≤ 200 unless --skip-brute-force is set "
            "(default: 100)."
        ),
    )
    parser.add_argument(
        "--lsh-perm",
        type=int,
        default=128,
        metavar="K",
        help="Number of MinHash permutations (default: 128).",
    )
    parser.add_argument(
        "--lsh-threshold",
        type=float,
        default=0.3,
        metavar="T",
        help="MinHashLSH Jaccard threshold (default: 0.3).",
    )
    parser.add_argument(
        "--all-statuses",
        action="store_true",
        help="Include non-Accepted submissions (default: Accepted only).",
    )
    parser.add_argument(
        "--skip-brute-force",
        action="store_true",
        help=(
            "Skip the O(N²) brute-force ground-truth step.  "
            "LSH recall/ARI metrics will be 0 but pipeline throughput is still measured."
        ),
    )
    parser.add_argument(
        "--lsh-only",
        action="store_true",
        help=(
            "Phase 2 only: segment + MinHash index submissions, collect LSH candidate pairs, "
            "skip the Phase 3 cascade entirely.  Much faster; only LSH candidate recall, "
            "precision, and workload-reduction metrics are meaningful."
        ),
    )
    parser.add_argument(
        "--max-cascade-pairs",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Cap total cascade (Phase 3) calls per problem to avoid O(N²) blowup.  "
            "Remaining submissions are still indexed for LSH metrics.  "
            "Recommended: set to max_submissions² / 4 for a 75 %% coverage budget."
        ),
    )
    parser.add_argument(
        "--full-gt",
        action="store_true",
        help=(
            "Use the full TieredPipeline (Phase 1 + Phase 2 TomA) for ground-truth computation. "
            "By default only Phase 1 (NiCAD-style Type-1/Type-2) is used — it is fast and "
            "sufficient for evaluating the LSH index.  Enable this flag only when "
            "--max-source-kb is very small (≤ 4) to avoid slow tree-sitter tokenization."
        ),
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=None,
        metavar="PATH",
        help="Write per-problem + summary results to a JSON file (default: ./results/evaluate/clustering_results.json).",
    )
    parser.add_argument(
        "--max-source-kb",
        type=int,
        default=16,
        metavar="N",
        help=(
            "Skip submissions whose source exceeds this size in KB.  "
            "Very large files cause slow tree-sitter parsing and produce many "
            "fragments that skew LSH metrics (default: 16 KB)."
        ),
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        metavar="S",
        help="RNG seed for reproducible problem / submission sampling (default: 42).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    evaluate(
        n_problems=args.n_problems,
        languages=args.language,
        max_submissions=args.max_submissions,
        lsh_num_perm=args.lsh_perm,
        lsh_threshold=args.lsh_threshold,
        accepted_only=not args.all_statuses,
        skip_brute_force=args.skip_brute_force,
        lsh_only=args.lsh_only,
        max_cascade_pairs=args.max_cascade_pairs,
        max_source_bytes=args.max_source_kb * 1024,
        output_json=args.output_json,
        seed=args.seed,
        phase1_only_gt=not args.full_gt,
    )
