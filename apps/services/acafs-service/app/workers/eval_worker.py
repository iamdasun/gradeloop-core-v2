"""Evaluation worker for processing submission events."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.config import Settings
from app.logging_config import get_logger
from app.schemas import SubmissionEvent
from app.services.evaluation.ast_parser import ASTParser
from app.services.storage.minio_client import MinIOClient
from app.services.storage.postgres_client import PostgresClient

logger = get_logger(__name__)


class EvaluationWorker:
    """Worker that processes submission events and extracts AST blueprints."""

    def __init__(
        self,
        settings: Settings,
        minio_client: MinIOClient,
        postgres_client: PostgresClient,
    ):
        """Initialize evaluation worker.
        
        Args:
            settings: Application settings
            minio_client: MinIO client for code retrieval
            postgres_client: PostgreSQL client for AST storage
        """
        self.settings = settings
        self.minio = minio_client
        self.postgres = postgres_client
        self.ast_parser = ASTParser()
        self._executor = ThreadPoolExecutor(max_workers=settings.rabbitmq_concurrency)

    async def process_event(self, event: SubmissionEvent) -> None:
        """Process a submission event.
        
        Args:
            event: Submission event from RabbitMQ
        """
        logger.info(
            "processing_submission",
            submission_id=str(event.submission_id),
            assignment_id=str(event.assignment_id),
            language=event.language,
        )

        try:
            # Get source code
            code = await self._get_code(event)
            if not code:
                await self._store_failure(
                    event,
                    "empty_source_code",
                    "No source code available",
                )
                return

            # Parse AST
            blueprint = await self._parse_ast(event, code)

            # ----------------------------------------------------------------
            # TODO [ACAFS – Rubric-Based Grading Pipeline]
            #
            # Once assessment-service stores rubric + test_cases + sample_answer,
            # the SubmissionEvent (or a supplementary RabbitMQ message) will carry:
            #
            #   event.rubric         → list[RubricCriterion] with name, description,
            #                          grading_mode ("llm" | "llm_ast" | "deterministic"),
            #                          weight (0-100, sums to 100), and bands:
            #                          {excellent/good/satisfactory/unsatisfactory}
            #                          each with description + mark_range.
            #
            #   event.test_cases     → list[TestCase] with test_case_id, description,
            #                          test_case_input (stdin), expected_output (stdout).
            #
            #   event.sample_answer  → {language_id: int, code: str}  (reference impl).
            #
            # Evaluation steps to implement:
            #
            # Step A — Deterministic test-case runner:
            #   For each criterion where grading_mode == "deterministic":
            #     1. Submit student code to Judge0 for each test_case.
            #     2. Compare actual stdout vs expected_output (trimEnd).
            #     3. Score = (passed_tests / total_tests) mapped to band mark_range.
            #     4. Store per-test result in TestCaseResult (already defined in schemas).
            #
            # Step B — LLM evaluation:
            #   For each criterion where grading_mode == "llm":
            #     1. Build a prompt containing:
            #        - assignment.description + assignment.objective
            #        - criterion.name + criterion.description
            #        - band descriptions (excellent → unsatisfactory)
            #        - student code (from event.code)
            #        - (optional) sample_answer.code for reference comparison
            #     2. Call LLM API, receive band classification + justification.
            #     3. Map band to mark_range to get numeric score.
            #
            # Step C — LLM + AST evaluation:
            #   For each criterion where grading_mode == "llm_ast":
            #     1. Use ASTBlueprint (already produced in this worker) to enrich prompt.
            #        Inject: function signatures, complexity indicators, control flow.
            #     2. Same LLM evaluation as Step B but with AST context.
            #
            # Step D — Aggregate score:
            #   total_score = sum(criterion.weight * band_score_ratio for each criterion)
            #   Store breakdown in postgres: submission_grades table.
            #
            # Step E — Socratic feedback (requires enable_socratic_feedback=True):
            #   TODO [ACAFS – Socratic Feedback]:
            #   For each failed/partial criterion, generate targeted Socratic hints:
            #     - Do NOT reveal the solution directly.
            #     - Ask guiding questions based on the criterion description.
            #     - Reference specific line numbers from the AST blueprint.
            #   Store hints in postgres: submission_feedback table.
            #   The assessment-service API endpoint /student-submissions/:id/feedback
            #   should serve these hints to students.
            # ----------------------------------------------------------------

            # Store blueprint
            await self.postgres.store_ast_blueprint(
                submission_id=event.submission_id,
                assignment_id=event.assignment_id,
                language=event.language,
                blueprint=blueprint,
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
            await self._store_failure(
                event,
                "processing_error",
                str(e),
            )

    async def _get_code(self, event: SubmissionEvent) -> str:
        """Get source code from event or MinIO.
        
        Args:
            event: Submission event
            
        Returns:
            Source code string
        """
        # Use code from event if available
        if event.code:
            return event.code
            
        # Otherwise fetch from MinIO
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            lambda: asyncio.run(self.minio.get_submission_code(event.storage_path)),
        )

    async def _parse_ast(self, event: SubmissionEvent, code: str) -> None:
        """Parse AST from source code.
        
        Args:
            event: Submission event
            code: Source code
            
        Returns:
            AST blueprint
        """
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
        """Store parse failure information.
        
        Args:
            event: Submission event
            reason: Failure reason
            details: Error details
        """
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
