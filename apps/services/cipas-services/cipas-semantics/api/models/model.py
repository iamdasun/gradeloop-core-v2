"""
Semantic Clone Detection Model
Based on GraphCodeBERT with custom classification head
"""

from pathlib import Path
from typing import Tuple

import torch
import torch.nn as nn
from transformers import AutoModel


class SemanticCloneModel(nn.Module):
    """
    Semantic clone detection model using GraphCodeBERT encoder
    with a custom classification head that combines:
    - Both code embeddings
    - Absolute difference
    - Element-wise product
    """

    def __init__(
        self,
        model_name: str = "microsoft/graphcodebert-base",
        hidden_size: int = 768,
        dropout_rate: float = 0.3,
    ):
        super().__init__()

        # Load pretrained GraphCodeBERT encoder
        self.encoder = AutoModel.from_pretrained(model_name, use_safetensors=True)

        # Classification head
        # Input: [e1, e2, |e1-e2|, e1*e2] = 4 * hidden_size
        combined_size = hidden_size * 4

        self.classifier = nn.Sequential(
            nn.Linear(combined_size, 512),
            nn.LayerNorm(512),
            nn.Dropout(dropout_rate),
            nn.ReLU(),
            nn.Linear(512, 128),
            nn.LayerNorm(128),
            nn.Dropout(dropout_rate * 0.67),
            nn.ReLU(),
            nn.Linear(128, 2),  # Binary classification: [not_clone, clone]
        )

    def forward(
        self,
        input_ids1: torch.Tensor,
        attention_mask1: torch.Tensor,
        input_ids2: torch.Tensor,
        attention_mask2: torch.Tensor,
    ) -> torch.Tensor:
        """
        Forward pass through the model

        Args:
            input_ids1: Token IDs for first code snippet
            attention_mask1: Attention mask for first code snippet
            input_ids2: Token IDs for second code snippet
            attention_mask2: Attention mask for second code snippet

        Returns:
            Logits for binary classification [not_clone, clone]
        """
        # Get CLS token embeddings for both code snippets
        encoder_output1 = self.encoder(input_ids1, attention_mask1)
        encoder_output2 = self.encoder(input_ids2, attention_mask2)

        # Extract CLS token embedding (first token)
        e1 = encoder_output1.last_hidden_state[:, 0, :]  # [batch, hidden_size]
        e2 = encoder_output2.last_hidden_state[:, 0, :]  # [batch, hidden_size]

        # Combine embeddings: [e1, e2, |e1-e2|, e1*e2]
        combined = torch.cat([e1, e2, torch.abs(e1 - e2), e1 * e2], dim=1)

        # Pass through classification head
        logits = self.classifier(combined)

        return logits

    def get_device(self) -> torch.device:
        """Get the current device of the model"""
        return next(self.parameters()).device


def load_model(
    model_path: Path, config_path: Path, device: str = "cuda"
) -> Tuple[SemanticCloneModel, dict]:
    """
    Load trained model from checkpoint

    Args:
        model_path: Path to model checkpoint (.pt file)
        config_path: Path to model configuration file
        device: Device to load model on ('cuda' or 'cpu')

    Returns:
        Tuple of (model, config_dict)
    """
    import json

    # Load configuration
    with open(config_path, "r") as f:
        config = json.load(f)

    # Initialize model
    model = SemanticCloneModel(
        model_name=config.get("model_name", "microsoft/graphcodebert-base"),
        hidden_size=config.get("hidden_size", 768),
        dropout_rate=config.get("dropout_rate", 0.3),
    )

    # Load checkpoint
    checkpoint = torch.load(model_path, map_location=device, weights_only=False)

    # Handle different checkpoint formats
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        model.load_state_dict(checkpoint)

    model = model.to(device)
    model.eval()

    return model, config
