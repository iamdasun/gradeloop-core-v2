"""
Inference module for semantic clone detection
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer

from ..core.config import settings
from .model import SemanticCloneModel, load_model


class SemanticCloneDetector:
    """
    High-level interface for semantic clone detection inference
    """

    def __init__(
        self,
        model_dir: Optional[Path] = None,
        device: Optional[str] = None,
        threshold: Optional[float] = None,
    ):
        """
        Initialize the semantic clone detector

        Args:
            model_dir: Directory containing model files
            device: Device to run inference on
            threshold: Confidence threshold for clone detection
        """
        self.model_dir = model_dir or settings.MODEL_DIR
        self.device = device or settings.DEVICE
        self.threshold = threshold or settings.CLONE_THRESHOLD

        # Load model and tokenizer
        self.model, self.config = self._load_model()
        self.tokenizer = self._load_tokenizer()

    def _load_model(self) -> Tuple[SemanticCloneModel, dict]:
        """Load the trained model"""
        model_path = self.model_dir / "model.pt"
        config_path = self.model_dir / "config.json"

        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")

        return load_model(model_path, config_path, self.device)

    def _load_tokenizer(self) -> AutoTokenizer:
        """Load the tokenizer"""
        tokenizer_dir = self.model_dir / "tokenizer"
        model_name = self.config.get("model_name", settings.MODEL_NAME)

        if tokenizer_dir.exists():
            try:
                return AutoTokenizer.from_pretrained(str(tokenizer_dir))
            except Exception:
                # Local tokenizer files are missing or corrupted – fall back to HuggingFace
                pass

        return AutoTokenizer.from_pretrained(model_name)

    def _tokenize_pair(
        self, code1: str, code2: str, max_length: Optional[int] = None
    ) -> Dict[str, torch.Tensor]:
        """
        Tokenize a pair of code snippets

        Args:
            code1: First code snippet
            code2: Second code snippet
            max_length: Maximum token length

        Returns:
            Dictionary with tokenized inputs
        """
        max_len = max_length or self.config.get("max_length", settings.MAX_LENGTH)

        # Tokenize first code snippet
        encoding1 = self.tokenizer(
            code1,
            max_length=max_len,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        # Tokenize second code snippet
        encoding2 = self.tokenizer(
            code2,
            max_length=max_len,
            padding="max_length",
            truncation=True,
            return_tensors="pt",
        )

        return {
            "input_ids1": encoding1["input_ids"].to(self.device),
            "attention_mask1": encoding1["attention_mask"].to(self.device),
            "input_ids2": encoding2["input_ids"].to(self.device),
            "attention_mask2": encoding2["attention_mask"].to(self.device),
        }

    def predict(self, code1: str, code2: str) -> Dict[str, float]:
        """
        Predict whether two code snippets are semantic clones

        Args:
            code1: First code snippet
            code2: Second code snippet

        Returns:
            Dictionary with prediction results:
            - is_clone: Boolean prediction
            - confidence: Confidence score (0-1)
            - clone_probability: Probability of being a clone
            - not_clone_probability: Probability of not being a clone
        """
        # Tokenize input
        inputs = self._tokenize_pair(code1, code2)

        # Run inference
        with torch.no_grad():
            logits = self.model(
                inputs["input_ids1"],
                inputs["attention_mask1"],
                inputs["input_ids2"],
                inputs["attention_mask2"],
            )

            # Get probabilities
            probs = F.softmax(logits, dim=1)

            # Extract probabilities
            not_clone_prob = probs[0, 0].item()
            clone_prob = probs[0, 1].item()

            # Make prediction
            is_clone = clone_prob >= self.threshold

        return {
            "is_clone": is_clone,
            "confidence": float(max(not_clone_prob, clone_prob)),
            "clone_probability": clone_prob,
            "not_clone_probability": not_clone_prob,
        }

    def predict_batch(
        self, pairs: List[Tuple[str, str]], batch_size: int = 16
    ) -> List[Dict[str, float]]:
        """
        Predict for multiple pairs of code snippets

        Args:
            pairs: List of (code1, code2) tuples
            batch_size: Batch size for inference

        Returns:
            List of prediction results for each pair
        """
        results = []

        for i in range(0, len(pairs), batch_size):
            batch_pairs = pairs[i : i + batch_size]

            # Tokenize all pairs in batch
            batch_inputs = []
            for code1, code2 in batch_pairs:
                inputs = self._tokenize_pair(code1, code2)
                batch_inputs.append(inputs)

            # Stack inputs for batch processing
            if not batch_inputs:
                continue

            input_ids1 = torch.cat([b["input_ids1"] for b in batch_inputs], dim=0)
            attention_mask1 = torch.cat(
                [b["attention_mask1"] for b in batch_inputs], dim=0
            )
            input_ids2 = torch.cat([b["input_ids2"] for b in batch_inputs], dim=0)
            attention_mask2 = torch.cat(
                [b["attention_mask2"] for b in batch_inputs], dim=0
            )

            # Run inference
            with torch.no_grad():
                logits = self.model(
                    input_ids1, attention_mask1, input_ids2, attention_mask2
                )

                probs = F.softmax(logits, dim=1)

                for j in range(len(batch_pairs)):
                    not_clone_prob = probs[j, 0].item()
                    clone_prob = probs[j, 1].item()
                    is_clone = clone_prob >= self.threshold

                    results.append(
                        {
                            "is_clone": is_clone,
                            "confidence": float(max(not_clone_prob, clone_prob)),
                            "clone_probability": clone_prob,
                            "not_clone_probability": not_clone_prob,
                        }
                    )

        return results

    def get_similarity_score(self, code1: str, code2: str) -> float:
        """
        Get raw similarity score between two code snippets

        Args:
            code1: First code snippet
            code2: Second code snippet

        Returns:
            Similarity score (0-1, where 1 means identical semantics)
        """
        result = self.predict(code1, code2)
        return result["clone_probability"]
