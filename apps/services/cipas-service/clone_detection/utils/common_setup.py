"""
Common Setup and Utility Functions for Clone Detection System.

This module provides shared utilities, configuration, and helper functions
used across the clone detection pipeline.
"""

import logging
import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# ============================================================================
# Path Configuration
# ============================================================================


def get_project_root() -> Path:
    """Get the project root directory (cipas-service)."""
    # Use environment variable if set (for Docker), otherwise use relative path
    root = os.environ.get("CIPAS_PROJECT_ROOT")
    if root:
        return Path(root)

    # Fallback: use path relative to this file
    # This file is at: gradeloop-core-v2/apps/services/cipas-service/clone_detection/utils/
    return Path(__file__).resolve().parent.parent.parent.parent


def get_data_dir() -> Path:
    """Get the datasets directory."""
    # Use environment variable if set (for Docker), otherwise use relative path
    data_dir = os.environ.get("CIPAS_DATA_DIR")
    if data_dir:
        return Path(data_dir)

    # Fallback: datasets are at: gradeloop-core-v2/datasets/
    return get_project_root().parent.parent.parent / "datasets"


def get_toma_dataset_dir() -> Path:
    """Get the TOMA dataset directory."""
    return get_data_dir() / "toma-dataset"


def get_bigclonebench_dir() -> Path:
    """Get the BigCloneBench dataset directory."""
    return get_data_dir() / "bigclonebench"


def get_models_dir() -> Path:
    """Get the directory for storing trained models."""
    return get_project_root() / "clone_detection" / "models" / "saved"


def get_parsers_dir() -> Path:
    """Get the Tree-sitter parsers directory."""
    return get_project_root() / "clone_detection" / "parsers"


# ============================================================================
# Logging Configuration
# ============================================================================


def setup_logging(
    name: str = "clone_detection",
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
# Data Loading Utilities
# ============================================================================


def load_toma_csv(filename: str) -> pd.DataFrame:
    """
    Load a TOMA dataset CSV file.

    Args:
        filename: Name of the CSV file (e.g., 'type-3.csv')

    Returns:
        DataFrame with columns: id1, id2, label, similarity_line, similarity_token
    """
    filepath = get_toma_dataset_dir() / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Dataset file not found: {filepath}")

    df = pd.read_csv(
        filepath,
        header=None,
        names=["id1", "id2", "label", "similarity_line", "similarity_token"],
    )
    return df


def load_source_code(code_id: int) -> Optional[str]:
    """
    Load source code for a given code ID.

    Args:
        code_id: The ID of the code snippet

    Returns:
        Source code string or None if not found
    """
    source_file = get_toma_dataset_dir() / "id2sourcecode" / f"{code_id}.java"
    if not source_file.exists():
        return None

    try:
        with open(source_file, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return None


def load_source_code_batch(code_ids: list[int]) -> dict[int, str]:
    """
    Load source code for multiple code IDs.

    Args:
        code_ids: List of code IDs

    Returns:
        Dictionary mapping code IDs to source code strings
    """
    result = {}
    for code_id in code_ids:
        code = load_source_code(code_id)
        if code is not None:
            result[code_id] = code
    return result


# ============================================================================
# Language Detection
# ============================================================================


def detect_language(code: str, filename: Optional[str] = None) -> str:
    """
    Detect the programming language of source code.

    Args:
        code: Source code string
        filename: Optional filename to help with detection

    Returns:
        Language string: 'java', 'c', 'python', or 'unknown'
    """
    if filename:
        if filename.endswith(".java"):
            return "java"
        elif filename.endswith(".c") or filename.endswith(".h"):
            return "c"
        elif filename.endswith(".py"):
            return "python"

    # Heuristic detection based on code content
    code_lower = code.lower()

    # Python indicators
    if "def " in code and "import " in code:
        if "public class" not in code and "#include" not in code:
            return "python"

    # Java indicators
    if "public class" in code or "public static void main" in code:
        return "java"

    # C indicators
    if "#include" in code and ("int main(" in code or "void main(" in code):
        return "c"

    # Default to Java for TOMA dataset
    return "java"


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
        model_name: Name of the model (e.g., 'type3_rf.pkl')

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


# ============================================================================
# Clone Type Constants
# ============================================================================


class CloneType:
    """Constants for clone types."""

    TYPE_1 = 1  # Exact clones
    TYPE_2 = 2  # Renamed clones
    TYPE_3 = 3  # Modified clones
    TYPE_4 = 4  # Semantic clones

    # TOMA dataset uses type-5.csv for Type-4 clones
    TOMA_TYPE_4_FILE = "type-5.csv"
    TOMA_TYPE_3_FILE = "type-3.csv"


# ============================================================================
# Token Type Mapping (15 standardized types)
# ============================================================================

TOKEN_TYPES = {
    # Keywords and modifiers
    "MODIFIER": {
        "public",
        "private",
        "protected",
        "static",
        "final",
        "abstract",
        "native",
        "synchronized",
        "volatile",
        "transient",
        "const",
        "extern",
        "inline",
        "virtual",
        "override",
    },
    # Data types
    "TYPE": {
        "int",
        "float",
        "double",
        "char",
        "void",
        "boolean",
        "byte",
        "short",
        "long",
        "unsigned",
        "signed",
        "str",
        "list",
        "dict",
        "set",
        "tuple",
        "class",
        "interface",
        "struct",
        "enum",
    },
    # Control flow
    "CONTROL": {
        "if",
        "else",
        "switch",
        "case",
        "default",
        "for",
        "while",
        "do",
        "break",
        "continue",
        "return",
        "goto",
        "try",
        "catch",
        "finally",
        "throw",
        "throws",
        "with",
        "yield",
        "async",
        "await",
    },
    # Operators
    "OPERATOR": {
        "+",
        "-",
        "*",
        "/",
        "%",
        "=",
        "==",
        "!=",
        "<",
        ">",
        "<=",
        ">=",
        "&&",
        "||",
        "!",
        "&",
        "|",
        "^",
        "~",
        "<<",
        ">>",
        "++",
        "--",
        "+=",
        "-=",
        "*=",
        "/=",
        "and",
        "or",
        "not",
        "in",
        "is",
    },
    # Delimiters
    "DELIMITER": {"(", ")", "{", "}", "[", "]", ";", ",", ":", ".", "..."},
    # Literals
    "LITERAL": {
        "null",
        "None",
        "True",
        "False",
        "true",
        "false",
        "nil",
        "undefined",
        "self",
        "this",
        "super",
    },
    # Numbers (detected by pattern)
    "NUMBER": set(),  # Detected by regex
    # Strings (detected by pattern)
    "STRING": set(),  # Detected by quotes
    # Identifiers (variables - abstracted to 'V')
    "IDENTIFIER": set(),  # All other identifiers
    # Comments (detected by pattern)
    "COMMENT": set(),  # Detected by //, /*, #, """
    # Annotations/Decorators
    "ANNOTATION": {"@"},
    # Lambda/Function keywords
    "FUNCTION": {"function", "func", "lambda", "def", "fn"},
    # Import/Export
    "IMPORT": {
        "import",
        "from",
        "export",
        "include",
        "require",
        "using",
        "package",
        "namespace",
    },
    # Memory/Allocation
    "MEMORY": {"new", "delete", "malloc", "free", "alloc", "sizeof"},
    # Other
    "OTHER": set(),
}


def get_token_type(token: str) -> str:
    """
    Get the type category for a token.

    Args:
        token: The token string

    Returns:
        Token type string (e.g., 'MODIFIER', 'IDENTIFIER')
    """
    token_lower = token.lower()

    # Check each category
    for token_type, tokens in TOKEN_TYPES.items():
        if token_lower in tokens or token in tokens:
            return token_type

    # Check for numbers
    try:
        float(token.replace("_", ""))
        return "NUMBER"
    except ValueError:
        pass

    # Check for strings (quoted)
    if (token.startswith('"') and token.endswith('"')) or (
        token.startswith("'") and token.endswith("'")
    ):
        return "STRING"

    # Check for comments
    if (
        token.startswith("//")
        or token.startswith("/*")
        or token.startswith("#")
        or token.startswith('"""')
    ):
        return "COMMENT"

    # Check for annotations
    if token.startswith("@"):
        return "ANNOTATION"

    # Default to identifier
    return "IDENTIFIER"


def abstract_identifier(token: str) -> str:
    """
    Abstract identifiers to generic 'V' for Type-2 clone handling.

    Args:
        token: The token string

    Returns:
        Abstracted token ('V' for identifiers, original for others)
    """
    token_type = get_token_type(token)
    if token_type == "IDENTIFIER":
        return "V"
    return token
