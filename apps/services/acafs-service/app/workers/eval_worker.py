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
