"""
Pydantic schemas for the CIPAS Syntactics API.

This module defines request/response models for the syntactic code clone detection API endpoints.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class LanguageEnum(str, Enum):
    """Supported programming languages."""

    JAVA = "java"
    C = "c"
    PYTHON = "python"


class ComparisonRequest(BaseModel):
    """Request model for code comparison."""

    code1: str = Field(..., description="First code snippet to compare", min_length=1)
    code2: str = Field(..., description="Second code snippet to compare", min_length=1)
    language: LanguageEnum = Field(
        default=LanguageEnum.JAVA, description="Programming language of the code"
    )


class SyntacticFeatures(BaseModel):
    """Syntactic similarity features."""

    jaccard_similarity: float = Field(..., description="Jaccard similarity coefficient")
    dice_coefficient: float = Field(..., description="Dice coefficient")
    levenshtein_distance: int = Field(..., description="Levenshtein distance")
    levenshtein_ratio: float = Field(..., description="Levenshtein similarity ratio")
    jaro_similarity: float = Field(..., description="Jaro similarity")
    jaro_winkler_similarity: float = Field(..., description="Jaro-Winkler similarity")


class ComparisonResult(BaseModel):
    """Response model for code comparison."""

    is_clone: bool = Field(..., description="Whether the codes are clones")
    confidence: float = Field(..., description="Confidence score (0-1)")
    clone_type: Optional[str] = Field(
        None, description="Type of clone detected (Type-1/2/3)"
    )
    pipeline_used: str = Field(
        ...,
        description="Which pipeline was used (Syntactic Cascade Type-1/2/3)",
    )
    normalization_level: Optional[str] = Field(
        None,
        description="Normalization level used (Literal, Blinded, or Token-based)",
    )

    # Optional detailed results
    syntactic_features: Optional[SyntacticFeatures] = Field(
        None, description="Syntactic features"
    )

    # Additional metadata
    tokens1_count: Optional[int] = Field(None, description="Number of tokens in code1")
    tokens2_count: Optional[int] = Field(None, description="Number of tokens in code2")


class BatchComparisonRequest(BaseModel):
    """Request model for batch code comparison."""

    pairs: list[ComparisonRequest] = Field(
        ..., description="List of code pairs to compare", min_length=1
    )


class BatchComparisonResult(BaseModel):
    """Response model for batch code comparison."""

    results: list[ComparisonResult] = Field(
        ..., description="List of comparison results for each pair"
    )
    total_pairs: int = Field(..., description="Total number of pairs compared")


class ModelStatus(BaseModel):
    """Model availability status."""

    model_name: str
    available: bool
    loaded: bool = False
    error: Optional[str] = None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "healthy"
    service: str = "cipas-syntactics"
    version: str = "0.1.0"
    models: dict[str, ModelStatus] = Field(
        default_factory=dict, description="Status of ML models"
    )


class FeatureImportanceResponse(BaseModel):
    """Feature importance response."""

    model: str
    features: dict[str, float]


class TokenizeRequest(BaseModel):
    """Request model for tokenization."""

    code: str = Field(..., description="Source code to tokenize", min_length=1)
    language: LanguageEnum = Field(
        default=LanguageEnum.JAVA, description="Programming language"
    )
    abstract_identifiers: bool = Field(
        default=True, description="Whether to abstract identifiers to 'V'"
    )


class TokenizeResponse(BaseModel):
    """Response model for tokenization."""

    tokens: list[str] = Field(..., description="List of tokens")
    token_count: int = Field(..., description="Number of tokens")
    language: str = Field(..., description="Programming language used")
