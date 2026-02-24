# gradeloop-core-v2/apps/services/cipas-service/src/cipas/domain/__init__.py
"""
CIPAS domain package.

Re-exports all public symbols from domain.models so callers can import
directly from `cipas.domain` without knowing the internal module layout:

    from cipas.domain import Language, GranuleData, SubmissionResponse
"""

from cipas.domain.models import (
    UTC,
    BatchParseResult,
    ErrorDetail,
    FileItem,
    FileParseResult,
    FileParseStatus,
    GranuleData,
    GranuleType,
    Language,
    ParseFailureDetail,
    ProblemDetail,
    SubmissionResponse,
    SubmissionStatus,
    SubmissionStatusResponse,
)

__all__ = [
    "UTC",
    # Enums
    "Language",
    "GranuleType",
    "SubmissionStatus",
    "FileParseStatus",
    # Internal DTOs
    "FileItem",
    "GranuleData",
    "FileParseResult",
    "BatchParseResult",
    # API schemas
    "ParseFailureDetail",
    "SubmissionResponse",
    "SubmissionStatusResponse",
    "ErrorDetail",
    "ProblemDetail",
]
