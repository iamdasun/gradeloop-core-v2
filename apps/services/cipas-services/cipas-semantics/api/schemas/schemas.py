"""
Pydantic schemas for request/response validation
"""

from typing import List

from pydantic import BaseModel, Field


class CloneDetectionRequest(BaseModel):
    """Request schema for semantic clone detection"""

    code1: str = Field(
        ..., description="First code snippet to compare", min_length=1, max_length=50000
    )
    code2: str = Field(
        ...,
        description="Second code snippet to compare",
        min_length=1,
        max_length=50000,
    )

    class Config:
        json_schema_extra = {
            "example": {
                "code1": "def add(a, b):\n    return a + b",
                "code2": "def sum(a, b):\n    return a + b",
            }
        }


class CloneDetectionResponse(BaseModel):
    """Response schema for semantic clone detection"""

    is_clone: bool = Field(
        ..., description="Whether the code snippets are semantic clones"
    )
    confidence: float = Field(
        ..., description="Confidence score of the prediction (0-1)", ge=0.0, le=1.0
    )
    clone_probability: float = Field(
        ..., description="Probability that the snippets are clones", ge=0.0, le=1.0
    )
    not_clone_probability: float = Field(
        ..., description="Probability that the snippets are not clones", ge=0.0, le=1.0
    )

    class Config:
        json_schema_extra = {
            "example": {
                "is_clone": True,
                "confidence": 0.95,
                "clone_probability": 0.95,
                "not_clone_probability": 0.05,
            }
        }


class BatchCloneDetectionRequest(BaseModel):
    """Request schema for batch semantic clone detection"""

    pairs: List[List[str]] = Field(
        ...,
        description="List of [code1, code2] pairs to compare",
        min_length=1,
        max_length=100,
    )

    class Config:
        json_schema_extra = {
            "example": {
                "pairs": [
                    ["def add(a, b): return a + b", "def sum(a, b): return a + b"],
                    ["def mul(a, b): return a * b", "def add(a, b): return a + b"],
                ]
            }
        }


class BatchCloneDetectionResponse(BaseModel):
    """Response schema for batch semantic clone detection"""

    results: List[CloneDetectionResponse] = Field(
        ..., description="List of prediction results for each pair"
    )
    total_pairs: int = Field(..., description="Total number of pairs processed")
    clone_count: int = Field(..., description="Number of pairs detected as clones")


class SimilarityScoreRequest(BaseModel):
    """Request schema for similarity score calculation"""

    code1: str = Field(
        ..., description="First code snippet", min_length=1, max_length=50000
    )
    code2: str = Field(
        ..., description="Second code snippet", min_length=1, max_length=50000
    )


class SimilarityScoreResponse(BaseModel):
    """Response schema for similarity score calculation"""

    similarity_score: float = Field(
        ..., description="Semantic similarity score (0-1)", ge=0.0, le=1.0
    )


class HealthResponse(BaseModel):
    """Health check response"""

    status: str = Field(..., description="Service status")
    model_loaded: bool = Field(..., description="Whether model is loaded")
    device: str = Field(..., description="Device model is running on")


class ModelInfoResponse(BaseModel):
    """Model information response"""

    model_name: str = Field(..., description="Model name")
    max_length: int = Field(..., description="Maximum token length")
    hidden_size: int = Field(..., description="Model hidden size")
    dropout_rate: float = Field(..., description="Dropout rate")
    device: str = Field(..., description="Current device")
    threshold: float = Field(..., description="Clone detection threshold")
