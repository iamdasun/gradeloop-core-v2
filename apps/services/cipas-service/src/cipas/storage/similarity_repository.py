# gradeloop-core-v2/apps/services/cipas-service/src/cipas/storage/similarity_repository.py
"""
SimilarityRepository — typed async data access layer for similarity scoring results.

Responsibilities:
  - Persist SimilarityReport records (similarity_reports table).
  - Bulk-insert CloneMatch records (clone_matches table).
  - Retrieve reports and matches by ID, submission, or assignment.
  - Update report status on completion or failure.

Design decisions:
  ─ Mirrors StorageRepository conventions: raw parameterised asyncpg SQL,
    no SQLAlchemy, executemany() for bulk inserts.
  ─ SimilarityReport is written in two phases:
      1. create_report()     — inserts the RUNNING skeleton row at job start.
      2. complete_report()   — updates status + metrics + inserts match rows.
    This allows the caller to persist the report_id immediately (for 202
    responses) and update it after the pipeline finishes.
  ─ CloneMatch rows are bulk-inserted inside the same transaction as the
    report status update so partial results are never visible.
  ─ ScoringConfig is serialised to/from JSONB in the similarity_reports table.
    Python's json module is used rather than Pydantic .model_dump_json() to
    keep this module free of Pydantic imports (asyncpg-compatible serialisation).

Retry strategy:
  Uses the same retryable-exception list as StorageRepository.
  Transient errors (serialisation conflicts, deadlocks, connection loss) are
  retried up to _MAX_RETRIES times with exponential backoff.

Error contract:
  - DBConnectionError (HTTP 503): pool exhausted or DB unreachable.
  - DBWriteError      (HTTP 500): INSERT/UPDATE failed after retries.
  - ReportNotFoundError (HTTP 404): requested report_id does not exist.
    (Defined in cipas.core.exceptions.)
"""

from __future__ import annotations

import asyncio
import datetime
import json
from typing import Any, Optional
import uuid

import asyncpg  # type: ignore[import]
from loguru import logger

from cipas.core.exceptions import DBConnectionError, DBWriteError
from cipas.similarity.models import (
    CloneMatch,
    CloneType,
    ScoringConfig,
    ScoringMetrics,
    SimilarityReport,
    SimilarityReportStatus,
)

# ---------------------------------------------------------------------------
# Retry configuration (mirrors StorageRepository)
# ---------------------------------------------------------------------------

_MAX_RETRIES: int = 3
_BACKOFF_BASE: float = 0.05  # 50ms → 100ms → 200ms


def _get_retryable_exceptions() -> tuple[type[Exception], ...]:
    try:
        return (
            asyncpg.exceptions.SerializationError,
            asyncpg.exceptions.DeadlockDetectedError,
            asyncpg.exceptions.TooManyConnectionsError,
            asyncpg.exceptions.ConnectionDoesNotExistError,
        )
    except AttributeError:
        return (asyncpg.PostgresConnectionError,)


UTC = datetime.timezone.utc


# ---------------------------------------------------------------------------
# SimilarityRepository
# ---------------------------------------------------------------------------


class SimilarityRepository:
    """
    Typed async data access layer for similarity scoring records.

    Instantiated once at application startup alongside StorageRepository and
    stored on app.state.similarity_repository.

    All UUIDs are passed as strings to asyncpg (asyncpg auto-coerces to UUID
    columns).  All timestamps are timezone-aware UTC datetimes.

    Usage:
        sim_repo = SimilarityRepository(pool=pool)

        # 1. Create skeleton report at job start:
        await sim_repo.create_report(report)

        # 2. Run the pipeline...
        completed_report = await pipeline.run(...)

        # 3. Persist the completed report:
        await sim_repo.complete_report(completed_report)

        # 4. Retrieve later:
        report = await sim_repo.get_report(report_id)
        matches = await sim_repo.get_matches(report_id, limit=100)
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._retryable: tuple[type[Exception], ...] = _get_retryable_exceptions()

    # ------------------------------------------------------------------
    # Report lifecycle
    # ------------------------------------------------------------------

    async def create_report(self, report: SimilarityReport) -> None:
        """
        Insert a RUNNING similarity_reports skeleton row.

        Called immediately when a POST /similarity-analysis request is accepted,
        before the pipeline runs.  This ensures the report_id is durable even
        if the service crashes mid-analysis.

        Args:
            report: SimilarityReport with status=RUNNING.  metrics and matches
                    are ignored at this stage.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
            DBWriteError:      INSERT failed after retries.
        """
        query = """
            INSERT INTO similarity_reports (
                id,
                submission_a_id,
                submission_b_id,
                assignment_id,
                status,
                config_json,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        """
        config_json = _serialise_config(report.config)
        params = (
            str(report.id),
            str(report.submission_a_id),
            str(report.submission_b_id),
            str(report.assignment_id),
            report.status.value,
            config_json,
            report.created_at,
        )
        await self._execute_with_retry(query, params, operation="create_report")
        logger.debug(
            "SimilarityRepository: report row created",
            report_id=str(report.id),
            status=report.status.value,
        )

    async def complete_report(self, report: SimilarityReport) -> None:
        """
        Update the report row to COMPLETED (or FAILED) and bulk-insert matches.

        Executes inside a single transaction so the status update and match
        rows are committed atomically.  A crash mid-insert leaves the report
        in RUNNING state (the previous value), which the stale-job recovery
        path can handle on restart.

        Args:
            report: Completed SimilarityReport with status=COMPLETED or FAILED.
                    For COMPLETED, metrics and matches must be populated.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
            DBWriteError:      UPDATE or bulk INSERT failed after retries.
        """
        try:
            async with self._pool.acquire() as conn:
                async with conn.transaction():
                    # Update the report row.
                    await conn.execute(
                        """
                        UPDATE similarity_reports
                        SET
                            status         = $1,
                            completed_at   = $2,
                            error_message  = $3,
                            total_pairs    = $4,
                            pre_filter_candidates = $5,
                            lcs_comparisons_run   = $6,
                            pre_filter_rejection_rate = $7,
                            clones_flagged  = $8,
                            duration_seconds = $9
                        WHERE id = $10
                        """,
                        report.status.value,
                        report.completed_at,
                        report.error_message,
                        report.metrics.total_granule_pairs if report.metrics else None,
                        report.metrics.pre_filter_candidates
                        if report.metrics
                        else None,
                        report.metrics.lcs_comparisons_run if report.metrics else None,
                        report.metrics.pre_filter_rejection_rate
                        if report.metrics
                        else None,
                        report.metrics.clones_flagged if report.metrics else None,
                        report.metrics.duration_seconds if report.metrics else None,
                        str(report.id),
                    )

                    # Bulk-insert clone matches (if any).
                    if report.matches:
                        match_rows = [_match_to_row(match) for match in report.matches]
                        await conn.executemany(
                            """
                            INSERT INTO clone_matches (
                                id,
                                report_id,
                                submission_id,
                                matched_submission_id,
                                granule_a_id,
                                granule_b_id,
                                similarity_score,
                                clone_type,
                                snippet_match,
                                created_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                            """,
                            match_rows,
                        )

        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc
        except asyncpg.PostgresError as exc:
            raise DBWriteError(
                table="similarity_reports/clone_matches",
                cause=exc,
            ) from exc

        logger.debug(
            "SimilarityRepository: report completed",
            report_id=str(report.id),
            status=report.status.value,
            matches=len(report.matches),
        )

    async def fail_report(
        self,
        report_id: uuid.UUID,
        error_message: str,
    ) -> None:
        """
        Mark a report as FAILED without inserting any match rows.

        Called when the pipeline raises an unrecoverable exception after
        create_report() has already been called.

        Args:
            report_id:     UUID of the report to fail.
            error_message: Human-readable error description.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
            DBWriteError:      UPDATE failed after retries.
        """
        query = """
            UPDATE similarity_reports
            SET
                status        = $1,
                completed_at  = $2,
                error_message = $3
            WHERE id = $4
        """
        params = (
            SimilarityReportStatus.FAILED.value,
            datetime.datetime.now(UTC),
            error_message[:2048],  # cap to avoid oversized error strings
            str(report_id),
        )
        await self._execute_with_retry(query, params, operation="fail_report")

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    async def get_report(
        self,
        report_id: uuid.UUID,
    ) -> Optional[dict[str, Any]]:
        """
        Fetch a single similarity_reports row by primary key.

        Args:
            report_id: UUID of the report to retrieve.

        Returns:
            Dict of report columns, or None if no row exists.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
        """
        query = """
            SELECT
                id,
                submission_a_id,
                submission_b_id,
                assignment_id,
                status,
                config_json,
                total_pairs,
                pre_filter_candidates,
                lcs_comparisons_run,
                pre_filter_rejection_rate,
                clones_flagged,
                duration_seconds,
                error_message,
                created_at,
                completed_at
            FROM similarity_reports
            WHERE id = $1
        """
        try:
            async with self._pool.acquire() as conn:
                row = await conn.fetchrow(query, str(report_id))
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        if row is None:
            return None
        return dict(row)

    async def get_matches(
        self,
        report_id: uuid.UUID,
        *,
        limit: int = 500,
        offset: int = 0,
        min_score: float = 0.0,
        clone_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch clone_matches rows for a given report.

        Args:
            report_id:  UUID of the parent report.
            limit:      Maximum rows to return.
            offset:     Row offset for pagination.
            min_score:  Only return matches with similarity_score >= min_score.
            clone_type: Optional filter: "type1" or "type2".

        Returns:
            List of match dicts, ordered by similarity_score DESC.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
        """
        params: list[Any] = [str(report_id), min_score]
        param_idx = 3

        type_filter = ""
        if clone_type is not None:
            type_filter = f"AND clone_type = ${param_idx}"
            params.append(clone_type)
            param_idx += 1

        params.extend([limit, offset])

        query = f"""
            SELECT
                id,
                report_id,
                submission_id,
                matched_submission_id,
                granule_a_id,
                granule_b_id,
                similarity_score,
                clone_type,
                snippet_match,
                created_at
            FROM clone_matches
            WHERE report_id = $1
              AND similarity_score >= $2
              {type_filter}
            ORDER BY similarity_score DESC
            LIMIT ${param_idx}
            OFFSET ${param_idx + 1}
        """

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    async def list_reports_for_submission(
        self,
        submission_id: uuid.UUID,
        *,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """
        List all similarity reports involving a given submission (as either A or B).

        Args:
            submission_id: UUID of the submission.
            limit:         Maximum rows to return.

        Returns:
            List of report dicts ordered by created_at DESC.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
        """
        query = """
            SELECT
                id,
                submission_a_id,
                submission_b_id,
                assignment_id,
                status,
                clones_flagged,
                pre_filter_rejection_rate,
                lcs_comparisons_run,
                duration_seconds,
                created_at,
                completed_at
            FROM similarity_reports
            WHERE submission_a_id = $1
               OR submission_b_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, str(submission_id), limit)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    async def list_reports_for_assignment(
        self,
        assignment_id: uuid.UUID,
        *,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        List similarity reports for all submissions in a given assignment.

        Args:
            assignment_id: UUID of the assignment.
            status:        Optional filter: "RUNNING", "COMPLETED", or "FAILED".
            limit:         Maximum rows to return.

        Returns:
            List of report dicts ordered by created_at DESC.

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
        """
        params: list[Any] = [str(assignment_id)]
        param_idx = 2

        status_filter = ""
        if status is not None:
            status_filter = f"AND status = ${param_idx}"
            params.append(status)
            param_idx += 1

        params.append(limit)

        query = f"""
            SELECT
                id,
                submission_a_id,
                submission_b_id,
                assignment_id,
                status,
                clones_flagged,
                pre_filter_rejection_rate,
                lcs_comparisons_run,
                duration_seconds,
                created_at,
                completed_at
            FROM similarity_reports
            WHERE assignment_id = $1
              {status_filter}
            ORDER BY created_at DESC
            LIMIT ${param_idx}
        """
        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Granule fetching (input to scoring pipeline)
    # ------------------------------------------------------------------

    async def fetch_granules_for_submission(
        self,
        submission_id: uuid.UUID,
        *,
        granule_type: Optional[str] = None,
        language: Optional[str] = None,
        exclude_oversized: bool = True,
        exclude_empty: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Fetch all granules for a submission as plain dicts.

        This is the primary data source for the scoring pipeline.  Returns
        only the columns needed by GranuleRecord, not the full granules schema.

        Oversized sentinel granules (granule_hash = '000...0') and granules
        with empty normalized_source are excluded by default because they
        contribute nothing to similarity analysis.

        Args:
            submission_id:     UUID of the submission to fetch granules for.
            granule_type:      Optional filter: "class", "function", or "loop".
            language:          Optional filter: "python", "java", or "c".
            exclude_oversized: Skip granules with the oversized sentinel hash.
            exclude_empty:     Skip granules with empty normalized_source.

        Returns:
            List of dicts with keys:
              granule_id, submission_id, granule_hash, granule_type, language,
              normalized_source, start_line, end_line, name

        Raises:
            DBConnectionError: Pool exhausted or DB unreachable.
        """
        sentinel = "0" * 64

        params: list[Any] = [str(submission_id)]
        param_idx = 2

        filters: list[str] = []

        if exclude_oversized:
            filters.append(f"AND granule_hash != '{sentinel}'")

        if exclude_empty:
            filters.append("AND normalized_source != ''")
            filters.append("AND normalized_source IS NOT NULL")

        if granule_type is not None:
            filters.append(f"AND granule_type = ${param_idx}")
            params.append(granule_type)
            param_idx += 1

        if language is not None:
            filters.append(f"AND language = ${param_idx}")
            params.append(language)
            param_idx += 1

        filter_clause = "\n".join(filters)

        query = f"""
            SELECT
                id               AS granule_id,
                submission_id,
                granule_hash,
                granule_type,
                language,
                normalized_source,
                start_line,
                end_line,
                name
            FROM granules
            WHERE submission_id = $1
              {filter_clause}
            ORDER BY start_line
        """

        try:
            async with self._pool.acquire() as conn:
                rows = await conn.fetch(query, *params)
        except asyncpg.PostgresConnectionError as exc:
            raise DBConnectionError(timeout=0, cause=exc) from exc

        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Retry helpers (mirrors StorageRepository pattern)
    # ------------------------------------------------------------------

    async def _execute_with_retry(
        self,
        query: str,
        params: tuple[Any, ...],
        *,
        operation: str,
    ) -> None:
        """
        Execute a single-statement parameterised query with retry on transient
        errors.

        Args:
            query:     Parameterised SQL string.
            params:    Positional parameter tuple.
            operation: Human-readable operation name for log context.

        Raises:
            DBConnectionError: Pool acquisition failed.
            DBWriteError:      Query failed after all retries.
        """
        for attempt in range(_MAX_RETRIES):
            try:
                async with self._pool.acquire() as conn:
                    await conn.execute(query, *params)
                return  # success
            except asyncpg.PostgresConnectionError as exc:
                raise DBConnectionError(timeout=0, cause=exc) from exc
            except self._retryable as exc:
                if attempt < _MAX_RETRIES - 1:
                    delay = _BACKOFF_BASE * (2**attempt)
                    logger.warning(
                        "SimilarityRepository: transient DB error, retrying",
                        operation=operation,
                        attempt=attempt + 1,
                        delay_s=delay,
                        error=str(exc),
                    )
                    await asyncio.sleep(delay)
                else:
                    raise DBWriteError(table="similarity_reports", cause=exc) from exc
            except asyncpg.PostgresError as exc:
                raise DBWriteError(table="similarity_reports", cause=exc) from exc


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _serialise_config(config: ScoringConfig) -> str:
    """Serialise a ScoringConfig to a JSON string for JSONB storage."""
    return json.dumps(
        {
            "syntactic_clone_threshold": config.syntactic_clone_threshold,
            "jaccard_prefilter_threshold": config.jaccard_prefilter_threshold,
            "minhash_num_permutations": config.minhash_num_permutations,
            "lsh_num_bands": config.lsh_num_bands,
            "shingle_size": config.shingle_size,
            "lcs_worker_count": config.lcs_worker_count,
        }
    )


def _match_to_row(match: CloneMatch) -> tuple[Any, ...]:
    """Convert a CloneMatch to an asyncpg executemany row tuple."""
    return (
        str(match.id),
        str(match.report_id),
        str(match.submission_id),
        str(match.matched_submission_id),
        str(match.granule_a_id),
        str(match.granule_b_id),
        match.similarity_score,
        match.clone_type.value,
        match.snippet_match,
        match.created_at,
    )


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "SimilarityRepository",
]
