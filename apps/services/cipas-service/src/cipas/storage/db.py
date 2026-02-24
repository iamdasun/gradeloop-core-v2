# gradeloop-core-v2/apps/services/cipas-service/src/cipas/storage/db.py
"""
asyncpg connection pool factory and migration runner for CIPAS.

Responsibilities:
  - Create and configure the asyncpg connection pool at application startup.
  - Register the pgvector `vector` type codec with every connection in the pool
    so that asyncpg can encode/decode vector columns transparently.
  - Run SQL migration scripts from storage/migrations/ in lexicographic order,
    tracking applied versions in the `schema_migrations` table.
  - Expose a pool teardown function for clean shutdown.

Design decisions:
  ─────────────────────────────────────────────────────────────────────────
  asyncpg vs psycopg3:
    asyncpg uses the PostgreSQL binary protocol and implements connection
    pooling natively in C-level asyncio.  For write-heavy workloads (bulk
    INSERT of granule rows) this is measurably faster than psycopg3's
    text-protocol default mode.  The trade-off is that asyncpg does not
    support SQLAlchemy Core ORM syntax — all queries are raw SQL strings.
    This is acceptable and preferred for a performance-critical service.

  pgvector type registration:
    pgvector installs a custom PostgreSQL type ("vector") that asyncpg does
    not know about by default.  Without registration, asyncpg raises
    `asyncpg.exceptions.UntrustedTypeError` when it encounters a vector
    column.  The `pgvector.asyncpg.register_vector()` function registers
    the type codec on a per-connection basis.  We pass it as the `init`
    callback to `asyncpg.create_pool()` so every connection (including
    newly created ones after pool exhaustion and recycling) has the codec
    registered.

  Migration runner design:
    We use a minimal hand-rolled migration runner rather than Alembic for
    Phase 1.  Alembic adds complexity (env.py, alembic.ini, migration
    versioning with autogenerate) that is not warranted when we have a
    single migration script.  Phase 2 will migrate to Alembic if schema
    evolution accelerates.

    The runner:
      1. Creates `schema_migrations` table if it does not exist.
      2. Reads all .sql files from storage/migrations/ in lexicographic order.
      3. Skips files whose version (filename without .sql) is already in
         schema_migrations.
      4. Executes remaining files in a single transaction per file.
      5. On success, inserts the version into schema_migrations.
      6. On failure, rolls back the transaction and raises — preventing the
         application from starting with an inconsistent schema.

  Stale submission recovery:
    On startup, after migrations, the pool factory runs a recovery query to
    detect submissions that were left in PROCESSING state (e.g. due to an
    unclean container shutdown mid-batch).  These are updated to FAILED with
    an error_message indicating recovery.

Pool sizing:
  min_size = DB_MIN_POOL_SIZE (default: 5)
    Five connections are always alive, preventing cold-start latency on
    the first request after a quiet period.

  max_size = DB_MAX_POOL_SIZE (default: 20)
    Twenty connections cap the load on PostgreSQL.  At 4 concurrent batches
    with bulk inserts using a single connection per batch, 4 connections are
    typically in use simultaneously — well within the limit.

  max_inactive_connection_lifetime = DB_MAX_INACTIVE_CONNECTION_LIFETIME
    Idle connections older than this are recycled to prevent TCP connection
    staleness (e.g. after a PostgreSQL restart or network interruption).

  command_timeout = DB_COMMAND_TIMEOUT
    Hard timeout per query.  Prevents runaway queries from blocking a
    connection indefinitely.
"""

from __future__ import annotations

import os
import pathlib
from typing import TYPE_CHECKING, Any

import asyncpg  # type: ignore[import]
from loguru import logger

if TYPE_CHECKING:
    from cipas.core.config import Settings

# ---------------------------------------------------------------------------
# Path to migration scripts
# ---------------------------------------------------------------------------

_MIGRATIONS_DIR = pathlib.Path(__file__).parent / "migrations"


# ---------------------------------------------------------------------------
# Pool factory
# ---------------------------------------------------------------------------


async def create_pool(settings: "Settings") -> asyncpg.Pool:
    """
    Create and return a fully-configured asyncpg connection pool.

    Called once at application startup (FastAPI lifespan).  The returned
    pool is stored on `app.state.db_pool` and injected into route handlers
    via the `get_db_pool()` FastAPI dependency.

    Steps:
        1. Create the asyncpg pool with pgvector codec registration.
        2. Run pending schema migrations.
        3. Recover stale PROCESSING submissions.
        4. Return the pool.

    Args:
        settings: Validated Settings instance from get_settings().

    Returns:
        A fully initialised asyncpg.Pool.

    Raises:
        asyncpg.PostgresConnectionError: If the DB is unreachable.
        RuntimeError: If a migration fails (prevents startup with bad schema).
    """
    logger.info(
        "Creating asyncpg connection pool",
        database_url=_redact_dsn(settings.DATABASE_URL),
        min_size=settings.DB_MIN_POOL_SIZE,
        max_size=settings.DB_MAX_POOL_SIZE,
        command_timeout=settings.DB_COMMAND_TIMEOUT,
    )

    pool: asyncpg.Pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=settings.DB_MIN_POOL_SIZE,
        max_size=settings.DB_MAX_POOL_SIZE,
        command_timeout=settings.DB_COMMAND_TIMEOUT,
        max_inactive_connection_lifetime=settings.DB_MAX_INACTIVE_CONNECTION_LIFETIME,
        # init: called on every new connection (including recycled ones).
        # Registers the pgvector `vector` type codec so asyncpg can
        # encode/decode vector columns in the embeddings table.
        init=_init_connection,
    )

    logger.info("asyncpg pool created successfully")

    # Run schema migrations before accepting requests.
    await _run_migrations(pool)

    # Recover stale PROCESSING submissions from unclean shutdowns.
    await _recover_stale_submissions(pool)

    return pool


async def close_pool(pool: asyncpg.Pool) -> None:
    """
    Gracefully close all connections in the pool.

    Called at application shutdown (FastAPI lifespan).  Waits for in-flight
    queries to complete before closing connections.

    Args:
        pool: The asyncpg.Pool returned by create_pool().
    """
    logger.info("Closing asyncpg connection pool")
    await pool.close()
    logger.info("asyncpg pool closed")


# ---------------------------------------------------------------------------
# Connection initialiser (pgvector type registration)
# ---------------------------------------------------------------------------


async def _init_connection(conn: asyncpg.Connection) -> None:
    """
    Per-connection initialisation callback.

    Called by asyncpg for every new connection added to the pool, including:
      - Connections created during pool initialisation (min_size connections).
      - Connections created when the pool grows under load.
      - Connections recreated after recycling (max_inactive_connection_lifetime).

    Registers the pgvector `vector` type so asyncpg knows how to serialise
    and deserialise vector(N) columns.  Without this, any query that reads
    or writes a `vector` column raises:
        asyncpg.exceptions.UntrustedTypeError: unsupported type: vector

    The `pgvector.asyncpg.register_vector` function executes a query against
    the database to discover the OID of the `vector` type and installs custom
    encode/decode functions for it on this connection.

    Args:
        conn: A newly created asyncpg.Connection.
    """
    try:
        from pgvector.asyncpg import register_vector  # type: ignore[import]

        await register_vector(conn)
    except ImportError:
        # pgvector Python package is not installed.  This is acceptable in Phase 1
        # if embeddings are not yet used.  Log a warning so operators are aware.
        logger.warning(
            "pgvector Python package not installed — vector type codec not registered. "
            "Embedding queries will fail. Install with: poetry add pgvector"
        )
    except Exception as exc:
        # The vector extension may not be installed in the database yet.
        # This is non-fatal for Phase 1 (embeddings table exists but is unused).
        # Migrations will create the extension if it is missing.
        logger.warning(
            "Failed to register pgvector type codec",
            error=str(exc),
            hint=(
                "Ensure the pgvector extension is enabled in the database: "
                "CREATE EXTENSION IF NOT EXISTS vector;"
            ),
        )


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------


async def _run_migrations(pool: asyncpg.Pool) -> None:
    """
    Apply pending SQL migration scripts from storage/migrations/.

    Migration files must be named with a numeric prefix for lexicographic
    ordering:  V001__description.sql, V002__description.sql, etc.
    The version key stored in schema_migrations is the filename without the
    .sql extension.

    All migration files are executed in a single connection with auto-commit
    disabled.  Each file runs in its own transaction:
        BEGIN;
        <migration SQL>;
        INSERT INTO schema_migrations (version) VALUES ($1);
        COMMIT;

    If any migration fails, the transaction rolls back and the application
    raises RuntimeError, preventing startup with an inconsistent schema.
    The container orchestrator will restart the container; on next startup
    the migration will be retried.

    Args:
        pool: The asyncpg.Pool to run migrations through.

    Raises:
        RuntimeError: If any migration script fails to execute.
    """
    if not _MIGRATIONS_DIR.exists():
        logger.warning(
            "Migration directory does not exist — skipping migrations",
            path=str(_MIGRATIONS_DIR),
        )
        return

    async with pool.acquire() as conn:
        # Ensure the migration tracking table exists.
        # Uses IF NOT EXISTS so this is idempotent.
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version     VARCHAR(256) PRIMARY KEY,
                applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
        """)

        # Load applied versions.
        applied: set[str] = {
            row["version"]
            for row in await conn.fetch("SELECT version FROM schema_migrations")
        }

        # Collect migration files sorted lexicographically.
        migration_files = sorted(
            f for f in _MIGRATIONS_DIR.iterdir() if f.is_file() and f.suffix == ".sql"
        )

        if not migration_files:
            logger.info("No migration files found in migrations/")
            return

        for migration_file in migration_files:
            version = migration_file.stem  # filename without .sql

            if version in applied:
                logger.debug(
                    "Migration already applied — skipping",
                    version=version,
                )
                continue

            logger.info("Applying migration", version=version, file=migration_file.name)

            sql = migration_file.read_text(encoding="utf-8")

            try:
                # Execute the migration in a transaction.
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute(
                        "INSERT INTO schema_migrations (version) VALUES ($1)",
                        version,
                    )
                logger.info("Migration applied successfully", version=version)
            except Exception as exc:
                logger.error(
                    "Migration FAILED — application startup aborted",
                    version=version,
                    file=migration_file.name,
                    error=str(exc),
                )
                raise RuntimeError(
                    f"Schema migration '{version}' failed: {exc}. "
                    f"The application cannot start with an inconsistent schema. "
                    f"Fix the migration and restart."
                ) from exc


# ---------------------------------------------------------------------------
# Stale submission recovery
# ---------------------------------------------------------------------------


async def _recover_stale_submissions(pool: asyncpg.Pool) -> None:
    """
    Recover submissions left in PROCESSING state from an unclean shutdown.

    On container restart after a crash or OOM kill, submissions that were
    mid-pipeline will be stuck in PROCESSING state indefinitely.  This
    function detects them (PROCESSING for > 5 minutes) and marks them FAILED
    with a recovery error message.

    The 5-minute threshold is intentionally conservative:
      - Normal batch processing completes in < 5 seconds.
      - Network timeouts and DB slow queries add at most 30 seconds.
      - 5 minutes provides a generous buffer for high-load scenarios.

    Args:
        pool: The asyncpg.Pool.
    """
    try:
        async with pool.acquire() as conn:
            # Check if submissions table exists (may not if migrations haven't run).
            table_exists = await conn.fetchval(
                """
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name   = 'submissions'
                )
                """
            )

            if not table_exists:
                return

            stale_count: int = (
                await conn.fetchval(
                    """
                UPDATE submissions
                SET    status        = 'FAILED',
                       error_message = 'Recovered from unclean shutdown: '
                                       'submission was in PROCESSING state on restart.',
                       completed_at  = NOW()
                WHERE  status      = 'PROCESSING'
                  AND  created_at  < NOW() - INTERVAL '5 minutes'
                RETURNING count(*) OVER ()
                """,
                )
                or 0
            )

            if stale_count > 0:
                logger.warning(
                    "Recovered stale PROCESSING submissions",
                    count=stale_count,
                )
            else:
                logger.debug("No stale submissions found")

    except Exception as exc:
        # Non-fatal: stale submissions are an operational concern, not a
        # startup blocker.  Log and continue.
        logger.warning(
            "Failed to recover stale submissions (non-fatal)",
            error=str(exc),
        )


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def _redact_dsn(dsn: str) -> str:
    """
    Redact the password from a PostgreSQL DSN for safe logging.

    Input:  "postgresql://cipas:s3cr3t@host:5432/cipas_db"
    Output: "postgresql://cipas:***@host:5432/cipas_db"

    Args:
        dsn: A postgresql:// DSN string.

    Returns:
        DSN with the password component replaced by "***".
    """
    try:
        # Find the @ that separates credentials from host.
        at_pos = dsn.rfind("@")
        if at_pos == -1:
            return dsn  # No credentials in DSN

        # Find the scheme end.
        scheme_end = dsn.find("://")
        if scheme_end == -1:
            return dsn

        credentials_start = scheme_end + 3
        credentials = dsn[credentials_start:at_pos]

        if ":" in credentials:
            user, _ = credentials.split(":", 1)
            redacted_credentials = f"{user}:***"
        else:
            redacted_credentials = credentials

        return dsn[:credentials_start] + redacted_credentials + dsn[at_pos:]
    except Exception:
        # If anything goes wrong with parsing, return a fully redacted string.
        return "<redacted DSN>"


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "create_pool",
    "close_pool",
]
