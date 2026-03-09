"""
Repository for similarity reports persistence.

Handles CRUD operations for cached assignment cluster reports.
"""

import json
import logging
from typing import Optional
from uuid import UUID

from database import get_db_connection
from schemas import AssignmentClusterResponse

logger = logging.getLogger(__name__)


class SimilarityReportRepository:
    """Repository for similarity reports."""

    @staticmethod
    async def save_report(
        report: AssignmentClusterResponse,
        lsh_threshold: float = 0.3,
        min_confidence: float = 0.0,
        processing_time: Optional[float] = None,
    ) -> UUID:
        """
        Save or update a similarity report for an assignment.

        Args:
            report: The cluster response from the cascade worker
            lsh_threshold: LSH threshold used for clustering
            min_confidence: Minimum confidence threshold used
            processing_time: Processing time in seconds

        Returns:
            UUID of the saved report
        """
        report_data = report.model_dump()

        query = """
            INSERT INTO similarity_reports (
                assignment_id, language, submission_count, processed_count,
                failed_count, total_clone_pairs, report_data,
                lsh_threshold, min_confidence, processing_time_seconds
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
            ON CONFLICT (assignment_id) 
            DO UPDATE SET
                language = EXCLUDED.language,
                submission_count = EXCLUDED.submission_count,
                processed_count = EXCLUDED.processed_count,
                failed_count = EXCLUDED.failed_count,
                total_clone_pairs = EXCLUDED.total_clone_pairs,
                report_data = EXCLUDED.report_data,
                lsh_threshold = EXCLUDED.lsh_threshold,
                min_confidence = EXCLUDED.min_confidence,
                processing_time_seconds = EXCLUDED.processing_time_seconds,
                updated_at = now()
            RETURNING id
        """

        async with get_db_connection() as conn:
            report_id = await conn.fetchval(
                query,
                report.assignment_id,
                report.language,
                report.submission_count,
                report.processed_count,
                report.failed_count,
                report.total_clone_pairs,
                json.dumps(report_data),
                lsh_threshold,
                min_confidence,
                processing_time,
            )

        logger.info(
            f"Saved similarity report for assignment {report.assignment_id} "
            f"(report_id={report_id})"
        )
        return report_id

    @staticmethod
    async def get_report(assignment_id: str) -> Optional[AssignmentClusterResponse]:
        """
        Retrieve a cached similarity report for an assignment.

        Args:
            assignment_id: Assignment identifier

        Returns:
            AssignmentClusterResponse if found, None otherwise
        """
        query = """
            SELECT report_data, created_at, updated_at
            FROM similarity_reports
            WHERE assignment_id = $1
        """

        async with get_db_connection() as conn:
            row = await conn.fetchrow(query, assignment_id)

        if row is None:
            logger.info(f"No cached report found for assignment {assignment_id}")
            return None

        report_data = row["report_data"]
        logger.info(
            f"Retrieved cached report for assignment {assignment_id} "
            f"(updated: {row['updated_at']})"
        )

        return AssignmentClusterResponse(**report_data)

    @staticmethod
    async def delete_report(assignment_id: str) -> bool:
        """
        Delete a similarity report for an assignment.

        Args:
            assignment_id: Assignment identifier

        Returns:
            True if report was deleted, False if not found
        """
        query = "DELETE FROM similarity_reports WHERE assignment_id = $1"

        async with get_db_connection() as conn:
            result = await conn.execute(query, assignment_id)

        deleted = result.endswith("1")
        if deleted:
            logger.info(f"Deleted similarity report for assignment {assignment_id}")
        return deleted

    @staticmethod
    async def get_report_metadata(assignment_id: str) -> Optional[dict]:
        """
        Get metadata about a cached report without loading full data.

        Args:
            assignment_id: Assignment identifier

        Returns:
            Dictionary with metadata or None if not found
        """
        query = """
            SELECT 
                id, assignment_id, language, submission_count,
                processed_count, failed_count, total_clone_pairs,
                lsh_threshold, min_confidence, processing_time_seconds,
                created_at, updated_at
            FROM similarity_reports
            WHERE assignment_id = $1
        """

        async with get_db_connection() as conn:
            row = await conn.fetchrow(query, assignment_id)

        if row is None:
            return None

        return dict(row)

    @staticmethod
    async def list_reports(limit: int = 50, offset: int = 0) -> list[dict]:
        """
        List all similarity reports (metadata only).

        Args:
            limit: Maximum number of reports to return
            offset: Offset for pagination

        Returns:
            List of report metadata dictionaries
        """
        query = """
            SELECT 
                id, assignment_id, language, submission_count,
                total_clone_pairs, created_at, updated_at
            FROM similarity_reports
            ORDER BY updated_at DESC
            LIMIT $1 OFFSET $2
        """

        async with get_db_connection() as conn:
            rows = await conn.fetch(query, limit, offset)

        return [dict(row) for row in rows]
