"""
Repository for instructor annotations persistence.

Handles CRUD operations for instructor feedback on clone matches and clusters.
"""

import logging
from typing import Optional
from uuid import UUID

import asyncpg

from database import get_db_connection, get_db_transaction

logger = logging.getLogger(__name__)


class AnnotationStatus:
    """Annotation status constants."""
    PENDING_REVIEW = "pending_review"
    CONFIRMED_PLAGIARISM = "confirmed_plagiarism"
    FALSE_POSITIVE = "false_positive"
    ACCEPTABLE_COLLABORATION = "acceptable_collaboration"
    REQUIRES_INVESTIGATION = "requires_investigation"


class InstructorAnnotationRepository:
    """Repository for instructor annotations."""

    @staticmethod
    async def create_annotation(
        assignment_id: str,
        instructor_id: str,
        status: str,
        match_id: Optional[UUID] = None,
        group_id: Optional[UUID] = None,
        comments: Optional[str] = None,
        action_taken: Optional[str] = None
    ) -> UUID:
        """
        Create a new instructor annotation.
        
        Args:
            assignment_id: Assignment identifier
            instructor_id: Instructor identifier
            status: Annotation status
            match_id: Optional clone match ID
            group_id: Optional plagiarism group ID
            comments: Optional instructor comments
            action_taken: Optional action description
            
        Returns:
            UUID of the created annotation
        """
        if match_id is None and group_id is None:
            raise ValueError("Either match_id or group_id must be provided")
            
        query = """
            INSERT INTO instructor_annotations (
                assignment_id, instructor_id, status,
                match_id, group_id, comments, action_taken
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        """
        
        async with get_db_connection() as conn:
            annotation_id = await conn.fetchval(
                query,
                assignment_id,
                instructor_id,
                status,
                match_id,
                group_id,
                comments,
                action_taken
            )
            
        logger.info(
            f"Created annotation {annotation_id} for assignment {assignment_id} "
            f"by instructor {instructor_id}"
        )
        return annotation_id

    @staticmethod
    async def update_annotation(
        annotation_id: UUID,
        status: Optional[str] = None,
        comments: Optional[str] = None,
        action_taken: Optional[str] = None
    ) -> bool:
        """
        Update an existing annotation.
        
        Args:
            annotation_id: Annotation UUID
            status: Optional new status
            comments: Optional new comments
            action_taken: Optional new action description
            
        Returns:
            True if annotation was updated, False if not found
        """
        updates = []
        params = []
        param_idx = 1
        
        if status is not None:
            updates.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1
            
        if comments is not None:
            updates.append(f"comments = ${param_idx}")
            params.append(comments)
            param_idx += 1
            
        if action_taken is not None:
            updates.append(f"action_taken = ${param_idx}")
            params.append(action_taken)
            param_idx += 1
            
        if not updates:
            return False
            
        updates.append(f"updated_at = now()")
        params.append(annotation_id)
        
        query = f"""
            UPDATE instructor_annotations
            SET {', '.join(updates)}
            WHERE id = ${param_idx}
        """
        
        async with get_db_connection() as conn:
            result = await conn.execute(query, *params)
            
        updated = result.endswith("1")
        if updated:
            logger.info(f"Updated annotation {annotation_id}")
        return updated

    @staticmethod
    async def get_annotation(annotation_id: UUID) -> Optional[dict]:
        """
        Get an annotation by ID.
        
        Args:
            annotation_id: Annotation UUID
            
        Returns:
            Dictionary with annotation data or None if not found
        """
        query = """
            SELECT 
                id, match_id, group_id, assignment_id, instructor_id,
                status, comments, action_taken, created_at, updated_at
            FROM instructor_annotations
            WHERE id = $1
        """
        
        async with get_db_connection() as conn:
            row = await conn.fetchrow(query, annotation_id)
            
        return dict(row) if row else None

    @staticmethod
    async def get_annotations_for_assignment(
        assignment_id: str,
        status: Optional[str] = None
    ) -> list[dict]:
        """
        Get all annotations for an assignment, optionally filtered by status.
        
        Args:
            assignment_id: Assignment identifier
            status: Optional status filter
            
        Returns:
            List of annotation dictionaries
        """
        if status:
            query = """
                SELECT 
                    id, match_id, group_id, assignment_id, instructor_id,
                    status, comments, action_taken, created_at, updated_at
                FROM instructor_annotations
                WHERE assignment_id = $1 AND status = $2
                ORDER BY updated_at DESC
            """
            params = [assignment_id, status]
        else:
            query = """
                SELECT 
                    id, match_id, group_id, assignment_id, instructor_id,
                    status, comments, action_taken, created_at, updated_at
                FROM instructor_annotations
                WHERE assignment_id = $1
                ORDER BY updated_at DESC
            """
            params = [assignment_id]
        
        async with get_db_connection() as conn:
            rows = await conn.fetch(query, *params)
            
        return [dict(row) for row in rows]

    @staticmethod
    async def get_annotation_for_match(match_id: UUID) -> Optional[dict]:
        """
        Get annotation for a specific clone match.
        
        Args:
            match_id: Clone match UUID
            
        Returns:
            Dictionary with annotation data or None if not found
        """
        query = """
            SELECT 
                id, match_id, group_id, assignment_id, instructor_id,
                status, comments, action_taken, created_at, updated_at
            FROM instructor_annotations
            WHERE match_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
        """
        
        async with get_db_connection() as conn:
            row = await conn.fetchrow(query, match_id)
            
        return dict(row) if row else None

    @staticmethod
    async def get_annotations_for_group(group_id: UUID) -> list[dict]:
        """
        Get all annotations for a plagiarism group.
        
        Args:
            group_id: Plagiarism group UUID
            
        Returns:
            List of annotation dictionaries
        """
        query = """
            SELECT 
                id, match_id, group_id, assignment_id, instructor_id,
                status, comments, action_taken, created_at, updated_at
            FROM instructor_annotations
            WHERE group_id = $1
            ORDER BY updated_at DESC
        """
        
        async with get_db_connection() as conn:
            rows = await conn.fetch(query, group_id)
            
        return [dict(row) for row in rows]

    @staticmethod
    async def delete_annotation(annotation_id: UUID) -> bool:
        """
        Delete an annotation.
        
        Args:
            annotation_id: Annotation UUID
            
        Returns:
            True if annotation was deleted, False if not found
        """
        query = "DELETE FROM instructor_annotations WHERE id = $1"
        
        async with get_db_connection() as conn:
            result = await conn.execute(query, annotation_id)
            
        deleted = result.endswith("1")
        if deleted:
            logger.info(f"Deleted annotation {annotation_id}")
        return deleted

    @staticmethod
    async def get_annotation_stats(assignment_id: str) -> dict:
        """
        Get statistics about annotations for an assignment.
        
        Args:
            assignment_id: Assignment identifier
            
        Returns:
            Dictionary with annotation counts by status
        """
        query = """
            SELECT 
                status,
                COUNT(*) as count
            FROM instructor_annotations
            WHERE assignment_id = $1
            GROUP BY status
        """
        
        async with get_db_connection() as conn:
            rows = await conn.fetch(query, assignment_id)
            
        stats = {row["status"]: row["count"] for row in rows}
        stats["total"] = sum(stats.values())
        return stats
