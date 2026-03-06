"""Chat session and message schema definitions."""

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


ChatRole = Literal["user", "assistant"]
SessionStatus = Literal["active", "closed"]


class ChatMessageModel(BaseModel):
    """A single turn in a Socratic chat session."""
    id: Optional[int] = None
    session_id: UUID
    role: ChatRole
    content: str
    reasoning_details: Optional[Any] = None
    created_at: Optional[datetime] = None


class ChatSessionModel(BaseModel):
    """A Socratic chat session scoped to one student + assignment."""
    id: UUID
    assignment_id: UUID
    user_id: str
    status: SessionStatus = "active"
    messages: list[ChatMessageModel] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    closed_reason: Optional[str] = None  # "submission" | "manual"


# ── API request / response models ────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Payload for sending a message to the Socratic tutor."""
    content: str = Field(..., min_length=1, max_length=4000)
    # Optional assignment context forwarded by the frontend
    assignment_title: Optional[str] = None
    assignment_description: Optional[str] = None
    rubric_skills: Optional[list[str]] = None    # skill names only, no scores
    answer_concepts: Optional[list[str]] = None  # key concepts to guide toward
    student_code: Optional[str] = None           # latest editor snapshot
    ast_context: Optional[dict[str, Any]] = None # compact AST snapshot


class ChatMessageResponse(BaseModel):
    """A single message returned from the API."""
    id: Optional[int] = None
    role: ChatRole
    content: str
    created_at: Optional[datetime] = None


class ChatResponse(BaseModel):
    """Response returned after sending a chat message."""
    session_id: UUID
    assignment_id: UUID
    user_id: str
    status: SessionStatus
    reply: str
    messages: list[ChatMessageResponse] = Field(default_factory=list)


class ChatHistoryResponse(BaseModel):
    """Full chat session history returned for analytics or UI restore."""
    session_id: UUID
    assignment_id: UUID
    user_id: str
    status: SessionStatus
    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    closed_reason: Optional[str] = None
    messages: list[ChatMessageResponse] = Field(default_factory=list)
