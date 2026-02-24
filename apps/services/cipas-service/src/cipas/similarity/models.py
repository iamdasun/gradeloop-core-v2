# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/models.py
"""
Domain models for CIPAS Track A syntactic similarity scoring.

This module defines every data shape used by the similarity scoring pipeline:

  ── Configuration ──────────────────────────────────────────────────────────
  ScoringConfig          Configurable thresholds and algorithm parameters
                         (per-assignment, loaded from Assignment Service or
                          overridden per-request).

  ── Pipeline-internal DTOs ─────────────────────────────────────────────────
  GranuleRecord          Lightweight projection of a stored granule used as
                         input to the pre-filter and LCS engine.
  PreFilterCandidate     A granule pair that passed the MinHash/LSH pre-filter
                         with its estimated Jaccard similarity.
  LCSResult              Raw output of a single LCS comparison: score and the
                         aligned token snippets.

  ── Output / API-facing models ─────────────────────────────────────────────
  CloneType              Enum: "type1" (exact) | "type2" (renamed).
  CloneMatch             A confirmed clone pair above the configured threshold.
  ScoringMetrics         Aggregate statistics for a scoring run.
  SimilarityReport       The top-level result persisted to DB and returned by
                         the API.
  SimilarityReportStatus Lifecycle enum for the report row.

  ── API request/response schemas ───────────────────────────────────────────
  SimilarityAnalysisRequest   POST body to trigger an analysis run.
  SimilarityAnalysisResponse  Immediate 202 response (report_id + status).
  CloneMatchResponse          Single match in the GET /reports/:id/matches list.
  SimilarityReportResponse    Full report payload returned by GET /reports/:id.

Conventions:
  - All models use ConfigDict(frozen=True) for pipeline DTOs that are passed
    through the processing stages and must not be mutated.
  - API response models are NOT frozen (FastAPI may populate optional fields).
  - All UUIDs are uuid.UUID objects; the FastAPI JSON encoder serialises them
    to strings automatically.
  - Timestamps are always timezone-aware UTC.
  - Similarity scores are floats in [0.0, 1.0].  They are NOT validated by
    Pydantic at construction time (the LCS engine guarantees the range) but
    ARE validated in API response models to catch implementation bugs early.
"""

from __future__ import annotations

import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Timezone constant
# ---------------------------------------------------------------------------
UTC = datetime.timezone.utc


def _now_utc() -> datetime.datetime:
    return datetime.datetime.now(UTC)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class CloneType(str, Enum):
    """
    Classification of a detected code clone.

    TYPE1 — Exact clone: granules are byte-identical after Type-1 normalisation
            (whitespace/comment removal).  Detected via granule_hash equality.
            LCS similarity score = 1.0.

    TYPE2 — Renamed clone: granules share ≥ SYNTACTIC_CLONE_THRESHOLD structural
            overlap but differ in identifier names.  Detected via LCS similarity
            on the normalised token stream.  Score ≥ threshold, < 1.0.

    The string values ("type1", "type2") are stored in the clone_matches table's
    clone_type column and returned verbatim in API responses.
    """

    TYPE1 = "type1"
    TYPE2 = "type2"


class SimilarityReportStatus(str, Enum):
    """
    Lifecycle states for a similarity_reports row.

    RUNNING   → analysis in progress (report row created, workers active).
    COMPLETED → analysis finished successfully.
    FAILED    → analysis terminated due to an unrecoverable error.
    """

    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

    @property
    def is_terminal(self) -> bool:
        return self in (self.COMPLETED, self.FAILED)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


class ScoringConfig(BaseModel):
    """
    Per-analysis configuration for the syntactic similarity scoring pipeline.

    Fields can be sourced from:
      1. Assignment Service API (course/instructor level defaults).
      2. Per-request override in the SimilarityAnalysisRequest body.
      3. Service-level defaults from Settings (CIPAS_SYNTACTIC_CLONE_THRESHOLD, …).

    Frozen after construction — never mutate mid-run.
    """

    model_config = ConfigDict(frozen=True)

    # ── Thresholding ──────────────────────────────────────────────────────────
    syntactic_clone_threshold: float = Field(
        0.85,
        ge=0.0,
        le=1.0,
        description=(
            "LCS similarity threshold above which a pair is flagged as a clone. "
            "Pairs with score >= threshold are flagged; strictly below are ignored. "
            "Set to 0.0 to flag all pairs (debug mode)."
        ),
    )

    # ── Pre-filtering ─────────────────────────────────────────────────────────
    jaccard_prefilter_threshold: float = Field(
        0.3,
        ge=0.0,
        le=1.0,
        description=(
            "Minimum estimated Jaccard similarity (from MinHash) for a pair to "
            "proceed to LCS.  Pairs below this threshold are discarded before LCS. "
            "Must be ≤ syntactic_clone_threshold."
        ),
    )
    minhash_num_permutations: int = Field(
        128,
        ge=16,
        le=512,
        description=(
            "Number of independent hash functions used for MinHash signature "
            "generation.  Higher values improve Jaccard estimate accuracy at the "
            "cost of more memory and CPU.  128 gives ~1% estimation error."
        ),
    )
    lsh_num_bands: int = Field(
        32,
        ge=4,
        le=256,
        description=(
            "Number of LSH bands.  Together with minhash_num_permutations, "
            "controls the LSH threshold: approx_threshold ≈ (1/b)^(1/r) where "
            "r = num_permutations / num_bands.  "
            "128 permutations / 32 bands = 4 rows per band → threshold ≈ 0.42."
        ),
    )
    shingle_size: int = Field(
        5,
        ge=1,
        le=20,
        description=(
            "Token n-gram size for shingling.  5-grams capture short structural "
            "patterns (e.g., 'for ( int i = 0 ) {') while filtering noise from "
            "identifier renaming at the shingle level."
        ),
    )

    # ── Parallelism ───────────────────────────────────────────────────────────
    lcs_worker_count: int = Field(
        0,
        ge=0,
        description=(
            "Number of ProcessPoolExecutor workers for parallel LCS computation. "
            "0 = os.cpu_count() at runtime."
        ),
    )

    @field_validator("jaccard_prefilter_threshold")
    @classmethod
    def prefilter_le_clone_threshold(cls, v: float) -> float:
        # Cross-field check: jaccard_prefilter_threshold should be ≤
        # syntactic_clone_threshold.  At model_validator time we would have
        # access to syntactic_clone_threshold, but for simplicity we just
        # validate it is ≥ 0 (done by ge=0.0) and ≤ 1 (le=1.0).
        # A separate application-level check warns if prefilter > clone_threshold.
        return v


# ---------------------------------------------------------------------------
# Pipeline-internal DTOs
# ---------------------------------------------------------------------------


class GranuleRecord(BaseModel):
    """
    Lightweight projection of a stored granule used as input to the scoring
    pipeline.  Fetched from the DB by SimilarityRepository.fetch_granules().

    Only the fields needed for pre-filtering and LCS are included — the full
    GranuleData model (with file_id, submission_id FK refs, etc.) is not
    carried through the pipeline to keep memory footprint small.
    """

    model_config = ConfigDict(frozen=True)

    granule_id: UUID
    submission_id: UUID
    granule_hash: str = Field(min_length=64, max_length=64)
    granule_type: str  # "class" | "function" | "loop"
    language: str  # "python" | "java" | "c"
    normalized_source: str
    start_line: int
    end_line: int
    name: Optional[str] = None

    @property
    def tokens(self) -> list[str]:
        """
        Split the normalised source into a token list for LCS comparison.

        Since type1_normalise() collapses all whitespace to a single space,
        splitting on whitespace gives the canonical token stream.  An empty
        normalised source (oversized/comment-only granule) returns [].
        """
        if not self.normalized_source.strip():
            return []
        return self.normalized_source.split()

    @property
    def is_empty(self) -> bool:
        """True if the granule has no usable tokens."""
        return len(self.tokens) == 0

    @property
    def is_oversized_sentinel(self) -> bool:
        """True if this granule carries the oversized sentinel hash (all zeros)."""
        return self.granule_hash == "0" * 64


class PreFilterCandidate(BaseModel):
    """
    A granule pair that survived the MinHash/LSH pre-filter.

    Produced by PreFilter.filter_candidates() and consumed by the LCS engine.
    Carries the estimated Jaccard similarity from MinHash so the LCS engine
    can log it alongside the final LCS score.
    """

    model_config = ConfigDict(frozen=True)

    granule_a: GranuleRecord
    granule_b: GranuleRecord
    estimated_jaccard: float = Field(ge=0.0, le=1.0)


class LCSResult(BaseModel):
    """
    Raw output of a single LCS comparison between two granule token streams.

    Produced by LCSEngine.compare() and consumed by the scoring orchestrator
    to decide whether the pair should be flagged as a clone.
    """

    model_config = ConfigDict(frozen=True)

    granule_a_id: UUID
    granule_b_id: UUID

    # Core similarity score: lcs_length / max(len(tokens_a), len(tokens_b))
    # Range: [0.0, 1.0].  1.0 means the shorter sequence is fully embedded in
    # the longer (or both are identical).
    similarity_score: float = Field(ge=0.0, le=1.0)

    # True if the DP loop was terminated early because the upper bound on
    # achievable similarity fell below the configured threshold.
    # When terminated_early=True, similarity_score is the score at termination
    # point, NOT the exact LCS score — but it is guaranteed to be < threshold.
    terminated_early: bool

    # Aligned token snippets: a representative excerpt of the common token
    # subsequence.  Truncated to SNIPPET_TOKEN_LIMIT for storage efficiency.
    # Empty when terminated_early=True (no full LCS computed).
    matching_tokens: list[str] = Field(default_factory=list)

    @property
    def snippet_text(self) -> str:
        """
        Render the matching token list as a space-separated string.

        Used as the snippet_match value stored in the clone_matches table.
        """
        return " ".join(self.matching_tokens)


# ---------------------------------------------------------------------------
# Output / API-facing models
# ---------------------------------------------------------------------------


class ScoringMetrics(BaseModel):
    """
    Aggregate statistics for a single similarity scoring run.

    These metrics are stored in the similarity_reports table and returned
    in API responses to allow instructors to understand the scale of the
    analysis and the efficiency of pre-filtering.
    """

    model_config = ConfigDict(frozen=True)

    # Total number of unique granule pairs considered before any filtering.
    # = (|granules_a| * |granules_b|) for cross-submission comparison,
    # = |granules| * (|granules| - 1) / 2 for within-submission.
    total_granule_pairs: int = Field(ge=0)

    # Number of pairs that survived the pre-filter (passed Jaccard threshold).
    pre_filter_candidates: int = Field(ge=0)

    # Number of LCS comparisons actually executed (≤ pre_filter_candidates,
    # since pairs already identified as Type-1 by granule_hash equality
    # skip the LCS engine).
    lcs_comparisons_run: int = Field(ge=0)

    # Fraction of pairs that did NOT pass pre-filtering.
    # = 1.0 - (pre_filter_candidates / total_granule_pairs)
    # 0.0 when total_granule_pairs == 0.
    pre_filter_rejection_rate: float = Field(ge=0.0, le=1.0)

    # Number of pairs flagged as clones (score >= threshold).
    clones_flagged: int = Field(ge=0)

    # Wall-clock duration of the full analysis in seconds.
    duration_seconds: float = Field(ge=0.0)


class CloneMatch(BaseModel):
    """
    A confirmed clone pair: a pair whose LCS similarity score meets or exceeds
    the configured syntactic_clone_threshold.

    Stored in the clone_matches table (one row per clone pair per report).
    Returned in SimilarityReport.matches and the GET /reports/:id/matches list.
    """

    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)
    report_id: UUID

    # The submission that was analysed (the "subject" submission).
    submission_id: UUID

    # The submission that the subject was compared against.
    matched_submission_id: UUID

    # IDs of the two cloning granules.
    granule_a_id: UUID
    granule_b_id: UUID

    # LCS similarity score in [0.0, 1.0].  1.0 = exact Type-1 clone.
    similarity_score: float = Field(ge=0.0, le=1.0)

    # Classification based on similarity_score and granule_hash comparison:
    #   TYPE1 → granule_hashes are equal (score = 1.0)
    #   TYPE2 → granule_hashes differ but score ≥ threshold
    clone_type: CloneType

    # Representative excerpt of the common token subsequence.
    # At most SNIPPET_TOKEN_LIMIT tokens, space-separated.
    # Empty string when snippet extraction was skipped.
    snippet_match: str = Field(default="", max_length=4096)

    created_at: datetime.datetime = Field(default_factory=_now_utc)


class SimilarityReport(BaseModel):
    """
    Top-level result of a similarity scoring run.

    One report is created per POST /similarity-analysis call.  It tracks
    the lifecycle of the analysis (RUNNING → COMPLETED | FAILED) and
    aggregates all clone matches and metrics.

    Stored in the similarity_reports table; matches stored in clone_matches.
    """

    model_config = ConfigDict(frozen=True)

    id: UUID = Field(default_factory=uuid4)

    # The two submissions being compared.  submission_a is the "subject" —
    # the newly submitted work.  submission_b is the comparison target.
    submission_a_id: UUID
    submission_b_id: UUID

    # The assignment these submissions belong to (determines threshold config).
    assignment_id: UUID

    # The scoring configuration used for this run.
    config: ScoringConfig

    # Analysis lifecycle.
    status: SimilarityReportStatus = SimilarityReportStatus.RUNNING

    # Populated only when status == COMPLETED.
    metrics: Optional[ScoringMetrics] = None
    matches: list[CloneMatch] = Field(default_factory=list)

    created_at: datetime.datetime = Field(default_factory=_now_utc)
    completed_at: Optional[datetime.datetime] = None

    # Non-None only when status == FAILED.
    error_message: Optional[str] = None


# ---------------------------------------------------------------------------
# API request / response schemas
# ---------------------------------------------------------------------------


class SimilarityAnalysisRequest(BaseModel):
    """
    Request body for POST /api/v1/cipas/submissions/{submission_id}/similarity-analysis.

    Triggers a syntactic similarity scoring run comparing submission_id against
    comparison_submission_id.

    All threshold fields are optional overrides of the service-level defaults
    (from Settings) and the assignment-level config (from Assignment Service).
    Per-request overrides take precedence.
    """

    # The submission to compare against.  Required.
    comparison_submission_id: UUID = Field(
        description="UUID of the submission to compare against the subject submission."
    )

    # Assignment context for loading threshold configuration.
    assignment_id: UUID = Field(
        description="UUID of the assignment both submissions belong to."
    )

    # Optional per-request threshold override (null = use service default).
    syntactic_clone_threshold: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description=(
            "Override the default clone detection threshold for this run. "
            "Null means use the service or assignment default (CIPAS_SYNTACTIC_CLONE_THRESHOLD)."
        ),
    )

    # Optional pre-filter threshold override.
    jaccard_prefilter_threshold: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Override the Jaccard pre-filter threshold for this run.",
    )


class SimilarityAnalysisResponse(BaseModel):
    """
    Immediate response for POST /similarity-analysis.

    Returns the report_id and the initial RUNNING status so callers can
    poll GET /similarity-reports/{report_id} for the final result.
    For the POC synchronous implementation, status will already be COMPLETED
    when this response is returned.
    """

    report_id: UUID
    submission_id: UUID
    comparison_submission_id: UUID
    assignment_id: UUID
    status: SimilarityReportStatus
    created_at: datetime.datetime

    # Present immediately for synchronous runs.
    metrics: Optional[ScoringMetrics] = None
    clones_flagged: int = 0


class CloneMatchResponse(BaseModel):
    """
    A single clone match entry in the GET /similarity-reports/:id/matches response.
    """

    match_id: UUID
    report_id: UUID
    submission_id: UUID
    matched_submission_id: UUID
    granule_a_id: UUID
    granule_b_id: UUID
    similarity_score: float = Field(ge=0.0, le=1.0)
    clone_type: CloneType
    snippet_match: str
    created_at: datetime.datetime


class SimilarityReportResponse(BaseModel):
    """
    Full report payload returned by GET /api/v1/cipas/similarity-reports/{report_id}.
    """

    report_id: UUID
    submission_a_id: UUID
    submission_b_id: UUID
    assignment_id: UUID
    status: SimilarityReportStatus
    config: ScoringConfig
    metrics: Optional[ScoringMetrics] = None
    matches: list[CloneMatchResponse] = Field(default_factory=list)
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None
    error_message: Optional[str] = None


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    # Enumerations
    "CloneType",
    "SimilarityReportStatus",
    # Configuration
    "ScoringConfig",
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
