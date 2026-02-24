# gradeloop-core-v2/apps/services/cipas-service/src/cipas/ingestion/worker.py
"""
Subprocess-safe parse worker for the CIPAS ingestion pipeline.

This module provides:
  - _worker_initializer()   Called once per worker process at pool startup.
                            Pre-loads all language parsers and the extractor
                            into process-global variables so they are reused
                            across tasks (O(ms) init amortised to zero per task).

  - parse_file_task()       The unit of work dispatched to each worker.
                            Accepts raw bytes + metadata, returns List[dict].
                            Must be a module-level function to be picklable
                            by ProcessPoolExecutor.

Critical design constraints:
  ─────────────────────────────────────────────────────────────────────────────
  1. MODULE-LEVEL FUNCTION REQUIREMENT
     ProcessPoolExecutor serialises task callables via pickle. Only module-level
     functions are picklable. Lambdas, instance methods, and closures are NOT.
     parse_file_task() is module-level — do not move it inside a class.

  2. PICKLABLE ARGUMENTS ONLY
     Arguments passed to run_in_executor() are pickled across the IPC pipe.
     All parameters to parse_file_task() must be basic Python types:
       bytes, str, int, float, bool, None, list, dict (of the above).
     Never pass: asyncpg connections, asyncio objects, file handles,
     tree-sitter Node/Tree objects, Pydantic models, or UUIDs.

  3. PICKLABLE RETURN VALUES ONLY
     parse_file_task() returns a plain dict. Pydantic models and dataclasses
     are avoided here because (a) Pydantic's import cost (~50ms) inside a
     fresh subprocess adds up, and (b) keeping returns as plain dicts
     minimises the pickle payload size.

  4. NO ASYNCIO IN WORKER PROCESSES
     Worker processes have no event loop. All code in this module must be
     synchronous. Never import asyncio here.

  5. NO DB ACCESS IN WORKER PROCESSES
     Workers are pure CPU computation units. DB connections (asyncpg pools)
     live exclusively in the event-loop process. Workers return results;
     the pipeline writes them.

  6. STDERR LOGGING IN WORKERS
     The Loguru logger (configured in the event-loop process) is NOT
     accessible in worker subprocesses — the enqueue=True logger sink runs
     in the event-loop process's background thread, not in the subprocess.
     Workers use print(..., file=sys.stderr) for diagnostic output.
     These appear in the container's stderr stream and are collected by the
     Docker logging driver.

  7. WORKER PROCESS MEMORY MANAGEMENT
     - max_tasks_per_child (set on the ProcessPoolExecutor) recycles worker
       processes after N tasks to return fragmented heap memory to the OS.
     - Explicit `tree = None` after extraction dereferences the tree-sitter
       Tree, allowing Python GC to free the C-level parse tree immediately.
     - Source bytes are NOT stored beyond the parse call (no assignment to
       module global).

Worker process call path:
  _worker_initializer()
    ├── get_all_parser_instances()   → warms _PROCESS_PARSERS
    └── GranuleExtractor()           → warms _PROCESS_EXTRACTOR

  parse_file_task(source_bytes, language, filename, file_hash, max_nodes)
    ├── _PROCESS_PARSERS[language].parse(source_bytes)
    │       → tree_sitter.Tree
    ├── _PROCESS_PARSERS[language].extract_raw_granules(tree, source_bytes, max_nodes)
    │       → List[RawGranule]
    ├── tree = None                  (explicit dereference)
    └── _PROCESS_EXTRACTOR.extract(raw_granules, language=language, file_hash=file_hash)
            → List[dict]             (returned via pickle IPC)
"""

from __future__ import annotations

import sys
import time
from typing import Any

# ---------------------------------------------------------------------------
# Process-global state
# ---------------------------------------------------------------------------
# These variables are module-globals WITHIN each worker subprocess.
# They are populated by _worker_initializer() and are NEVER set in the
# event-loop (parent) process — each subprocess has its own independent
# copy of these variables.
#
# Naming convention: _PROCESS_* to signal "belongs to this subprocess".
#
# Type annotation uses Any to avoid importing heavy types (LanguageParser,
# GranuleExtractor) at the top of this module — those imports happen inside
# _worker_initializer() to keep this module importable in the parent process
# without triggering tree-sitter grammar loading.

_PROCESS_PARSERS: dict[str, Any] = {}
_PROCESS_EXTRACTOR: Any = None
_PROCESS_WORKER_ID: int = -1  # set in initializer for diagnostic logging


# ---------------------------------------------------------------------------
# Worker initializer  (called once per subprocess at pool startup)
# ---------------------------------------------------------------------------


def _worker_initializer(worker_id: int = 0) -> None:
    """
    Pre-load all language parsers and the granule extractor into process globals.

    Called by ProcessPoolExecutor with the `initializer` parameter.  Runs once
    per worker process at pool startup — NOT once per task.  After this function
    returns, the worker process is ready to handle parse_file_task() calls with
    zero per-task warm-up cost.

    Timing (approximate on modern hardware):
      - import tree_sitter_languages:  ~5ms (shared library already mmap'd after
        the first worker loads it; subsequent workers benefit from OS page cache)
      - get_all_parser_instances():    ~20–50ms (compiles TSQueries for each language)
      - GranuleExtractor():            ~0ms (no heavy __init__ logic)
    Total per worker: ~25–55ms, amortised across all tasks in the worker's lifetime.

    Process globals set:
      _PROCESS_PARSERS:   dict[str, LanguageParser]  — one instance per language
      _PROCESS_EXTRACTOR: GranuleExtractor
      _PROCESS_WORKER_ID: int                         — for diagnostic logging

    Failure handling:
      If any parser fails to initialise (e.g. grammar file missing, incompatible
      tree-sitter version), this function prints to stderr and re-raises.
      ProcessPoolExecutor will mark the worker as broken and replace it.
      The event-loop process will see a BrokenProcessPool error on the next
      run_in_executor() call, which the pipeline catches as WorkerCrashError.

    Args:
        worker_id: An optional integer identifier for this worker process,
                   assigned by the pipeline for diagnostic logging.
                   Defaults to 0 if not provided (initializer doesn't receive
                   the worker index from ProcessPoolExecutor directly; callers
                   pass it via initializer_args).
    """
    global _PROCESS_PARSERS, _PROCESS_EXTRACTOR, _PROCESS_WORKER_ID

    _PROCESS_WORKER_ID = worker_id

    _log_worker(
        f"Initializing worker process (pid={_get_pid()}, worker_id={worker_id})"
    )

    try:
        # Import here (not at module top) to defer grammar loading to subprocess.
        # In the parent process, this module is imported to register parse_file_task
        # as the executor callable — we must NOT load tree-sitter there.
        from cipas.parsing.registry import get_all_parser_instances

        t0 = time.monotonic()
        _PROCESS_PARSERS = get_all_parser_instances()
        parser_init_ms = (time.monotonic() - t0) * 1000

        _log_worker(
            f"Parsers loaded: {list(_PROCESS_PARSERS.keys())} in {parser_init_ms:.1f}ms"
        )
    except Exception as exc:
        _log_worker(
            f"FATAL: Failed to load language parsers: {exc}",
            level="ERROR",
        )
        raise

    try:
        from cipas.extraction.granule_extractor import GranuleExtractor

        _PROCESS_EXTRACTOR = GranuleExtractor()
        _log_worker("GranuleExtractor initialised")
    except Exception as exc:
        _log_worker(
            f"FATAL: Failed to initialise GranuleExtractor: {exc}",
            level="ERROR",
        )
        raise

    _log_worker(
        f"Worker process ready "
        f"(pid={_get_pid()}, languages={list(_PROCESS_PARSERS.keys())})"
    )


# ---------------------------------------------------------------------------
# Parse task  (module-level function — picklable by ProcessPoolExecutor)
# ---------------------------------------------------------------------------


def parse_file_task(
    source_bytes: bytes,
    language: str,
    filename: str,
    file_hash: str,
    max_nodes: int = 10_000,
) -> dict[str, Any]:
    """
    Parse a single source file and extract granules. Runs in a worker subprocess.

    This is the unit of work dispatched via:
        loop.run_in_executor(process_pool, parse_file_task, ...)

    All parameters and the return value are plain Python types to satisfy
    pickle serialisation requirements for IPC.

    Processing steps:
        1. Validate that the language parser is available (_PROCESS_PARSERS).
        2. Call parser.parse(source_bytes) → tree-sitter Tree.
        3. Call parser.extract_raw_granules(tree, source_bytes, max_nodes=max_nodes)
           → List[RawGranule].
        4. Explicitly dereference the Tree (tree = None) to allow GC.
        5. Call extractor.extract(raw_granules, language, file_hash) → List[dict].
        6. Filter out error sentinels (extraction_error=True).
        7. Return the result dict.

    Args:
        source_bytes: Raw UTF-8 encoded content of the source file.
                      Maximum size is enforced by the caller (MAX_FILE_SIZE_BYTES).
                      The worker does not re-validate size.
        language:     Language key string (e.g. "python", "java", "c").
                      Must be a key in _PROCESS_PARSERS (set by initializer).
        filename:     Sanitised basename of the source file.
                      Used only for error messages and logging — not stored.
        file_hash:    SHA-256 hex digest of source_bytes.
                      Computed by the pipeline before dispatch (avoids
                      recomputing in the worker since the pipeline already
                      has the bytes).  Passed through to each granule dict.
        max_nodes:    Maximum AST nodes per granule before flagging as oversized.
                      Passed through to LanguageParser.extract_raw_granules().

    Returns:
        A plain dict with the following schema:

        On success:
        {
            "status":           "ok",
            "filename":         str,
            "language":         str,
            "file_hash":        str,
            "granule_count":    int,
            "oversized_count":  int,   # granules flagged as oversized
            "error_count":      int,   # granules where extraction failed
            "granules":         List[dict],  # see GranuleData.from_worker_dict()
            "parse_duration_ms": float,
            "extract_duration_ms": float,
            "total_duration_ms": float,
            "worker_id":        int,
            "pid":              int,
        }

        On failure (parse exception):
        {
            "status":        "error",
            "filename":      str,
            "language":      str,
            "file_hash":     str,
            "error_code":    str,   # exception class name
            "error_detail":  str,   # exception message
            "granules":      [],
            "granule_count": 0,
            "total_duration_ms": float,
            "worker_id":     int,
            "pid":           int,
        }

    Never raises.  All exceptions are caught and returned in the result dict
    so that a single file failure does not abort the asyncio.gather() for
    the entire batch.  The pipeline inspects result["status"] to classify
    outcomes.
    """
    wall_start = time.monotonic()
    pid = _get_pid()

    # --- Guard: initializer must have run --------------------------------
    if not _PROCESS_PARSERS or _PROCESS_EXTRACTOR is None:
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code="WORKER_NOT_INITIALIZED",
            error_detail=(
                "Worker process was not properly initialised. "
                "_PROCESS_PARSERS or _PROCESS_EXTRACTOR is empty. "
                "This indicates the ProcessPoolExecutor initializer did not run."
            ),
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )

    # --- Guard: language must be registered ------------------------------
    if language not in _PROCESS_PARSERS:
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code="UNSUPPORTED_LANGUAGE_IN_WORKER",
            error_detail=(
                f"Language {language!r} is not in the worker's parser registry. "
                f"Available languages: {list(_PROCESS_PARSERS.keys())!r}. "
                f"This is a developer error — the language should have been "
                f"validated before dispatch."
            ),
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )

    parser = _PROCESS_PARSERS[language]

    # --- Step 1: Parse source bytes → Tree --------------------------------
    parse_start = time.monotonic()
    tree: Any = None
    try:
        tree = parser.parse(source_bytes)
    except Exception as exc:
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code=type(exc).__name__,
            error_detail=str(exc),
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )
    parse_duration_ms = (time.monotonic() - parse_start) * 1000

    # Detect completely-failed parse (root node is ERROR with no children).
    # This represents a catastrophic syntax error where tree-sitter could
    # not build any useful CST.  Return an error result rather than
    # attempting granule extraction on an unusable tree.
    try:
        root = tree.root_node
        if root.type == "ERROR" and len(root.children) == 0:
            # Full error tree — no granules extractable.
            # This is still a "soft" error: the file existed and was processed,
            # but no granules were found.  The pipeline marks the file as FAILED.
            tree = None  # explicit dereference
            return _error_result(
                filename=filename,
                language=language,
                file_hash=file_hash,
                error_code="PARSE_ERROR_FULL_ERROR_TREE",
                error_detail=(
                    f"tree-sitter produced a full ERROR tree for '{filename}'. "
                    f"The file has severe syntax errors and no granules can be extracted."
                ),
                wall_start=wall_start,
                worker_id=_PROCESS_WORKER_ID,
                pid=pid,
            )
    except Exception as exc:
        tree = None
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code="TREE_INSPECTION_ERROR",
            error_detail=f"Failed to inspect parse tree root for '{filename}': {exc}",
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )

    # --- Step 2: Extract raw granules from tree ---------------------------
    extract_start = time.monotonic()
    raw_granules: list[Any] = []
    try:
        raw_granules = parser.extract_raw_granules(
            tree,
            source_bytes,
            max_nodes=max_nodes,
        )
    except Exception as exc:
        tree = None  # dereference before return
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code="GRANULE_EXTRACTION_ERROR",
            error_detail=f"Failed to extract granules from '{filename}': {exc}",
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )
    finally:
        # Explicitly dereference the Tree so the GC can free the C-level
        # parse tree memory as soon as possible.  This is critical for
        # memory management in long-lived worker processes.
        tree = None

    extract_duration_ms = (time.monotonic() - extract_start) * 1000

    # --- Step 3: Convert RawGranules → dicts ----------------------------
    granule_dicts: list[dict[str, Any]] = []
    try:
        all_dicts = _PROCESS_EXTRACTOR.extract(
            raw_granules,
            language=language,
            file_hash=file_hash,
        )
    except Exception as exc:
        return _error_result(
            filename=filename,
            language=language,
            file_hash=file_hash,
            error_code="EXTRACTOR_ERROR",
            error_detail=f"GranuleExtractor failed for '{filename}': {exc}",
            wall_start=wall_start,
            worker_id=_PROCESS_WORKER_ID,
            pid=pid,
        )

    # --- Step 4: Filter out error sentinels ------------------------------
    # error sentinels have "extraction_error": True — they are diagnostic
    # records, not DB-insertable granules.
    error_count = 0
    oversized_count = 0
    for d in all_dicts:
        if d.get("extraction_error"):
            error_count += 1
            continue
        if d.get("is_oversized"):
            oversized_count += 1
        granule_dicts.append(d)

    total_duration_ms = (time.monotonic() - wall_start) * 1000

    _log_worker(
        f"Parsed '{filename}' ({language}) → "
        f"{len(granule_dicts)} granules, "
        f"{oversized_count} oversized, "
        f"{error_count} extraction errors | "
        f"parse={parse_duration_ms:.1f}ms "
        f"extract={extract_duration_ms:.1f}ms "
        f"total={total_duration_ms:.1f}ms"
    )

    return {
        "status": "ok",
        "filename": filename,
        "language": language,
        "file_hash": file_hash,
        "granule_count": len(granule_dicts),
        "oversized_count": oversized_count,
        "error_count": error_count,
        "granules": granule_dicts,
        "parse_duration_ms": round(parse_duration_ms, 3),
        "extract_duration_ms": round(extract_duration_ms, 3),
        "total_duration_ms": round(total_duration_ms, 3),
        "worker_id": _PROCESS_WORKER_ID,
        "pid": pid,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _error_result(
    *,
    filename: str,
    language: str,
    file_hash: str,
    error_code: str,
    error_detail: str,
    wall_start: float,
    worker_id: int,
    pid: int,
) -> dict[str, Any]:
    """
    Build a standardised error result dict.

    The pipeline inspects result["status"] == "error" to classify failures.
    The error_code and error_detail are stored in the `files` row's
    error_message column and included in the SubmissionResponse.parse_failures list.

    Args:
        filename:     Sanitised basename of the file that failed.
        language:     Language key (may be "unknown" if detection failed).
        file_hash:    SHA-256 hex of the raw file bytes.
        error_code:   Machine-readable error code (exception class name or
                      sentinel string like "PARSE_ERROR_FULL_ERROR_TREE").
        error_detail: Human-readable error description.
        wall_start:   time.monotonic() at task start (to compute duration).
        worker_id:    Worker process identifier.
        pid:          OS process ID of this worker.

    Returns:
        A dict with status="error" and the provided metadata.
    """
    total_duration_ms = (time.monotonic() - wall_start) * 1000

    _log_worker(
        f"Parse FAILED for '{filename}' ({language}): [{error_code}] {error_detail}",
        level="WARNING",
    )

    return {
        "status": "error",
        "filename": filename,
        "language": language,
        "file_hash": file_hash,
        "error_code": error_code,
        "error_detail": error_detail,
        "granules": [],
        "granule_count": 0,
        "oversized_count": 0,
        "error_count": 1,
        "total_duration_ms": round(total_duration_ms, 3),
        "worker_id": worker_id,
        "pid": pid,
    }


def _log_worker(message: str, *, level: str = "INFO") -> None:
    """
    Write a diagnostic message to stderr from within a worker subprocess.

    Worker processes do not have access to the Loguru logger configured in
    the parent process (the enqueue=True sink runs in a background thread in
    the parent process, not in subprocesses).  We use print-to-stderr as a
    simple fallback.

    Messages are prefixed with [cipas.worker] and the worker PID so they are
    identifiable in aggregated container logs.

    Args:
        message: The log message string.
        level:   Log level string ("INFO", "WARNING", "ERROR", "DEBUG").
                 Used only for prefix formatting.
    """
    pid = _get_pid()
    prefix = f"[cipas.worker pid={pid} id={_PROCESS_WORKER_ID}]"
    print(f"{prefix} [{level}] {message}", file=sys.stderr, flush=True)


def _get_pid() -> int:
    """Return the current process PID (cached per call for efficiency)."""
    import os

    return os.getpid()


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "_worker_initializer",
    "parse_file_task",
]
