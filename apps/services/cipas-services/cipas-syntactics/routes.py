"""
CIPAS Syntactics API Routes for Syntactic Code Clone Detection.

This module implements REST API endpoints for comparing code snippets
using the automatic cascade detection pipeline:

  Type-1 → Phase One (NiCAD-style) : Literal CST comparison  (threshold ≥ 0.98)
  Type-2 → Phase One (NiCAD-style) : Blinded CST comparison  (threshold ≥ 0.95, token delta ≤ 5 %)
  Type-3 → Phase Two (ToMa + XGB)  : Hybrid String + AST features → XGBoost classifier
  Non-Syntactic → returned when no syntactic clone is confirmed
"""

import logging
from typing import Optional

from fastapi import HTTPException, status

from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.normalizers.structural_normalizer import (
    NormalizationLevel,
    StructuralNormalizer,
)
from clone_detection.pipelines import (
    TieredDetectionResult,
    TieredPipeline,
)
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import get_model_path
from schemas import (
    BatchComparisonRequest,
    BatchComparisonResult,
    ComparisonRequest,
    ComparisonResult,
    FeatureImportanceResponse,
    HealthResponse,
    ModelStatus,
    TokenizeRequest,
    TokenizeResponse,
)

logger = logging.getLogger(__name__)

# ============================================================================
# Global Model Instances (lazy loaded)
# ============================================================================

_syntactic_model: Optional[SyntacticClassifier] = None
_tokenizer: Optional[TreeSitterTokenizer] = None
_syntactic_extractor: Optional[SyntacticFeatureExtractor] = None
_normalizer: Optional[StructuralNormalizer] = None
_tiered_pipeline: Optional[TieredPipeline] = None


def _get_tokenizer() -> TreeSitterTokenizer:
    """Get or create tokenizer instance."""
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = TreeSitterTokenizer()
    return _tokenizer


def _get_syntactic_extractor() -> SyntacticFeatureExtractor:
    """Get or create syntactic feature extractor."""
    global _syntactic_extractor
    if _syntactic_extractor is None:
        _syntactic_extractor = SyntacticFeatureExtractor()
    return _syntactic_extractor


def _get_normalizer() -> StructuralNormalizer:
    """Get or create structural normalizer."""
    global _normalizer
    if _normalizer is None:
        _normalizer = StructuralNormalizer()
    return _normalizer


def _get_tiered_pipeline() -> TieredPipeline:
    """Get or create tiered pipeline with loaded classifier."""
    global _tiered_pipeline, _syntactic_model

    if _tiered_pipeline is None:
        # Load syntactic model (Type-3)
        syntactic_classifier = _load_syntactic_model()

        _tiered_pipeline = TieredPipeline(classifier=syntactic_classifier)

    return _tiered_pipeline


def _load_syntactic_model() -> Optional[SyntacticClassifier]:
    """Load the Type-3 XGBoost model if available."""
    global _syntactic_model
    if _syntactic_model is None:
        try:
            model_path = get_model_path("type3_xgb.pkl")
            if model_path.exists():
                _syntactic_model = SyntacticClassifier.load("type3_xgb.pkl")
                logger.info("Type-3 XGBoost model loaded successfully")
            else:
                logger.warning(
                    "Type-3 model not found (type3_xgb.pkl). "
                    "Run 'poetry run python train.py' to train it."
                )
        except Exception as exc:
            logger.warning(f"Could not load Type-3 model: {exc}")
            _syntactic_model = None
    return _syntactic_model


def _get_model_status() -> dict[str, ModelStatus]:
    """Get status of all models."""
    models = {}

    # Type-3 XGBoost model
    model_path = get_model_path("type3_xgb.pkl")
    available = model_path.exists()
    loaded = _syntactic_model is not None and _syntactic_model.is_trained

    models["syntactic_type3"] = ModelStatus(
        model_name="type3_xgb.pkl",
        available=available,
        loaded=loaded,
        error=None if available else "Model file not found — run train.py",
    )

    return models


def compare_codes(
    request: ComparisonRequest,
) -> ComparisonResult:
    """
    Compare two code snippets for clone detection using the tiered pipeline.

    Detection cascade:
      Type-1        → NiCAD-style literal CST comparison  (threshold ≥ 0.98)
      Type-2        → NiCAD-style blinded CST comparison  (threshold ≥ 0.95)
      Type-3        → ToMa + XGBoost (String + AST features)
      Non-Syntactic → returned when no syntactic clone is confirmed

    Early exit occurs as soon as a clone type is confirmed.

    Args:
        request: Comparison request with code pairs

    Returns:
        Comparison result with clone prediction and features

    Raises:
        HTTPException: If comparison fails
    """
    tokenizer = _get_tokenizer()
    language = request.language.value

    try:
        # Tokenize both code snippets for metadata
        tokens1 = tokenizer.tokenize(request.code1, language, abstract_identifiers=True)
        tokens2 = tokenizer.tokenize(request.code2, language, abstract_identifiers=True)

        # Get tiered pipeline with classifier loaded
        tiered_pipeline = _get_tiered_pipeline()

        # Run automatic cascade detection
        detection_result = tiered_pipeline.detect(
            request.code1, request.code2, language, abstract_identifiers=True
        )

        # Build response from detection result
        result = ComparisonResult(
            is_clone=detection_result.is_clone,
            confidence=detection_result.confidence,
            clone_type=(
                detection_result.clone_type
                if detection_result.is_clone
                else None
            ),
            pipeline_used="Syntactic Cascade (Type-1 → Type-2 → Type-3)",
            normalization_level=detection_result.normalization_level,
            tokens1_count=len(tokens1),
            tokens2_count=len(tokens2),
        )

        # Add syntactic features if available
        if detection_result.syntactic_features is not None:
            features = detection_result.syntactic_features
            result.syntactic_features = SyntacticFeatures(
                jaccard_similarity=float(features[0]),
                dice_coefficient=float(features[1]),
                levenshtein_distance=int(features[2]),
                levenshtein_ratio=float(features[3]),
                jaro_similarity=float(features[4]),
                jaro_winkler_similarity=float(features[5]),
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing codes: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Comparison failed: {str(e)}",
        )


def compare_codes_batch(
    request: BatchComparisonRequest,
) -> BatchComparisonResult:
    """
    Compare multiple code pairs in batch.

    Args:
        request: Batch comparison request

    Returns:
        Batch comparison results
    """
    results = []

    for pair_request in request.pairs:
        try:
            result = compare_codes(pair_request)
            results.append(result)
        except Exception as e:
            # Add error result for this pair
            results.append(
                ComparisonResult(
                    is_clone=False,
                    confidence=0.0,
                    pipeline_used="Syntactic Cascade (Type-1/2/3)",
                    clone_type=None,
                )
            )
            logger.warning(f"Batch comparison failed for pair: {e}")

    return BatchComparisonResult(results=results, total_pairs=len(results))


def get_health() -> HealthResponse:
    """
    Get service health status.

    Returns:
        Health check response with model status
    """
    return HealthResponse(
        status="healthy",
        service="cipas-syntactics",
        version="0.1.0",
        models=_get_model_status(),
    )


def get_feature_importance() -> FeatureImportanceResponse:
    """
    Get feature importance from the trained Type-3 XGBoost model.

    Returns:
        Feature importance scores

    Raises:
        HTTPException: If model is not available
    """
    model = _load_syntactic_model()
    if model is None or not model.is_trained:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Type-3 model not available — run 'python train.py' to train it.",
        )

    importance = model.get_feature_importance()
    return FeatureImportanceResponse(model="type3_xgb.pkl", features=importance)


def tokenize_code(request: TokenizeRequest) -> TokenizeResponse:
    """
    Tokenize source code using Tree-sitter.

    Args:
        request: Tokenization request

    Returns:
        Tokenization result

    Raises:
        HTTPException: If tokenization fails
    """
    try:
        tokenizer = _get_tokenizer()
        tokens = tokenizer.tokenize(
            request.code,
            request.language.value,
            abstract_identifiers=request.abstract_identifiers,
        )

        return TokenizeResponse(
            tokens=tokens,
            token_count=len(tokens),
            language=request.language.value,
        )

    except Exception as e:
        logger.error(f"Tokenization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tokenization failed: {str(e)}",
        )
