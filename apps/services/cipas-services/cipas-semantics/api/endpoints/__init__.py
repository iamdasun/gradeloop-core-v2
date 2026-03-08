"""
Endpoints module initialization
"""

from .detection import router as detection_router

__all__ = ["detection_router"]
