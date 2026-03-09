"""
CIPAS Syntactics API Routes for Syntactic Code Clone Detection.

This module implements REST API endpoints for comparing code snippets
using the automatic cascade detection pipeline:

  Type-1 → Phase One (NiCAD-style) : Literal CST comparison  (threshold ≥ 0.98)
  Type-2 → Phase One (NiCAD-style) : Blinded CST comparison  (threshold ≥ 0.95, token delta ≤ 5 %)
  Type-3 → Phase Two (ToMa + XGB)  : Hybrid String + AST features → XGBoost classifier
  Non-Syntactic → returned when no syntactic clone is confirmed

Phase 1–4 endpoints:
  POST /submissions/ingest      → segment + index + cascade + graph update
  POST /templates/register      → register instructor skeleton code
  GET  /collusion-report        → connected components (collusion rings)
  GET  /index/status            → LSH index statistics
"""

import logging
from typing import Optional

from fastapi import HTTPException, status

from clone_detection.cascade_worker import (
    CascadeWorker,
    InMemoryDB,
)
from clone_detection.collusion_graph import CollusionGraph
from clone_detection.features.syntactic_features import SyntacticFeatureExtractor
from clone_detection.lsh_index import MinHashIndexer
from clone_detection.models.classifiers import SyntacticClassifier
from clone_detection.normalizers.structural_normalizer import (
    StructuralNormalizer,
)
from clone_detection.pipelines import (
    TieredPipeline,
)
from clone_detection.preprocessor import Fragmenter, TemplateFilter
from clone_detection.tokenizers.tree_sitter_tokenizer import TreeSitterTokenizer
from clone_detection.utils.common_setup import get_model_path
from schemas import (
    AssignmentClusterRequest,
    AssignmentClusterResponse,
    BatchComparisonRequest,
    BatchComparisonResult,
    CloneMatchSchema,
    CollusionEdgeSchema,
    CollusionGroupSchema,
    CollusionReportResponse,
    ComparisonRequest,
    ComparisonResult,
    FeatureImportanceResponse,
    HealthResponse,
    IndexStatusResponse,
    IngestionResponse,
    ModelStatus,
    SubmissionClusterResult,
    SyntacticFeatures,
    TemplateRegisterRequest,
    TemplateRegisterResponse,
    TokenizeRequest,
    TokenizeResponse,
    SubmissionIngestRequest,
)

logger = logging.getLogger(__name__)

# ============================================================================
# Global Singletons (lazy loaded)
# ============================================================================

_syntactic_model: Optional[SyntacticClassifier] = None
_tokenizer: Optional[TreeSitterTokenizer] = None
_syntactic_extractor: Optional[SyntacticFeatureExtractor] = None
_normalizer: Optional[StructuralNormalizer] = None
_tiered_pipeline: Optional[TieredPipeline] = None

# Phase 1–4 singletons
_db: Optional[InMemoryDB] = None
_indexer: Optional[MinHashIndexer] = None
_graph: Optional[CollusionGraph] = None
_worker: Optional[CascadeWorker] = None
_tpl_filter: Optional[TemplateFilter] = None


def _get_tokenizer() -> TreeSitterTokenizer:
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = TreeSitterTokenizer()
    return _tokenizer


def _get_syntactic_extractor() -> SyntacticFeatureExtractor:
    global _syntactic_extractor
    if _syntactic_extractor is None:
        _syntactic_extractor = SyntacticFeatureExtractor()
    return _syntactic_extractor


def _get_normalizer() -> StructuralNormalizer:
    global _normalizer
    if _normalizer is None:
        _normalizer = StructuralNormalizer()
    return _normalizer


def _get_tiered_pipeline() -> TieredPipeline:
    global _tiered_pipeline, _syntactic_model
    if _tiered_pipeline is None:
        syntactic_classifier = _load_syntactic_model()
        _tiered_pipeline = TieredPipeline(classifier=syntactic_classifier)
    return _tiered_pipeline


def _load_syntactic_model() -> Optional[SyntacticClassifier]:
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
    models = {}
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


# ── Phase 1–4 singleton accessors ──────────────────────────────────────────


def _get_db() -> InMemoryDB:
    global _db
    if _db is None:
        _db = InMemoryDB()
    return _db


def _get_indexer() -> MinHashIndexer:
    global _indexer
    if _indexer is None:
        _indexer = MinHashIndexer(num_perm=128, threshold=0.3)
    return _indexer


def _get_graph() -> CollusionGraph:
    global _graph
    if _graph is None:
        _graph = CollusionGraph()
    return _graph


def _get_tpl_filter() -> TemplateFilter:
    global _tpl_filter
    if _tpl_filter is None:
        _tpl_filter = TemplateFilter()
    return _tpl_filter


def _get_worker() -> CascadeWorker:
    global _worker
    if _worker is None:
        _worker = CascadeWorker(
            db=_get_db(),
            indexer=_get_indexer(),
            graph=_get_graph(),
            pipeline=_get_tiered_pipeline(),
            tpl_filter=_get_tpl_filter(),
        )
    return _worker


# ============================================================================
# Existing endpoints (pairwise comparison, health, etc.)
# ============================================================================


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
                detection_result.clone_type if detection_result.is_clone else None
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


# ============================================================================
# Phase 1–4 Pipeline Endpoints
# ============================================================================


def ingest_submission(request: SubmissionIngestRequest) -> IngestionResponse:
    """
    Ingest a student submission through all four pipeline phases:

    Phase 1 — Segmentation + Template Filtering
    Phase 2 — MinHash LSH Indexing + Candidate Retrieval
    Phase 3 — CIPAS Syntactic Cascade (Type-1/2/3)
    Phase 4 — Collusion Graph Update (Connected Components)

    Returns a summary of fragments, candidate pairs, and confirmed clone matches.
    """
    try:
        worker = _get_worker()
        result = worker.process_submission(
            source_code=request.source_code,
            language=request.language.value,
            submission_id=request.submission_id,
            student_id=request.student_id,
            assignment_id=request.assignment_id,
        )

        matches_out = [
            CloneMatchSchema(
                id=m.id,
                frag_a_id=m.frag_a_id,
                frag_b_id=m.frag_b_id,
                student_a=m.student_a,
                student_b=m.student_b,
                clone_type=m.clone_type,
                confidence=m.confidence,
                is_clone=m.is_clone,
                features=m.features,
                normalized_code_a=m.normalized_code_a,
                normalized_code_b=m.normalized_code_b,
            )
            for m in result.clone_matches
        ]

        return IngestionResponse(
            submission_id=result.submission_id,
            student_id=result.student_id,
            assignment_id=result.assignment_id,
            fragment_count=result.fragment_count,
            candidate_pair_count=result.candidate_pair_count,
            confirmed_clone_count=result.confirmed_clone_count,
            clone_matches=matches_out,
            errors=result.errors,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Ingestion failed for submission %s: %s",
            request.submission_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {exc}",
        )


def register_template(request: TemplateRegisterRequest) -> TemplateRegisterResponse:
    """
    Register instructor skeleton (starter) code as a template for an assignment.

    Fragments in future student submissions that closely match the template
    (Jaccard ≥ 0.90) are discarded before LSH indexing.
    """
    try:
        tpl_filter = _get_tpl_filter()
        count = tpl_filter.register_template(
            assignment_id=request.assignment_id,
            source=request.source_code,
            language=request.language.value,
        )
        # Persist token sets in the DB for persistence across restarts
        db = _get_db()
        from clone_detection.preprocessor import Fragmenter

        fragmenter = Fragmenter(request.language.value)
        frags = fragmenter.segment(
            request.source_code,
            submission_id="template",
            student_id="instructor",
            assignment_id=request.assignment_id,
        )
        token_sets = [frozenset(f.abstract_tokens) for f in frags]
        db.register_template_tokens(request.assignment_id, token_sets)

        return TemplateRegisterResponse(
            assignment_id=request.assignment_id,
            template_fragment_count=count,
        )
    except Exception as exc:
        logger.error("Template registration failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Template registration failed: {exc}",
        )


def get_collusion_report(
    assignment_id: Optional[str] = None,
    min_confidence: float = 0.0,
) -> CollusionReportResponse:
    """
    Return connected-component collusion groups.

    Each group represents a set of students likely involved in code sharing.
    Groups are sorted by size (descending) then by max confidence (descending).

    Parameters
    ----------
    assignment_id:  Filter graph edges by assignment (informational; the
                    shared in-memory graph contains all assignments).
    min_confidence: Only include edges with confidence ≥ this value.
    """
    try:
        graph = _get_graph()
        groups = graph.connected_components(
            min_group_size=2,
            min_confidence=min_confidence,
        )

        groups_out = []
        for g in groups:
            edges_out = [
                CollusionEdgeSchema(
                    student_a=e.student_a,
                    student_b=e.student_b,
                    clone_type=e.clone_type,
                    confidence=e.confidence,
                    match_count=e.match_count,
                )
                for e in g.edges
            ]
            groups_out.append(
                CollusionGroupSchema(
                    group_id=g.group_id,
                    member_ids=g.member_ids,
                    member_count=g.size,
                    max_confidence=g.max_confidence,
                    dominant_type=g.dominant_type,
                    edge_count=len(g.edges),
                    edges=edges_out,
                )
            )

        total_students = sum(g.size for g in groups)

        return CollusionReportResponse(
            assignment_id=assignment_id,
            group_count=len(groups_out),
            total_flagged_students=total_students,
            groups=groups_out,
        )

    except Exception as exc:
        logger.error("Collusion report failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Collusion report failed: {exc}",
        )


def get_index_status() -> IndexStatusResponse:
    """
    Return statistics about the in-memory MinHash LSH index.
    """
    indexer = _get_indexer()
    return IndexStatusResponse(
        indexed_fragment_count=indexer.size(),
        lsh_threshold=indexer._threshold,
        num_permutations=indexer._num_perm,
    )


def cluster_assignment(request: AssignmentClusterRequest) -> AssignmentClusterResponse:
    """
    Process all submissions for an assignment through an **isolated** Phase 1–4
    pipeline and return the clone clusters.

    A fresh DB / LSH index / collusion graph is created for each call so that:
    - Concurrent requests cannot pollute each other's results.
    - The global incremental-ingestion index (used by /submissions/ingest) is
      not affected.

    Steps
    -----
    1. Optionally register instructor template (suppresses starter-code matches).
    2. Ingest each submission: segment → template-filter → LSH index → cascade → graph.
    3. Compute connected components of the resulting collusion graph.
    4. Return per-submission summaries + collusion groups.
    5. Persist report to database for future retrieval.
    """
    import time

    start_time = time.time()

    try:
        # ── Isolated pipeline ─────────────────────────────────────────────
        isolated_db = InMemoryDB()
        isolated_indexer = MinHashIndexer(num_perm=128, threshold=request.lsh_threshold)
        isolated_graph = CollusionGraph()
        isolated_tpl_filter = TemplateFilter()
        isolated_worker = CascadeWorker(
            db=isolated_db,
            indexer=isolated_indexer,
            graph=isolated_graph,
            pipeline=_get_tiered_pipeline(),
            tpl_filter=isolated_tpl_filter,
        )

        # ── Optional instructor template ──────────────────────────────────
        if request.instructor_template:
            try:
                isolated_tpl_filter.register_template(
                    assignment_id=request.assignment_id,
                    source=request.instructor_template,
                    language=request.language.value,
                )
                fragmenter = Fragmenter(request.language.value)
                tpl_frags = fragmenter.segment(
                    request.instructor_template,
                    submission_id="template",
                    student_id="instructor",
                    assignment_id=request.assignment_id,
                )
                isolated_db.register_template_tokens(
                    request.assignment_id,
                    [frozenset(f.abstract_tokens) for f in tpl_frags],
                )
                logger.info(
                    "Registered instructor template for %s (%d fragments)",
                    request.assignment_id,
                    len(tpl_frags),
                )
            except Exception as exc:
                logger.warning("Template registration failed (continuing): %s", exc)

        # ── Ingest each submission ────────────────────────────────────────
        per_submission: list[SubmissionClusterResult] = []
        processed = 0
        failed = 0
        total_clone_pairs = 0

        for sub in request.submissions:
            try:
                result = isolated_worker.process_submission(
                    source_code=sub.source_code,
                    language=request.language.value,
                    submission_id=sub.submission_id,
                    student_id=sub.student_id,
                    assignment_id=request.assignment_id,
                )
                per_submission.append(
                    SubmissionClusterResult(
                        submission_id=result.submission_id,
                        student_id=result.student_id,
                        fragment_count=result.fragment_count,
                        candidate_pair_count=result.candidate_pair_count,
                        confirmed_clone_count=result.confirmed_clone_count,
                        errors=result.errors,
                    )
                )
                total_clone_pairs += result.confirmed_clone_count
                processed += 1
            except Exception as exc:
                logger.warning(
                    "Submission %s failed during clustering: %s",
                    sub.submission_id,
                    exc,
                )
                per_submission.append(
                    SubmissionClusterResult(
                        submission_id=sub.submission_id,
                        student_id=sub.student_id,
                        fragment_count=0,
                        candidate_pair_count=0,
                        confirmed_clone_count=0,
                        errors=[str(exc)],
                    )
                )
                failed += 1

        # ── Collusion groups ──────────────────────────────────────────────
        groups = isolated_graph.connected_components(
            min_group_size=2,
            min_confidence=request.min_confidence,
        )

        groups_out = []
        for g in groups:
            edges_out = [
                CollusionEdgeSchema(
                    student_a=e.student_a,
                    student_b=e.student_b,
                    clone_type=e.clone_type,
                    confidence=e.confidence,
                    match_count=e.match_count,
                )
                for e in g.edges
            ]
            groups_out.append(
                CollusionGroupSchema(
                    group_id=g.group_id,
                    member_ids=g.member_ids,
                    member_count=g.size,
                    max_confidence=g.max_confidence,
                    dominant_type=g.dominant_type,
                    edge_count=len(g.edges),
                    edges=edges_out,
                )
            )

        logger.info(
            "Assignment %s clustered: %d/%d submissions, %d clone pairs, %d groups",
            request.assignment_id,
            processed,
            len(request.submissions),
            total_clone_pairs,
            len(groups_out),
        )

        processing_time = time.time() - start_time

        response = AssignmentClusterResponse(
            assignment_id=request.assignment_id,
            language=request.language.value,
            submission_count=len(request.submissions),
            processed_count=processed,
            failed_count=failed,
            total_clone_pairs=total_clone_pairs,
            collusion_groups=groups_out,
            per_submission=per_submission,
        )

        # Persist report to database (best effort - don't fail if DB is unavailable)
        try:
            from repositories import SimilarityReportRepository
            import asyncio

            # Run the async save in a new event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(
                    SimilarityReportRepository.save_report(
                        report=response,
                        lsh_threshold=request.lsh_threshold,
                        min_confidence=request.min_confidence,
                        processing_time=processing_time,
                    )
                )
                logger.info(
                    f"Persisted similarity report for assignment {request.assignment_id}"
                )
            finally:
                loop.close()
        except Exception as exc:
            logger.warning(
                f"Failed to persist similarity report for {request.assignment_id}: {exc}. "
                "Report is still returned to caller."
            )

        return response

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Assignment clustering failed for %s: %s",
            request.assignment_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Assignment clustering failed: {exc}",
        )


# ═══════════════════════════════════════════════════════════════════════════
# Similarity Reports & Annotations
# ═══════════════════════════════════════════════════════════════════════════


async def get_similarity_report(assignment_id: str):
    """
    Retrieve a cached similarity report from the database.

    Args:
        assignment_id: Assignment identifier

    Returns:
        AssignmentClusterResponse if found

    Raises:
        HTTPException: 404 if report not found, 500 on database error
    """
    try:
        from repositories import SimilarityReportRepository

        report = await SimilarityReportRepository.get_report(assignment_id)

        if report is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No similarity report found for assignment {assignment_id}",
            )

        return report

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to retrieve report for %s: %s", assignment_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve similarity report: {exc}",
        )


async def create_annotation(request):
    """
    Create a new instructor annotation.

    Args:
        request: CreateAnnotationRequest

    Returns:
        AnnotationResponse with the created annotation

    Raises:
        HTTPException: 400 on invalid request, 500 on database error
    """
    try:
        from repositories import InstructorAnnotationRepository
        from uuid import UUID

        # Convert string UUIDs to UUID objects if provided
        match_id = UUID(request.match_id) if request.match_id else None
        group_id = UUID(request.group_id) if request.group_id else None

        annotation_id = await InstructorAnnotationRepository.create_annotation(
            assignment_id=request.assignment_id,
            instructor_id=request.instructor_id,
            status=request.status.value,
            match_id=match_id,
            group_id=group_id,
            comments=request.comments,
            action_taken=request.action_taken,
        )

        # Retrieve the created annotation
        annotation = await InstructorAnnotationRepository.get_annotation(annotation_id)

        from schemas import AnnotationResponse

        return AnnotationResponse(
            id=str(annotation["id"]),
            assignment_id=annotation["assignment_id"],
            instructor_id=annotation["instructor_id"],
            status=annotation["status"],
            match_id=str(annotation["match_id"]) if annotation["match_id"] else None,
            group_id=str(annotation["group_id"]) if annotation["group_id"] else None,
            comments=annotation["comments"],
            action_taken=annotation["action_taken"],
            created_at=annotation["created_at"].isoformat(),
            updated_at=annotation["updated_at"].isoformat(),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: {exc}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to create annotation: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create annotation: {exc}",
        )


async def update_annotation(annotation_id: str, request):
    """
    Update an existing instructor annotation.

    Args:
        annotation_id: Annotation UUID as string
        request: UpdateAnnotationRequest

    Returns:
        AnnotationResponse with the updated annotation

    Raises:
        HTTPException: 404 if not found, 500 on database error
    """
    try:
        from repositories import InstructorAnnotationRepository
        from uuid import UUID

        annotation_uuid = UUID(annotation_id)

        # Update the annotation
        updated = await InstructorAnnotationRepository.update_annotation(
            annotation_id=annotation_uuid,
            status=request.status.value if request.status else None,
            comments=request.comments,
            action_taken=request.action_taken,
        )

        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Annotation {annotation_id} not found",
            )

        # Retrieve the updated annotation
        annotation = await InstructorAnnotationRepository.get_annotation(
            annotation_uuid
        )

        from schemas import AnnotationResponse

        return AnnotationResponse(
            id=str(annotation["id"]),
            assignment_id=annotation["assignment_id"],
            instructor_id=annotation["instructor_id"],
            status=annotation["status"],
            match_id=str(annotation["match_id"]) if annotation["match_id"] else None,
            group_id=str(annotation["group_id"]) if annotation["group_id"] else None,
            comments=annotation["comments"],
            action_taken=annotation["action_taken"],
            created_at=annotation["created_at"].isoformat(),
            updated_at=annotation["updated_at"].isoformat(),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid UUID format: {exc}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to update annotation %s: %s", annotation_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update annotation: {exc}",
        )


async def get_annotations(assignment_id: str, status_filter: str | None = None):
    """
    Get all annotations for an assignment.

    Args:
        assignment_id: Assignment identifier
        status_filter: Optional status filter

    Returns:
        List of AnnotationResponse objects

    Raises:
        HTTPException: 500 on database error
    """
    try:
        from repositories import InstructorAnnotationRepository

        annotations = (
            await InstructorAnnotationRepository.get_annotations_for_assignment(
                assignment_id=assignment_id,
                status=status_filter,
            )
        )

        from schemas import AnnotationResponse

        return [
            AnnotationResponse(
                id=str(ann["id"]),
                assignment_id=ann["assignment_id"],
                instructor_id=ann["instructor_id"],
                status=ann["status"],
                match_id=str(ann["match_id"]) if ann["match_id"] else None,
                group_id=str(ann["group_id"]) if ann["group_id"] else None,
                comments=ann["comments"],
                action_taken=ann["action_taken"],
                created_at=ann["created_at"].isoformat(),
                updated_at=ann["updated_at"].isoformat(),
            )
            for ann in annotations
        ]

    except Exception as exc:
        logger.error(
            "Failed to get annotations for %s: %s", assignment_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve annotations: {exc}",
        )


async def get_annotation_stats(assignment_id: str):
    """
    Get annotation statistics for an assignment.

    Args:
        assignment_id: Assignment identifier

    Returns:
        AnnotationStatsResponse with counts by status

    Raises:
        HTTPException: 500 on database error
    """
    try:
        from repositories import InstructorAnnotationRepository

        stats = await InstructorAnnotationRepository.get_annotation_stats(assignment_id)

        from schemas import AnnotationStatsResponse

        return AnnotationStatsResponse(
            assignment_id=assignment_id,
            total=stats.get("total", 0),
            pending_review=stats.get("pending_review", 0),
            confirmed_plagiarism=stats.get("confirmed_plagiarism", 0),
            false_positive=stats.get("false_positive", 0),
            acceptable_collaboration=stats.get("acceptable_collaboration", 0),
            requires_investigation=stats.get("requires_investigation", 0),
        )

    except Exception as exc:
        logger.error(
            "Failed to get annotation stats for %s: %s",
            assignment_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve annotation statistics: {exc}",
        )


async def export_similarity_report_csv(assignment_id: str):
    """
    Export similarity report as CSV format.

    Args:
        assignment_id: Assignment identifier

    Returns:
        CSV file with cluster and edge data

    Raises:
        HTTPException: 404 if report not found, 500 on database error
    """
    try:
        from repositories import SimilarityReportRepository
        from fastapi.responses import StreamingResponse
        import io
        import csv

        # Fetch the report
        report = await SimilarityReportRepository.get_report(assignment_id)
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No similarity report found for assignment {assignment_id}",
            )

        # Create CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        # Write headers
        writer.writerow(
            [
                "Cluster ID",
                "Student A",
                "Student B",
                "Similarity Score",
                "Clone Type",
                "Match Count",
                "Cluster Size",
                "Dominant Type",
            ]
        )

        # Write cluster data
        for group in report.collusion_groups:
            cluster_letter = chr(64 + group.group_id)
            for edge in group.edges:
                writer.writerow(
                    [
                        cluster_letter,
                        edge.student_a,
                        edge.student_b,
                        f"{edge.confidence * 100:.2f}%",
                        edge.clone_type,
                        edge.match_count,
                        group.member_count,
                        group.dominant_type,
                    ]
                )

        # Return CSV response
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=similarity_report_{assignment_id}.csv"
            },
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to export report for %s: %s", assignment_id, exc, exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export report: {exc}",
        )
