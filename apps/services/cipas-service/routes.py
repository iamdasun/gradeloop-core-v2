"""
CIPAS API Routes for Code Clone Detection.

This module implements REST API endpoints for comparing code snippets
using syntactic (Pipeline A) and semantic (Pipeline B) analysis.

Tiered Detection Strategy (Pipeline A):
- Phase One: NiCad-Style Normalization
  - Pass A: Literal comparison (Type-1, threshold >= 0.98)
  - Pass B: Blinded comparison (Type-2, threshold >= 0.95)
- Phase Two: TOMA Approach (Type-3)
  - Token Frequency Vector + Random Forest classification

Pipeline B (XGBoost) is NOT triggered if Type-1 or Type-2 is confirmed.
"""

import logging
from typing import Optional

from fastapi import HTTPException, status

from clone_detection.features.semantic_features import SemanticFeatureExtractor
from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.models.classifiers import SemanticClassifier, SyntacticClassifier
from clone_detection.normalizers.structural_normalizer import (
    NormalizationLevel,
    StructuralNormalizer,
)
from clone_detection.pipelines.tiered_pipeline import (
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
    LanguageEnum,
    ModelStatus,
    PipelineEnum,
    SemanticFeatures,
    SyntacticFeatures,
    TokenizeRequest,
    TokenizeResponse,
)

logger = logging.getLogger(__name__)

# ============================================================================
# Global Model Instances (lazy loaded)
# ============================================================================

_syntactic_model: Optional[SyntacticClassifier] = None
_semantic_model: Optional[SemanticClassifier] = None
_tokenizer: Optional[TreeSitterTokenizer] = None
_syntactic_extractor: Optional[SyntacticFeatureExtractor] = None
_semantic_extractor: Optional[SemanticFeatureExtractor] = None
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


def _get_semantic_extractor() -> SemanticFeatureExtractor:
    """Get or create semantic feature extractor."""
    global _semantic_extractor
    if _semantic_extractor is None:
        _semantic_extractor = SemanticFeatureExtractor()
    return _semantic_extractor


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
        # Load syntactic model if not already loaded
        classifier = _load_syntactic_model()
        _tiered_pipeline = TieredPipeline(classifier=classifier)

    return _tiered_pipeline


def _load_syntactic_model() -> Optional[SyntacticClassifier]:
    """Load syntactic model if available."""
    global _syntactic_model
    if _syntactic_model is None:
        try:
            model_path = get_model_path("type3_rf.pkl")
            if model_path.exists():
                _syntactic_model = SyntacticClassifier.load("type3_rf.pkl")
                logger.info("Syntactic model (Type-3) loaded successfully")
        except Exception as e:
            logger.warning(f"Could not load syntactic model: {e}")
            _syntactic_model = None
    return _syntactic_model


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

    # Syntactic model (Type-3)
    syntactic_path = get_model_path("type3_rf.pkl")
    syntactic_available = syntactic_path.exists()
    syntactic_loaded = _syntactic_model is not None and _syntactic_model.is_trained

    models["syntactic_type3"] = ModelStatus(
        model_name="type3_rf.pkl",
        available=syntactic_available,
        loaded=syntactic_loaded,
        error=None if syntactic_available else "Model file not found",
    )

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


def _determine_clone_type(
    syntactic_features: "SyntacticFeatures",
    syntactic_proba: Optional[list[float]] = None,
    semantic_proba: Optional[list[float]] = None,
) -> str:
    """
    Determine the type of clone based on feature analysis.

    Note: This function is deprecated in favor of the tiered pipeline.
    Kept for backward compatibility.

    Args:
        syntactic_features: Extracted syntactic features
        syntactic_proba: Probability scores from syntactic model
        semantic_proba: Probability scores from semantic model

    Returns:
        Clone type string (Type-1, Type-2, Type-3, or Type-4)
    """
    # If both models agree on clone
    if syntactic_proba and semantic_proba:
        syn_conf = syntactic_proba[1] if len(syntactic_proba) > 1 else 0
        sem_conf = semantic_proba[1] if len(semantic_proba) > 1 else 0

        if sem_conf > syn_conf and sem_conf > 0.7:
            return "Type-4"

    # Analyze syntactic features to determine Type-1/2/3
    if syntactic_features:
        # Type-1: Very high similarity across all metrics
        if (
            syntactic_features.jaccard_similarity > 0.9
            and syntactic_features.levenshtein_ratio > 0.95
        ):
            return "Type-1"
        # Type-2: High similarity with some differences (renamed variables)
        elif (
            syntactic_features.jaccard_similarity > 0.7
            and syntactic_features.levenshtein_ratio > 0.8
        ):
            return "Type-2"
        # Type-3: Modified code with lower similarity
        elif syntactic_features.jaccard_similarity > 0.5:
            return "Type-3"

    return "Type-4"


def compare_codes(
    request: ComparisonRequest,
) -> ComparisonResult:
    """
    Compare two code snippets for clone detection using tiered detection.

    Tiered Detection Strategy (Pipeline A):
    - Phase One: NiCad-Style Normalization
      - Pass A: Literal comparison (Type-1, threshold >= 0.98)
      - Pass B: Blinded comparison (Type-2, threshold >= 0.95)
    - Phase Two: TOMA Approach (Type-3)
      - Token Frequency Vector + Random Forest classification

    Pipeline B (XGBoost) is NOT triggered if Type-1 or Type-2 is confirmed.

    Args:
        request: Comparison request with code pairs and pipeline selection

    Returns:
        Comparison result with clone prediction and features

    Raises:
        HTTPException: If models are not available or comparison fails
    """
    tokenizer = _get_tokenizer()
    language = request.language.value

    try:
        # Tokenize both code snippets for metadata
        tokens1 = tokenizer.tokenize(request.code1, language, abstract_identifiers=True)
        tokens2 = tokenizer.tokenize(request.code2, language, abstract_identifiers=True)

        # Initialize result with default values
        result = ComparisonResult(
            is_clone=False,
            confidence=0.0,
            pipeline_used=request.pipeline.value,
            tokens1_count=len(tokens1),
            tokens2_count=len(tokens2),
        )

        # Pipeline A: Syntactic Similarity with Tiered Detection (Type-1/2/3 clones)
        if request.pipeline in [PipelineEnum.SYNTACTIC, PipelineEnum.BOTH]:
            # Use tiered pipeline for Phase One + Phase Two
            tiered_pipeline = _get_tiered_pipeline()

            if tiered_pipeline is None or not tiered_pipeline.classifier.is_trained:
                if request.pipeline == PipelineEnum.SYNTACTIC:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Syntactic model not available. Please train the model first.",
                    )
            else:
                # Run tiered detection
                detection_result = tiered_pipeline.detect(
                    request.code1, request.code2, language, abstract_identifiers=True
                )

                # Update result from tiered detection
                result.is_clone = detection_result.is_clone
                result.confidence = detection_result.confidence
                result.clone_type = (
                    detection_result.clone_type if detection_result.is_clone else None
                )
                result.normalization_level = detection_result.normalization_level

                # Add syntactic features to response
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

                # IMPORTANT: If Type-1 or Type-2 confirmed, skip Pipeline B
                if detection_result.clone_type in ["Type-1", "Type-2"]:
                    # Early return - do not trigger Pipeline B
                    return result

        # Pipeline B: Semantic Similarity (Type-4 clones)
        # Only executed if:
        # 1. Pipeline is SEMANTIC or BOTH
        # 2. Type-1 or Type-2 was NOT confirmed in Pipeline A
        if request.pipeline in [PipelineEnum.SEMANTIC, PipelineEnum.BOTH]:
            semantic_model = _load_semantic_model()
            semantic_extractor = _get_semantic_extractor()

            if semantic_model is None or not semantic_model.is_trained:
                if request.pipeline == PipelineEnum.SEMANTIC:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Semantic model not available. Please train the model first.",
                    )
            else:
                # Extract semantic features
                fused_features = semantic_extractor.extract_fused_features(
                    request.code1, request.code2, language
                )

                # Predict
                prediction = semantic_model.predict(fused_features.reshape(1, -1))[0]
                probabilities = semantic_model.predict_proba(
                    fused_features.reshape(1, -1)
                )[0]

                sem_confidence = (
                    float(probabilities[1]) if len(probabilities) > 1 else 0.0
                )

                # For BOTH pipeline, use semantic if higher confidence
                if request.pipeline == PipelineEnum.BOTH:
                    if sem_confidence > result.confidence:
                        result.is_clone = bool(prediction == 1)
                        result.confidence = sem_confidence
                        result.clone_type = "Type-4" if result.is_clone else None
                        result.normalization_level = (
                            NormalizationLevel.TOKEN_BASED.value
                        )
                else:
                    result.is_clone = bool(prediction == 1)
                    result.confidence = sem_confidence
                    result.clone_type = "Type-4" if result.is_clone else None
                    result.normalization_level = NormalizationLevel.TOKEN_BASED.value

                # Add semantic features metadata
                result.semantic_features = SemanticFeatures(
                    feature_count=len(fused_features)
                )

        # Fallback if no pipeline was executed
        if result.confidence == 0.0:
            result.confidence = 0.0
            result.is_clone = False

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
                    pipeline_used=pair_request.pipeline.value,
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
        service="cipas-service",
        version="0.1.0",
        models=_get_model_status(),
    )


def get_feature_importance(pipeline: PipelineEnum) -> FeatureImportanceResponse:
    """
    Get feature importance from trained models.

    Args:
        pipeline: Which pipeline's model to query

    Returns:
        Feature importance scores

    Raises:
        HTTPException: If model is not available
    """
    if pipeline == PipelineEnum.SYNTACTIC:
        model = _load_syntactic_model()
        if model is None or not model.is_trained:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Syntactic model not available",
            )

        importance = model.get_feature_importance()
        return FeatureImportanceResponse(model="type3_rf.pkl", features=importance)

    elif pipeline == PipelineEnum.SEMANTIC:
        model = _load_semantic_model()
        if model is None or not model.is_trained:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Semantic model not available",
            )

        importance_list = model.get_feature_importance(top_n=20)
        importance_dict = {name: float(score) for name, score in importance_list}
        return FeatureImportanceResponse(
            model="type4_xgb.pkl", features=importance_dict
        )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pipeline must be 'syntactic' or 'semantic'",
        )


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
