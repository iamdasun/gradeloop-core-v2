# gradeloop-core-v2/apps/services/cipas-service/src/cipas/storage/__init__.py
"""
CIPAS storage package.

Exposes the public interface for the database and storage layer:

  - create_pool()        Async factory: creates and returns an asyncpg.Pool
                         with pgvector type registration and migration runner.
  - close_pool()         Gracefully closes the asyncpg pool on shutdown.
  - StorageRepository    Typed async data access layer (all SQL lives here).

Usage in application lifespan (main.py):

    from cipas.storage import create_pool, close_pool, StorageRepository

    pool = await create_pool(settings)
    repository = StorageRepository(pool=pool)

    app.state.db_pool   = pool
    app.state.repository = repository

    yield  # application running

    await close_pool(pool)

Usage in FastAPI dependency injection (api/v1/deps/db.py):

    from cipas.storage import StorageRepository

    async def get_repository(request: Request) -> StorageRepository:
        return request.app.state.repository

Design note:
    The storage package intentionally does NOT re-export the migration runner
    (_run_migrations) or the connection initialiser (_init_connection).  Those
    are internal implementation details of db.py and are invoked automatically
    by create_pool().  Callers never need to call them directly.
"""

from cipas.storage.db import close_pool, create_pool
from cipas.storage.repository import StorageRepository

__all__ = [
    "create_pool",
    "close_pool",
    "StorageRepository",
]
