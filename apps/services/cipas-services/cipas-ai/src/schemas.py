"""
Pydantic schemas for CIPAS AI Detection Service.
"""

from pydantic import BaseModel, Field


class CodeSnippetRequest(BaseModel):
    """Request schema for code snippet analysis."""

    code: str = Field(..., description="The code snippet to analyze", min_length=1)


class AIDetectionResponse(BaseModel):
    """Response schema for AI detection analysis."""

    is_ai_generated: bool = Field(
        ..., description="Whether the code is predicted to be AI-generated"
    )
    confidence: float = Field(
        ..., description="Confidence score (0.0 to 1.0)", ge=0.0, le=1.0
    )
    ai_likelihood: float = Field(
        ..., description="Probability that the code is AI-generated", ge=0.0, le=1.0
    )
    human_likelihood: float = Field(
        ..., description="Probability that the code is human-generated", ge=0.0, le=1.0
    )


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(..., description="Service health status")
    model_loaded: bool = Field(..., description="Whether the model is loaded and ready")
