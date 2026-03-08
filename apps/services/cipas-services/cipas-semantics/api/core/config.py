"""
Configuration settings for Semantic Clone Detection API
"""

import os
from pathlib import Path
from typing import Optional


class Settings:
    """Application settings loaded from environment variables"""

    # API Settings
    API_TITLE: str = "Semantic Clone Detection API"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = (
        "FastAPI service for detecting semantic clones in code using GraphCodeBERT"
    )

    # Server Settings
    HOST: str = os.getenv("API_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("API_PORT", "8000"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Model Settings
    MODEL_DIR: Path = Path(__file__).parent.parent.parent / "model"
    MODEL_NAME: str = "microsoft/graphcodebert-base"
    MAX_LENGTH: int = 512
    HIDDEN_SIZE: int = 768
    DROPOUT_RATE: float = 0.3

    # Hardware Settings
    DEVICE: str = os.getenv(
        "DEVICE", "cuda" if os.getenv("USE_CUDA", "true").lower() == "true" else "cpu"
    )
    USE_MIXED_PRECISION: bool = (
        os.getenv("USE_MIXED_PRECISION", "true").lower() == "true"
    )

    # Threshold Settings
    CLONE_THRESHOLD: float = float(os.getenv("CLONE_THRESHOLD", "0.5"))

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    @classmethod
    def load_model_config(cls) -> dict:
        """Load model configuration from config.json if available"""
        config_path = cls.MODEL_DIR / "config.json"
        if config_path.exists():
            import json

            with open(config_path, "r") as f:
                return json.load(f)
        return {
            "model_name": cls.MODEL_NAME,
            "max_length": cls.MAX_LENGTH,
            "hidden_size": cls.HIDDEN_SIZE,
            "dropout_rate": cls.DROPOUT_RATE,
        }


settings = Settings()
