"""
Clone Detection Pipelines.

This package provides tiered detection pipelines for code clone analysis.
"""

from .tiered_pipeline import TieredDetectionResult, TieredPipeline, get_tiered_pipeline

__all__ = [
    "TieredDetectionResult",
    "TieredPipeline",
    "get_tiered_pipeline",
]
