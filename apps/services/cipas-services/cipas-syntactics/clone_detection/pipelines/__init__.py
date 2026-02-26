"""
Tiered Detection Pipeline for Syntactic Clone Detection.

This module implements the tiered detection strategy with automatic cascade:
- Phase One: NiCad-Style Normalization (Type-1 & Type-2)
  - Pass A: Literal comparison (Jaccard, Levenshtein >= 0.98) -> Type-1
  - Pass B: Blinded comparison (>= 0.95) -> Type-2
- Phase Two: TOMA Approach (Type-3)
  - Token Frequency Vector + Token Sequence Stream
  - 6 core syntactic features fed to Random Forest

Output Constraints:
- normalization_level: Literal, Blinded, or Token-based
- Confidence: 1.0 for Type-1, ~0.95 for Type-2, RF probability for Type-3
- Pipeline breaks early when a clone type is confirmed
"""

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

from ..features.syntactic_features import SyntacticFeatureExtractor
from ..models.classifiers import SyntacticClassifier
from ..normalizers.structural_normalizer import (
    NormalizationLevel,
    StructuralNormalizer,
)
from ..tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer


@dataclass
class TieredDetectionResult:
    """Result from tiered detection pipeline."""

    is_clone: bool
    confidence: float
    clone_type: str
    normalization_level: str
    jaccard_similarity: float
    levenshtein_ratio: float
    syntactic_features: Optional[np.ndarray] = None
    blinded_code1: Optional[str] = None
    blinded_code2: Optional[str] = None
    normalized_code1: Optional[str] = None
    normalized_code2: Optional[str] = None


class TieredPipeline:
    """
    Tiered detection pipeline for syntactic clone detection.

    Implements a three-tier cascade strategy:
    1. Type-1: Literal comparison with high threshold (>=0.98)
    2. Type-2: Blinded comparison with medium threshold (>=0.95) + token count delta <=5%
    3. Type-3: TOMA features with Random Forest classification
    4. Non-clone: If all tiers fail to confirm a clone
    """

    def __init__(
        self,
        normalizer: Optional[StructuralNormalizer] = None,
        tokenizer: Optional[TreeSitterTokenizer] = None,
        feature_extractor: Optional[SyntacticFeatureExtractor] = None,
        classifier: Optional[SyntacticClassifier] = None,
    ):
        """
        Initialize the tiered pipeline.

        Args:
            normalizer: Structural normalizer for NiCad-style normalization
            tokenizer: Tree-sitter tokenizer
            feature_extractor: Syntactic feature extractor
            classifier: Pre-trained Random Forest classifier (Type-3)
        """
        self.normalizer = normalizer or StructuralNormalizer()
        self.tokenizer = tokenizer or TreeSitterTokenizer()
        self.feature_extractor = feature_extractor or SyntacticFeatureExtractor()
        self.classifier = classifier

    def detect(
        self,
        code1: str,
        code2: str,
        language: str,
        abstract_identifiers: bool = True,
    ) -> TieredDetectionResult:
        """
        Run tiered detection on two code snippets using automatic cascade.

        Detection Flow:
        1. Type-1: Literal comparison (threshold >= 0.98)
        2. Type-2: Blinded comparison (threshold >= 0.95, token delta <= 5%)
        3. Type-3: TOMA features + Random Forest
        4. Non-clone: If all tiers fail

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language
            abstract_identifiers: Whether to abstract identifiers for tokenization

        Returns:
            TieredDetectionResult with clone type and confidence
        """
        # Phase One: NiCad-Style Normalization (Type-1 and Type-2)
        result = self._phase_one_normalization(code1, code2, language)

        # Early exit if Type-1 or Type-2 was detected
        if result.clone_type in ["Type-1", "Type-2"]:
            return result

        # Phase Two: TOMA Approach for Type-3
        result = self._phase_two_toma(code1, code2, language, abstract_identifiers)

        # Early exit if Type-3 was detected
        if result.clone_type == "Type-3":
            return result

        # Not a syntactic clone
        return result

    def _phase_one_normalization(
        self, code1: str, code2: str, language: str
    ) -> TieredDetectionResult:
        """
        Phase One: NiCad-Style Normalization for Type-1 and Type-2 detection.

        Pass A: Literal comparison (no renaming)
        Pass B: Blinded comparison (identifiers and literals abstracted)

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language

        Returns:
            TieredDetectionResult (Type-1, Type-2, or continues to Phase Two)
        """
        # Pass A: Literal comparison
        jaccard_lit, lev_lit, norm1, norm2 = self.normalizer.compare_literal(
            code1, code2, language
        )

        # Type-1 detection: Both metrics must exceed threshold
        if (
            jaccard_lit >= self.normalizer.TYPE_1_JACCARD_THRESHOLD
            and lev_lit >= self.normalizer.TYPE_1_LEVENSHTEIN_THRESHOLD
        ):
            return TieredDetectionResult(
                is_clone=True,
                confidence=1.0,
                clone_type="Type-1",
                normalization_level=NormalizationLevel.LITERAL.value,
                jaccard_similarity=jaccard_lit,
                levenshtein_ratio=lev_lit,
                normalized_code1=norm1,
                normalized_code2=norm2,
            )

        # Pass B: Blinded comparison
        jaccard_blind, lev_blind, blind1, blind2 = self.normalizer.compare_blinded(
            code1, code2, language
        )

        # Type-2 detection: Maximum similarity exceeds threshold
        max_similarity = max(jaccard_blind, lev_blind)

        if max_similarity >= self.normalizer.TYPE_2_THRESHOLD:
            # Token Count Delta Constraint: Prevent Type-2 Logic Leak
            # Calculate token counts from blinded code
            tokens1 = blind1.split()
            tokens2 = blind2.split()
            count1, count2 = len(tokens1), len(tokens2)

            # Calculate length difference ratio
            max_count = max(count1, count2)
            if max_count > 0:
                length_diff_ratio = abs(count1 - count2) / max_count
            else:
                length_diff_ratio = 0.0

            # Type-2 requires both high similarity AND minimal length difference (≤5%)
            # If length differs by >5%, force fallthrough to Phase Two (TOMA + Random Forest)
            # even if similarity is high, as this indicates structural changes
            if length_diff_ratio <= 0.05:
                # Confidence scales from 0.95 to 0.99 based on similarity
                confidence = (
                    0.95 + (max_similarity - self.normalizer.TYPE_2_THRESHOLD) * 0.1
                )
                confidence = min(confidence, 0.99)

                return TieredDetectionResult(
                    is_clone=True,
                    confidence=confidence,
                    clone_type="Type-2",
                    normalization_level=NormalizationLevel.BLINDED.value,
                    jaccard_similarity=jaccard_blind,
                    levenshtein_ratio=lev_blind,
                    blinded_code1=blind1,
                    blinded_code2=blind2,
                )

        # Not Type-1 or Type-2, continue to Phase Two
        # This includes cases where:
        # 1. Similarity < threshold, OR
        # 2. Similarity >= threshold BUT length_diff_ratio > 0.05 (Type-2 Logic Leak prevention)
        return TieredDetectionResult(
            is_clone=False,
            confidence=0.0,
            clone_type="Type-3",
            normalization_level=NormalizationLevel.TOKEN_BASED.value,
            jaccard_similarity=jaccard_blind,
            levenshtein_ratio=lev_blind,
        )

    def _phase_two_toma(
        self, code1: str, code2: str, language: str, abstract_identifiers: bool
    ) -> TieredDetectionResult:
        """
        Phase Two: TOMA Approach for Type-3 detection.

        Uses Token Frequency Vector and Token Sequence Stream
        with Random Forest classification.

        Args:
            code1: First code snippet
            code2: Second code snippet
            language: Programming language
            abstract_identifiers: Whether to abstract identifiers

        Returns:
            TieredDetectionResult with Type-3 classification
        """
        # Tokenize with abstraction
        tokens1 = self.tokenizer.tokenize(
            code1, language, abstract_identifiers=abstract_identifiers
        )
        tokens2 = self.tokenizer.tokenize(
            code2, language, abstract_identifiers=abstract_identifiers
        )

        # Extract 6 core syntactic features
        features = self.feature_extractor.extract_features(tokens1, tokens2)

        # Use Random Forest classifier if available
        if self.classifier is not None and self.classifier.is_trained:
            try:
                prediction = self.classifier.predict(features.reshape(1, -1))[0]
                probabilities = self.classifier.predict_proba(features.reshape(1, -1))[
                    0
                ]

                is_clone = bool(prediction == 1)
                confidence = float(probabilities[1]) if len(probabilities) > 1 else 0.0

                return TieredDetectionResult(
                    is_clone=is_clone,
                    confidence=confidence,
                    clone_type="Type-3" if is_clone else "Not Clone",
                    normalization_level=NormalizationLevel.TOKEN_BASED.value,
                    jaccard_similarity=float(features[0]),
                    levenshtein_ratio=float(features[3]),
                    syntactic_features=features,
                )
            except Exception as e:
                # Fallback to threshold-based detection if classifier fails
                logger = logging.getLogger(__name__)
                logger.warning(f"Classifier failed: {e}, using fallback")

        # Fallback: Threshold-based Type-3 detection
        jaccard = float(features[0])
        lev_ratio = float(features[3])

        # Type-3 threshold (modified clones) - more conservative
        type3_threshold = 0.6

        # Require both metrics to indicate similarity for fallback
        is_clone = jaccard >= type3_threshold and lev_ratio >= 70.0

        # Confidence based on how far above threshold
        if is_clone:
            confidence = max(jaccard, lev_ratio / 100.0)
        else:
            confidence = 1.0 - max(jaccard, lev_ratio / 100.0)

        return TieredDetectionResult(
            is_clone=is_clone,
            confidence=confidence,
            clone_type="Type-3" if is_clone else "Not Clone",
            normalization_level=NormalizationLevel.TOKEN_BASED.value,
            jaccard_similarity=jaccard,
            levenshtein_ratio=lev_ratio,
            syntactic_features=features,
        )


def get_tiered_pipeline(
    classifier: Optional[SyntacticClassifier] = None,
) -> TieredPipeline:
    """
    Get a configured tiered pipeline instance.

    Args:
        classifier: Optional pre-trained Random Forest classifier (Type-3)

    Returns:
        Configured TieredPipeline instance
    """
    return TieredPipeline(classifier=classifier)
