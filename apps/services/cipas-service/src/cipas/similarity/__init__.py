# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/__init__.py
"""
CIPAS Track A — Syntactic Similarity Scoring package.

This package implements the three-stage scoring pipeline for detecting
Type-1 (exact) and Type-2 (renamed) code clones between submission granules:

  Stage 1 — Pre-Filter  (pre_filter.py)
    MinHash + Locality-Sensitive Hashing to reduce the O(N²) candidate space.
    Only granule pairs with estimated Jaccard similarity ≥ jaccard_threshold
    proceed to the LCS stage.

  Stage 2 — LCS Engine  (lcs_engine.py)
    Space-efficient (O(min(m,n))) Longest Common Subsequence DP with early
    termination.  Dispatched in parallel via ProcessPoolExecutor.

  Stage 3 — Thresholding  (scorer.py)
    Configurable per-assignment clone threshold.  Pairs at or above the
    syntactic_clone_threshold are classified as TYPE1 (exact) or TYPE2
    (renamed) and emitted as CloneMatch entries.

Public interface
────────────────
The top-level entry point for callers (route handlers, tests, CLI) is
SimilarityScoringPipeline from scorer.py:

    from cipas.similarity import SimilarityScoringPipeline, ScoringConfig

    pipeline = SimilarityScoringPipeline(worker_count=8)
    await pipeline.start()
    report = await pipeline.run(
        report_id=uuid4(),
        submission_a_id=sub_a,
        submission_b_id=sub_b,
        assignment_id=assign_id,
        granules_a=granules_a,
        granules_b=granules_b,
        config=ScoringConfig(syntactic_clone_threshold=0.85),
    )
    await pipeline.stop()

Domain models are re-exported from models.py for convenient import:

    from cipas.similarity import (
        CloneType,
        CloneMatch,
        ScoringConfig,
        ScoringMetrics,
        SimilarityReport,
        GranuleRecord,
    )
"""

from cipas.similarity.models import (
    CloneMatch,
    CloneMatchResponse,
    CloneType,
    GranuleRecord,
    LCSResult,
    PreFilterCandidate,
    ScoringConfig,
    ScoringMetrics,
    SimilarityAnalysisRequest,
    SimilarityAnalysisResponse,
    SimilarityReport,
    SimilarityReportResponse,
    SimilarityReportStatus,
)
from cipas.similarity.scorer import SimilarityScoringPipeline

__all__ = [
    # Pipeline entry point
    "SimilarityScoringPipeline",
    # Configuration
    "ScoringConfig",
    # Enumerations
    "CloneType",
    "SimilarityReportStatus",
    # Pipeline DTOs
    "GranuleRecord",
    "PreFilterCandidate",
    "LCSResult",
    # Output models
    "ScoringMetrics",
    "CloneMatch",
    "SimilarityReport",
    # API schemas
    "SimilarityAnalysisRequest",
    "SimilarityAnalysisResponse",
    "CloneMatchResponse",
    "SimilarityReportResponse",
]
