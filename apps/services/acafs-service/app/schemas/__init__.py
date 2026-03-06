"""Schema definitions for ACAFS Service."""

from .chat import (
    ChatHistoryResponse,
    ChatMessageModel,
    ChatMessageResponse,
    ChatRequest,
    ChatResponse,
    ChatSessionModel,
)
from .grade import CriterionScore, SubmissionGrade
from .submission_event import (
    ASTBlueprint,
    ASTMetadata,
    GradingMode,
    RubricBand,
    RubricCriterion,
    SubmissionEvent,
    TestCaseResult,
)

__all__ = [
    # submission event
    "ASTBlueprint",
    "ASTMetadata",
    "GradingMode",
    "RubricBand",
    "RubricCriterion",
    "SubmissionEvent",
    "TestCaseResult",
    # grade
    "CriterionScore",
    "SubmissionGrade",
    # chat
    "ChatMessageModel",
    "ChatSessionModel",
    "ChatRequest",
    "ChatResponse",
    "ChatHistoryResponse",
    "ChatMessageResponse",
]
