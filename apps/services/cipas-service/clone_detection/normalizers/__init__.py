"""
Code Normalizers for Clone Detection.

This package provides structural normalization for NiCad-style
Type-1 and Type-2 clone detection.
"""

from .structural_normalizer import (
    NormalizationLevel,
    NormalizationResult,
    StructuralNormalizer,
    get_normalizer,
)

__all__ = [
    "NormalizationLevel",
    "NormalizationResult",
    "StructuralNormalizer",
    "get_normalizer",
]
