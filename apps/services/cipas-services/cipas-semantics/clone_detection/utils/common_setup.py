"""
Common Setup and Utility Functions for Semantic Clone Detection.

This module provides shared utilities, configuration, and helper functions
used across the semantic clone detection pipeline.
"""

import logging
import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np

# ============================================================================
# Path Configuration
# ============================================================================


def get_project_root() -> Path:
    """Get the project root directory (cipas-semantics)."""
    # Use environment variable if set (for Docker), otherwise use relative path
    root = os.environ.get("CIPAS_SEMANTICS_ROOT")
    if root:
        return Path(root)

    # Fallback: use path relative to this file
    # This file is at: apps/services/cipas-services/cipas-semantics/clone_detection/utils/
    return Path(__file__).resolve().parent.parent.parent


def get_models_dir() -> Path:
    """Get the directory for storing trained models."""
    return get_project_root() / "models"


def get_parsers_dir() -> Path:
    """Get the Tree-sitter parsers directory."""
    return get_project_root() / "parsers"


# ============================================================================
# Logging Configuration
# ============================================================================


def setup_logging(
    name: str = "cipas_semantics",
    level: int = logging.INFO,
    log_file: Optional[str] = None,
) -> logging.Logger:
    """
    Set up logging configuration.

    Args:
        name: Logger name
        level: Logging level
        log_file: Optional file path for logging

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Create formatter
    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger


# ============================================================================
# Random Seed Setup
# ============================================================================


def set_random_seed(seed: int = 42) -> None:
    """
    Set random seeds for reproducibility.

    Args:
        seed: Random seed value
    """
    np.random.seed(seed)
    try:
        import random

        random.seed(seed)
    except ImportError:
        pass

    # Set environment variable for Python hash seed
    os.environ["PYTHONHASHSEED"] = str(seed)


# ============================================================================
# Model Path Utilities
# ============================================================================


def get_model_path(model_name: str) -> Path:
    """
    Get the path for a saved model.

    Args:
        model_name: Name of the model (e.g., 'type4_xgb.pkl')

    Returns:
        Full path to the model file
    """
    models_dir = get_models_dir()
    models_dir.mkdir(parents=True, exist_ok=True)
    return models_dir / model_name


def model_exists(model_name: str) -> bool:
    """
    Check if a model file exists.

    Args:
        model_name: Name of the model

    Returns:
        True if model exists, False otherwise
    """
    return get_model_path(model_name).exists()
