# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/scorer.py
"""
Scoring orchestrator for CIPAS Track A syntactic similarity pipeline.

This module implements the full three-stage scoring pipeline:

  Stage 1: Pre-Filter   (pre_filter.PreFilter)
    - Shingle + MinHash + LSH candidate discovery
    - Jaccard estimate secondary filter

  Stage 2: LCS Engine   (lcs_engine.LCSEngine / compare_pair_task)
    - Parallel LCS via ProcessPoolExecutor
    - Early termination per-pair
    - Snippet extraction for above-threshold pairs

  Stage 3: Thresholding
    - Compare LCS score against ScoringConfig.syntactic_clone_threshold
    - Classify as TYPE1 (exact hash match) or TYPE2 (LCS-based)
    - Build CloneMatch entries

The top-level entry point is SimilarityScoringPipeline.run(), which is an
async method that:
  1. Accepts two lists of GranuleRecord (fetched by the caller from the DB).
  2. Runs the synchronous pre-filter in the event loop (fast enough: <50ms).
  3. Dispatches LCS pairs to a ProcessPoolExecutor via asyncio.run_in_executor()
     in parallel bounded chunks.
  4. Collects results and builds the final SimilarityReport.

Parallelism model
─────────────────
LCS comparison is CPU-bound.  We use asyncio + ProcessPoolExecutor:

  ┌─────────────────────────────────────────────────────────────────────┐
  │ FastAPI event loop (single asyncio thread)                          │
  │                                                                     │
  │  await pipeline.run(granules_a, granules_b)                         │
  │    ├─ pre_filter.filter_candidates(...)  [sync, fast]               │
  │    ├─ asyncio.gather(                                               │
  │    │    run_in_executor(pool, compare_pair_task, pair_1), ...       │
  │    │  )  ← event loop stays responsive; workers run in parallel     │
  │    └─ collect + classify results                                    │
  └─────────────────────────────────────────────────────────────────────┘

  ProcessPoolExecutor workers (N = lcs_worker_count or os.cpu_count()):
    Each worker executes compare_pair_task() independently.
    Workers are created and destroyed by the caller via
    SimilarityScoringPipeline.start() / stop() to avoid fork-per-batch cost.

Chunk-based dispatch
────────────────────
All candidate pairs are dispatched in chunks of LCS_DISPATCH_CHUNK_SIZE
(default 256) to prevent overwhelming the asyncio gather() with thousands
of coroutines simultaneously, which would spike memory usage.  Each chunk
is awaited before the next is dispatched.

Type-1 short-circuit
────────────────────
Pairs whose granule_hash values are equal (TYPE1) are detected before any
LCS computation.  They receive a similarity_score of 1.0 automatically and
skip the LCS stage entirely.  This is correct because:
  - granule_hash = SHA-256(type1_normalise(source))
  - Equal hashes → identical normalised sources → LCS = full length → score = 1.0

Metrics
───────
The orchestrator tracks:
  - total_granule_pairs
  - pre_filter_candidates / rejection_rate
  - lcs_comparisons_run (type1 short-circuits not counted)
  - clones_flagged
  - duration_seconds

This module has no non-stdlib imports beyond cipas.similarity.*.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
import datetime
import os
import time
from typing import Any
from uuid import UUID, uuid4

from loguru import logger

from cipas.similarity.lcs_engine import LCSEngine, compare_pair_task
from cipas.similarity.models import (
    CloneMatch,
    CloneType,
    GranuleRecord,
    LCSResult,
    PreFilterCandidate,
    ScoringConfig,
    ScoringMetrics,
    SimilarityReport,
    SimilarityReportStatus,
)
from cipas.similarity.pre_filter import PreFilter

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

UTC = datetime.timezone.utc

# Number of LCS pairs dispatched to the executor in a single asyncio.gather().
# Larger chunks reduce coroutine overhead; smaller chunks keep memory usage low.
_LCS_DISPATCH_CHUNK_SIZE: int = 256

# Maximum number of clone matches stored in a single report.
# Prevents unbounded result sets when threshold is very low.
_MAX_MATCHES_PER_REPORT: int = 2_000


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_pre_filter(config: ScoringConfig) -> PreFilter:
    """Construct a PreFilter from a ScoringConfig."""
    return PreFilter(
        num_permutations=config.minhash_num_permutations,
        num_bands=config.lsh_num_bands,
        shingle_size=config.shingle_size,
        jaccard_threshold=config.jaccard_prefilter_threshold,
    )


def _classify_clone_type(
    granule_a: GranuleRecord,
    granule_b: GranuleRecord,
    lcs_score: float,
) -> CloneType:
    """
    Classify a confirmed clone as TYPE1 or TYPE2.

    TYPE1: granule hashes are equal (byte-identical after normalisation).
           LCS score will be 1.0 by construction.
    TYPE2: hashes differ but LCS score >= threshold (renamed / near-copy).

    Args:
        granule_a:  First granule in the pair.
        granule_b:  Second granule in the pair.
        lcs_score:  LCS similarity score (used as sanity check only; the
                    canonical classification is the hash comparison).

    Returns:
        CloneType.TYPE1 or CloneType.TYPE2.
    """
    if granule_a.granule_hash == granule_b.granule_hash:
        return CloneType.TYPE1
    return CloneType.TYPE2


def _make_clone_match(
    report_id: UUID,
    candidate: PreFilterCandidate,
    lcs_result: dict[str, Any],
    threshold: float,
) -> CloneMatch | None:
    """
    Build a CloneMatch from an LCS result dict if it meets the threshold.

    Returns None if the score is below the threshold.

    Args:
        report_id:  The UUID of the parent SimilarityReport.
        candidate:  The PreFilterCandidate (carries both GranuleRecord objects).
        lcs_result: Result dict from compare_pair_task() or LCSEngine.compare().
        threshold:  syntactic_clone_threshold from ScoringConfig.

    Returns:
        CloneMatch if score >= threshold, else None.
    """
    score: float = lcs_result["similarity_score"]
    if score < threshold:
        return None

    granule_a = candidate.granule_a
    granule_b = candidate.granule_b

    clone_type = _classify_clone_type(granule_a, granule_b, score)
    matching_tokens: list[str] = lcs_result.get("matching_tokens", [])
    snippet = " ".join(matching_tokens) if matching_tokens else ""

    return CloneMatch(
        report_id=report_id,
        submission_id=granule_a.submission_id,
        matched_submission_id=granule_b.submission_id,
        granule_a_id=granule_a.granule_id,
        granule_b_id=granule_b.granule_id,
        similarity_score=score,
        clone_type=clone_type,
        snippet_match=snippet[:4096],
    )


# ---------------------------------------------------------------------------
# SimilarityScoringPipeline
# ---------------------------------------------------------------------------


class SimilarityScoringPipeline:
    """
    Async orchestrator for the full three-stage syntactic similarity pipeline.

    Lifecycle:
        pipeline = SimilarityScoringPipeline()
        await pipeline.start()          # spawns ProcessPoolExecutor workers
        report = await pipeline.run(…)  # runs one analysis
        await pipeline.stop()           # shuts down workers

    The start/stop lifecycle mirrors IngestionPipeline so both can be managed
    symmetrically in the FastAPI lifespan (main.py).

    For one-shot use (e.g., unit tests), call run_sync() which creates a
    temporary executor internally.

    Thread safety:
        The async run() method is safe to call concurrently; each call creates
        independent state.  The shared ProcessPoolExecutor is safe for
        concurrent submissions because each submitted task is independent.
    """

    def __init__(self, worker_count: int = 0) -> None:
        """
        Args:
            worker_count: Number of ProcessPoolExecutor workers.
                          0 = os.cpu_count().
        """
        self._worker_count: int = worker_count or (os.cpu_count() or 1)
        self._executor: ProcessPoolExecutor | None = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """
        Spawn the ProcessPoolExecutor worker pool.

        Called once at application startup.  Workers are persistent across
        analysis runs to avoid the process spawn cost per-run.
        """
        if self._executor is not None:
            logger.warning(
                "SimilarityScoringPipeline.start() called but executor already running"
            )
            return

        logger.info(
            "SimilarityScoringPipeline: starting LCS worker pool",
            worker_count=self._worker_count,
        )
        self._executor = ProcessPoolExecutor(
            max_workers=self._worker_count,
            # Recycle workers after 500 tasks to prevent memory fragmentation
            # from accumulation of large LCS DP arrays in worker heap.
            max_tasks_per_child=500,
        )

        # Warm-up: submit a trivial task so workers are forked before the
        # first real analysis request arrives (avoids cold-start latency).
        loop = asyncio.get_running_loop()
        try:
            await loop.run_in_executor(
                self._executor,
                compare_pair_task,
                {
                    "granule_a_id": str(uuid4()),
                    "granule_b_id": str(uuid4()),
                    "normalized_source_a": "warmup",
                    "normalized_source_b": "warmup",
                },
                0.0,
                False,
            )
            logger.info("SimilarityScoringPipeline: worker pool warmed up")
        except Exception as exc:
            logger.warning(
                "SimilarityScoringPipeline: warm-up task failed (non-fatal)",
                error=str(exc),
            )

    async def stop(self) -> None:
        """
        Gracefully shut down the ProcessPoolExecutor.

        Waits for in-flight LCS tasks to complete before terminating workers.
        """
        if self._executor is None:
            return

        logger.info("SimilarityScoringPipeline: shutting down LCS worker pool")
        try:
            self._executor.shutdown(wait=True, cancel_futures=False)
        except Exception as exc:
            logger.warning(
                "SimilarityScoringPipeline: error during executor shutdown",
                error=str(exc),
            )
        finally:
            self._executor = None
        logger.info("SimilarityScoringPipeline: worker pool shut down")

    @property
    def worker_count(self) -> int:
        return self._worker_count

    # ------------------------------------------------------------------
    # Core run method
    # ------------------------------------------------------------------

    async def run(
        self,
        *,
        report_id: UUID,
        submission_a_id: UUID,
        submission_b_id: UUID,
        assignment_id: UUID,
        granules_a: list[GranuleRecord],
        granules_b: list[GranuleRecord],
        config: ScoringConfig,
    ) -> SimilarityReport:
        """
        Execute the full three-stage scoring pipeline.

        Processing flow:
            1. Pre-filter: shingle → MinHash → LSH → Jaccard filter
            2. Type-1 short-circuit: pairs with matching granule_hash get score=1.0
            3. LCS: parallel compare_pair_task() via ProcessPoolExecutor
            4. Threshold: build CloneMatch for pairs above threshold
            5. Build and return SimilarityReport

        Args:
            report_id:         UUID for the new SimilarityReport.
            submission_a_id:   UUID of the subject submission.
            submission_b_id:   UUID of the comparison submission.
            assignment_id:     UUID of the assignment (for context/logging).
            granules_a:        GranuleRecord list for submission A.
            granules_b:        GranuleRecord list for submission B.
            config:            Scoring configuration (thresholds, algorithm params).

        Returns:
            A completed SimilarityReport with status=COMPLETED and full metrics.
            On unexpected error, returns a report with status=FAILED.

        Raises:
            Does NOT raise — all exceptions are caught and reflected in the
            report's status=FAILED and error_message field.
        """
        t_start = time.monotonic()

        logger.info(
            "SimilarityScoringPipeline: run started",
            report_id=str(report_id),
            submission_a=str(submission_a_id),
            submission_b=str(submission_b_id),
            granules_a=len(granules_a),
            granules_b=len(granules_b),
            threshold=config.syntactic_clone_threshold,
        )

        try:
            matches, metrics = await self._run_pipeline(
                report_id=report_id,
                granules_a=granules_a,
                granules_b=granules_b,
                config=config,
            )
        except Exception as exc:
            duration = time.monotonic() - t_start
            logger.error(
                "SimilarityScoringPipeline: run FAILED",
                report_id=str(report_id),
                error=str(exc),
                duration_s=f"{duration:.2f}",
            )
            return SimilarityReport(
                id=report_id,
                submission_a_id=submission_a_id,
                submission_b_id=submission_b_id,
                assignment_id=assignment_id,
                config=config,
                status=SimilarityReportStatus.FAILED,
                error_message=str(exc),
                completed_at=datetime.datetime.now(UTC),
            )

        duration = time.monotonic() - t_start

        logger.info(
            "SimilarityScoringPipeline: run COMPLETED",
            report_id=str(report_id),
            clones_flagged=metrics.clones_flagged,
            lcs_comparisons=metrics.lcs_comparisons_run,
            rejection_rate=f"{metrics.pre_filter_rejection_rate:.2%}",
            duration_s=f"{duration:.2f}",
        )

        return SimilarityReport(
            id=report_id,
            submission_a_id=submission_a_id,
            submission_b_id=submission_b_id,
            assignment_id=assignment_id,
            config=config,
            status=SimilarityReportStatus.COMPLETED,
            metrics=metrics,
            matches=matches,
            completed_at=datetime.datetime.now(UTC),
        )

    # ------------------------------------------------------------------
    # Pipeline stages
    # ------------------------------------------------------------------

    async def _run_pipeline(
        self,
        *,
        report_id: UUID,
        granules_a: list[GranuleRecord],
        granules_b: list[GranuleRecord],
        config: ScoringConfig,
    ) -> tuple[list[CloneMatch], ScoringMetrics]:
        """
        Internal: execute all three pipeline stages and return (matches, metrics).

        Separated from run() so that the error wrapper in run() cleanly catches
        exceptions from any stage without nesting try/except blocks.
        """
        threshold = config.syntactic_clone_threshold

        # ── Stage 1: Pre-filter ───────────────────────────────────────────────
        logger.debug(
            "SimilarityScoringPipeline: Stage 1 — pre-filter",
            granules_a=len(granules_a),
            granules_b=len(granules_b),
        )
        pre_filter = _build_pre_filter(config)
        candidates, pf_metrics = pre_filter.filter_candidates(
            granules_a=granules_a,
            granules_b=granules_b,
        )

        total_pairs: int = int(pf_metrics["total_pairs"])
        pf_rejection_rate: float = float(pf_metrics["rejection_rate"])

        logger.debug(
            "SimilarityScoringPipeline: pre-filter complete",
            total_pairs=total_pairs,
            lsh_candidates=pf_metrics["lsh_candidates"],
            jaccard_candidates=len(candidates),
            rejection_rate=f"{pf_rejection_rate:.2%}",
            skipped_empty=pf_metrics["skipped_empty"],
        )

        if not candidates:
            # No candidate pairs — nothing to compare.
            return [], ScoringMetrics(
                total_granule_pairs=total_pairs,
                pre_filter_candidates=0,
                lcs_comparisons_run=0,
                pre_filter_rejection_rate=pf_rejection_rate,
                clones_flagged=0,
                duration_seconds=0.0,
            )

        # ── Stage 2: Type-1 short-circuit + LCS dispatch ─────────────────────
        logger.debug(
            "SimilarityScoringPipeline: Stage 2 — LCS engine",
            candidate_count=len(candidates),
        )

        t_lcs_start = time.monotonic()
        lcs_results, type1_count = await self._run_lcs_stage(
            candidates=candidates,
            config=config,
        )
        lcs_duration = time.monotonic() - t_lcs_start
        lcs_comparisons_run = len(candidates) - type1_count

        logger.debug(
            "SimilarityScoringPipeline: LCS stage complete",
            lcs_comparisons=lcs_comparisons_run,
            type1_shortcuts=type1_count,
            duration_s=f"{lcs_duration:.2f}",
        )

        # ── Stage 3: Thresholding ─────────────────────────────────────────────
        logger.debug(
            "SimilarityScoringPipeline: Stage 3 — thresholding",
            threshold=threshold,
            result_count=len(lcs_results),
        )

        matches: list[CloneMatch] = []
        for candidate, lcs_result in zip(candidates, lcs_results):
            match = _make_clone_match(report_id, candidate, lcs_result, threshold)
            if match is not None:
                matches.append(match)
                if len(matches) >= _MAX_MATCHES_PER_REPORT:
                    logger.warning(
                        "SimilarityScoringPipeline: match cap reached",
                        cap=_MAX_MATCHES_PER_REPORT,
                        report_id=str(report_id),
                    )
                    break

        # Sort matches by similarity score descending (highest confidence first).
        matches.sort(key=lambda m: m.similarity_score, reverse=True)

        total_duration = time.monotonic() - t_lcs_start

        metrics = ScoringMetrics(
            total_granule_pairs=total_pairs,
            pre_filter_candidates=len(candidates),
            lcs_comparisons_run=lcs_comparisons_run,
            pre_filter_rejection_rate=pf_rejection_rate,
            clones_flagged=len(matches),
            duration_seconds=total_duration,
        )

        return matches, metrics

    async def _run_lcs_stage(
        self,
        *,
        candidates: list[PreFilterCandidate],
        config: ScoringConfig,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Dispatch LCS comparisons in parallel chunks via ProcessPoolExecutor.

        Type-1 pairs (matching granule_hash) short-circuit with score=1.0
        and are NOT sent to the executor.

        Returns:
            Tuple (lcs_results, type1_count):
              - lcs_results: One result dict per candidate, in the same order
                             as the input candidate list.
              - type1_count: Number of pairs handled by Type-1 short-circuit.
        """
        threshold = config.syntactic_clone_threshold
        # Extract snippet only for pairs that pass — determined inline.
        # For the executor path we always pass extract_snippet=True and rely on
        # the engine's internal logic to skip it for below-threshold pairs.
        extract_snippet = True

        # Pre-allocate result list to preserve ordering.
        lcs_results: list[dict[str, Any]] = [{}] * len(candidates)
        type1_count: int = 0

        # Separate short-circuit pairs from LCS pairs.
        lcs_indices: list[int] = []  # indices into candidates needing LCS
        pair_dicts: list[dict[str, Any]] = []  # serialised pairs for executor

        for idx, candidate in enumerate(candidates):
            ga = candidate.granule_a
            gb = candidate.granule_b

            # Type-1 short-circuit: equal granule_hash → score is exactly 1.0.
            if ga.granule_hash == gb.granule_hash:
                snippet = ga.tokens[:150]  # use granule A's tokens as snippet
                lcs_results[idx] = {
                    "granule_a_id": str(ga.granule_id),
                    "granule_b_id": str(gb.granule_id),
                    "similarity_score": 1.0,
                    "terminated_early": False,
                    "matching_tokens": snippet,
                }
                type1_count += 1
            else:
                lcs_indices.append(idx)
                pair_dicts.append(
                    {
                        "granule_a_id": str(ga.granule_id),
                        "granule_b_id": str(gb.granule_id),
                        "normalized_source_a": ga.normalized_source,
                        "normalized_source_b": gb.normalized_source,
                    }
                )

        if not pair_dicts:
            return lcs_results, type1_count

        # Dispatch LCS pairs in chunks.
        loop = asyncio.get_running_loop()
        executor = self._executor

        total_lcs = len(pair_dicts)
        processed = 0

        for chunk_start in range(0, total_lcs, _LCS_DISPATCH_CHUNK_SIZE):
            chunk_end = min(chunk_start + _LCS_DISPATCH_CHUNK_SIZE, total_lcs)
            chunk_pairs = pair_dicts[chunk_start:chunk_end]
            chunk_indices = lcs_indices[chunk_start:chunk_end]

            # Build futures for the chunk.
            if executor is not None:
                futures = [
                    loop.run_in_executor(
                        executor,
                        compare_pair_task,
                        pair_dict,
                        threshold,
                        extract_snippet,
                    )
                    for pair_dict in chunk_pairs
                ]
            else:
                # Fallback: run synchronously in the event loop when no
                # executor is available (unit tests, debug mode).
                futures = [
                    asyncio.coroutine(
                        lambda p=p: compare_pair_task(p, threshold, extract_snippet)
                    )()  # type: ignore[misc]
                    for p in chunk_pairs
                ]

            chunk_results = await asyncio.gather(*futures, return_exceptions=True)

            # Store results.
            for local_idx, result in enumerate(chunk_results):
                global_idx = chunk_indices[local_idx]
                if isinstance(result, Exception):
                    logger.warning(
                        "LCS task raised an exception",
                        error=str(result),
                        granule_a=pair_dicts[chunk_start + local_idx].get(
                            "granule_a_id"
                        ),
                        granule_b=pair_dicts[chunk_start + local_idx].get(
                            "granule_b_id"
                        ),
                    )
                    lcs_results[global_idx] = {
                        "granule_a_id": pair_dicts[chunk_start + local_idx].get(
                            "granule_a_id", ""
                        ),
                        "granule_b_id": pair_dicts[chunk_start + local_idx].get(
                            "granule_b_id", ""
                        ),
                        "similarity_score": 0.0,
                        "terminated_early": False,
                        "matching_tokens": [],
                        "error": str(result),
                    }
                else:
                    lcs_results[global_idx] = result  # type: ignore[assignment]

            processed += len(chunk_pairs)
            logger.debug(
                "SimilarityScoringPipeline: LCS chunk complete",
                processed=processed,
                total=total_lcs,
            )

        return lcs_results, type1_count

    # ------------------------------------------------------------------
    # Synchronous convenience wrapper  (for tests + CLI use)
    # ------------------------------------------------------------------

    @classmethod
    def run_sync(
        cls,
        *,
        report_id: UUID | None = None,
        submission_a_id: UUID,
        submission_b_id: UUID,
        assignment_id: UUID,
        granules_a: list[GranuleRecord],
        granules_b: list[GranuleRecord],
        config: ScoringConfig | None = None,
    ) -> SimilarityReport:
        """
        Synchronous wrapper for run().  Creates a temporary event loop and
        executor, runs the full pipeline, then tears down.

        Intended for unit tests, CLI scripts, and notebook exploration.
        NOT suitable for production use (executor creation overhead per call).

        Args:
            report_id:         Optional report UUID.  Generated if not provided.
            submission_a_id:   UUID of the subject submission.
            submission_b_id:   UUID of the comparison submission.
            assignment_id:     UUID of the assignment.
            granules_a:        GranuleRecord list for submission A.
            granules_b:        GranuleRecord list for submission B.
            config:            Scoring config.  Uses default ScoringConfig if None.

        Returns:
            Completed SimilarityReport.
        """
        if report_id is None:
            report_id = uuid4()
        if config is None:
            config = ScoringConfig()

        async def _inner() -> SimilarityReport:
            pipeline = cls(worker_count=1)
            await pipeline.start()
            try:
                return await pipeline.run(
                    report_id=report_id,
                    submission_a_id=submission_a_id,
                    submission_b_id=submission_b_id,
                    assignment_id=assignment_id,
                    granules_a=granules_a,
                    granules_b=granules_b,
                    config=config,
                )
            finally:
                await pipeline.stop()

        return asyncio.run(_inner())


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "SimilarityScoringPipeline",
]
