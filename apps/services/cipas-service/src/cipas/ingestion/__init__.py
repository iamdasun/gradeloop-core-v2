# gradeloop-core-v2/apps/services/cipas-service/src/cipas/ingestion/__init__.py
"""
CIPAS ingestion package.

Exposes the public interface for the ingestion orchestration layer:

  - IngestionPipeline   Async batch orchestrator (semaphore + ProcessPoolExecutor)

The worker module (cipas.ingestion.worker) is intentionally NOT re-exported
here because its symbols (parse_file_task, _worker_initializer) are internal
implementation details used only by the pipeline and the ProcessPoolExecutor.
Callers should never import worker symbols directly — they go through the
pipeline interface exclusively.

Usage in application startup (main.py lifespan):

    from cipas.ingestion import IngestionPipeline

    pipeline = IngestionPipeline(settings=settings, repository=repository)
    await pipeline.start()

    app.state.pipeline = pipeline

    yield  # application running

    await pipeline.stop()

Usage in route handlers:

    pipeline: IngestionPipeline = request.app.state.pipeline
    result = await pipeline.ingest(submission_id=submission_id, files=files)
"""

from cipas.ingestion.pipeline import IngestionPipeline

__all__ = [
    "IngestionPipeline",
]
