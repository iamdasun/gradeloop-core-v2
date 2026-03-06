"""Grade and feedback schema definitions."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CriterionScore(BaseModel):
    """Score and justification for a single rubric criterion."""
    name: str
    score: float
    max_score: float
    grading_mode: str          # deterministic | llm | llm_ast
    reason: str                # instructor-facing technical justification


class SubmissionGrade(BaseModel):
    """Complete grading result for a submission."""
    submission_id: UUID
    assignment_id: UUID
    total_score: float
    max_total_score: float
    criteria_scores: list[CriterionScore] = Field(default_factory=list)
    holistic_feedback: str     # student-facing plain-English paragraph
    graded_at: datetime = Field(default_factory=datetime.utcnow)
    grading_metadata: Optional[dict[str, Any]] = None
