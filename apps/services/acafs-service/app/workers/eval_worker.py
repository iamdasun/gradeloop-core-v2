"""Evaluation worker for processing submission events.

Grading pipeline
----------------
1. Resolve student code (event payload or MinIO).
2. Parse AST blueprint via tree-sitter.
3. Close any active Socratic chat session for this student + assignment.
4. If rubric is present, run the full grading pipeline:
   a) Deterministic criteria  → Judge0 test-case pass/fail (authoritative).
   b) LLM + AST criteria      → Qwen grader with AST blueprint context.
   c) LLM-only criteria       → Qwen grader with student code + sample answer.
   d) Qwen grader evaluates ALL criteria in one call; deterministic scores are
      then patched in from Judge0 results (overriding any LLM estimate).
5. Persist AST blueprint, grade breakdown, and per-criterion scores.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional
from uuid import UUID

from app.config import Settings
from app.logging_config import get_logger
from app.schemas import ASTBlueprint, RubricCriterion, SubmissionEvent
from app.services.evaluation.ast_parser import ASTParser
from app.services.evaluation.judge0_client import Judge0Client
from app.services.feedback.llm_grader import LLMGrader
from app.services.feedback.prompts import build_assignment_context
from app.services.storage.minio_client import MinIOClient
from app.services.storage.postgres_client import PostgresClient

logger = get_logger(__name__)


class EvaluationWorker:
    """Worker that processes submission events and runs the full grading pipeline."""

    def __init__(
        self,
        settings: Settings,
        minio_client: MinIOClient,
        postgres_client: PostgresClient,
    ):
        self.settings = settings
        self.minio = minio_client
        self.postgres = postgres_client
        self.ast_parser = ASTParser()
        self.judge0 = Judge0Client(settings)
        self.grader = LLMGrader(settings)
        self._executor = ThreadPoolExecutor(max_workers=settings.rabbitmq_concurrency)

    # ── main entry point ────────────────────────────────────────────────────

    async def process_event(self, event: SubmissionEvent) -> None:
        """Process a submission event end-to-end."""
        logger.info(
            "processing_submission",
            submission_id=str(event.submission_id),
            assignment_id=str(event.assignment_id),
            language=event.language,
            has_rubric=bool(event.rubric),
            has_test_cases=bool(event.test_cases),
            has_sample_answer=bool(event.sample_answer),
        )

        try:
            # 1. Resolve source code
            code = await self._get_code(event)
            if not code:
                await self._store_failure(event, "empty_source_code", "No source code available")
                return

            # 2. Parse AST
            blueprint = await self._parse_ast(event, code)

            # 3. Close any active chat session (submission ends the session)
            await self.postgres.close_chat_session_on_submission(
                assignment_id=event.assignment_id,
                user_id=event.user_id,
            )

            # 4. Persist AST blueprint
            await self.postgres.store_ast_blueprint(
                submission_id=event.submission_id,
                assignment_id=event.assignment_id,
                language=event.language,
                blueprint=blueprint,
            )

            # 5. Run grading pipeline if rubric is present
            if event.rubric:
                await self._run_grading_pipeline(event, code, blueprint)
            else:
                logger.info(
                    "no_rubric_skipping_grading",
                    submission_id=str(event.submission_id),
                )

            logger.info(
                "submission_processed_successfully",
                submission_id=str(event.submission_id),
            )

        except Exception as e:
            logger.error(
                "submission_processing_failed",
                submission_id=str(event.submission_id),
                error=str(e),
            )
            await self._store_failure(event, "processing_error", str(e))

    # ── grading pipeline ────────────────────────────────────────────────────

    async def _run_grading_pipeline(
        self,
        event: SubmissionEvent,
        student_code: str,
        blueprint: ASTBlueprint,
    ) -> None:
        """Orchestrate deterministic + LLM grading and persist results."""
        rubric: list[RubricCriterion] = event.rubric  # type: ignore[assignment]

        # ── Step A: Route test cases to their criteria ────────────────────
        # Test cases with a `criterion_name` field are routed to that criterion
        # exclusively.  Those without fall into a shared fallback pool used by
        # criteria that have no linked test cases.
        criterion_tests: dict[str, list[dict[str, Any]]] = {}
        shared_tests: list[dict[str, Any]] = []

        if event.test_cases:
            for tc in event.test_cases:
                cname = tc.get("criterion_name") or tc.get("criterion_id")
                if cname:
                    criterion_tests.setdefault(str(cname), []).append(tc)
                else:
                    shared_tests.append(tc)

        # ── Step B: Run Judge0 per-criterion (deterministic only) ─────────
        deterministic_map: dict[str, tuple[float, str]] = {}
        criterion_results: dict[str, list[dict[str, Any]]] = {}

        deterministic_criteria = [c for c in rubric if c.grading_mode == "deterministic"]

        if deterministic_criteria:
            for crit in deterministic_criteria:
                # Use linked test cases if available, otherwise shared pool
                tc_subset = criterion_tests.get(crit.name) or shared_tests
                if not tc_subset:
                    deterministic_map[crit.name] = (0.0, "No test cases provided — scored 0.")
                    criterion_results[crit.name] = []
                    continue

                logger.info(
                    "running_deterministic_tests",
                    submission_id=str(event.submission_id),
                    criterion=crit.name,
                    test_case_count=len(tc_subset),
                )
                test_results = await self.judge0.run_batch(
                    language_id=event.language_id,
                    source_code=student_code,
                    test_cases=tc_subset,
                )
                criterion_results[crit.name] = test_results
                score, reason = Judge0Client.compute_deterministic_score(
                    test_results, crit.weight
                )
                deterministic_map[crit.name] = (score, reason)
                logger.info(
                    "deterministic_criterion_scored",
                    criterion=crit.name,
                    score=score,
                    weight=crit.weight,
                )

        # ── Step C: Build enriched rubric_data with per-criterion evidence ─
        # Each criterion dict gets an `evidence` key so the LLM prompt can
        # reference the right test results inline — removing the need for the
        # model to correlate a flat global execution list.
        rubric_data = []
        for c in rubric:
            c_dict = c.model_dump()
            results_for_criterion = (
                criterion_results.get(c.name)
                or criterion_tests.get(c.name, [])  # unmapped results fall back gracefully
            )
            # For non-deterministic criteria also attach any linked test results as context
            if not results_for_criterion and c.grading_mode != "deterministic":
                results_for_criterion = []
            c_dict["evidence"] = {"test_results": results_for_criterion}
            rubric_data.append(c_dict)

        # ── Step D: LLM evaluation (all criteria, single Qwen grader call) ──
        # Criterion isolation is achieved via the in-JSON reasoning chain:
        # analysis → band_selected → band_justification → score → reason → confidence
        # The model reasons about each criterion independently before scoring it.
        assignment_context = build_assignment_context(
            title=event.assignment_title,
            description=event.assignment_description,
            objective=event.objective,
        )
        ast_data = blueprint.model_dump(exclude={"raw_ast"})
        sample_code: Optional[str] = None
        if event.sample_answer:
            sample_code = event.sample_answer.get("code")

        llm_result = await self.grader.evaluate(
            rubric_data=rubric_data,
            student_code=student_code,
            sample_answer_code=sample_code,
            ast_data=ast_data,
            assignment_context=assignment_context,
        )

        if "error" in llm_result:
            logger.error(
                "llm_grading_failed",
                submission_id=str(event.submission_id),
                error=llm_result["error"],
            )
            if not deterministic_map:
                return
            # Build result covering ALL rubric criteria.
            # Deterministic: use the authoritative Judge0-derived score.
            # LLM / LLM_AST: score 0 with an explanatory note so the
            #   criterion still appears in the breakdown rather than vanishing.
            fallback_scores = []
            for c in rubric:
                if c.name in deterministic_map:
                    score, reason = deterministic_map[c.name]
                    fallback_scores.append({
                        "name": c.name,
                        "analysis": reason,
                        "band_selected": None,
                        "band_justification": None,
                        "score": score,
                        "max_score": c.weight,
                        "grading_mode": c.grading_mode,
                        "reason": reason,
                        "confidence": 1.0,
                    })
                else:
                    fallback_scores.append({
                        "name": c.name,
                        "analysis": "AI grading unavailable for this criterion.",
                        "band_selected": None,
                        "band_justification": None,
                        "score": 0.0,
                        "max_score": c.weight,
                        "grading_mode": c.grading_mode,
                        "reason": "AI grading unavailable — this criterion could not be evaluated automatically.",
                        "confidence": 0.0,
                    })
            llm_result = {
                "criteria_scores": fallback_scores,
                "total_score": sum(s for s, _ in deterministic_map.values()),
                "holistic_feedback": (
                    "Your submission has been received and test cases evaluated.\n\n"
                    "Detailed feedback is currently unavailable — the AI grading service encountered an error.\n\n"
                    "What part of the problem did you find most challenging?"
                ),
            }

        # ── Step E: Patch deterministic scores (override LLM estimates) ───
        if deterministic_map:
            llm_result = LLMGrader.patch_deterministic_scores(
                llm_result, rubric_data, deterministic_map
            )

        # ── Step F: Persist grade breakdown ──────────────────────────────
        criteria_scores = llm_result.get("criteria_scores", [])
        total_score = float(llm_result.get("total_score", 0))
        max_total = sum(c.weight for c in rubric)

        # Normalise feedback — model may return holistic_feedback at top level
        # or nested under feedback.holistic_feedback (legacy shape)
        holistic_feedback = (
            llm_result.get("holistic_feedback")
            or llm_result.get("feedback", {}).get("holistic_feedback", "")
        )

        await self.postgres.store_submission_grade(
            submission_id=event.submission_id,
            assignment_id=event.assignment_id,
            total_score=total_score,
            max_total_score=max_total,
            holistic_feedback=holistic_feedback,
            criteria_scores=criteria_scores,
            grading_metadata={
                "ast_truncated": blueprint.metadata.ast_truncated,
                "model": self.settings.openrouter_grader_model,
            },
        )

        logger.info(
            "grading_pipeline_complete",
            submission_id=str(event.submission_id),
            total_score=total_score,
            max_total=max_total,
        )

    # ── helpers ─────────────────────────────────────────────────────────────

    async def _get_code(self, event: SubmissionEvent) -> str:
        """Get source code from event payload or MinIO.

        The MinIO SDK is synchronous; get_submission_code contains no internal
        awaits so it executes synchronously when awaited (fine for a single
        small file read). Using asyncio.run() inside an executor would create
        a nested event loop, which is unsafe and the root cause of the
        'cannot perform operation: another operation is in progress' error.
        """
        if event.code:
            return event.code
        return await self.minio.get_submission_code(event.storage_path)

    async def _parse_ast(self, event: SubmissionEvent, code: str) -> ASTBlueprint:
        """Parse AST from source code in a thread executor."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: self.ast_parser.parse(
                code=code,
                language=event.language,
                language_id=event.language_id,
            ),
        )

    async def _store_failure(
        self,
        event: SubmissionEvent,
        reason: str,
        details: str,
    ) -> None:
        """Persist a parse/processing failure record."""
        await self.postgres.store_parse_failure(
            submission_id=event.submission_id,
            assignment_id=event.assignment_id,
            language=event.language,
            failure_reason=reason,
            error_details={"details": details},
        )

    def close(self) -> None:
        """Clean up resources."""
        self._executor.shutdown(wait=True)
        logger.info("evaluation_worker_closed")

