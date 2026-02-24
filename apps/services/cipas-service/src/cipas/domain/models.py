# gradeloop-core-v2/apps/services/cipas-service/src/cipas/domain/models.py
"""
CIPAS domain models.

This module is the single source of truth for every data shape in the system.
Both the API layer (request/response schemas) and the storage layer (repository
DTOs) import from here.  No layer defines ad-hoc dicts or inline TypedDicts.

Organisation:
  ─ Enumerations          (Language, GranuleType, SubmissionStatus, FileParseStatus)
  ─ Internal DTOs         (FileItem, GranuleData, FileParseResult, BatchParseResult)
  ─ API request schemas   (SubmissionRequest metadata carried as Form fields)
  ─ API response schemas  (SubmissionResponse, SubmissionStatusResponse, ErrorDetail,
                           ProblemDetail)

Conventions:
  - All UUIDs are uuid.UUID objects, not strings.  The FastAPI JSON encoder
    serialises them to strings automatically.
  - Timestamps are always timezone-aware (UTC).  Use datetime.now(UTC) — never
    datetime.utcnow() which returns a naive datetime.
  - Pydantic models use `model_config = ConfigDict(frozen=True)` for DTOs that
    are passed through the pipeline and must not be mutated.  API response models
    are not frozen because FastAPI may need to set default fields.
  - `GranuleData` is the central DTO: it is what the subprocess worker returns
    (as a plain dict) and what the repository writes to PostgreSQL.
"""

from __future__ import annotations

import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Timezone-aware UTC constant (Python 3.11+)
# ---------------------------------------------------------------------------
UTC = datetime.timezone.utc


def _now_utc() -> datetime.datetime:
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.datetime.now(UTC)


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class Language(str, Enum):
    """
    Supported source-code languages.

    Values are lowercase strings used as:
      - tree-sitter-languages.get_language(language.value) keys
      - file extension → language mapping keys
      - `language` column values in the `files` and `granules` tables
    """

    JAVA = "java"
    C = "c"
    PYTHON = "python"

    @classmethod
    def from_extension(cls, ext: str) -> Optional["Language"]:
        """
        Map a file extension (including the dot) to a Language.

        Returns None for unsupported extensions rather than raising, so
        callers can differentiate between unsupported and invalid.

        Examples:
            Language.from_extension(".py")   → Language.PYTHON
            Language.from_extension(".java") → Language.JAVA
            Language.from_extension(".c")    → Language.C
            Language.from_extension(".h")    → Language.C
            Language.from_extension(".rb")   → None
        """
        _EXT_MAP: dict[str, Language] = {
            ".py": cls.PYTHON,
            ".java": cls.JAVA,
            ".c": cls.C,
            ".h": cls.C,  # C headers share the C grammar
        }
        return _EXT_MAP.get(ext.lower())

    @classmethod
    def supported_extensions(cls) -> list[str]:
        """Return the full list of accepted file extensions."""
        return [".py", ".java", ".c", ".h"]


class GranuleType(str, Enum):
    """
    Structural unit types extracted from source files.

    Phase 1 supports three types.  Phase 2 may add BLOCK, LAMBDA, etc.
    The string values are stored verbatim in the `granule_type` column.
    """

    CLASS = "class"
    FUNCTION = "function"
    LOOP = "loop"


class SubmissionStatus(str, Enum):
    """
    Lifecycle states for a submission batch.

    State machine:
      PROCESSING → COMPLETED   (all files parsed successfully)
      PROCESSING → PARTIAL     (some files parsed, some failed)
      PROCESSING → FAILED      (all files failed OR a fatal pipeline error)

    A submission is never created in COMPLETED/PARTIAL/FAILED state.
    The PROCESSING → terminal transition is atomic (single UPDATE).
    """

    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"

    @property
    def is_terminal(self) -> bool:
        return self in (self.COMPLETED, self.PARTIAL, self.FAILED)


class FileParseStatus(str, Enum):
    """
    Parse outcome for a single file within a batch.

    PARSED:      tree-sitter produced a usable CST; granules were extracted.
    FAILED:      tree-sitter returned an error tree, timed out, or the worker
                 crashed.  No granules were written for this file.
    UNSUPPORTED: Extension is technically in the whitelist (.h) but the grammar
                 produced zero useful granules (e.g. empty header file).
    SKIPPED:     File was a duplicate of another file in the same batch (same
                 file_hash).  Granules are shared with the canonical file entry.
    """

    PARSED = "PARSED"
    FAILED = "FAILED"
    UNSUPPORTED = "UNSUPPORTED"
    SKIPPED = "SKIPPED"


# ---------------------------------------------------------------------------
# Internal DTOs  (pipeline-internal data transfer; NOT exposed in API responses)
# ---------------------------------------------------------------------------


class FileItem(BaseModel):
    """
    A validated, in-memory source file ready for dispatch to the parse pool.

    Constructed by the ingestion route after file validation.  Passed to
    IngestionPipeline.ingest() as a list.

    `content` holds the raw UTF-8 bytes of the file.  These are serialised
    over the IPC pipe to the worker subprocess, so they must not contain
    anything non-picklable.
    """

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    filename: str = Field(description="Sanitised filename (basename only, no path)")
    language: Language
    content: bytes = Field(description="Raw UTF-8 encoded file content")
    file_hash: str = Field(
        description="SHA-256 hex digest of the raw content bytes (64 chars)"
    )
    byte_size: int = Field(ge=1)

    @property
    def line_count(self) -> int:
        """Approximate line count from raw bytes (newline count + 1)."""
        return self.content.count(b"\n") + 1


class GranuleData(BaseModel):
    """
    A fully-processed granule ready for database insertion.

    Returned by the subprocess worker (as a plain dict) and reconstructed
    into this model by the pipeline before passing to the repository.

    All hash fields are lowercase hex strings.  UUIDs are assigned server-side
    after the worker returns, not inside the worker, to keep the worker
    stateless and side-effect-free.
    """

    model_config = ConfigDict(frozen=True)

    # Assigned server-side (not in worker)
    id: UUID = Field(default_factory=uuid4)
    file_id: UUID
    submission_id: UUID

    # Extracted by worker
    granule_type: GranuleType
    language: Language
    file_hash: str = Field(min_length=64, max_length=64)
    granule_hash: str = Field(min_length=64, max_length=64)
    ast_fingerprint: str = Field(min_length=64, max_length=64)
    start_line: int = Field(ge=1, description="1-indexed start line (inclusive)")
    end_line: int = Field(ge=1, description="1-indexed end line (inclusive)")
    name: Optional[str] = Field(
        None, max_length=512, description="Identifier name; None for anonymous nodes"
    )
    normalized_source: str = Field(
        description="Type-1 normalised source (comments stripped, whitespace collapsed)"
    )

    @field_validator("granule_hash", "ast_fingerprint", "file_hash")
    @classmethod
    def validate_hex(cls, v: str) -> str:
        if not all(c in "0123456789abcdef" for c in v):
            raise ValueError(f"Expected lowercase hex string, got: {v[:16]!r}...")
        return v

    @field_validator("end_line")
    @classmethod
    def end_ge_start(cls, v: int, info: Any) -> int:
        # end_line must be >= start_line.
        # `info.data` contains already-validated fields; start_line may not be
        # present if it failed validation, so guard with .get().
        start = info.data.get("start_line", 0)
        if v < start:
            raise ValueError(f"end_line ({v}) must be >= start_line ({start})")
        return v

    @classmethod
    def from_worker_dict(
        cls,
        d: dict[str, Any],
        *,
        file_id: UUID,
        submission_id: UUID,
    ) -> "GranuleData":
        """
        Construct a GranuleData from the plain dict returned by the worker.

        The worker cannot import UUID or construct GranuleData (it must be
        subprocess-safe and import-minimal). It returns plain dicts.  This
        factory bridges that gap.
        """
        return cls(
            file_id=file_id,
            submission_id=submission_id,
            granule_type=GranuleType(d["granule_type"]),
            language=Language(d["language"]),
            file_hash=d["file_hash"],
            granule_hash=d["granule_hash"],
            ast_fingerprint=d["ast_fingerprint"],
            start_line=d["start_line"],
            end_line=d["end_line"],
            name=d.get("name"),
            normalized_source=d["normalized_source"],
        )


class FileParseResult(BaseModel):
    """
    The outcome of parsing a single file, as produced by the pipeline.

    `granules` is populated only when `status == PARSED`.
    `error_detail` is populated only when `status == FAILED`.
    `parse_duration_ms` is the elapsed wall-clock time in the worker process.
    """

    model_config = ConfigDict(frozen=True)

    filename: str
    language: Language
    file_hash: str
    byte_size: int
    line_count: int
    status: FileParseStatus
    granule_count: int = 0
    parse_duration_ms: float = 0.0
    error_detail: Optional[str] = None


class BatchParseResult(BaseModel):
    """
    Aggregated result of processing all files in a submission batch.

    Returned by IngestionPipeline.ingest() to the ingestion route, which
    uses it to build the HTTP response and update the submission record.
    """

    model_config = ConfigDict(frozen=True)

    submission_id: UUID
    file_results: list[FileParseResult]
    total_granules: int
    pipeline_duration_ms: float
    created_at: datetime.datetime = Field(default_factory=_now_utc)
    completed_at: Optional[datetime.datetime] = None

    @property
    def parsed_count(self) -> int:
        return sum(1 for f in self.file_results if f.status == FileParseStatus.PARSED)

    @property
    def failed_count(self) -> int:
        return sum(1 for f in self.file_results if f.status == FileParseStatus.FAILED)

    @property
    def skipped_count(self) -> int:
        return sum(1 for f in self.file_results if f.status == FileParseStatus.SKIPPED)

    @property
    def final_status(self) -> SubmissionStatus:
        """
        Derive the terminal SubmissionStatus from the per-file results.

        COMPLETED  → all files parsed (or skipped as duplicates)
        PARTIAL    → some files parsed, some failed
        FAILED     → all files failed
        """
        if self.parsed_count == 0 and self.skipped_count == 0:
            return SubmissionStatus.FAILED
        if self.failed_count == 0:
            return SubmissionStatus.COMPLETED
        return SubmissionStatus.PARTIAL


# ---------------------------------------------------------------------------
# API response schemas  (serialised to JSON in HTTP responses)
# ---------------------------------------------------------------------------


class ParseFailureDetail(BaseModel):
    """Per-file failure detail included in the submission response."""

    filename: str
    error_code: str
    detail: str


class SubmissionResponse(BaseModel):
    """
    Response body for POST /api/v1/cipas/submissions.

    Returned with HTTP 200 (synchronous processing complete).
    `parse_failures` is empty on COMPLETED status; populated on PARTIAL/FAILED.
    """

    submission_id: UUID
    status: SubmissionStatus
    file_count: int
    parsed_count: int
    failed_count: int
    granule_count: int
    parse_failures: list[ParseFailureDetail] = Field(default_factory=list)
    pipeline_duration_ms: float
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]

    @classmethod
    def from_batch_result(
        cls,
        result: BatchParseResult,
        file_results_with_errors: list[FileParseResult],
    ) -> "SubmissionResponse":
        """Construct from a BatchParseResult."""
        failures = [
            ParseFailureDetail(
                filename=f.filename,
                error_code="PARSE_ERROR",
                detail=f.error_detail or "Unknown parse error",
            )
            for f in file_results_with_errors
            if f.status == FileParseStatus.FAILED and f.error_detail
        ]
        return cls(
            submission_id=result.submission_id,
            status=result.final_status,
            file_count=len(result.file_results),
            parsed_count=result.parsed_count,
            failed_count=result.failed_count,
            granule_count=result.total_granules,
            parse_failures=failures,
            pipeline_duration_ms=result.pipeline_duration_ms,
            created_at=result.created_at,
            completed_at=result.completed_at,
        )


class SubmissionStatusResponse(BaseModel):
    """
    Response body for GET /api/v1/cipas/submissions/{submission_id}.

    Allows callers to poll for the outcome of a submission.
    """

    submission_id: UUID
    assignment_id: UUID
    submitted_by: UUID
    status: SubmissionStatus
    file_count: int
    granule_count: int
    error_message: Optional[str]
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime]


# ---------------------------------------------------------------------------
# RFC 7807 Problem Detail  (used by the global exception handler)
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    """A single field-level error within a Problem Detail response."""

    field: Optional[str] = None
    code: str
    detail: str


class ProblemDetail(BaseModel):
    """
    RFC 7807 Problem Details for HTTP APIs.

    Serialised as the JSON body for all error responses.  The FastAPI
    exception handler constructs this from a CIPASError or a
    pydantic ValidationError.
    """

    type: str = Field(
        description="A URI reference identifying the error type",
        examples=["https://cipas.gradeloop.internal/errors/file-too-large"],
    )
    title: str = Field(description="Human-readable summary of the error type")
    status: int = Field(description="HTTP status code")
    detail: str = Field(
        description="Human-readable explanation specific to this occurrence"
    )
    instance: str = Field(
        description="The request URI that caused the error",
        examples=["/api/v1/cipas/submissions"],
    )
    errors: list[ErrorDetail] = Field(
        default_factory=list,
        description="Field-level errors (populated for validation failures)",
    )

    @classmethod
    def from_cipas_error(
        cls,
        exc: Any,  # CIPASError — avoids circular import
        *,
        instance: str,
    ) -> "ProblemDetail":
        base_uri = "https://cipas.gradeloop.internal/errors"
        slug = exc.code.lower().replace("_", "-")
        return cls(
            type=f"{base_uri}/{slug}",
            title=type(exc).__name__,
            status=exc.http_status,
            detail=exc.detail,
            instance=instance,
        )


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    # Enums
    "Language",
    "GranuleType",
    "SubmissionStatus",
    "FileParseStatus",
    # Internal DTOs
    "FileItem",
    "GranuleData",
    "FileParseResult",
    "BatchParseResult",
    # API schemas
    "ParseFailureDetail",
    "SubmissionResponse",
    "SubmissionStatusResponse",
    "ErrorDetail",
    "ProblemDetail",
]
