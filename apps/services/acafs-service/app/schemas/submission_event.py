"""Schema definitions for submission events and AST blueprints."""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TestCaseResult(BaseModel):
    """Individual test case evaluation result."""
    test_case_id: str
    input: str
    expected_output: str
    actual_output: str
    passed: bool
    execution_time: Optional[str] = None
    memory_used: Optional[int] = None
    status_id: int
    status_description: str


class ASTMetadata(BaseModel):
    """Metadata for AST extraction."""
    ast_truncated: bool = False
    parser_timeout: bool = False
    low_readability: bool = False
    lines_of_code: int = 0
    extraction_duration_ms: Optional[float] = None


class ASTBlueprint(BaseModel):
    """Structural blueprint of source code."""
    schema_version: str = "1.0.0"
    language: str
    functions: list[dict[str, Any]] = Field(default_factory=list)
    classes: list[dict[str, Any]] = Field(default_factory=list)
    variables: list[dict[str, Any]] = Field(default_factory=list)
    control_flow: list[dict[str, Any]] = Field(default_factory=list)
    operators: list[dict[str, Any]] = Field(default_factory=list)
    imports: list[dict[str, Any]] = Field(default_factory=list)
    metadata: ASTMetadata = Field(default_factory=ASTMetadata)
    raw_ast: Optional[dict[str, Any]] = None


# ─────────────────────────────────────────────────────────────────────────────
# Rubric models – forwarded from assessment-service via the submission event
# ─────────────────────────────────────────────────────────────────────────────

GradingMode = Literal["deterministic", "llm", "llm_ast"]


class RubricBand(BaseModel):
    """Performance band descriptor within a rubric criterion."""
    description: str
    min_mark: float
    max_mark: float


class RubricCriterion(BaseModel):
    """Single graded criterion in a rubric.

    grading_mode controls which evaluation path is used:
    - deterministic : scored solely from Judge0 test-case pass/fail counts.
    - llm           : scored by Gemini reasoning over student code and sample answer.
    - llm_ast       : scored by Gemini reasoning enriched with AST structural evidence.
    """
    name: str
    description: Optional[str] = None   # omitempty on Go side — may be absent
    grading_mode: GradingMode
    weight: float  # max marks this criterion contributes to total_score
    bands: Optional[dict[str, RubricBand]] = None  # excellent/good/satisfactory/unsatisfactory


class SubmissionEvent(BaseModel):
    """Submission event from RabbitMQ."""
    submission_id: UUID
    assignment_id: UUID
    code: str
    language: str
    language_id: int
    storage_path: str
    user_id: str
    username: str
    ip_address: str
    user_agent: str
    enqueued_at: datetime

    # -------------------------------------------------------------------------
    # Evaluation context – forwarded from assessment-service via RabbitMQ.
    # All fields are optional so existing messages without them remain valid.
    # -------------------------------------------------------------------------

    # Assignment metadata (used as LLM prompt context):
    assessment_type: Optional[str] = None        # "lab" | "exam"
    assignment_title: Optional[str] = None       # short title shown to model
    assignment_description: Optional[str] = None # full problem description
    objective: Optional[str] = None              # free-text learning objective

    # Rubric: list of criteria that define how the submission is graded.
    rubric: Optional[list[RubricCriterion]] = None

    # Test cases used for deterministic evaluation.
    # Structure: [{id, input, expected_output}]
    test_cases: Optional[list[dict[str, Any]]] = None

    # Reference implementation / sample answer for LLM comparison.
    # Structure: {language_id: int, code: str}
    sample_answer: Optional[dict[str, Any]] = None

    class Config:
        """Pydantic config."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v),
        }
