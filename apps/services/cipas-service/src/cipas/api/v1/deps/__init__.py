# gradeloop-core-v2/apps/services/cipas-service/src/cipas/api/v1/deps/__init__.py
"""
CIPAS API v1 dependency providers.

Re-exports all FastAPI dependency provider functions and Annotated type aliases
from cipas.api.v1.deps.db so that route handlers can import from a single
location:

    from cipas.api.v1.deps import RepositoryDep, PipelineDep, SettingsDep

rather than reaching into the sub-module directly.
"""

from cipas.api.v1.deps.db import (
    PipelineDep,
    RepositoryDep,
    SettingsDep,
    get_db_pool,
    get_pipeline,
    get_repository,
    get_settings_dep,
)

__all__ = [
    # Dependency provider functions
    "get_db_pool",
    "get_repository",
    "get_pipeline",
    "get_settings_dep",
    # Annotated type aliases (preferred usage in route handlers)
    "RepositoryDep",
    "PipelineDep",
    "SettingsDep",
]
