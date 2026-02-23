# gradeloop-core-v2/apps/services/cipas-service/src/cipas/core/config.py
"""
Core configuration for CIPAS service.

- Uses pydantic-settings (BaseSettings) for environment-driven configuration.
- Exposes a `Settings` dataclass and a cached `get_settings()` factory.
- Provides `configure_logging()` to initialize Loguru with structured JSON output.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from typing import Optional

from loguru import logger
from pydantic import AnyHttpUrl, Field, SecretStr, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Environment variables are expected to be prefixed with `CIPAS_` by default,
    e.g. `CIPAS_MINIO_ENDPOINT`, `CIPAS_MINIO_ACCESS_KEY`, etc.
    """

    model_config = SettingsConfigDict(env_prefix="CIPAS_", frozen=True)

    # Runtime / environment
    ENV: str = Field(
        "development", description="Runtime environment, e.g. development|production"
    )
    LOG_LEVEL: str = Field("INFO", description="Log level for the application")

    # Health / Observability
    HEALTH_CHECK_TIMEOUT_SECONDS: float = Field(
        3.0,
        description="Timeout seconds for performing external dependency health checks",
    )

    # Optional instrumentation / tracing
    OTEL_SERVICE_NAME: Optional[str] = Field(
        "cipas", description="OpenTelemetry service name"
    )
    SENTRY_DSN: Optional[str] = Field(None, description="Sentry DSN (optional)")



def configure_logging(settings: Settings) -> None:
    """
    Configure structured JSON logging via Loguru.

    - Uses `settings.LOG_LEVEL`
    - Enables JSON serialization (structured logs) so they are friendly to log collectors.
    """
    # Remove default handlers and set our structured handler
    logger.remove()

    # Keep the format minimal when serializing (Loguru will output JSON with keys like time, level, message)
    logger.add(
        sys.stdout,
        level=settings.LOG_LEVEL,
        serialize=True,
        enqueue=True,
        backtrace=False,
        diagnose=False,
    )

    # Example of a consistent logger sink for library code to use
    logger.bind(service="cipas")
    logger.debug("Logging configured", env=settings.ENV, level=settings.LOG_LEVEL)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a cached Settings instance.

    This performs environment variable validation immediately. If required environment variables
    are missing or invalid, this function will raise SystemExit so the process fails fast.
    """
    try:
        settings = Settings()
    except (
        ValidationError
    ) as exc:  # pragma: no cover - this branch is exercised by env misconfiguration
        # Fail fast with a clear message; container orchestrators / proc managers will see the exit code.
        # Avoid leaking secrets in logs: show which fields are missing/invalid but do not print values.
        missing_or_invalid = exc.errors()
        msg = (
            "Configuration validation failed. See details in `exc.errors()`.\n"
            f"{missing_or_invalid}"
        )
        # Use stderr for machine-readable logs on startup problems
        sys.stderr.write(msg + "\n")
        raise SystemExit(2) from exc

    # Configure global logger once settings are validated
    configure_logging(settings)

    logger.info("Settings loaded successfully", env=settings.ENV)
    return settings


__all__ = ["Settings", "get_settings", "configure_logging"]
