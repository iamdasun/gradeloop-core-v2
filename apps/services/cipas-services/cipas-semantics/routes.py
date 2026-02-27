"""
CIPAS Semantics API Routes for Semantic Code Clone Detection.

This module implements REST API endpoints for comparing code snippets
using semantic analysis for Type-4 clone detection.

Semantic Detection (Type-4):
- Uses 100+ semantic features per code snippet
- XGBoost classification with fused feature vectors
- Detects clones with similar functionality but different implementation
"""

import logging
from typing import Optional

from fastapi import HTTPException, status

from clone_detection.features.semantic_features import SemanticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
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
    SemanticFeatures,
    TokenizeRequest,
    TokenizeResponse,
)

logger = logging.getLogger(__name__)

# ============================================================================
# Global Model Instances (lazy loaded)
# ============================================================================

_semantic_model: Optional[SemanticClassifier] = None
_tokenizer: Optional[TreeSitterTokenizer] = None
_semantic_extractor: Optional[SemanticFeatureExtractor] = None


def _get_tokenizer() -> TreeSitterTokenizer:
    """Get or create tokenizer instance."""
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = TreeSitterTokenizer()
    return _tokenizer


def _get_semantic_extractor() -> SemanticFeatureExtractor:
    """Get or create semantic feature extractor."""
    global _semantic_extractor
    if _semantic_extractor is None:
        _semantic_extractor = SemanticFeatureExtractor()
    return _semantic_extractor


def _load_semantic_model() -> Optional[SemanticClassifier]:
    """Load semantic model if available."""
    global _semantic_model
    if _semantic_model is None:
        try:
            model_path = get_model_path("type4_xgb.pkl")
            if model_path.exists():
                _semantic_model = SemanticClassifier.load("type4_xgb.pkl")
                logger.info("Semantic model (Type-4) loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load semantic model: {e}")
            _semantic_model = None
    return _semantic_model


def _get_model_status() -> dict[str, ModelStatus]:
    """Get status of all models."""
    models = {}

    # Semantic model (Type-4)
    semantic_path = get_model_path("type4_xgb.pkl")
    semantic_available = semantic_path.exists()
    semantic_loaded = _semantic_model is not None and _semantic_model.is_trained

    models["semantic_type4"] = ModelStatus(
        model_name="type4_xgb.pkl",
        available=semantic_available,
        loaded=semantic_loaded,
        error=None if semantic_available else "Model file not found",
    )

    return models


def compare_codes(
    request: ComparisonRequest,
) -> ComparisonResult:
    """
    Compare two code snippets for semantic clone detection (Type-4).

    Semantic Detection (Type-4):
    - Extracts 100+ semantic features from each code snippet
    - Fuses features using concatenation (204 features total)
    - Uses XGBoost classification for clone detection
    - Detects clones with similar functionality but different implementation

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

        # Get semantic extractor
        semantic_extractor = _get_semantic_extractor()

        # Extract fused semantic features
        fused_features = semantic_extractor.extract_fused_features(
            request.code1, request.code2, language
        )

        # Load semantic model
        semantic_model = _load_semantic_model()

        # Predict using XGBoost
        if semantic_model is not None and semantic_model.is_trained:
            prediction = semantic_model.predict(fused_features.reshape(1, -1))[0]
            probabilities = semantic_model.predict_proba(fused_features.reshape(1, -1))[
                0
            ]

            is_clone = bool(prediction == 1)
            confidence = float(probabilities[1]) if len(probabilities) > 1 else 0.0

            result = ComparisonResult(
                is_clone=is_clone,
                confidence=confidence,
                clone_type="Type-4" if is_clone else None,
                pipeline_used="Semantic XGBoost (Type-4)",
                normalization_level="Token-based",
                tokens1_count=len(tokens1),
                tokens2_count=len(tokens2),
                semantic_features=SemanticFeatures(feature_count=len(fused_features)),
            )
        else:
            # Fallback: Use feature similarity heuristic
            # Split fused features back into two sets
            n_features = len(fused_features) // 2
            features1 = fused_features[:n_features]
            features2 = fused_features[n_features:]

            # Calculate cosine similarity as fallback
            from numpy import dot, linalg

            cosine_sim = dot(features1, features2) / (
                linalg.norm(features1) * linalg.norm(features2)
            )

            # Heuristic threshold for Type-4
            is_clone = cosine_sim > 0.85
            confidence = float(cosine_sim) if is_clone else 1.0 - float(cosine_sim)

            result = ComparisonResult(
                is_clone=is_clone,
                confidence=confidence,
                clone_type="Type-4" if is_clone else None,
                pipeline_used="Semantic Heuristic (Type-4)",
                normalization_level="Token-based",
                tokens1_count=len(tokens1),
                tokens2_count=len(tokens2),
                semantic_features=SemanticFeatures(feature_count=len(fused_features)),
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
                    pipeline_used="Semantic XGBoost (Type-4)",
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
        service="cipas-semantics",
        version="0.1.0",
        models=_get_model_status(),
    )


def get_feature_importance() -> FeatureImportanceResponse:
    """
    Get feature importance from trained semantic model.

    Returns:
        Feature importance scores

    Raises:
        HTTPException: If model is not available
    """
    model = _load_semantic_model()
    if model is None or not model.is_trained:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Semantic model not available",
        )

    importance_list = model.get_feature_importance(top_n=20)
    importance_dict = {name: float(score) for name, score in importance_list}
    return FeatureImportanceResponse(model="type4_xgb.pkl", features=importance_dict)


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
