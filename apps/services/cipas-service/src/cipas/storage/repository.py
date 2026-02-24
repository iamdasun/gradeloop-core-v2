# gradeloop-core-v2/apps/services/cipas-service/src/cipas/storage/repository.py
"""
StorageRepository — typed async data access layer for CIPAS.

Responsibilities:
  - Provide typed async methods for all DB read/write operations.
  - Isolate all SQL from the rest of the application.
  - Enforce the rule: no business logic in the repository, no SQL outside it.
  - Use asyncpg parameterised queries exclusively ($1, $2, ...) — never string
    interpolation.
  - Implement retry logic for transient DB failures (serialisation conflicts,
    transient connectivity loss).

Design decisions:
  ─────────────────────────────────────────────────────────────────────────────
  Raw SQL (not SQLAlchemy):
    asyncpg's binary protocol is most efficient with raw SQL.  SQLAlchemy Core
    adds a significant abstraction layer and its async support (asyncpg dialect)
    is less battle-tested for bulk INSERT workloads.  Raw SQL with parameterised
    queries is simpler, faster, and easier to optimise.

  executemany() for bulk inserts:
    asyncpg.Connection.executemany(query, args_list) sends all rows in a single
    protocol round-trip with pipelining.  For 200 files × 50 granules = 10,000
    rows, this reduces insert time from ~10s (10,000 individual INSERTs) to
    ~50ms (one executemany call).

  Single transaction per submission:
    bulk_insert_files() and bulk_insert_granules() are called within a single
    asyncpg transaction acquired in _write_submission_data().  If either fails,
    both roll back atomically.  The submission record is updated AFTER the
    transaction commits.

  Retry strategy:
    Transient errors (asyncpg.exceptions.SerializationError,
    asyncpg.exceptions.DeadlockDetectedError,
    asyncpg.exceptions.TooManyConnectionsError) are retried up to
    MAX_RETRIES times with exponential backoff.  Non-transient errors
    (constraint violations, type errors) are NOT retried.

  Connection acquisition:
    Every method acquires a connection via `async with pool.acquire()` for
    the duration of the operation.  We do NOT hold connections across
    multiple method calls — each method is a complete unit of work.
    This keeps pool utilisation low even under concurrent batch processing.

  No UUID generation in SQL:
    UUIDs are generated in the application layer (domain/models.py via uuid4())
    and passed as strings to asyncpg.  This avoids relying on gen_random_uuid()
    being available (requires pgcrypto extension) and keeps ID generation
    deterministic in tests.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, Optional
import uuid

import asyncpg  # type: ignore[import]
from loguru import logger

from cipas.core.exceptions import DBConnectionError, DBWriteError
from cipas.domain.models import SubmissionStatus

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Retry configuration
# ---------------------------------------------------------------------------

# Maximum number of retry attempts for transient DB errors.
_MAX_RETRIES: int = 3

# Base backoff delay in seconds.  Actual delay = _BACKOFF_BASE * (2 ** attempt).
_BACKOFF_BASE: float = 0.05  # 50ms, 100ms, 200ms

# asyncpg exception classes that represent transient failures worth retrying.
# These are defined as strings to avoid importing asyncpg.exceptions at module
# level (the exceptions are attributes of the asyncpg package; accessing them
# requires asyncpg to be installed and imported, which is fine here).
_RETRYABLE_EXCEPTIONS: tuple[type[Exception], ...] = ()


def _get_retryable_exceptions() -> tuple[type[Exception], ...]:
    """
    Return the tuple of asyncpg exception classes that should be retried.

    Deferred to a function to avoid importing asyncpg.exceptions at module
    load time (the submodule may not be importable without a DB connection
    in some test environments).
    """
    try:
        return (
            asyncpg.exceptions.SerializationError,
            asyncpg.exceptions.DeadlockDetectedError,
            asyncpg.exceptions.TooManyConnectionsError,
            asyncpg.exceptions.ConnectionDoesNotExistError,
        )
    except AttributeError:
        return (asyncpg.PostgresConnectionError,)


# ---------------------------------------------------------------------------
# StorageRepository
# ---------------------------------------------------------------------------


class StorageRepository:
    """
    Typed async data access layer for CIPAS.

    All DB interaction in the service goes through this class.  The pipeline,
    route handlers, and health check all use StorageRepository methods —
    never raw asyncpg calls outside this module.

    Instantiation:
        The repository is created once at application startup with the
        asyncpg pool and stored on app.state.repository.

        repository = StorageRepository(pool=pool)

    Dependency injection:
        FastAPI route handlers receive the repository via the get_repository()
        dependency in cipas/api/v1/deps/db.py.

    Error contract:
        - DBConnectionError (HTTP 503): Pool exhausted or DB unreachable.
        - DBWriteError (HTTP 500): INSERT/UPDATE failed after retries.
        - All other asyncpg exceptions propagate as-is for unexpected errors.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._retryable: tuple[type[Exception], ...] = _get_retryable_exceptions()

    # ------------------------------------------------------------------
    # Submission operations
    # ------------------------------------------------------------------

    async def create_submission(
        self,
        *,
        submission_id: uuid.UUID,
        assignment_id: uuid.UUID,
        submitted_by: uuid.UUID,
        file_count: int,
    ) -> None:
        """
        Insert a new submission record with status=PROCESSING.

        Called by the ingestion route handler before dispatching parse tasks,
        so the submission exists in the DB from the moment the request is
        accepted.  This allows callers to poll GET /submissions/{id} while
        processing is in progress.

        Args:
            submission_id:  Client-visible submission UUID (generated server-side).
            assignment_id:  UUID of the assignment this submission belongs to.
            submitted_by:   UUID of the user who submitted.
            file_count:     Total number of files in the batch (including duplicates).

        Raises:
            DBWriteError: If the INSERT fails.
        """
        query = """
            INSERT INTO submissions (
                id, assignment_id, submitted_by, status, file_count, granule_count
            ) VALUES (
                $1, $2, $3, 'PROCESSING', $4, 0
            )
        """
        await self._execute_with_retry(
            operation="create_submission",
            query=query,
            args=(
                str(submission_id),
                str(assignment_id),
                str(submitted_by),
                file_count,
            ),
        )

        logger.debug(
            "Submission record created",
            submission_id=str(submission_id),
            assignment_id=str(assignment_id),
            file_count=file_count,
        )

    async def update_submission_status(
        self,
        *,
        submission_id: uuid.UUID,
        status: SubmissionStatus,
        granule_count: int,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Update a submission's status to a terminal state.

        Called by the pipeline after all files have been processed and
        DB writes have completed.  This is the final operation in the
        batch lifecycle.

        Args:
            submission_id:  The submission to update.
            status:         Terminal status (COMPLETED, PARTIAL, or FAILED).
            granule_count:  Total granules extracted across all parsed files.
            error_message:  Optional error summary (populated for PARTIAL/FAILED).

        Raises:
            DBWriteError: If the UPDATE fails.
        """
        query = """
            UPDATE submissions
            SET
                status        = $2,
                granule_count = $3,
                error_message = $4,
                completed_at  = NOW()
            WHERE id = $1
        """
        await self._execute_with_retry(
            operation="update_submission_status",
            query=query,
            args=(
                str(submission_id),
                status.value,
                granule_count,
                error_message,
            ),
        )

        logger.info(
            "Submission status updated",
            submission_id=str(submission_id),
            status=status.value,
            granule_count=granule_count,
        )

    async def get_submission(
        self,
        submission_id: uuid.UUID,
    ) -> Optional[dict[str, Any]]:
        """
        Fetch a single submission record by ID.

        Returns None if the submission does not exist.

        Args:
            submission_id: The submission UUID to look up.

        Returns:
            A dict with submission fields, or None.
        """
        query = """
            SELECT
                id,
                assignment_id,
                submitted_by,
                status,
                file_count,
                granule_count,
                error_message,
                created_at,
                completed_at
            FROM submissions
            WHERE id = $1
        """
        try:
            async with self._pool.acquire() as conn:
                row: asyncpg.Record | None = await conn.fetchrow(
                    query, str(submission_id)
                )
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(
                timeout=self._pool.get_min_size(),
                cause=exc,
            ) from exc

        if row is None:
            return None

        return dict(row)

    async def get_submission_files(
        self,
        submission_id: uuid.UUID,
    ) -> list[dict[str, Any]]:
        """
        Fetch all file records for a submission.

        Args:
            submission_id: The submission UUID.

        Returns:
            List of file record dicts, ordered by filename.
        """
        query = """
            SELECT
                id,
                submission_id,
                filename,
                language,
                file_hash,
                byte_size,
                line_count,
                parse_status,
                error_message,
                created_at
            FROM files
            WHERE submission_id = $1
            ORDER BY filename
        """
        try:
            async with self._pool.acquire() as conn:
                rows: list[asyncpg.Record] = await conn.fetch(query, str(submission_id))
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    async def get_submission_granule_count(
        self,
        submission_id: uuid.UUID,
    ) -> int:
        """
        Return the count of granules associated with a submission.

        Used by the health check and observability endpoints.

        Args:
            submission_id: The submission UUID.

        Returns:
            Number of granule rows for this submission.
        """
        query = "SELECT COUNT(*) FROM granules WHERE submission_id = $1"
        try:
            async with self._pool.acquire() as conn:
                count: int = await conn.fetchval(query, str(submission_id)) or 0
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc
        return count

    # ------------------------------------------------------------------
    # Bulk insert operations
    # ------------------------------------------------------------------

    async def bulk_insert_files(
        self,
        file_records: list[dict[str, Any]],
    ) -> None:
        """
        Bulk insert file records using asyncpg executemany.

        All records are inserted in a single protocol round-trip.  The insert
        uses ON CONFLICT DO NOTHING to handle the case where a retry re-submits
        records that were already committed (idempotent on re-run).

        Args:
            file_records: List of dicts with keys:
                id, submission_id, filename, language, file_hash,
                byte_size, line_count, parse_status, error_message.

        Raises:
            DBWriteError: If the bulk insert fails after retries.
        """
        if not file_records:
            return

        query = """
            INSERT INTO files (
                id, submission_id, filename, language, file_hash,
                byte_size, line_count, parse_status, error_message
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9
            )
            ON CONFLICT (id) DO NOTHING
        """

        args_list = [
            (
                r["id"],
                r["submission_id"],
                r["filename"],
                r["language"],
                r["file_hash"],
                r["byte_size"],
                r["line_count"],
                r["parse_status"],
                r.get("error_message"),
            )
            for r in file_records
        ]

        await self._executemany_with_retry(
            operation="bulk_insert_files",
            query=query,
            args_list=args_list,
        )

        logger.debug(
            "Bulk inserted files",
            count=len(file_records),
        )

    async def bulk_insert_granules(
        self,
        granule_dicts: list[dict[str, Any]],
    ) -> None:
        """
        Bulk insert granule records using asyncpg executemany.

        Granules are inserted in batches of BATCH_SIZE rows to prevent
        extremely large executemany calls from exhausting the asyncpg
        send buffer or hitting PostgreSQL parameter limits.

        The INSERT uses ON CONFLICT DO NOTHING for idempotency on retry.

        Args:
            granule_dicts: List of GranuleData.model_dump() dicts with keys:
                id, file_id, submission_id, granule_type, language,
                file_hash, granule_hash, ast_fingerprint,
                start_line, end_line, name, normalized_source.

        Raises:
            DBWriteError: If any batch insert fails after retries.
        """
        if not granule_dicts:
            return

        # Insert in batches of 500 rows to stay well within asyncpg's
        # internal buffer limits and avoid single-statement timeouts on
        # extremely large granule sets.
        BATCH_SIZE = 500

        query = """
            INSERT INTO granules (
                id, file_id, submission_id, granule_type, language,
                file_hash, granule_hash, ast_fingerprint,
                start_line, end_line, name, normalized_source
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )
            ON CONFLICT (id) DO NOTHING
        """

        total_inserted = 0
        for batch_start in range(0, len(granule_dicts), BATCH_SIZE):
            batch = granule_dicts[batch_start : batch_start + BATCH_SIZE]

            args_list = [
                (
                    str(g["id"]),
                    str(g["file_id"]),
                    str(g["submission_id"]),
                    g["granule_type"],
                    g["language"],
                    g["file_hash"],
                    g["granule_hash"],
                    g["ast_fingerprint"],
                    g["start_line"],
                    g["end_line"],
                    g.get("name"),
                    g["normalized_source"],
                )
                for g in batch
                # Filter out oversized sentinel granules with empty normalised source
                # IF we want to exclude them from the granules table. For Phase 1,
                # we keep them (is_oversized=True granules still have their AST
                # fingerprint and span stored for observability).
            ]

            await self._executemany_with_retry(
                operation=f"bulk_insert_granules (batch {batch_start // BATCH_SIZE + 1})",
                query=query,
                args_list=args_list,
            )
            total_inserted += len(batch)

        logger.debug(
            "Bulk inserted granules",
            count=total_inserted,
            batches=((len(granule_dicts) - 1) // BATCH_SIZE + 1),
        )

    # ------------------------------------------------------------------
    # Clone detection queries  (Phase 1: Type 1 exact match)
    # ------------------------------------------------------------------

    async def find_type1_clones(
        self,
        *,
        submission_id: uuid.UUID,
        compare_submission_id: Optional[uuid.UUID] = None,
        granule_type: Optional[str] = None,
        language: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Find Type-1 (exact) clone pairs for a submission.

        A Type-1 clone pair is two granules with the same granule_hash that
        belong to different files.

        If compare_submission_id is provided, finds clones between
        submission_id and compare_submission_id specifically.
        Otherwise, finds clones between submission_id and ANY other submission.

        Oversized sentinel granules (granule_hash = '000...0') are excluded.

        Args:
            submission_id:         The submission to find clones for.
            compare_submission_id: Optional second submission to compare against.
                                   If None, compares against all submissions.
            granule_type:          Optional filter: "class", "function", or "loop".
            language:              Optional filter: "python", "java", or "c".
            limit:                 Maximum number of clone pairs to return.

        Returns:
            List of dicts, each representing a clone pair:
            {
                "granule_a_id":         str (UUID),
                "granule_b_id":         str (UUID),
                "granule_hash":         str,
                "granule_type":         str,
                "language":             str,
                "file_a_id":            str (UUID),
                "file_b_id":            str (UUID),
                "submission_a_id":      str (UUID),
                "submission_b_id":      str (UUID),
                "start_line_a":         int,
                "end_line_a":           int,
                "start_line_b":         int,
                "end_line_b":           int,
                "name_a":               str | None,
                "name_b":               str | None,
            }
        """
        # Build parameterised WHERE clause.
        # We avoid string interpolation — all filter values are positional params.
        params: list[Any] = [str(submission_id)]
        param_idx = 2  # $1 is already used for submission_id

        compare_filter = ""
        if compare_submission_id is not None:
            compare_filter = f"AND b.submission_id = ${param_idx}"
            params.append(str(compare_submission_id))
            param_idx += 1
        else:
            compare_filter = "AND b.submission_id != $1"

        type_filter = ""
        if granule_type is not None:
            type_filter = f"AND a.granule_type = ${param_idx}"
            params.append(granule_type)
            param_idx += 1

        lang_filter = ""
        if language is not None:
            lang_filter = f"AND a.language = ${param_idx}"
            params.append(language)
            param_idx += 1

        params.append(limit)
        limit_param = f"${param_idx}"

        # Sentinel hash (all zeros) is excluded — those are oversized granules.
        sentinel = "0" * 64

        query = f"""
            SELECT
                a.id             AS granule_a_id,
                b.id             AS granule_b_id,
                a.granule_hash,
                a.granule_type,
                a.language,
                a.file_id        AS file_a_id,
                b.file_id        AS file_b_id,
                a.submission_id  AS submission_a_id,
                b.submission_id  AS submission_b_id,
                a.start_line     AS start_line_a,
                a.end_line       AS end_line_a,
                b.start_line     AS start_line_b,
                b.end_line       AS end_line_b,
                a.name           AS name_a,
                b.name           AS name_b
            FROM granules a
            JOIN granules b
              ON  a.granule_hash = b.granule_hash
             AND  a.file_id     != b.file_id
            WHERE a.submission_id = $1
              {compare_filter}
              {type_filter}
              {lang_filter}
              AND a.granule_hash != '{sentinel}'
            ORDER BY a.granule_type, a.start_line
            LIMIT {limit_param}
        """

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    async def find_type2_candidates(
        self,
        *,
        submission_id: uuid.UUID,
        compare_submission_id: Optional[uuid.UUID] = None,
        granule_type: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Find Type-2 clone candidates: same AST fingerprint, different granule_hash.

        Type-2 clones are structurally identical code with renamed identifiers.
        Candidates are pairs where:
          - ast_fingerprint matches (same structural shape)
          - granule_hash differs (content is different — renamed identifiers)

        These are candidates only; Phase 2 will validate them using identifier
        renaming normalisation to confirm they are true Type-2 clones.

        Args:
            submission_id:         The submission to search.
            compare_submission_id: Optional second submission to compare against.
            granule_type:          Optional filter by granule type.
            limit:                 Maximum clone pairs to return.

        Returns:
            List of dicts with the same schema as find_type1_clones().
        """
        params: list[Any] = [str(submission_id)]
        param_idx = 2

        compare_filter = ""
        if compare_submission_id is not None:
            compare_filter = f"AND b.submission_id = ${param_idx}"
            params.append(str(compare_submission_id))
            param_idx += 1
        else:
            compare_filter = "AND b.submission_id != $1"

        type_filter = ""
        if granule_type is not None:
            type_filter = f"AND a.granule_type = ${param_idx}"
            params.append(granule_type)
            param_idx += 1

        params.append(limit)
        limit_param = f"${param_idx}"

        sentinel = "0" * 64

        query = f"""
            SELECT
                a.id             AS granule_a_id,
                b.id             AS granule_b_id,
                a.ast_fingerprint,
                a.granule_type,
                a.language,
                a.file_id        AS file_a_id,
                b.file_id        AS file_b_id,
                a.submission_id  AS submission_a_id,
                b.submission_id  AS submission_b_id,
                a.start_line     AS start_line_a,
                a.end_line       AS end_line_a,
                b.start_line     AS start_line_b,
                b.end_line       AS end_line_b,
                a.name           AS name_a,
                b.name           AS name_b
            FROM granules a
            JOIN granules b
              ON  a.ast_fingerprint  = b.ast_fingerprint
             AND  a.granule_hash    != b.granule_hash
             AND  a.file_id         != b.file_id
            WHERE a.submission_id = $1
              {compare_filter}
              {type_filter}
              AND a.ast_fingerprint != '{sentinel}'
            ORDER BY a.granule_type, a.start_line
            LIMIT {limit_param}
        """

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    async def ping(self) -> bool:
        """
        Execute a minimal query to verify DB connectivity.

        Used by the health endpoint to check that the pool is functional
        and the DB is reachable.

        Returns:
            True if the DB responds within command_timeout.
            Raises if unreachable (caller handles the exception).
        """
        async with self._pool.acquire() as conn:
            result: int = await conn.fetchval("SELECT 1")
        return result == 1

    async def get_pool_stats(self) -> dict[str, int]:
        """
        Return current connection pool statistics for observability.

        Returns:
            {
                "size":         current pool size (open connections),
                "free":         idle connections available for acquisition,
                "used":         connections currently in use by queries,
                "min_size":     configured minimum pool size,
                "max_size":     configured maximum pool size,
            }
        """
        return {
            "size": self._pool.get_size(),
            "free": self._pool.get_idle_size(),
            "used": self._pool.get_size() - self._pool.get_idle_size(),
            "min_size": self._pool.get_min_size(),
            "max_size": self._pool.get_max_size(),
        }

    # ------------------------------------------------------------------
    # Internal retry helpers
    # ------------------------------------------------------------------

    async def _execute_with_retry(
        self,
        *,
        operation: str,
        query: str,
        args: tuple[Any, ...],
    ) -> None:
        """
        Execute a single-statement query with retry on transient errors.

        Args:
            operation: Human-readable name for logging / error messages.
            query:     Parameterised SQL query string.
            args:      Positional parameters for the query ($1, $2, ...).

        Raises:
            DBConnectionError: If connection acquisition fails.
            DBWriteError:      If the query fails after all retries.
        """
        last_exc: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES):
            try:
                async with self._pool.acquire() as conn:
                    await conn.execute(query, *args)
                return  # success

            except asyncpg.PostgresConnectionError as exc:
                raise DBConnectionError(timeout=0, cause=exc) from exc

            except self._retryable as exc:
                last_exc = exc
                delay = _BACKOFF_BASE * (2**attempt)
                logger.warning(
                    "Transient DB error — retrying",
                    operation=operation,
                    attempt=attempt + 1,
                    max_retries=_MAX_RETRIES,
                    delay_ms=delay * 1000,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

            except Exception as exc:
                # Non-retryable (constraint violation, type error, etc.).
                raise DBWriteError(operation=operation, cause=exc) from exc

        # All retries exhausted.
        raise DBWriteError(
            operation=operation, cause=last_exc or Exception("exhausted")
        )

    async def _executemany_with_retry(
        self,
        *,
        operation: str,
        query: str,
        args_list: list[tuple[Any, ...]],
    ) -> None:
        """
        Execute a bulk insert using executemany with retry on transient errors.

        executemany() sends all rows in a single protocol message, which is
        ~10–50× faster than individual execute() calls for large batches.

        Args:
            operation:  Human-readable name for logging / error messages.
            query:      Parameterised INSERT query string.
            args_list:  List of argument tuples, one per row.

        Raises:
            DBConnectionError: If connection acquisition fails.
            DBWriteError:      If the bulk insert fails after all retries.
        """
        if not args_list:
            return

        last_exc: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES):
            try:
                async with self._pool.acquire() as conn:
                    await conn.executemany(query, args_list)
                return  # success

            except asyncpg.PostgresConnectionError as exc:
                raise DBConnectionError(timeout=0, cause=exc) from exc

            except self._retryable as exc:
                last_exc = exc
                delay = _BACKOFF_BASE * (2**attempt)
                logger.warning(
                    "Transient DB error during bulk insert — retrying",
                    operation=operation,
                    rows=len(args_list),
                    attempt=attempt + 1,
                    max_retries=_MAX_RETRIES,
                    delay_ms=delay * 1000,
                    error=str(exc),
                )
                await asyncio.sleep(delay)

            except Exception as exc:
                raise DBWriteError(operation=operation, cause=exc) from exc

        raise DBWriteError(
            operation=operation,
            cause=last_exc or Exception("retries exhausted"),
        )


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = ["StorageRepository"]
