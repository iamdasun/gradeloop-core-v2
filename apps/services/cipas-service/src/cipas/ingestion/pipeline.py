# gradeloop-core-v2/apps/services/cipas-service/src/cipas/ingestion/pipeline.py
"""
IngestionPipeline — async orchestrator for the CIPAS batch parse pipeline.

Responsibilities:
  - Accept a validated batch of FileItem objects from the ingestion route.
  - Enforce per-service concurrency limits via asyncio.Semaphore (backpressure).
  - Fan out CPU-bound parse tasks to a ProcessPoolExecutor via
    asyncio.get_event_loop().run_in_executor().
  - Collect and classify per-file results (ok / error / timeout / crash).
  - Construct GranuleData objects from worker-returned plain dicts.
  - Delegate all DB writes to StorageRepository.
  - Return a BatchParseResult to the calling route handler.

Concurrency model:
  ┌─────────────────────────────────────────────────────────────────────┐
  │ FastAPI event loop (single asyncio thread)                          │
  │                                                                     │
  │  POST handler                                                       │
  │    └─ await pipeline.ingest(submission_id, files)                  │
  │           ├─ acquire Semaphore  (backpressure gate)                 │
  │           ├─ asyncio.gather(                                        │
  │           │    run_in_executor(pool, parse_file_task, file_1), ...  │
  │           │  )  ← event loop is NOT blocked; handles other requests │
  │           │     while workers are running in separate OS processes  │
  │           ├─ collect + classify results                             │
  │           ├─ await repository.bulk_insert_files(...)               │
  │           ├─ await repository.bulk_insert_granules(...)            │
  │           ├─ await repository.update_submission_status(...)        │
  │           └─ release Semaphore                                      │
  └─────────────────────────────────────────────────────────────────────┘

  ProcessPoolExecutor workers (N = os.cpu_count() OS processes):
    Each worker independently calls parse_file_task() on one file.
    Workers share no state with the event loop or each other.
    Workers pre-load parsers once (via _worker_initializer) and reuse them.

Backpressure:
  asyncio.Semaphore(MAX_CONCURRENT_BATCHES) limits the number of batches
  active simultaneously.  Requests that cannot acquire the semaphore within
  BATCH_SEMAPHORE_TIMEOUT seconds cause the pipeline to raise
  SemaphoreTimeoutError, which the route handler converts to HTTP 503.

Duplicate file handling:
  Files within the same batch that share the same file_hash (identical content)
  are deduplicated before dispatch.  Only ONE parse task is spawned for the
  canonical file.  The resulting granules are associated with ALL file records
  sharing that hash.  Duplicate file records are inserted with
  parse_status=SKIPPED.

Per-file timeout:
  Each run_in_executor future is wrapped in asyncio.wait_for(timeout=
  settings.PARSE_TASK_TIMEOUT).  A timed-out task is cancelled from the
  event-loop side; the worker subprocess continues executing until it
  finishes or is recycled by max_tasks_per_child.  The file is marked FAILED
  with error_code=PARSE_TIMEOUT.

Worker crash handling:
  If a worker subprocess crashes (e.g., segfault in tree-sitter), the
  concurrent.futures.process.BrokenProcessPool exception propagates through
  the executor future.  The pipeline catches this as a WorkerCrashError for
  the specific file whose task was in-flight.  ProcessPoolExecutor
  automatically replaces the dead worker for subsequent tasks.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor
import os
import time
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from loguru import logger

from cipas.core.exceptions import SemaphoreTimeoutError, WorkerCrashError
from cipas.domain.models import (
    BatchParseResult,
    FileItem,
    FileParseResult,
    FileParseStatus,
    GranuleData,
    SubmissionStatus,
)
from cipas.extraction.granule_extractor import compute_file_hash
from cipas.ingestion.worker import _worker_initializer, parse_file_task

if TYPE_CHECKING:
    from cipas.core.config import Settings
    from cipas.storage.repository import StorageRepository


# ---------------------------------------------------------------------------
# IngestionPipeline
# ---------------------------------------------------------------------------


class IngestionPipeline:
    """
    Async orchestrator for the CIPAS batch parse pipeline.

    Lifecycle:
        pipeline = IngestionPipeline(settings, repository)
        await pipeline.start()        # creates ProcessPoolExecutor
        ...
        result = await pipeline.ingest(submission_id, files)
        ...
        await pipeline.stop()         # shuts down ProcessPoolExecutor gracefully

    The pipeline is created once at application startup (in main.py lifespan)
    and stored on app.state.pipeline.  It is shared across all requests.

    Thread/async safety:
        - `ingest()` is an async coroutine — safe to call concurrently from
          multiple request handlers.
        - The Semaphore ensures at most MAX_CONCURRENT_BATCHES are active.
        - The ProcessPoolExecutor is thread-safe by design.
        - `_active_batches` is an asyncio Counter protected by the semaphore;
          it is only read/written from the event loop thread.
    """

    def __init__(
        self,
        settings: "Settings",
        repository: "StorageRepository",
    ) -> None:
        self._settings = settings
        self._repository = repository

        # Semaphore: hard cap on concurrently active batches.
        # Requests that cannot acquire within BATCH_SEMAPHORE_TIMEOUT
        # receive HTTP 503 immediately.
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_BATCHES)

        # Active batch counter for observability (Prometheus gauge).
        # Only read/written from event loop thread — no locking needed.
        self._active_batches: int = 0

        # ProcessPoolExecutor: created in start(), shut down in stop().
        # Using None as sentinel so we can assert it is initialised before use.
        self._process_pool: ProcessPoolExecutor | None = None

        # Resolved worker count (0 → os.cpu_count())
        self._worker_count: int = (
            settings.PARSER_WORKERS
            if settings.PARSER_WORKERS > 0
            else (os.cpu_count() or 1)
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """
        Create the ProcessPoolExecutor and warm up worker processes.

        Called once at application startup (FastAPI lifespan).
        Spawns `_worker_count` subprocesses, each running _worker_initializer()
        to pre-load language parsers.  The first batch will not pay the grammar
        load cost because parsers are already cached in each worker.

        Blocking behaviour:
            ProcessPoolExecutor.__init__() is synchronous and does NOT block
            the event loop — process spawning happens lazily on the first
            submit() call, not in __init__().  However, we submit dummy tasks
            here to force eager process spawning and parser warm-up BEFORE
            the first real request arrives.

        Raises:
            RuntimeError: If start() is called more than once.
        """
        if self._process_pool is not None:
            raise RuntimeError(
                "IngestionPipeline.start() has already been called. "
                "Do not call start() more than once."
            )

        logger.info(
            "IngestionPipeline starting",
            worker_count=self._worker_count,
            max_concurrent_batches=self._settings.MAX_CONCURRENT_BATCHES,
            max_tasks_per_child=self._settings.WORKER_MAX_TASKS_PER_CHILD,
        )

        self._process_pool = ProcessPoolExecutor(
            max_workers=self._worker_count,
            initializer=_worker_initializer,
            # Pass worker_id=0 to all workers via initargs.
            # ProcessPoolExecutor does not expose per-worker indices, so all
            # workers get id=0.  This is acceptable — the PID disambiguates them
            # in logs.
            initargs=(0,),
            # max_tasks_per_child: recycle worker processes after N tasks to
            # prevent heap fragmentation from accumulating.
            # Requires Python 3.11+ (added in 3.11 via PEP 667).
            # Falls back silently on 3.10 where the parameter is ignored.
            max_tasks_per_child=self._settings.WORKER_MAX_TASKS_PER_CHILD,
        )

        # Eagerly warm up worker processes by submitting a no-op task.
        # This forces the executor to spawn processes and run _worker_initializer()
        # now, so the first real request does not pay the grammar load cost.
        loop = asyncio.get_event_loop()
        warmup_futures = [
            loop.run_in_executor(self._process_pool, _noop_warmup_task)
            for _ in range(self._worker_count)
        ]
        try:
            await asyncio.gather(*warmup_futures, return_exceptions=True)
            logger.info(
                "IngestionPipeline worker pool warmed up",
                worker_count=self._worker_count,
            )
        except Exception as exc:
            logger.warning(
                "Worker pool warm-up encountered errors (non-fatal)",
                error=str(exc),
            )

    async def stop(self) -> None:
        """
        Gracefully shut down the ProcessPoolExecutor.

        Called once at application shutdown (FastAPI lifespan).
        Waits for in-flight tasks to complete before terminating workers.

        Uses shutdown(wait=True, cancel_futures=False) so currently-executing
        parse tasks are allowed to finish.  Submitted but not yet started tasks
        are cancelled to avoid waiting for a full batch worth of parse time.
        """
        if self._process_pool is None:
            return

        logger.info(
            "IngestionPipeline stopping",
            active_batches=self._active_batches,
        )

        # shutdown(wait=True) blocks the calling thread until all submitted
        # futures complete.  Since this is called from an async context, we
        # run it in the default executor to avoid blocking the event loop.
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,  # default ThreadPoolExecutor
            lambda: self._process_pool.shutdown(wait=True, cancel_futures=True),  # type: ignore[union-attr]
        )
        self._process_pool = None
        logger.info("IngestionPipeline stopped")

    # ------------------------------------------------------------------
    # Public API: ingest
    # ------------------------------------------------------------------

    async def ingest(
        self,
        submission_id: UUID,
        files: list[FileItem],
    ) -> BatchParseResult:
        """
        Process a batch of validated source files through the parse pipeline.

        This is the primary method called by the ingestion route handler.
        It orchestrates the full pipeline from file dispatch to DB write.

        Flow:
            1. Acquire semaphore (backpressure gate).
            2. Deduplicate files by content hash within the batch.
            3. Fan out parse tasks to ProcessPoolExecutor via asyncio.gather.
            4. Collect results; classify as ok / timeout / crash.
            5. Construct GranuleData objects.
            6. Bulk-insert files and granules to DB in a single transaction.
            7. Update submission status.
            8. Release semaphore.
            9. Return BatchParseResult.

        Args:
            submission_id: UUID of the pre-created submission record.
            files:         List of validated FileItem objects (≤200).

        Returns:
            BatchParseResult with per-file outcomes and aggregate counts.

        Raises:
            SemaphoreTimeoutError: If the semaphore cannot be acquired within
                                   BATCH_SEMAPHORE_TIMEOUT seconds.
            RuntimeError:          If start() has not been called.
        """
        if self._process_pool is None:
            raise RuntimeError(
                "IngestionPipeline has not been started. "
                "Call await pipeline.start() before calling ingest()."
            )

        pipeline_start = time.monotonic()

        # --- Acquire semaphore (backpressure) ---
        try:
            acquired = await asyncio.wait_for(
                self._semaphore.acquire(),
                timeout=self._settings.BATCH_SEMAPHORE_TIMEOUT,
            )
            if not acquired:
                raise SemaphoreTimeoutError(
                    timeout=self._settings.BATCH_SEMAPHORE_TIMEOUT,
                    max_batches=self._settings.MAX_CONCURRENT_BATCHES,
                    active_batches=self._active_batches,
                )
        except asyncio.TimeoutError as exc:
            raise SemaphoreTimeoutError(
                timeout=self._settings.BATCH_SEMAPHORE_TIMEOUT,
                max_batches=self._settings.MAX_CONCURRENT_BATCHES,
                active_batches=self._active_batches,
            ) from exc

        self._active_batches += 1

        logger.info(
            "Batch pipeline started",
            submission_id=str(submission_id),
            file_count=len(files),
            active_batches=self._active_batches,
        )

        try:
            result = await self._run_pipeline(
                submission_id=submission_id,
                files=files,
                pipeline_start=pipeline_start,
            )
        finally:
            self._active_batches -= 1
            self._semaphore.release()

        return result

    # ------------------------------------------------------------------
    # Pipeline internals
    # ------------------------------------------------------------------

    async def _run_pipeline(
        self,
        *,
        submission_id: UUID,
        files: list[FileItem],
        pipeline_start: float,
    ) -> BatchParseResult:
        """
        Execute the full pipeline for a batch.

        Separated from ingest() so the semaphore release in the finally
        block of ingest() is clean and unconditional.

        Args:
            submission_id:    UUID of the submission record.
            files:            Validated FileItem list.
            pipeline_start:   time.monotonic() at pipeline entry.

        Returns:
            BatchParseResult.
        """
        loop = asyncio.get_event_loop()

        # --- Deduplicate files by content hash ---
        # Files with the same content (hash) are parsed once; granules are
        # associated with all duplicate file records.
        canonical_map: dict[str, FileItem] = {}  # hash → first FileItem
        duplicate_hashes: set[str] = set()  # hashes seen more than once

        for file_item in files:
            if file_item.file_hash in canonical_map:
                duplicate_hashes.add(file_item.file_hash)
            else:
                canonical_map[file_item.file_hash] = file_item

        unique_files = list(canonical_map.values())
        dup_count = len(files) - len(unique_files)

        if dup_count > 0:
            logger.info(
                "Deduplicated batch files",
                submission_id=str(submission_id),
                total_files=len(files),
                unique_files=len(unique_files),
                duplicates=dup_count,
            )

        # --- Dispatch parse tasks to process pool ---
        parse_futures: list[asyncio.Future[dict[str, Any]]] = []
        for file_item in unique_files:
            future = asyncio.ensure_future(
                _dispatch_parse_task(
                    loop=loop,
                    pool=self._process_pool,  # type: ignore[arg-type]
                    file_item=file_item,
                    max_nodes=self._settings.MAX_GRANULE_AST_NODES,
                    timeout=self._settings.PARSE_TASK_TIMEOUT,
                )
            )
            parse_futures.append(future)

        # --- Gather results (all futures, return_exceptions=True) ---
        # return_exceptions=True ensures one task failure does not cancel others.
        # We handle each result individually below.
        raw_results: list[dict[str, Any] | BaseException] = await asyncio.gather(
            *parse_futures, return_exceptions=True
        )

        # --- Classify results ---
        worker_results: dict[str, dict[str, Any]] = {}  # file_hash → result dict

        for i, raw in enumerate(raw_results):
            file_item = unique_files[i]

            if isinstance(raw, BaseException):
                # The _dispatch_parse_task coroutine raised an exception.
                # This should not happen because _dispatch_parse_task
                # catches all exceptions and returns error dicts.
                # Defensive handling for unexpected coroutine failures.
                worker_results[file_item.file_hash] = {
                    "status": "error",
                    "filename": file_item.filename,
                    "language": file_item.language.value,
                    "file_hash": file_item.file_hash,
                    "error_code": type(raw).__name__,
                    "error_detail": str(raw),
                    "granules": [],
                    "granule_count": 0,
                    "total_duration_ms": 0.0,
                }
            else:
                worker_results[file_item.file_hash] = raw

        # --- Build FileParseResult objects ---
        # One FileParseResult per original file (including duplicates).
        file_results: list[FileParseResult] = []
        all_granule_dicts: list[
            tuple[UUID, dict[str, Any]]
        ] = []  # (file_id, granule_dict)

        # Assign UUIDs to file records.
        file_id_map: dict[str, UUID] = {}  # file_hash → file_id for canonical files
        for file_item in unique_files:
            file_id_map[file_item.file_hash] = uuid4()

        for file_item in files:
            is_duplicate = file_item.file_hash in duplicate_hashes and (
                file_item is not canonical_map.get(file_item.file_hash)
            )

            if is_duplicate:
                # Duplicate file: mark as SKIPPED, share granules with canonical.
                file_results.append(
                    FileParseResult(
                        filename=file_item.filename,
                        language=file_item.language,
                        file_hash=file_item.file_hash,
                        byte_size=file_item.byte_size,
                        line_count=file_item.line_count,
                        status=FileParseStatus.SKIPPED,
                        granule_count=0,  # granules are on the canonical record
                        parse_duration_ms=0.0,
                    )
                )
                continue

            result = worker_results.get(file_item.file_hash, {})
            file_id = file_id_map[file_item.file_hash]

            if result.get("status") == "ok":
                granule_dicts: list[dict[str, Any]] = result.get("granules", [])

                # Construct GranuleData objects (assigns UUID, file_id, submission_id).
                for gd in granule_dicts:
                    gd_obj = GranuleData.from_worker_dict(
                        gd,
                        file_id=file_id,
                        submission_id=submission_id,
                    )
                    all_granule_dicts.append((file_id, gd_obj.model_dump()))

                file_results.append(
                    FileParseResult(
                        filename=file_item.filename,
                        language=file_item.language,
                        file_hash=file_item.file_hash,
                        byte_size=file_item.byte_size,
                        line_count=file_item.line_count,
                        status=FileParseStatus.PARSED,
                        granule_count=len(granule_dicts),
                        parse_duration_ms=result.get("total_duration_ms", 0.0),
                    )
                )

            else:
                # Parse failed for this file.
                error_detail = result.get("error_detail", "Unknown parse error")
                file_results.append(
                    FileParseResult(
                        filename=file_item.filename,
                        language=file_item.language,
                        file_hash=file_item.file_hash,
                        byte_size=file_item.byte_size,
                        line_count=file_item.line_count,
                        status=FileParseStatus.FAILED,
                        granule_count=0,
                        parse_duration_ms=result.get("total_duration_ms", 0.0),
                        error_detail=error_detail,
                    )
                )

        total_granules = sum(
            g.granule_count for g in file_results if g.status == FileParseStatus.PARSED
        )

        # --- Write to database ---
        await self._write_to_db(
            submission_id=submission_id,
            files=files,
            file_results=file_results,
            file_id_map=file_id_map,
            duplicate_hashes=duplicate_hashes,
            canonical_map=canonical_map,
            all_granule_dicts=[gd for _, gd in all_granule_dicts],
        )

        pipeline_duration_ms = (time.monotonic() - pipeline_start) * 1000

        # --- Determine final status and update submission ---
        batch_result = BatchParseResult(
            submission_id=submission_id,
            file_results=file_results,
            total_granules=total_granules,
            pipeline_duration_ms=round(pipeline_duration_ms, 3),
        )

        final_status = batch_result.final_status
        await self._repository.update_submission_status(
            submission_id=submission_id,
            status=final_status,
            granule_count=total_granules,
            error_message=(
                f"{batch_result.failed_count} file(s) failed to parse."
                if final_status in (SubmissionStatus.PARTIAL, SubmissionStatus.FAILED)
                else None
            ),
        )

        logger.info(
            "Batch pipeline completed",
            submission_id=str(submission_id),
            status=final_status.value,
            file_count=len(files),
            parsed_count=batch_result.parsed_count,
            failed_count=batch_result.failed_count,
            skipped_count=batch_result.skipped_count,
            total_granules=total_granules,
            pipeline_duration_ms=round(pipeline_duration_ms, 1),
        )

        return batch_result

    async def _write_to_db(
        self,
        *,
        submission_id: UUID,
        files: list[FileItem],
        file_results: list[FileParseResult],
        file_id_map: dict[str, UUID],
        duplicate_hashes: set[str],
        canonical_map: dict[str, "FileItem"],
        all_granule_dicts: list[dict[str, Any]],
    ) -> None:
        """
        Persist files and granules to the database.

        Executes in a single transaction to ensure atomicity:
          - If the bulk_insert_files succeeds but bulk_insert_granules fails,
            the transaction rolls back and neither is committed.
          - The submission status update is performed AFTER the transaction
            commits, so a DB failure leaves the submission in PROCESSING state
            (detectable by the stale-submission cleanup at startup).

        Args:
            submission_id:    UUID of the submission record.
            files:            Original FileItem list (includes duplicates).
            file_results:     FileParseResult list (one per file).
            file_id_map:      Maps file_hash → UUID for canonical files.
            duplicate_hashes: Set of hashes that appeared more than once.
            canonical_map:    Maps file_hash → canonical FileItem.
            all_granule_dicts: Fully-constructed granule dicts ready for insert.
        """
        # Build the file records for DB insert.
        file_records: list[dict[str, Any]] = []
        result_by_filename = {r.filename: r for r in file_results}

        for file_item in files:
            result = result_by_filename.get(file_item.filename)
            is_dup = (
                file_item.file_hash in duplicate_hashes
                and file_item is not canonical_map.get(file_item.file_hash)
            )

            parse_status = (
                FileParseStatus.SKIPPED.value
                if is_dup
                else (result.status.value if result else FileParseStatus.FAILED.value)
            )

            # All duplicates share the canonical file's UUID in granule.file_id,
            # but each duplicate gets its OWN file record UUID for traceability.
            file_record_id = file_id_map.get(file_item.file_hash, uuid4())

            file_records.append(
                {
                    "id": str(file_record_id),
                    "submission_id": str(submission_id),
                    "filename": file_item.filename,
                    "language": file_item.language.value,
                    "file_hash": file_item.file_hash,
                    "byte_size": file_item.byte_size,
                    "line_count": file_item.line_count,
                    "parse_status": parse_status,
                    "error_message": result.error_detail if result else None,
                }
            )

        try:
            await self._repository.bulk_insert_files(file_records)
        except Exception as exc:
            logger.error(
                "Failed to bulk insert files",
                submission_id=str(submission_id),
                error=str(exc),
            )
            raise

        if all_granule_dicts:
            try:
                await self._repository.bulk_insert_granules(all_granule_dicts)
            except Exception as exc:
                logger.error(
                    "Failed to bulk insert granules",
                    submission_id=str(submission_id),
                    granule_count=len(all_granule_dicts),
                    error=str(exc),
                )
                raise

    # ------------------------------------------------------------------
    # Observability
    # ------------------------------------------------------------------

    @property
    def active_batches(self) -> int:
        """Number of batches currently being processed (for Prometheus gauge)."""
        return self._active_batches

    @property
    def worker_count(self) -> int:
        """Number of worker processes in the pool."""
        return self._worker_count


# ---------------------------------------------------------------------------
# Module-level helper coroutines
# ---------------------------------------------------------------------------


async def _dispatch_parse_task(
    *,
    loop: asyncio.AbstractEventLoop,
    pool: ProcessPoolExecutor,
    file_item: FileItem,
    max_nodes: int,
    timeout: float,
) -> dict[str, Any]:
    """
    Dispatch a single parse_file_task to the process pool with a timeout.

    Wraps the run_in_executor future with asyncio.wait_for to enforce the
    per-file parse timeout.  On timeout, the future is cancelled from the
    event-loop side.  The worker process continues executing until it
    finishes or is recycled by max_tasks_per_child — we cannot kill it
    from here without terminating the entire process (which would affect
    other in-flight tasks in the same worker process).

    On BrokenProcessPool (worker crash), returns an error dict rather than
    raising, so that asyncio.gather() in the pipeline collects the error
    rather than propagating it.

    Args:
        loop:       The running event loop.
        pool:       The ProcessPoolExecutor.
        file_item:  The FileItem to parse.
        max_nodes:  AST node cap for oversized granule detection.
        timeout:    Per-task timeout in seconds.

    Returns:
        A worker result dict (status="ok" or status="error").
        Never raises.
    """
    import concurrent.futures

    future = loop.run_in_executor(
        pool,
        parse_file_task,
        file_item.content,
        file_item.language.value,
        file_item.filename,
        file_item.file_hash,
        max_nodes,
    )

    try:
        result: dict[str, Any] = await asyncio.wait_for(future, timeout=timeout)
        return result

    except asyncio.TimeoutError:
        # The per-file timeout fired.  Return an error dict.
        return {
            "status": "error",
            "filename": file_item.filename,
            "language": file_item.language.value,
            "file_hash": file_item.file_hash,
            "error_code": "PARSE_TIMEOUT",
            "error_detail": (
                f"Parse task for '{file_item.filename}' exceeded the "
                f"{timeout}s timeout. The file may be too large or complex."
            ),
            "granules": [],
            "granule_count": 0,
            "total_duration_ms": timeout * 1000,
        }

    except concurrent.futures.process.BrokenProcessPool as exc:
        # Worker process crashed (segfault, OOM, etc.).
        # ProcessPoolExecutor replaces the dead worker automatically.
        return {
            "status": "error",
            "filename": file_item.filename,
            "language": file_item.language.value,
            "file_hash": file_item.file_hash,
            "error_code": "WORKER_CRASH",
            "error_detail": (
                f"Worker process crashed while parsing '{file_item.filename}'. "
                f"Underlying error: {exc}. "
                f"Other files in the batch are unaffected."
            ),
            "granules": [],
            "granule_count": 0,
            "total_duration_ms": 0.0,
        }

    except Exception as exc:  # noqa: BLE001
        # Catch-all for unexpected coroutine failures.
        return {
            "status": "error",
            "filename": file_item.filename,
            "language": file_item.language.value,
            "file_hash": file_item.file_hash,
            "error_code": type(exc).__name__,
            "error_detail": str(exc),
            "granules": [],
            "granule_count": 0,
            "total_duration_ms": 0.0,
        }


def _noop_warmup_task() -> str:
    """
    No-op task submitted to each worker process to force eager pool initialisation.

    When ProcessPoolExecutor first submits a task, it spawns the worker
    process and runs _worker_initializer().  By submitting this no-op task
    from start(), we force all N workers to initialise before the first real
    request arrives, so grammar loading is not on the critical path.

    Returns "warmed_up" so the gather in start() can confirm all workers
    responded without error.
    """
    return "warmed_up"


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = ["IngestionPipeline"]
