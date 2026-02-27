"""
Tiered Detection Pipeline for Syntactic Code Clone Detection.

Detection flow:
  Type-1  ──► Phase One (NiCAD-style): Literal CST comparison  (≥ 0.98 Jaccard AND Lev.)
  Type-2  ──► Phase One (NiCAD-style): Blinded CST comparison  (≥ 0.95 max-similarity,
                                        token-length delta ≤ 5 %)
  Type-3  ──► Phase Two (ToMa + XGB) : Hybrid String + AST features → XGBoost classifier
  Non-Syntactic ──► Returned when all phases fail (escalate to semantic detection)

NiCAD-style normalization is implemented via Tree-sitter (no external NiCAD tool required):
  - CST-based pretty-printing (one statement per line, standard spacing)
  - Comment / annotation removal
  - Identifier + literal blinding for Type-2 pass
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
    """Result from the tiered detection pipeline."""

    is_clone: bool
    confidence: float
    # Possible values: "Type-1", "Type-2", "Type-3", "Non-Syntactic"
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
    Tiered syntactic clone detection pipeline.

    Detection hierarchy:
      1. Type-1  — Literal CST comparison via NiCAD-style normalizer  (threshold ≥ 0.98)
      2. Type-2  — Blinded CST comparison via NiCAD-style normalizer  (threshold ≥ 0.95,
                   token-length delta ≤ 5 %)
      3. Type-3  — ToMa approach: hybrid String + AST features fed to a trained XGBoost
                   classifier.  Requires a pre-trained model; falls back to threshold-based
                   decision when no model is loaded.
      4. Non-Syntactic — Returned when no syntactic clone is confirmed.  The caller should
                          escalate to a semantic / embedding-based detector.
    """

    def __init__(
        self,
        normalizer: Optional[StructuralNormalizer] = None,
        tokenizer: Optional[TreeSitterTokenizer] = None,
        feature_extractor: Optional[SyntacticFeatureExtractor] = None,
        classifier: Optional[SyntacticClassifier] = None,
    ):
        self.normalizer = normalizer or StructuralNormalizer()
        self.tokenizer = tokenizer or TreeSitterTokenizer()
        self.feature_extractor = feature_extractor or SyntacticFeatureExtractor()
        self.classifier = classifier
        self._logger = logging.getLogger(__name__)

    def detect(
        self,
        code1: str,
        code2: str,
        language: str,
        abstract_identifiers: bool = True,
    ) -> TieredDetectionResult:
        """
        Run the full tiered detection on two code snippets.

        The cascade short-circuits at the first confirmed clone type:
          Type-1 → Type-2 → Type-3 → Non-Syntactic

        Args:
            code1: First source-code snippet.
            code2: Second source-code snippet.
            language: Programming language ('java', 'c', 'python').
            abstract_identifiers: Whether to abstract identifiers during tokenization
                                  (Phase Two).

        Returns:
            TieredDetectionResult describing the outcome.
        """
        # ─── Phase One: NiCAD-style (Type-1 / Type-2) ─────────────────────
        result = self._phase_one_nicad(code1, code2, language)
        if result.clone_type in ("Type-1", "Type-2"):
            return result

        # ─── Phase Two: ToMa + XGBoost (Type-3) ───────────────────────────
        result = self._phase_two_toma(code1, code2, language, abstract_identifiers)
        if result.clone_type == "Type-3":
            return result

        # ─── No syntactic clone detected ──────────────────────────────────
        return TieredDetectionResult(
            is_clone=False,
            confidence=result.confidence,
            clone_type="Non-Syntactic",
            normalization_level=NormalizationLevel.TOKEN_BASED.value,
            jaccard_similarity=result.jaccard_similarity,
            levenshtein_ratio=result.levenshtein_ratio,
            syntactic_features=result.syntactic_features,
        )

    # ──────────────────────────────────────────────────────────────────────
    # Phase One — NiCAD-style normalizer
    # ──────────────────────────────────────────────────────────────────────

    def _phase_one_nicad(
        self, code1: str, code2: str, language: str
    ) -> TieredDetectionResult:
        """
        NiCAD-style tiered comparison for Type-1 and Type-2 detection.

        Pass A (Literal):
            Normalize code without renaming identifiers or literals.
            Threshold: Jaccard ≥ 0.98  AND  Levenshtein ≥ 0.98  → Type-1

        Pass B (Blinded):
            Normalize with identifier/literal abstraction (→ ID / LIT tokens).
            Threshold: max(Jaccard, Levenshtein) ≥ 0.95
                       AND token-length delta ≤ 5 %  → Type-2

        If neither pass confirms a clone, we return a placeholder result
        with clone_type "Type-3" so the caller escalates to Phase Two.
        """
        # Pass A — Literal
        jaccard_lit, lev_lit, norm1, norm2 = self.normalizer.compare_literal(
            code1, code2, language
        )

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

        # Pass B — Blinded
        jaccard_blind, lev_blind, blind1, blind2 = self.normalizer.compare_blinded(
            code1, code2, language
        )

        max_sim = max(jaccard_blind, lev_blind)
        if max_sim >= self.normalizer.TYPE_2_THRESHOLD:
            # Token-length delta guard: prevent Type-2 false positives on
            # structurally different code that happens to share many token types.
            tokens1 = blind1.split()
            tokens2 = blind2.split()
            max_count = max(len(tokens1), len(tokens2))
            length_diff_ratio = (
                abs(len(tokens1) - len(tokens2)) / max_count if max_count > 0 else 0.0
            )

            if length_diff_ratio <= 0.05:
                confidence = min(
                    0.95 + (max_sim - self.normalizer.TYPE_2_THRESHOLD) * 0.1,
                    0.99,
                )
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

        # Not Type-1 or Type-2 — escalate to Phase Two
        return TieredDetectionResult(
            is_clone=False,
            confidence=0.0,
            clone_type="Type-3",  # placeholder; Phase Two will decide
            normalization_level=NormalizationLevel.TOKEN_BASED.value,
            jaccard_similarity=jaccard_blind,
            levenshtein_ratio=lev_blind,
        )

    # ──────────────────────────────────────────────────────────────────────
    # Phase Two — ToMa + XGBoost
    # ──────────────────────────────────────────────────────────────────────

    def _phase_two_toma(
        self,
        code1: str,
        code2: str,
        language: str,
        abstract_identifiers: bool,
    ) -> TieredDetectionResult:
        """
        ToMa approach for Type-3 detection.

        Extracts hybrid String + AST features and feeds them to the
        trained XGBoost classifier.  When no classifier is loaded, falls
        back to a simple threshold-based decision on Jaccard similarity.

        String features (6):
            Jaccard, Dice, Levenshtein distance/ratio, Jaro, Jaro-Winkler
        AST features (4 + N node-type diffs):
            Structural Jaccard, AST depth diff, node count diff/ratio,
            per-node-type distribution diffs

        Returns TieredDetectionResult with clone_type "Type-3" if clone
        detected, otherwise "Non-Syntactic" (caller in detect() will wrap
        this into the final Non-Syntactic result).
        """
        # Extract hybrid features directly from raw code
        try:
            features = self.feature_extractor.extract_features_from_code(
                code1, code2, language
            )
        except Exception as exc:
            self._logger.warning(f"Feature extraction failed: {exc}; using zero features")
            features = np.zeros(len(self.feature_extractor.feature_names))

        # ── Classifier path ──────────────────────────────────────────────
        if self.classifier is not None and self.classifier.is_trained:
            try:
                prediction = self.classifier.predict(features.reshape(1, -1))[0]
                probabilities = self.classifier.predict_proba(features.reshape(1, -1))[0]
                is_clone = bool(prediction == 1)
                confidence = float(probabilities[1]) if len(probabilities) > 1 else 0.0

                return TieredDetectionResult(
                    is_clone=is_clone,
                    confidence=confidence,
                    clone_type="Type-3" if is_clone else "Non-Syntactic",
                    normalization_level=NormalizationLevel.TOKEN_BASED.value,
                    jaccard_similarity=float(features[0]),
                    levenshtein_ratio=float(features[3]),
                    syntactic_features=features,
                )
            except Exception as exc:
                self._logger.warning(
                    f"XGBoost classifier inference failed: {exc}; using threshold fallback"
                )

        # ── Fallback: threshold-based decision ────────────────────────────
        jaccard = float(features[0])
        lev_ratio = float(features[3])

        # Conservative threshold — only flag high-confidence Type-3 clones
        # when the classifier is unavailable.
        TYPE3_THRESHOLD = 0.6
        is_clone = jaccard >= TYPE3_THRESHOLD and lev_ratio >= 0.70

        confidence = max(jaccard, lev_ratio) if is_clone else 1.0 - max(jaccard, lev_ratio)

        return TieredDetectionResult(
            is_clone=is_clone,
            confidence=confidence,
            clone_type="Type-3" if is_clone else "Non-Syntactic",
            normalization_level=NormalizationLevel.TOKEN_BASED.value,
            jaccard_similarity=jaccard,
            levenshtein_ratio=lev_ratio,
            syntactic_features=features,
        )


def get_tiered_pipeline(
    classifier: Optional[SyntacticClassifier] = None,
) -> TieredPipeline:
    """
    Convenience factory: returns a fully initialised TieredPipeline.

    Args:
        classifier: Optional pre-trained XGBoost classifier for Type-3 detection.

    Returns:
        Configured TieredPipeline instance.
    """
    return TieredPipeline(classifier=classifier)
