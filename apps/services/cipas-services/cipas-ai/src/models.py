"""
AI Detection Model for CIPAS Service.
Loads and runs the UniXcoder-based classifier for AI code detection.
"""

from pathlib import Path
from typing import Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoModel, AutoTokenizer


class UniXcoderClassifier(nn.Module):
    """
    UniXcoder-based classifier for AI code detection.
    Architecture matches the trained model from training scripts.
    """

    def __init__(self, base_model_name: str = "microsoft/unixcoder-base"):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(base_model_name)
        self.config = self.encoder.config
        self.classifier = nn.Linear(self.config.hidden_size, 2)

    def forward(self, input_ids=None, attention_mask=None, labels=None, **kwargs):
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        features = outputs.last_hidden_state[:, 0, :]
        logits = self.classifier(features)

        loss = None
        if labels is not None:
            ce = F.cross_entropy(logits, labels)
            loss = ce

        return {"loss": loss, "logits": logits}


class AIDetectionModel:
    """
    High-level wrapper for AI detection inference.
    Handles model loading, tokenization, and prediction.
    """

    def __init__(self, model_dir: str, device: str = None):
        self.model_dir = Path(model_dir)
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.tokenizer = None
        self.max_length = 256

    def load(self) -> None:
        """Load the model and tokenizer from disk."""
        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))

        # Load model architecture
        self.model = UniXcoderClassifier()

        # Load trained weights
        model_path = self.model_dir / "pytorch_model.bin"
        if not model_path.exists():
            raise FileNotFoundError(f"Model weights not found at {model_path}")

        state_dict = torch.load(model_path, map_location=self.device, weights_only=True)

        # Clean state dict (remove compiled prefixes if present)
        clean_state_dict = {
            k.replace("_orig_mod.", ""): v for k, v in state_dict.items()
        }
        self.model.load_state_dict(clean_state_dict)

        # Move to device and set to eval mode
        self.model.to(self.device)
        self.model.eval()

        # Compile for inference if available (optional optimization)
        if hasattr(torch, "compile") and self.device == "cuda":
            try:
                self.model = torch.compile(self.model)
            except Exception:
                pass  # Compilation is optional

    def predict(self, code: str) -> Tuple[bool, float, float, float]:
        """
        Predict whether code is AI-generated.

        Args:
            code: The code snippet to analyze

        Returns:
            Tuple of (is_ai_generated, confidence, ai_likelihood, human_likelihood)
        """
        if self.model is None or self.tokenizer is None:
            raise RuntimeError("Model not loaded. Call load() first.")

        # Tokenize
        inputs = self.tokenizer(
            code,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt",
        )

        # Move to device
        input_ids = inputs["input_ids"].to(self.device)
        attention_mask = inputs["attention_mask"].to(self.device)

        # Inference
        with torch.no_grad():
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs["logits"]
            probs = torch.softmax(logits, dim=1)[0]

        # Extract probabilities
        human_prob = probs[0].item()
        ai_prob = probs[1].item()

        # Prediction
        is_ai_generated = ai_prob > 0.5
        confidence = max(ai_prob, human_prob)

        return is_ai_generated, confidence, ai_prob, human_prob

    def is_ready(self) -> bool:
        """Check if the model is loaded and ready."""
        return self.model is not None and self.tokenizer is not None
