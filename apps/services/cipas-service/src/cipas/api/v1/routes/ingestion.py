# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/routes/ingestion.py
"""
Ingestion route handlers for the CIPAS submission API.

Endpoints:
  POST   /api/v1/cipas/submissions
      Accept a multipart batch of source files, validate, dispatch to the
      ingestion pipeline, and return the structured parse result.

  GET    /api/v1/cipas/submissions/{submission_id}
      Return the current status and metadata for a submission.

  GET    /api/v1/cipas/submissions/{submission_id}/clones
      Return Type-1 (exact) clone pairs detected for a submission.
      Optional query params: compare_submission_id, granule_type, language, limit.

Design principles:
  - Route handlers are thin: validate inputs, delegate to pipeline/repository,
    return shaped responses.  No business logic lives here.
  - All file validation (count, size, filename, extension, encoding) is
    performed eagerly before any parse task is dispatched, so failures are
    returned cheaply without consuming worker pool resources.
  - The file bytes are read into memory once (via UploadFile.read()), checked
    for size, then passed directly to FileItem.  After FileItem construction
    the UploadFile is closed — no file handles are held across the pipeline call.
  - Duplicate detection within a batch (same file_hash) is handled by the
    pipeline, not the route handler.  The route handler does not deduplicate.
  - The route prefix is /api/v1/cipas (not /api/v1) because Traefik routes
    PathPrefix(`/api/v1/cipas`) to this service.

Error handling:
  - All CIPASError subclasses are caught by the global exception handler in
    main.py and translated to RFC 7807 ProblemDetail JSON responses.
  - pydantic ValidationError from Form fields is caught by FastAPI's default
    handler and returned as HTTP 422.
  - Unexpected exceptions (not CIPASError) propagate to the FastAPI default
    handler which returns HTTP 500.

Multipart form contract:
  Content-Type: multipart/form-data
  Fields:
    assignment_id   string (UUID v4)   required
    submitted_by    string (UUID v4)   required
    files           UploadFile[]       required, 1-200 files

  Per-file constraints (enforced in _validate_and_read_files):
    - Extension must be in Language.supported_extensions()
    - Filename: basename only, regex ^[a-zA-Z0-9_\-\.]{1,255}$
    - Size: > 0 bytes, <= MAX_FILE_SIZE_BYTES
    - Cumulative batch size: <= MAX_TOTAL_BATCH_BYTES
    - Content must be valid UTF-8
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from loguru import logger

from cipas.api.v1.deps.db import PipelineDep, RepositoryDep, SettingsDep
from cipas.core.exceptions import (
    BatchTooLargeError,
    CIPASError,
    FileTooLargeError,
    InvalidEncodingError,
    InvalidFilenameError,
    TooManyFilesError,
    UnsupportedLanguageError,
)
from cipas.domain.models import (
    FileItem,
    Language,
    SubmissionResponse,
    SubmissionStatusResponse,
)
from cipas.extraction.granule_extractor import compute_file_hash

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/cipas",
    tags=["ingestion"],
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Service initialising or at capacity"
        },
        status.HTTP_422_UNPROCESSABLE_ENTITY: {
            "description": "Request validation failed"
        },
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: {
            "description": "File or batch size limit exceeded"
        },
    },
)

# ---------------------------------------------------------------------------
# Filename validation regex
# Safe character set: alphanumeric, underscore, hyphen, dot.
# Max length: 255 characters.
# This is applied AFTER os.path.basename() strips path components.
# ---------------------------------------------------------------------------
_SAFE_FILENAME_RE: re.Pattern[str] = re.compile(r"^[a-zA-Z0-9_\-\.]{1,255}$")


# ---------------------------------------------------------------------------
# POST /api/v1/cipas/submissions
# ---------------------------------------------------------------------------


@router.post(
    "/submissions",
    summary="Submit a batch of source files for clone analysis",
    response_model=SubmissionResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {
            "description": (
                "Batch processed. Status is COMPLETED, PARTIAL, or FAILED "
                "depending on how many files parsed successfully."
            )
        },
        413: {"description": "Too many files, file too large, or batch too large"},
        422: {
            "description": "Invalid filename, unsupported extension, or bad encoding"
        },
        503: {"description": "Pipeline at capacity — retry after Retry-After seconds"},
    },
)
async def submit_batch(
    request: Request,
    settings: SettingsDep,
    repository: RepositoryDep,
    pipeline: PipelineDep,
    # ── Form fields ────────────────────────────────────────────────────────────
    # FastAPI parses these from the multipart form body.
    # UUIDs are received as strings and validated here (not via Pydantic Form
    # because Form fields with UUID type do not produce clean error messages).
    assignment_id: str = Form(
        ...,
        description="UUID v4 of the assignment this submission belongs to",
        examples=["550e8400-e29b-41d4-a716-446655440000"],
    ),
    submitted_by: str = Form(
        ...,
        description="UUID v4 of the submitting user",
        examples=["550e8400-e29b-41d4-a716-446655440001"],
    ),
    # ── File uploads ───────────────────────────────────────────────────────────
    # FastAPI accepts List[UploadFile] for multi-file uploads.
    # The field name "files" must match the multipart part name.
    files: list[UploadFile] = File(
        ...,
        description="Source files to analyse (1–200 files per batch)",
    ),
) -> SubmissionResponse:
    """
    Accept a multipart batch of source files and run the parse pipeline.

    Processing flow:
        1. Parse and validate assignment_id and submitted_by UUIDs.
        2. Check file count against MAX_FILES_PER_BATCH.
        3. Read and validate each file: filename, extension, size, encoding.
        4. Create the submission DB record (status=PROCESSING).
        5. Dispatch the validated FileItem list to IngestionPipeline.ingest().
        6. Return the SubmissionResponse derived from BatchParseResult.

    The response is synchronous — the HTTP connection is held open while the
    pipeline processes the batch.  For a 200-file batch on a 4-core container,
    expected response time is 500ms–2s.

    If the pipeline semaphore is exhausted (service at capacity), returns
    HTTP 503 with Retry-After: 5.  The caller should retry after 5 seconds.
    """

    # ── Step 1: Validate UUIDs ────────────────────────────────────────────────
    try:
        parsed_assignment_id = uuid.UUID(assignment_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_UUID",
                "field": "assignment_id",
                "detail": f"assignment_id must be a valid UUID v4, got: {assignment_id!r}",
            },
        )

    try:
        parsed_submitted_by = uuid.UUID(submitted_by)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_UUID",
                "field": "submitted_by",
                "detail": f"submitted_by must be a valid UUID v4, got: {submitted_by!r}",
            },
        )

    # ── Step 2: File count check ──────────────────────────────────────────────
    if not files:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "NO_FILES",
                "detail": "At least one file must be provided in the batch.",
            },
        )

    if len(files) > settings.MAX_FILES_PER_BATCH:
        raise TooManyFilesError(
            received=len(files),
            limit=settings.MAX_FILES_PER_BATCH,
        )

    # ── Step 3: Read and validate files ───────────────────────────────────────
    file_items = await _validate_and_read_files(files, settings=settings)

    logger.info(
        "Submission received",
        assignment_id=str(parsed_assignment_id),
        submitted_by=str(parsed_submitted_by),
        file_count=len(file_items),
        total_bytes=sum(f.byte_size for f in file_items),
    )

    # ── Step 4: Create submission record ──────────────────────────────────────
    submission_id = uuid.uuid4()
    await repository.create_submission(
        submission_id=submission_id,
        assignment_id=parsed_assignment_id,
        submitted_by=parsed_submitted_by,
        file_count=len(file_items),
    )

    # ── Step 5: Run pipeline ──────────────────────────────────────────────────
    # SemaphoreTimeoutError is raised by the pipeline if at capacity.
    # It is caught by the global exception handler in main.py → HTTP 503.
    batch_result = await pipeline.ingest(
        submission_id=submission_id,
        files=file_items,
    )

    # ── Step 6: Build and return response ─────────────────────────────────────
    failed_results = [
        fr for fr in batch_result.file_results if fr.error_detail is not None
    ]

    response = SubmissionResponse.from_batch_result(
        result=batch_result,
        file_results_with_errors=failed_results,
    )

    logger.info(
        "Submission response dispatched",
        submission_id=str(submission_id),
        status=response.status.value,
        granule_count=response.granule_count,
        pipeline_duration_ms=response.pipeline_duration_ms,
    )

    return response


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/submissions/{submission_id}
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}",
    summary="Get submission status and metadata",
    response_model=SubmissionStatusResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Submission found"},
        404: {"description": "Submission not found"},
    },
)
async def get_submission(
    submission_id: uuid.UUID,
    repository: RepositoryDep,
) -> SubmissionStatusResponse:
    """
    Return the current status and metadata for a submission by its UUID.

    For submissions in PROCESSING state (in-progress batches), the response
    reflects the state at the time of the request.  Poll until status is a
    terminal state (COMPLETED, PARTIAL, or FAILED).

    Returns HTTP 404 if the submission does not exist.
    """
    row = await repository.get_submission(submission_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SUBMISSION_NOT_FOUND",
                "detail": f"Submission {submission_id!s} does not exist.",
            },
        )

    return SubmissionStatusResponse(
        submission_id=row["id"],
        assignment_id=row["assignment_id"],
        submitted_by=row["submitted_by"],
        status=row["status"],
        file_count=row["file_count"],
        granule_count=row["granule_count"],
        error_message=row.get("error_message"),
        created_at=row["created_at"],
        completed_at=row.get("completed_at"),
    )


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/submissions/{submission_id}/clones
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}/clones",
    summary="Find Type-1 (exact) clone pairs for a submission",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Clone pairs found (may be empty list)"},
        404: {"description": "Submission not found"},
    },
)
async def get_clone_pairs(
    submission_id: uuid.UUID,
    repository: RepositoryDep,
    compare_submission_id: Optional[uuid.UUID] = None,
    granule_type: Optional[str] = None,
    language: Optional[str] = None,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Find Type-1 (exact hash match) clone pairs for a completed submission.

    A Type-1 clone pair is two granules with the same normalised source
    (granule_hash match) that come from different files.

    Query parameters:
      compare_submission_id  Compare against a specific other submission.
                             If omitted, compares against all submissions.
      granule_type           Filter by type: "class", "function", or "loop".
      language               Filter by language: "python", "java", or "c".
      limit                  Maximum clone pairs to return (default: 100, max: 1000).

    Returns HTTP 404 if the submission does not exist.
    Returns an empty `clones` list if no clone pairs were found.
    """
    # Validate limit bounds.
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_LIMIT",
                "detail": "limit must be between 1 and 1000.",
            },
        )

    # Validate granule_type if provided.
    if granule_type is not None and granule_type not in ("class", "function", "loop"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_GRANULE_TYPE",
                "detail": "granule_type must be 'class', 'function', or 'loop'.",
            },
        )

    # Validate language if provided.
    if language is not None and language not in ("python", "java", "c"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_LANGUAGE",
                "detail": "language must be 'python', 'java', or 'c'.",
            },
        )

    # Confirm submission exists.
    row = await repository.get_submission(submission_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SUBMISSION_NOT_FOUND",
                "detail": f"Submission {submission_id!s} does not exist.",
            },
        )

    clones = await repository.find_type1_clones(
        submission_id=submission_id,
        compare_submission_id=compare_submission_id,
        granule_type=granule_type,
        language=language,
        limit=limit,
    )

    # Serialise UUIDs to strings for JSON output
    # (asyncpg returns asyncpg.Record objects with UUID values).
    serialised = []
    for c in clones:
        serialised.append(
            {k: str(v) if isinstance(v, uuid.UUID) else v for k, v in c.items()}
        )

    return {
        "submission_id": str(submission_id),
        "clone_type": "TYPE_1",
        "total_pairs": len(serialised),
        "clones": serialised,
    }


# ---------------------------------------------------------------------------
# GET /api/v1/cipas/submissions/{submission_id}/clones/type2
# ---------------------------------------------------------------------------


@router.get(
    "/submissions/{submission_id}/clones/type2",
    summary="Find Type-2 (structural) clone candidates for a submission",
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Clone candidates found (may be empty list)"},
        404: {"description": "Submission not found"},
    },
)
async def get_type2_clone_candidates(
    submission_id: uuid.UUID,
    repository: RepositoryDep,
    compare_submission_id: Optional[uuid.UUID] = None,
    granule_type: Optional[str] = None,
    limit: int = 100,
) -> dict[str, Any]:
    """
    Find Type-2 (structural) clone candidates for a completed submission.

    A Type-2 candidate pair shares the same AST fingerprint (identical
    structural shape) but has a different granule_hash (different identifier
    names or literals).  These are candidates — Phase 2 validation via
    identifier renaming normalisation is required to confirm true Type-2 clones.

    Query parameters:
      compare_submission_id  Compare against a specific other submission.
      granule_type           Filter: "class", "function", or "loop".
      limit                  Max pairs to return (default: 100, max: 1000).
    """
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_LIMIT", "detail": "limit must be 1–1000."},
        )

    row = await repository.get_submission(submission_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SUBMISSION_NOT_FOUND",
                "detail": f"Submission {submission_id!s} does not exist.",
            },
        )

    candidates = await repository.find_type2_candidates(
        submission_id=submission_id,
        compare_submission_id=compare_submission_id,
        granule_type=granule_type,
        limit=limit,
    )

    serialised = [
        {k: str(v) if isinstance(v, uuid.UUID) else v for k, v in c.items()}
        for c in candidates
    ]

    return {
        "submission_id": str(submission_id),
        "clone_type": "TYPE_2_CANDIDATE",
        "note": (
            "These are structural candidates only. "
            "Phase 2 identifier-renaming normalisation is required to confirm "
            "true Type-2 clones."
        ),
        "total_pairs": len(serialised),
        "clones": serialised,
    }


# ---------------------------------------------------------------------------
# File validation helper
# ---------------------------------------------------------------------------


async def _validate_and_read_files(
    uploads: list[UploadFile],
    *,
    settings: Any,
) -> list[FileItem]:
    """
    Validate and read all uploaded files.

    Applies validation in this order (fails fast at each gate):
        1. Filename sanitisation (path traversal prevention, safe char regex)
        2. Extension whitelist check
        3. Per-file size limit (read with size guard)
        4. Cumulative batch size check
        5. UTF-8 decodability check

    For each valid file, computes file_hash (SHA-256 of raw bytes) and
    constructs a FileItem DTO.

    Args:
        uploads:  List of FastAPI UploadFile objects from the multipart form.
        settings: Validated Settings instance.

    Returns:
        List of FileItem objects, one per uploaded file.
        All files are fully read into memory and their handles closed.

    Raises:
        InvalidFilenameError:    Filename fails sanitisation or safe-char regex.
        UnsupportedLanguageError: File extension is not in the whitelist.
        FileTooLargeError:        File exceeds MAX_FILE_SIZE_BYTES.
        BatchTooLargeError:       Cumulative batch exceeds MAX_TOTAL_BATCH_BYTES.
        InvalidEncodingError:     File content is not valid UTF-8.
    """
    file_items: list[FileItem] = []
    total_bytes: int = 0

    for upload in uploads:
        # ── 1. Filename sanitisation ──────────────────────────────────────────
        raw_filename: str = upload.filename or ""

        # Strip any path components to prevent directory traversal.
        safe_filename = os.path.basename(raw_filename)

        # Reject empty filenames (after basename extraction).
        if not safe_filename:
            raise InvalidFilenameError(
                filename=raw_filename,
                reason="filename is empty or consists entirely of path separators",
            )

        # Enforce the safe character set regex.
        if not _SAFE_FILENAME_RE.match(safe_filename):
            raise InvalidFilenameError(
                filename=safe_filename,
                reason=(
                    "filename contains characters outside the allowed set "
                    "[a-zA-Z0-9_\\-\\.] or exceeds 255 characters"
                ),
            )

        # ── 2. Extension whitelist ────────────────────────────────────────────
        _, ext = os.path.splitext(safe_filename)
        language = Language.from_extension(ext)
        if language is None:
            raise UnsupportedLanguageError(
                filename=safe_filename,
                extension=ext,
                supported=Language.supported_extensions(),
            )

        # ── 3. Per-file size limit ────────────────────────────────────────────
        # Read the file with a size guard: read(limit + 1) bytes.
        # If we get more than the limit, the file is too large — reject it
        # without reading the rest (avoids loading a 100MB file into memory).
        try:
            content: bytes = await upload.read(settings.MAX_FILE_SIZE_BYTES + 1)
        finally:
            # Always close the UploadFile handle to release resources,
            # regardless of whether the read succeeded.
            await upload.close()

        actual_size = len(content)

        if actual_size == 0:
            raise InvalidFilenameError(
                filename=safe_filename,
                reason="file is empty (0 bytes)",
            )

        if actual_size > settings.MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(
                filename=safe_filename,
                size=actual_size,
                limit=settings.MAX_FILE_SIZE_BYTES,
            )

        # ── 4. Cumulative batch size check ────────────────────────────────────
        total_bytes += actual_size
        if total_bytes > settings.MAX_TOTAL_BATCH_BYTES:
            raise BatchTooLargeError(
                total_bytes=total_bytes,
                limit=settings.MAX_TOTAL_BATCH_BYTES,
            )

        # ── 5. UTF-8 decodability check ───────────────────────────────────────
        # Reject binary files masquerading as source files.
        # errors="strict" raises UnicodeDecodeError on any non-UTF-8 byte.
        try:
            content.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            raise InvalidEncodingError(filename=safe_filename)

        # ── Construct FileItem ────────────────────────────────────────────────
        file_hash = compute_file_hash(content)

        file_items.append(
            FileItem(
                filename=safe_filename,
                language=language,
                content=content,
                file_hash=file_hash,
                byte_size=actual_size,
            )
        )

    return file_items
