"""PostgreSQL client for AST blueprint persistence."""

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, Optional
from uuid import UUID

import asyncpg

from app.logging_config import get_logger
from app.schemas import ASTBlueprint

logger = get_logger(__name__)


class PostgresClient:
    """Async PostgreSQL client for ACAFS data persistence."""

    def __init__(self, dsn: str):
        """Initialize PostgreSQL client.
        
        Args:
            dsn: PostgreSQL connection string
        """
        self.dsn = dsn
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Initialize connection pool."""
        import ssl as _ssl
        from urllib.parse import urlparse, parse_qs

        # Detect sslmode in DSN query params (e.g. ?sslmode=require)
        use_ssl = False
        try:
            parsed = urlparse(self.dsn)
            q = parse_qs(parsed.query)
            if q.get("sslmode", [None])[0] in ("require", "verify-ca", "verify-full"):
                use_ssl = True
        except Exception:
            # If parsing fails, fall back to string search
            use_ssl = "sslmode=require" in (self.dsn or "")

        ssl_ctx = None
        if use_ssl:
            ssl_ctx = _ssl.create_default_context()

        # Retry loop for transient connection issues (e.g., DB not ready)
        attempts = 0
        max_attempts = 6
        backoff = 1.0
        while attempts < max_attempts:
            try:
                self._pool = await asyncpg.create_pool(
                    self.dsn,
                    min_size=2,
                    max_size=10,
                    command_timeout=60,
                    # Recycle idle connections after 5 min so stale TCP sockets
                    # (common after container restarts) are replaced automatically.
                    max_inactive_connection_lifetime=300,
                    ssl=ssl_ctx,
                )
                logger.info("postgres_pool_created")
                return
            except Exception as e:
                attempts += 1
                logger.error(
                    "postgres_connect_failed",
                    attempt=attempts,
                    max_attempts=max_attempts,
                    error=str(e),
                )
                if attempts >= max_attempts:
                    raise
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 10.0)

    async def close(self) -> None:
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            logger.info("postgres_pool_closed")

    async def ensure_tables(self) -> None:
        """Ensure required tables exist."""
        async with self._get_connection() as conn:
            # ── AST results ───────────────────────────────────────────────
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS acafs_results (
                    id SERIAL PRIMARY KEY,
                    submission_id UUID NOT NULL UNIQUE,
                    assignment_id UUID NOT NULL,
                    language VARCHAR(50) NOT NULL,
                    ast_blueprint JSONB NOT NULL,
                    extraction_status VARCHAR(50) DEFAULT 'success',
                    parse_failure JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_acafs_submission_id
                ON acafs_results(submission_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_acafs_assignment_id
                ON acafs_results(assignment_id)
            """)

            # ── Submission grades ─────────────────────────────────────────
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS submission_grades (
                    id SERIAL PRIMARY KEY,
                    submission_id UUID NOT NULL UNIQUE,
                    assignment_id UUID NOT NULL,
                    total_score NUMERIC(6,2) NOT NULL,
                    max_total_score NUMERIC(6,2) NOT NULL,
                    holistic_feedback TEXT NOT NULL,
                    grading_metadata JSONB,
                    graded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_grades_submission_id
                ON submission_grades(submission_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_grades_assignment_id
                ON submission_grades(assignment_id)
            """)

            # ── Per-criterion scores ──────────────────────────────────────
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS submission_criteria_scores (
                    id SERIAL PRIMARY KEY,
                    submission_id UUID NOT NULL,
                    criterion_name VARCHAR(255) NOT NULL,
                    score NUMERIC(6,2) NOT NULL,
                    max_score NUMERIC(6,2) NOT NULL,
                    grading_mode VARCHAR(50) NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    FOREIGN KEY (submission_id)
                        REFERENCES submission_grades(submission_id)
                        ON DELETE CASCADE
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_criteria_submission_id
                ON submission_criteria_scores(submission_id)
            """)
            # ── Idempotent migrations for new columns ────────────────────
            # submission_grades: structured feedback + instructor override
            await conn.execute("""
                ALTER TABLE submission_grades
                    ADD COLUMN IF NOT EXISTS structured_feedback JSONB,
                    ADD COLUMN IF NOT EXISTS instructor_override_score NUMERIC(6,2),
                    ADD COLUMN IF NOT EXISTS instructor_holistic_feedback TEXT,
                    ADD COLUMN IF NOT EXISTS override_by VARCHAR(255),
                    ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMP WITH TIME ZONE
            """)
            # submission_criteria_scores: band, confidence, instructor override
            await conn.execute("""
                ALTER TABLE submission_criteria_scores
                    ADD COLUMN IF NOT EXISTS band_selected VARCHAR(50),
                    ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2),
                    ADD COLUMN IF NOT EXISTS instructor_override_score NUMERIC(6,2),
                    ADD COLUMN IF NOT EXISTS instructor_override_reason TEXT
            """)
            # ── Chat sessions ─────────────────────────────────────────────
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    assignment_id UUID NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    status VARCHAR(50) NOT NULL DEFAULT 'active',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    closed_at TIMESTAMP WITH TIME ZONE,
                    closed_reason VARCHAR(50)
                )
            """)
            # Enforce one active session per assignment+student
            await conn.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session
                ON chat_sessions(assignment_id, user_id)
                WHERE status = 'active'
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_assignment_user
                ON chat_sessions(assignment_id, user_id)
            """)

            # ── Chat messages ─────────────────────────────────────────────
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    session_id UUID NOT NULL
                        REFERENCES chat_sessions(id) ON DELETE CASCADE,
                    role VARCHAR(50) NOT NULL,
                    content TEXT NOT NULL,
                    reasoning_details JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id
                ON chat_messages(session_id)
            """)

            logger.info("acafs_tables_ensured")

    @asynccontextmanager
    async def _get_connection(self):
        """Get a connection from the pool."""
        if not self._pool:
            raise RuntimeError("PostgreSQL pool not initialized. Call connect() first.")
        
        async with self._pool.acquire() as conn:
            yield conn

    async def store_ast_blueprint(
        self,
        submission_id: UUID,
        assignment_id: UUID,
        language: str,
        blueprint: ASTBlueprint,
    ) -> None:
        """Store AST blueprint in database.
        
        Args:
            submission_id: UUID of the submission
            assignment_id: UUID of the assignment
            language: Programming language
            blueprint: AST blueprint to store
        """
        async with self._get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO acafs_results 
                    (submission_id, assignment_id, language, ast_blueprint, extraction_status)
                VALUES ($1, $2, $3, $4, 'success')
                ON CONFLICT (submission_id) 
                DO UPDATE SET
                    ast_blueprint = EXCLUDED.ast_blueprint,
                    language = EXCLUDED.language,
                    extraction_status = EXCLUDED.extraction_status,
                    updated_at = NOW()
                """,
                submission_id,
                assignment_id,
                language,
                json.dumps(blueprint.model_dump()),
            )
            logger.info(
                "ast_blueprint_stored",
                submission_id=str(submission_id),
                language=language,
            )

    async def store_parse_failure(
        self,
        submission_id: UUID,
        assignment_id: UUID,
        language: str,
        failure_reason: str,
        error_details: Optional[dict] = None,
    ) -> None:
        """Store parse failure information.
        
        Args:
            submission_id: UUID of the submission
            assignment_id: UUID of the assignment
            language: Programming language attempted
            failure_reason: High-level failure description
            error_details: Additional error context
        """
        parse_failure = {
            "reason": failure_reason,
            "details": error_details or {},
        }
        
        async with self._get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO acafs_results 
                    (submission_id, assignment_id, language, ast_blueprint, extraction_status, parse_failure)
                VALUES ($1, $2, $3, '{}', 'parse_failed', $4)
                ON CONFLICT (submission_id) 
                DO UPDATE SET
                    extraction_status = EXCLUDED.extraction_status,
                    parse_failure = EXCLUDED.parse_failure,
                    updated_at = NOW()
                """,
                submission_id,
                assignment_id,
                language,
                json.dumps(parse_failure),
            )
            logger.info(
                "parse_failure_stored",
                submission_id=str(submission_id),
                language=language,
                reason=failure_reason,
            )

    async def get_ast_blueprint(self, submission_id: UUID) -> Optional[ASTBlueprint]:
        """Retrieve AST blueprint by submission ID.
        
        Args:
            submission_id: UUID of the submission
            
        Returns:
            ASTBlueprint if found, None otherwise
        """
        async with self._get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT ast_blueprint 
                FROM acafs_results 
                WHERE submission_id = $1 AND extraction_status = 'success'
                """,
                submission_id,
            )
            
            if row:
                return ASTBlueprint.model_validate_json(row["ast_blueprint"])
            return None

    # ── Grade persistence ─────────────────────────────────────────────────────

    async def store_submission_grade(
        self,
        *,
        submission_id: UUID,
        assignment_id: UUID,
        total_score: float,
        max_total_score: float,
        holistic_feedback: str,
        criteria_scores: list[dict[str, Any]],
        grading_metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Persist a full grade breakdown for a submission.

        ``criteria_scores`` must be a list of dicts with keys:
        name, score, max_score, grading_mode, reason, and optionally
        band_selected, confidence.
        """
        async with self._get_connection() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO submission_grades
                        (submission_id, assignment_id, total_score,
                         max_total_score, holistic_feedback,
                         grading_metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (submission_id) DO UPDATE SET
                        total_score         = EXCLUDED.total_score,
                        max_total_score     = EXCLUDED.max_total_score,
                        holistic_feedback   = EXCLUDED.holistic_feedback,
                        grading_metadata    = EXCLUDED.grading_metadata,
                        graded_at           = NOW()
                    """,
                    submission_id,
                    assignment_id,
                    total_score,
                    max_total_score,
                    holistic_feedback,
                    json.dumps(grading_metadata) if grading_metadata else None,
                )

                # Delete stale per-criterion rows then re-insert
                await conn.execute(
                    "DELETE FROM submission_criteria_scores WHERE submission_id = $1",
                    submission_id,
                )
                for cs in criteria_scores:
                    await conn.execute(
                        """
                        INSERT INTO submission_criteria_scores
                            (submission_id, criterion_name, score, max_score,
                             grading_mode, reason, band_selected, confidence)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        """,
                        submission_id,
                        cs["name"],
                        cs["score"],
                        cs["max_score"],
                        cs.get("grading_mode", "llm"),
                        cs.get("reason", ""),
                        cs.get("band_selected"),
                        cs.get("confidence"),
                    )

        logger.info(
            "submission_grade_stored",
            submission_id=str(submission_id),
            total_score=total_score,
            criteria_count=len(criteria_scores),
        )

    async def get_submission_grade(
        self, submission_id: UUID
    ) -> Optional[dict[str, Any]]:
        """Retrieve grade breakdown for a submission."""
        async with self._get_connection() as conn:
            grade_row = await conn.fetchrow(
                """
                SELECT submission_id, assignment_id, total_score,
                       max_total_score, holistic_feedback,
                       grading_metadata, graded_at,
                       instructor_override_score, instructor_holistic_feedback,
                       override_by, overridden_at
                FROM submission_grades
                WHERE submission_id = $1
                """,
                submission_id,
            )
            if not grade_row:
                return None

            criteria_rows = await conn.fetch(
                """
                SELECT criterion_name, score, max_score, grading_mode, reason,
                       band_selected, confidence,
                       instructor_override_score, instructor_override_reason
                FROM submission_criteria_scores
                WHERE submission_id = $1
                ORDER BY id
                """,
                submission_id,
            )

            return {
                "submission_id": str(grade_row["submission_id"]),
                "assignment_id": str(grade_row["assignment_id"]),
                "total_score": float(grade_row["total_score"]),
                "max_total_score": float(grade_row["max_total_score"]),
                "holistic_feedback": grade_row["holistic_feedback"],
                "grading_metadata": grade_row["grading_metadata"],
                "graded_at": grade_row["graded_at"].isoformat()
                if grade_row["graded_at"]
                else None,
                "instructor_override_score": float(grade_row["instructor_override_score"])
                if grade_row["instructor_override_score"] is not None else None,
                "instructor_holistic_feedback": grade_row["instructor_holistic_feedback"],
                "override_by": grade_row["override_by"],
                "overridden_at": grade_row["overridden_at"].isoformat()
                if grade_row["overridden_at"] else None,
                "criteria_scores": [
                    {
                        "name": r["criterion_name"],
                        "score": float(r["score"]),
                        "max_score": float(r["max_score"]),
                        "grading_mode": r["grading_mode"],
                        "reason": r["reason"],
                        "band_selected": r["band_selected"],
                        "confidence": float(r["confidence"]) if r["confidence"] is not None else None,
                        "instructor_override_score": float(r["instructor_override_score"])
                        if r["instructor_override_score"] is not None else None,
                        "instructor_override_reason": r["instructor_override_reason"],
                    }
                    for r in criteria_rows
                ],
            }

    async def override_submission_grade(
        self,
        *,
        submission_id: UUID,
        criteria_overrides: Optional[list[dict[str, Any]]] = None,
        instructor_holistic_feedback: Optional[str] = None,
        override_by: str,
    ) -> bool:
        """Apply instructor overrides to an existing grade.

        Stores overrides in separate columns — the original ACAFS-generated
        scores are never mutated so the AI output is always preserved for audit.

        Returns True if the grade row was found and updated, False otherwise.
        """
        async with self._get_connection() as conn:
            # Check grade exists
            exists = await conn.fetchval(
                "SELECT 1 FROM submission_grades WHERE submission_id = $1",
                submission_id,
            )
            if not exists:
                return False

            async with conn.transaction():
                # Update grade-level override fields
                if instructor_holistic_feedback is not None:
                    await conn.execute(
                        """
                        UPDATE submission_grades SET
                            instructor_holistic_feedback = $1,
                            override_by                  = $2,
                            overridden_at                = NOW()
                        WHERE submission_id = $3
                        """,
                        instructor_holistic_feedback,
                        override_by,
                        submission_id,
                    )
                else:
                    # Still stamp override_by/overridden_at even for criteria-only overrides
                    await conn.execute(
                        """
                        UPDATE submission_grades SET
                            override_by   = $1,
                            overridden_at = NOW()
                        WHERE submission_id = $2
                        """,
                        override_by,
                        submission_id,
                    )

                # Per-criterion overrides
                if criteria_overrides:
                    for co in criteria_overrides:
                        cname = co.get("criterion_name")
                        o_score = co.get("override_score")
                        o_reason = co.get("override_reason")
                        if not cname:
                            continue
                        await conn.execute(
                            """
                            UPDATE submission_criteria_scores SET
                                instructor_override_score  = $1,
                                instructor_override_reason = $2
                            WHERE submission_id = $3 AND criterion_name = $4
                            """,
                            o_score,
                            o_reason,
                            submission_id,
                            cname,
                        )

        logger.info(
            "submission_grade_overridden",
            submission_id=str(submission_id),
            override_by=override_by,
            criteria_count=len(criteria_overrides or []),
        )
        return True

    # ── Chat session + message persistence ───────────────────────────────────

    async def get_or_create_chat_session(
        self,
        *,
        assignment_id: UUID,
        user_id: str,
    ) -> dict[str, Any]:
        """Return the active session for assignment+student, creating one if absent."""
        async with self._get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, status, created_at
                FROM chat_sessions
                WHERE assignment_id = $1
                  AND user_id = $2
                  AND status = 'active'
                """,
                assignment_id,
                user_id,
            )
            if row:
                return {
                    "id": str(row["id"]),
                    "assignment_id": str(assignment_id),
                    "user_id": user_id,
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat(),
                }

            new_id = await conn.fetchval(
                """
                INSERT INTO chat_sessions (assignment_id, user_id, status)
                VALUES ($1, $2, 'active')
                RETURNING id
                """,
                assignment_id,
                user_id,
            )
            logger.info(
                "chat_session_created",
                session_id=str(new_id),
                assignment_id=str(assignment_id),
                user_id=user_id,
            )
            return {
                "id": str(new_id),
                "assignment_id": str(assignment_id),
                "user_id": user_id,
                "status": "active",
            }

    async def append_chat_message(
        self,
        *,
        session_id: UUID,
        role: str,
        content: str,
        reasoning_details: Optional[Any] = None,
    ) -> int:
        """Insert a message into a chat session and return its id."""
        async with self._get_connection() as conn:
            msg_id = await conn.fetchval(
                """
                INSERT INTO chat_messages (session_id, role, content, reasoning_details)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                """,
                session_id,
                role,
                content,
                json.dumps(reasoning_details) if reasoning_details is not None else None,
            )
            return msg_id

    async def get_chat_messages(self, session_id: UUID) -> list[dict[str, Any]]:
        """Return all messages for a session ordered by creation time."""
        async with self._get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, role, content, reasoning_details, created_at
                FROM chat_messages
                WHERE session_id = $1
                ORDER BY created_at ASC, id ASC
                """,
                session_id,
            )
            return [
                {
                    "id": r["id"],
                    "role": r["role"],
                    "content": r["content"],
                    "reasoning_details": r["reasoning_details"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in rows
            ]

    async def get_chat_session(
        self,
        *,
        assignment_id: UUID,
        user_id: str,
    ) -> Optional[dict[str, Any]]:
        """Return the most recent session (active or closed) for analytics."""
        async with self._get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, status, created_at, closed_at, closed_reason
                FROM chat_sessions
                WHERE assignment_id = $1 AND user_id = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                assignment_id,
                user_id,
            )
            if not row:
                return None
            return {
                "id": str(row["id"]),
                "assignment_id": str(assignment_id),
                "user_id": user_id,
                "status": row["status"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "closed_at": row["closed_at"].isoformat() if row["closed_at"] else None,
                "closed_reason": row["closed_reason"],
            }

    async def close_chat_session_on_submission(
        self,
        *,
        assignment_id: UUID,
        user_id: str,
    ) -> bool:
        """Close the active chat session when a submission is processed.

        Returns True if a session was closed, False if none was active.
        """
        async with self._get_connection() as conn:
            result = await conn.execute(
                """
                UPDATE chat_sessions
                SET status       = 'closed',
                    closed_at    = NOW(),
                    closed_reason = 'submission'
                WHERE assignment_id = $1
                  AND user_id       = $2
                  AND status        = 'active'
                """,
                assignment_id,
                user_id,
            )
            # asyncpg returns "UPDATE <n>" as the status string
            closed = result.endswith("1")
            if closed:
                logger.info(
                    "chat_session_closed_on_submission",
                    assignment_id=str(assignment_id),
                    user_id=user_id,
                )
            return closed

