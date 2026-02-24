# gradeloop-core-v2/apps/services/cipas-service/src/cipas/core/exceptions.py
"""
CIPAS domain exception hierarchy.

Design principles:
  - Every exception carries a machine-readable `code` (SCREAMING_SNAKE_CASE)
    and a human-readable `detail` string. The code is used in RFC 7807
    Problem Detail responses; the detail is the user-facing message.
  - HTTP status mapping is declared on each exception class so the FastAPI
    exception handler in main.py can translate without a lookup table.
  - Exceptions are organised in a strict hierarchy:
      CIPASError (base)
        ├── ValidationError       (4xx — caller's fault)
        │     ├── FileTooLargeError
        │     ├── TooManyFilesError
        │     ├── BatchTooLargeError
        │     ├── UnsupportedLanguageError
        │     ├── InvalidFilenameError
        │     └── InvalidEncodingError
        ├── IngestionError        (5xx — service's fault)
        │     ├── ParseError
        │     ├── ParseTimeoutError
        │     └── WorkerCrashError
        ├── StorageError          (5xx — infrastructure fault)
        │     ├── DBConnectionError
        │     └── DBWriteError
        └── CapacityError         (503 — transient overload)
              └── SemaphoreTimeoutError

All exceptions are importable from `cipas.core.exceptions` directly.
"""

from __future__ import annotations

from typing import Any, Optional

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------


class CIPASError(Exception):
    """
    Base class for all CIPAS domain exceptions.

    Attributes:
        code:       Machine-readable error code (used in RFC 7807 `type` field).
        detail:     Human-readable description of the error.
        http_status: HTTP status code for the FastAPI exception handler.
        context:    Optional dict of additional structured context fields that
                    will be included in the RFC 7807 response body and in the
                    structured log record.
    """

    code: str = "CIPAS_ERROR"
    http_status: int = 500

    def __init__(
        self,
        detail: str,
        *,
        code: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        # Allow per-instance code override for subclasses that want to
        # specialise without creating a new class (rare but valid).
        if code is not None:
            self.code = code
        self.context: dict[str, Any] = context or {}

    def __repr__(self) -> str:
        ctx = f", context={self.context!r}" if self.context else ""
        return f"{type(self).__name__}(code={self.code!r}, detail={self.detail!r}{ctx})"

    def to_dict(self) -> dict[str, Any]:
        """
        Serialise to a dict suitable for RFC 7807 Problem Detail responses.

        The FastAPI exception handler calls this to build the JSON response body.
        """
        return {
            "code": self.code,
            "detail": self.detail,
            **self.context,
        }


# ---------------------------------------------------------------------------
# Validation errors  (HTTP 4xx — caller's fault)
# ---------------------------------------------------------------------------


class ValidationError(CIPASError):
    """
    Base for all input validation failures.

    These errors result from the caller sending invalid data.
    The caller should fix the request; retrying without changes will fail again.
    """

    code = "VALIDATION_ERROR"
    http_status = 422


class FileTooLargeError(ValidationError):
    """
    A single uploaded file exceeds MAX_FILE_SIZE_BYTES.

    Context fields:
        filename:  The offending filename (sanitised).
        size:      Actual byte size of the file.
        limit:     Configured MAX_FILE_SIZE_BYTES.
    """

    code = "FILE_TOO_LARGE"
    http_status = 413

    def __init__(self, filename: str, size: int, limit: int) -> None:
        super().__init__(
            detail=(
                f"File '{filename}' is {size:,} bytes which exceeds the "
                f"maximum allowed size of {limit:,} bytes per file."
            ),
            context={"filename": filename, "size": size, "limit": limit},
        )
        self.filename = filename
        self.size = size
        self.limit = limit


class TooManyFilesError(ValidationError):
    """
    The batch contains more files than MAX_FILES_PER_BATCH.

    Context fields:
        received:  Number of files received.
        limit:     Configured MAX_FILES_PER_BATCH.
    """

    code = "TOO_MANY_FILES"
    http_status = 413

    def __init__(self, received: int, limit: int) -> None:
        super().__init__(
            detail=(
                f"Batch contains {received} files which exceeds the maximum "
                f"of {limit} files per submission."
            ),
            context={"received": received, "limit": limit},
        )
        self.received = received
        self.limit = limit


class BatchTooLargeError(ValidationError):
    """
    The cumulative size of all files exceeds MAX_TOTAL_BATCH_BYTES.

    Context fields:
        total_bytes:  Cumulative byte size encountered so far.
        limit:        Configured MAX_TOTAL_BATCH_BYTES.
    """

    code = "BATCH_TOO_LARGE"
    http_status = 413

    def __init__(self, total_bytes: int, limit: int) -> None:
        super().__init__(
            detail=(
                f"Total batch size of {total_bytes:,} bytes exceeds the maximum "
                f"allowed batch size of {limit:,} bytes."
            ),
            context={"total_bytes": total_bytes, "limit": limit},
        )
        self.total_bytes = total_bytes
        self.limit = limit


class UnsupportedLanguageError(ValidationError):
    """
    A file has an extension that does not map to a supported language.

    Context fields:
        filename:   The offending filename (sanitised).
        extension:  The detected extension (e.g. ".rb").
        supported:  List of supported extensions.
    """

    code = "UNSUPPORTED_LANGUAGE"
    http_status = 422

    def __init__(
        self,
        filename: str,
        extension: str,
        supported: list[str],
    ) -> None:
        super().__init__(
            detail=(
                f"File '{filename}' has unsupported extension '{extension}'. "
                f"Supported extensions: {', '.join(sorted(supported))}."
            ),
            context={
                "filename": filename,
                "extension": extension,
                "supported": supported,
            },
        )
        self.filename = filename
        self.extension = extension
        self.supported = supported


class InvalidFilenameError(ValidationError):
    """
    A filename fails the safe character-set regex or exceeds the length limit.

    Context fields:
        filename:  The raw (unsanitised) filename from the multipart part header.
        reason:    Human-readable reason (e.g. "contains path traversal components").
    """

    code = "INVALID_FILENAME"
    http_status = 422

    def __init__(self, filename: str, reason: str) -> None:
        super().__init__(
            detail=f"Filename '{filename}' is invalid: {reason}.",
            context={"filename": filename, "reason": reason},
        )
        self.filename = filename
        self.reason = reason


class InvalidEncodingError(ValidationError):
    """
    File content is not valid UTF-8.

    Context fields:
        filename:  The offending filename (sanitised).
    """

    code = "INVALID_ENCODING"
    http_status = 422

    def __init__(self, filename: str) -> None:
        super().__init__(
            detail=(
                f"File '{filename}' is not valid UTF-8. "
                "Only UTF-8 encoded source files are accepted."
            ),
            context={"filename": filename},
        )
        self.filename = filename


# ---------------------------------------------------------------------------
# Ingestion errors  (HTTP 5xx — service-side processing failure)
# ---------------------------------------------------------------------------


class IngestionError(CIPASError):
    """
    Base for errors that occur during the parse / extract pipeline.

    These are typically non-fatal at the batch level: one file failing does
    not abort the entire batch. The pipeline catches these, marks the
    individual file as FAILED, and continues processing remaining files.
    """

    code = "INGESTION_ERROR"
    http_status = 500


class ParseError(IngestionError):
    """
    tree-sitter returned a null tree or an error node at the root.

    This indicates the source file has syntax errors severe enough that
    tree-sitter could not produce a usable CST.

    Context fields:
        filename:  The file that failed to parse.
        language:  The language that was attempted.
        reason:    Additional diagnostic from the parser (if available).
    """

    code = "PARSE_ERROR"
    http_status = 422  # 422 because the source content is the problem (caller's fault)

    def __init__(
        self,
        filename: str,
        language: str,
        reason: str = "tree-sitter returned an unusable parse tree",
    ) -> None:
        super().__init__(
            detail=f"Failed to parse '{filename}' as {language}: {reason}.",
            context={"filename": filename, "language": language, "reason": reason},
        )
        self.filename = filename
        self.language = language
        self.reason = reason


class ParseTimeoutError(IngestionError):
    """
    A parse task in the ProcessPoolExecutor exceeded PARSE_TASK_TIMEOUT.

    This is a service-side constraint, not a caller error, hence HTTP 500.
    The caller may retry with a smaller file.

    Context fields:
        filename:  The file whose parse task timed out.
        timeout:   The configured timeout in seconds.
    """

    code = "PARSE_TIMEOUT"
    http_status = 500

    def __init__(self, filename: str, timeout: float) -> None:
        super().__init__(
            detail=(
                f"Parse task for '{filename}' exceeded the {timeout}s timeout. "
                "The file may be too complex or too large for the current configuration."
            ),
            context={"filename": filename, "timeout_seconds": timeout},
        )
        self.filename = filename
        self.timeout = timeout


class WorkerCrashError(IngestionError):
    """
    A worker process in the ProcessPoolExecutor crashed unexpectedly
    (e.g. segfault in a tree-sitter grammar or OOM in worker).

    The ProcessPoolExecutor replaces the dead worker transparently, but
    the in-flight task is lost. This exception is raised for the file
    whose task was in that worker.

    Context fields:
        filename:  The file whose task was lost in the crash.
    """

    code = "WORKER_CRASH"
    http_status = 500

    def __init__(self, filename: str) -> None:
        super().__init__(
            detail=(
                f"Parse worker crashed while processing '{filename}'. "
                "The file has been marked as failed; other files in the batch are unaffected."
            ),
            context={"filename": filename},
        )
        self.filename = filename


# ---------------------------------------------------------------------------
# Storage errors  (HTTP 5xx — database / infrastructure fault)
# ---------------------------------------------------------------------------


class StorageError(CIPASError):
    """
    Base for all database and storage infrastructure failures.

    These are always HTTP 500; the caller cannot fix them by changing
    the request. The on-call engineer should investigate.
    """

    code = "STORAGE_ERROR"
    http_status = 500


class DBConnectionError(StorageError):
    """
    Failed to acquire a connection from the asyncpg pool within the
    configured timeout, or the pool itself is unhealthy.

    Context fields:
        timeout:  Pool acquisition timeout in seconds.
    """

    code = "DB_CONNECTION_ERROR"
    http_status = 503  # 503 because the DB is a transient dependency

    def __init__(self, timeout: float, cause: Optional[Exception] = None) -> None:
        cause_detail = f": {cause}" if cause else ""
        super().__init__(
            detail=(
                f"Failed to acquire a database connection within {timeout}s{cause_detail}. "
                "The database may be unavailable or the connection pool is exhausted."
            ),
            context={"timeout_seconds": timeout},
        )
        self.timeout = timeout
        self.__cause__ = cause


class DBWriteError(StorageError):
    """
    A database write operation (INSERT/UPDATE) failed.

    This is typically a transient failure (e.g. serialisation conflict,
    temporary connectivity loss). The retry logic in repository.py should
    have already exhausted its attempts before raising this.

    Context fields:
        operation:  The SQL operation that failed (e.g. "bulk_insert_granules").
        cause:      String representation of the underlying asyncpg exception.
    """

    code = "DB_WRITE_ERROR"
    http_status = 500

    def __init__(self, operation: str, cause: Exception) -> None:
        super().__init__(
            detail=f"Database write failed during '{operation}': {cause}.",
            context={"operation": operation, "cause": str(cause)},
        )
        self.operation = operation
        self.__cause__ = cause


# ---------------------------------------------------------------------------
# Capacity errors  (HTTP 503 — transient overload)
# ---------------------------------------------------------------------------


class CapacityError(CIPASError):
    """
    Base for transient capacity-related failures.

    The caller SHOULD retry after a short delay. All subclasses set
    `retry_after` (seconds) which is included in the `Retry-After`
    HTTP response header by the exception handler.
    """

    code = "CAPACITY_ERROR"
    http_status = 503
    retry_after: int = 5  # seconds


class SemaphoreTimeoutError(CapacityError):
    """
    The ingestion pipeline could not acquire a batch semaphore slot within
    BATCH_SEMAPHORE_TIMEOUT seconds.

    This means MAX_CONCURRENT_BATCHES batches are already being processed.
    The caller should retry after `retry_after` seconds.

    Context fields:
        timeout:             Configured BATCH_SEMAPHORE_TIMEOUT.
        active_batches:      Number of batches currently being processed (if known).
        max_batches:         Configured MAX_CONCURRENT_BATCHES.
    """

    code = "SEMAPHORE_TIMEOUT"
    http_status = 503
    retry_after = 5

    def __init__(
        self,
        timeout: float,
        max_batches: int,
        active_batches: Optional[int] = None,
    ) -> None:
        active_detail = (
            f" ({active_batches} batches currently active)"
            if active_batches is not None
            else ""
        )
        super().__init__(
            detail=(
                f"Service is at capacity{active_detail}. "
                f"Could not acquire a processing slot within {timeout}s. "
                f"Maximum concurrent batches: {max_batches}. "
                "Please retry after a short delay."
            ),
            context={
                "timeout_seconds": timeout,
                "max_batches": max_batches,
                "active_batches": active_batches,
                "retry_after_seconds": self.retry_after,
            },
        )
        self.timeout = timeout
        self.max_batches = max_batches
        self.active_batches = active_batches


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    # Base
    "CIPASError",
    # Validation (4xx)
    "ValidationError",
    "FileTooLargeError",
    "TooManyFilesError",
    "BatchTooLargeError",
    "UnsupportedLanguageError",
    "InvalidFilenameError",
    "InvalidEncodingError",
    # Ingestion (5xx)
    "IngestionError",
    "ParseError",
    "ParseTimeoutError",
    "WorkerCrashError",
    # Storage (5xx)
    "StorageError",
    "DBConnectionError",
    "DBWriteError",
    # Capacity (503)
    "CapacityError",
    "SemaphoreTimeoutError",
]
