"""
CIPAS Semantics API Routes for Semantic Code Clone Detection.

This module implements REST API endpoints for comparing code snippets
using semantic analysis for Type-IV clone detection based on Sheneamer et al. (2021).

Semantic Detection (Type-IV):
- Uses 100 semantic features per code snippet (Sheneamer framework)
- XGBoost classification with fused feature vectors (202 features total)
- Detects clones with similar functionality but different implementation
- Supports Java, C, C#, and Python
"""

import logging
from typing import Optional

from fastapi import HTTPException, status

from clone_detection.features.sheneamer_features import SheneamerFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import get_model_path
from schemas import (
    BatchComparisonRequest,
    BatchComparisonResult,
    CloneDetectionRequest,
    CloneDetectionResponse,
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
_feature_extractor: Optional[SheneamerFeatureExtractor] = None


def _get_tokenizer() -> TreeSitterTokenizer:
    """Get or create tokenizer instance."""
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = TreeSitterTokenizer()
    return _tokenizer


def _get_feature_extractor() -> SheneamerFeatureExtractor:
    """Get or create Sheneamer feature extractor."""
    global _feature_extractor
    if _feature_extractor is None:
        _feature_extractor = SheneamerFeatureExtractor()
    return _feature_extractor


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
    Compare two code snippets for semantic clone detection (Type-IV).

    Semantic Detection (Type-IV) based on Sheneamer et al. (2021):
    - Extracts 101 semantic features from each code snippet
    - Fuses features using concatenation (202 features total)
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

        # Get feature extractor
        feature_extractor = _get_feature_extractor()

        # Extract fused semantic features
        fused_features = feature_extractor.extract_fused_features(
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
                clone_type="Type-IV" if is_clone else None,
                pipeline_used="Sheneamer et al. (2021) Type-IV Detector",
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

            # Heuristic threshold for Type-IV
            is_clone = cosine_sim > 0.85
            confidence = float(cosine_sim) if is_clone else 1.0 - float(cosine_sim)

            result = ComparisonResult(
                is_clone=is_clone,
                confidence=confidence,
                clone_type="Type-IV" if is_clone else None,
                pipeline_used="Sheneamer Heuristic (Type-IV)",
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


def detect_clones(request: CloneDetectionRequest) -> CloneDetectionResponse:
    """
    Detect Type-IV code clones using Sheneamer et al. (2021) framework.

    This endpoint accepts two code snippets and returns:
    - is_clone: Boolean indicating if the codes are semantic clones
    - clone_type: Integer (1-4) indicating clone type (always 4 for this detector)
    - confidence: XGBoost probability score

    Feature Extraction (101 features per code snippet):
    - Traditional (11): LOC, keyword category counts
    - Syntactic/CST (40): Non-leaf node frequencies via post-order traversal
    - Semantic/PDG (20): Implicit program dependency relationships
    - Structural Depth (15): Nesting, depth, density metrics
    - Type Signatures (10): Parameter/return type patterns
    - API Fingerprinting (5): Library usage patterns

    Feature Fusion: Linear combination (concatenation) of two feature vectors.

    Args:
        request: Clone detection request with two code snippets

    Returns:
        Clone detection response with prediction results

    Raises:
        HTTPException: If detection fails
    """
    tokenizer = _get_tokenizer()
    language = request.language.value

    try:
        # Tokenize for metadata
        tokens1 = tokenizer.tokenize(request.code1, language, abstract_identifiers=True)
        tokens2 = tokenizer.tokenize(request.code2, language, abstract_identifiers=True)

        # Get feature extractor
        feature_extractor = _get_feature_extractor()

        # Extract fused features (202 total: 101 per code snippet)
        fused_features = feature_extractor.extract_fused_features(
            request.code1, request.code2, language
        )

        # Load pre-trained XGBoost model
        semantic_model = _load_semantic_model()
        model_available = semantic_model is not None and semantic_model.is_trained

        # Predict using XGBoost
        if model_available:
            prediction = semantic_model.predict(fused_features.reshape(1, -1))[0]
            probabilities = semantic_model.predict_proba(fused_features.reshape(1, -1))[
                0
            ]

            is_clone = bool(prediction == 1)
            confidence = float(probabilities[1]) if len(probabilities) > 1 else 0.0

            # Clone type: 4 for Type-IV (semantic)
            clone_type = 4 if is_clone else None
            clone_type_label = "Type-IV (Semantic)" if is_clone else None

        else:
            # Fallback: cosine similarity heuristic
            n_features = len(fused_features) // 2
            features1 = fused_features[:n_features]
            features2 = fused_features[n_features:]

            from numpy import dot, linalg

            cosine_sim = dot(features1, features2) / (
                linalg.norm(features1) * linalg.norm(features2)
            )

            # Heuristic threshold for Type-IV
            is_clone = cosine_sim > 0.85
            confidence = float(cosine_sim) if is_clone else 1.0 - float(cosine_sim)
            clone_type = 4 if is_clone else None
            clone_type_label = "Type-IV (Semantic)" if is_clone else None

        return CloneDetectionResponse(
            is_clone=is_clone,
            confidence=confidence,
            clone_type=clone_type,
            clone_type_label=clone_type_label,
            pipeline_used="Sheneamer et al. (2021) Type-IV Detector",
            features_extracted=len(fused_features),
            feature_categories={
                "traditional": feature_extractor.n_traditional,
                "syntactic_cst": feature_extractor.n_cst,
                "semantic_pdg": feature_extractor.n_semantic,
                "structural_depth": feature_extractor.n_depth,
                "type_signatures": feature_extractor.n_type,
                "api_fingerprinting": feature_extractor.n_api,
            },
            tokens1_count=len(tokens1),
            tokens2_count=len(tokens2),
            model_available=model_available,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clone detection failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clone detection failed: {str(e)}",
        )
