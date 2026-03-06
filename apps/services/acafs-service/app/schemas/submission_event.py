"""Schema definitions for submission events and AST blueprints."""

from datetime import datetime
from typing import Any, Optional
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
    # TODO [ACAFS – Evaluation Context Fields]
    #
    # The following fields must be added once assessment-service stores them.
    # Uncomment and update the RabbitMQ publisher in assessment-service to
    # include these in the queue message payload.
    #
    # Assignment metadata:
    # assignment_type: Optional[str] = None        # "lab" | "exam"
    # assignment_objective: Optional[str] = None   # LLM prompt context
    #
    # Rubric (drives per-criterion grading):
    # rubric: Optional[list[dict[str, Any]]] = None
    # Structure: [{id, name, description, grading_mode, weight, bands: {...}}]
    #
    # Test cases (drives deterministic evaluation):
    # test_cases: Optional[list[dict[str, Any]]] = None
    # Structure: [{test_case_id, description, test_case_input, expected_output}]
    #
    # Sample answer (LLM reference & deterministic ground-truth):
    # sample_answer: Optional[dict[str, Any]] = None
    # Structure: {language_id: int, code: str}
    # -------------------------------------------------------------------------

    class Config:
        """Pydantic config."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v),
        }
