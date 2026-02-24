# gradeloop-core-v2/apps/services/cipas-service/src/cipas/extraction/granule_extractor.py
"""
Granule extractor: RawGranule → GranuleData (as plain dict for IPC safety).

Responsibilities:
  - Accept a list of RawGranule objects produced by a LanguageParser.
  - For each RawGranule:
      1. Decode source_bytes → str (UTF-8, replace errors)
      2. Apply Type-1 normalisation via normalizer.type1_normalise()
      3. Compute granule_hash = SHA-256(normalised_source)
      4. Compute ast_fingerprint = SHA-256("|".join(node_type_sequence))
      5. Convert span from 0-indexed (tree-sitter) to 1-indexed (storage)
      6. Return a plain dict (not a Pydantic model) for subprocess IPC safety

  - Oversized granules (RawGranule.is_oversized == True) are stored with
    normalized_source = "" and granule_hash = OVERSIZED_SENTINEL_HASH.
    They are still persisted so the DB reflects their existence, but they
    are excluded from hash-based clone queries via a WHERE clause.

Design constraints:
  - This module has ZERO non-stdlib imports beyond cipas.extraction.normalizer
    and cipas.parsing.base.  It must be importable and executable inside the
    subprocess worker process without importing Pydantic, FastAPI, asyncpg,
    or any other heavyweight dependency.
  - All return values are plain Python dicts — no Pydantic, no dataclass,
    no namedtuple — because the worker subprocess returns results via pickle
    IPC and we want the smallest possible serialised payload.
  - UUID assignment is NOT performed here.  UUIDs (granule.id, file_id,
    submission_id) are assigned server-side in the pipeline after the worker
    returns, so the worker remains stateless with respect to the DB.

Worker process call path:
  parse_file_task()
    → parser.parse(source_bytes)                       [tree-sitter]
    → parser.extract_raw_granules(tree, source_bytes)  [TSQuery]
    → GranuleExtractor.extract(raw_granules, ...)       [this module]
    → List[dict]                                        [returned via pickle]

Returned dict schema (matches GranuleData.from_worker_dict() field names):
  {
    "granule_type":       str,    # "class" | "function" | "loop"
    "language":           str,    # "python" | "java" | "c"
    "file_hash":          str,    # 64-char lowercase hex (SHA-256)
    "granule_hash":       str,    # 64-char lowercase hex (SHA-256)
    "ast_fingerprint":    str,    # 64-char lowercase hex (SHA-256)
    "start_line":         int,    # 1-indexed
    "end_line":           int,    # 1-indexed, inclusive
    "name":               str | None,
    "normalized_source":  str,    # Type-1 normalised; empty if oversized
    "is_oversized":       bool,
    "node_count":         int,    # len(node_type_sequence) — for observability
  }
"""

from __future__ import annotations

import hashlib
from typing import Any

from cipas.extraction.normalizer import type1_normalise_bytes
from cipas.parsing.base import RawGranule

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Sentinel hash stored in granule_hash for oversized granules.
# 64 zeros is not a valid SHA-256 output (SHA-256 always produces a non-zero
# hash for any non-empty input and for the empty string produces a known hash
# that is NOT all zeros).  Using all-zeros makes it trivially filterable in
# SQL:  WHERE granule_hash != '0000...000'
OVERSIZED_SENTINEL_HASH: str = "0" * 64

# SHA-256 of the empty string — used as granule_hash when normalized_source
# is empty (e.g. a granule whose source bytes are entirely comments).
# Stored as-is; the clone detection layer skips empty-source granules.
_EMPTY_STRING_SHA256: str = hashlib.sha256(b"").hexdigest()


# ---------------------------------------------------------------------------
# GranuleExtractor
# ---------------------------------------------------------------------------


class GranuleExtractor:
    """
    Transforms RawGranule objects into serialisable dicts ready for DB insertion.

    Stateless after construction.  Safe to instantiate once per worker process
    and reuse across all parse tasks (called by _worker_initializer).

    The extractor is language-agnostic: it applies the same normalisation and
    hashing logic to all languages.  Language-specific behaviour lives entirely
    in the LanguageParser implementations.

    Usage in worker subprocess:
        extractor = GranuleExtractor()
        granule_dicts = extractor.extract(
            raw_granules=raw_granules,
            language="python",
            file_hash="abc123...",
        )
    """

    def extract(
        self,
        raw_granules: list[RawGranule],
        *,
        language: str,
        file_hash: str,
    ) -> list[dict[str, Any]]:
        """
        Convert a list of RawGranule objects to plain dicts for IPC return.

        Processing per granule:
          1. Decode source_bytes to str (UTF-8, errors=replace)
          2. Type-1 normalise the decoded string
          3. Compute granule_hash from normalised_source
          4. Compute ast_fingerprint from node_type_sequence
          5. Convert span from 0-indexed to 1-indexed
          6. Build and return the result dict

        Oversized granules (is_oversized=True):
          - normalized_source is set to "" (do not attempt to normalise a
            potentially massive string)
          - granule_hash is set to OVERSIZED_SENTINEL_HASH ("000...0")
          - ast_fingerprint is still computed from the (truncated)
            node_type_sequence so structural queries can still find them

        Args:
            raw_granules: List of RawGranule from LanguageParser.extract_raw_granules().
            language:     Language key string (e.g. "python", "java", "c").
            file_hash:    SHA-256 hex digest of the raw file bytes.
                          Denormalised onto each granule for clone query performance.

        Returns:
            List of plain dicts, one per input RawGranule.
            May be empty if raw_granules is empty.
            Never raises — individual granule failures produce an error sentinel
            dict rather than propagating an exception (see _error_sentinel()).
        """
        results: list[dict[str, Any]] = []
        for raw in raw_granules:
            try:
                result = self._process_one(raw, language=language, file_hash=file_hash)
            except Exception as exc:  # noqa: BLE001 — intentional catch-all in worker
                # An individual granule processing failure must not abort the
                # entire file.  Log the error (to stderr since we are in a
                # subprocess with no configured logger) and return an error
                # sentinel dict that the pipeline will filter out.
                import sys

                print(
                    f"[cipas.extraction] WARNING: Failed to process granule "
                    f"type={raw.granule_type!r} "
                    f"lines={raw.span.start_line + 1}-{raw.span.end_line + 1}: "
                    f"{exc}",
                    file=sys.stderr,
                )
                result = _error_sentinel(raw, language=language, file_hash=file_hash)
            results.append(result)
        return results

    def _process_one(
        self,
        raw: RawGranule,
        *,
        language: str,
        file_hash: str,
    ) -> dict[str, Any]:
        """
        Process a single RawGranule into a result dict.

        Args:
            raw:       A RawGranule from the parser.
            language:  Language key string.
            file_hash: SHA-256 of the parent file's raw bytes.

        Returns:
            A dict matching the GranuleData.from_worker_dict() field schema.
        """
        # --- Compute AST fingerprint (always, even for oversized granules) ---
        # The fingerprint is computed from the (possibly truncated) node_type_sequence.
        # For oversized granules, the sequence is truncated to max_nodes by the parser.
        # This means oversized granules have an approximate fingerprint — acceptable
        # because they are excluded from exact clone detection anyway.
        ast_fingerprint = _hash_node_sequence(raw.node_type_sequence)

        # --- Handle oversized granules ---
        if raw.is_oversized:
            return {
                "granule_type": raw.granule_type,
                "language": language,
                "file_hash": file_hash,
                "granule_hash": OVERSIZED_SENTINEL_HASH,
                "ast_fingerprint": ast_fingerprint,
                "start_line": raw.span.start_line + 1,  # 0→1 indexed
                "end_line": raw.span.end_line + 1,  # 0→1 indexed
                "name": raw.name,
                "normalized_source": "",
                "is_oversized": True,
                "node_count": len(raw.node_type_sequence),
            }

        # --- Normal path ---

        # Step 1 + 2: Decode + Type-1 normalise.
        # type1_normalise_bytes handles both decoding (UTF-8, errors=replace)
        # and normalisation (strip comments, collapse whitespace).
        normalized_source = type1_normalise_bytes(raw.source_bytes)

        # Step 3: granule_hash = SHA-256(normalised_source encoded as UTF-8).
        # The normalised string is re-encoded as UTF-8 for consistent hashing.
        # Empty normalised_source (e.g. a granule that was entirely comments)
        # produces the known SHA-256 of the empty string.
        granule_hash = _sha256_str(normalized_source)

        return {
            "granule_type": raw.granule_type,
            "language": language,
            "file_hash": file_hash,
            "granule_hash": granule_hash,
            "ast_fingerprint": ast_fingerprint,
            "start_line": raw.span.start_line + 1,  # 0→1 indexed
            "end_line": raw.span.end_line + 1,  # 0→1 indexed
            "name": raw.name,
            "normalized_source": normalized_source,
            "is_oversized": False,
            "node_count": len(raw.node_type_sequence),
        }


# ---------------------------------------------------------------------------
# Module-level singleton (subprocess worker uses this instance)
# ---------------------------------------------------------------------------

# One shared GranuleExtractor instance per subprocess worker.
# Constructed at module load time; stateless so sharing is safe.
_DEFAULT_EXTRACTOR: GranuleExtractor = GranuleExtractor()


def extract_granules(
    raw_granules: list[RawGranule],
    *,
    language: str,
    file_hash: str,
) -> list[dict[str, Any]]:
    """
    Module-level convenience function using the shared GranuleExtractor instance.

    This is the primary entry point called from cipas/ingestion/worker.py's
    parse_file_task() function.  Using a module-level function (rather than a
    method call) keeps the worker task function clean and avoids passing the
    extractor instance through the executor IPC boundary.

    Args:
        raw_granules: Output of LanguageParser.extract_raw_granules().
        language:     Language key (e.g. "python").
        file_hash:    SHA-256 hex of the raw file bytes.

    Returns:
        List[dict] — one dict per RawGranule, suitable for GranuleData.from_worker_dict().
    """
    return _DEFAULT_EXTRACTOR.extract(
        raw_granules,
        language=language,
        file_hash=file_hash,
    )


# ---------------------------------------------------------------------------
# Hashing helpers
# ---------------------------------------------------------------------------


def _sha256_str(text: str) -> str:
    """
    Compute SHA-256 of a UTF-8 encoded string and return the lowercase hex digest.

    Returns the known SHA-256 of the empty string for empty input:
      SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

    Args:
        text: A Python str (UTF-8 conceptually).

    Returns:
        64-character lowercase hex string.
    """
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _sha256_bytes(data: bytes) -> str:
    """
    Compute SHA-256 of raw bytes and return the lowercase hex digest.

    Args:
        data: Raw bytes.

    Returns:
        64-character lowercase hex string.
    """
    return hashlib.sha256(data).hexdigest()


def _hash_node_sequence(node_types: list[str]) -> str:
    """
    Compute the AST fingerprint from a DFS node-type sequence.

    The fingerprint is the SHA-256 of the pipe-delimited node type string:
        SHA-256("function_definition|identifier|parameters|...")

    Design rationale:
      - The "|" delimiter prevents false collisions between sequences where
        one type's suffix matches another type's prefix (e.g., "for_stmt" vs
        "f|or_stmt" — contrived but possible with custom grammars).
      - The sequence contains only NAMED node types (anonymous punctuation
        nodes are excluded by the parser's _dfs_node_types function).
        This makes the fingerprint stable across minor grammar versions that
        change how punctuation is tokenised.
      - The sequence is language-specific (tree-sitter node types differ by
        grammar), so fingerprints from different languages are never equal in
        practice (even if the structural pattern is similar).  Phase 2 cross-
        language clone detection will require a language-normalised fingerprint.

    Args:
        node_types: List of node.type strings from DFS traversal.
                    May be empty (produces SHA-256 of "").

    Returns:
        64-character lowercase hex string.
    """
    if not node_types:
        return _sha256_str("")
    joined = "|".join(node_types)
    return hashlib.sha256(joined.encode("ascii", errors="replace")).hexdigest()


def compute_file_hash(content: bytes) -> str:
    """
    Compute the file hash for a raw file content buffer.

    Called in the event-loop context (before dispatch to the process pool)
    to compute file_hash from the validated raw bytes.  The same hash is
    passed into parse_file_task() and stored on both the `files` row and
    all `granules` rows for that file (denormalised for query performance).

    Args:
        content: Raw UTF-8 encoded file bytes.

    Returns:
        64-character lowercase hex string (SHA-256).
    """
    return _sha256_bytes(content)


# ---------------------------------------------------------------------------
# Error sentinel
# ---------------------------------------------------------------------------


def _error_sentinel(
    raw: RawGranule,
    *,
    language: str,
    file_hash: str,
) -> dict[str, Any]:
    """
    Build an error-sentinel dict for a granule that failed processing.

    Error sentinels are filtered out by the pipeline (they are NOT inserted
    into the DB) — they are used only for logging and observability.  The
    pipeline identifies sentinels by the presence of "extraction_error": True.

    A granule failing extraction is a recoverable error at the granule level.
    The containing file is still marked PARSED (not FAILED); only the failed
    granule is omitted from the DB write.

    Args:
        raw:      The RawGranule that failed processing.
        language: Language key.
        file_hash: SHA-256 of the parent file.

    Returns:
        A dict with "extraction_error": True and span/type information for
        diagnostic logging.
    """
    return {
        "granule_type": raw.granule_type,
        "language": language,
        "file_hash": file_hash,
        "granule_hash": OVERSIZED_SENTINEL_HASH,
        "ast_fingerprint": OVERSIZED_SENTINEL_HASH,
        "start_line": raw.span.start_line + 1,
        "end_line": raw.span.end_line + 1,
        "name": raw.name,
        "normalized_source": "",
        "is_oversized": False,
        "node_count": 0,
        "extraction_error": True,  # Sentinel flag — pipeline filters this out
    }


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "GranuleExtractor",
    "extract_granules",
    "compute_file_hash",
    "OVERSIZED_SENTINEL_HASH",
    # Hash helpers exposed for tests
    "_sha256_str",
    "_sha256_bytes",
    "_hash_node_sequence",
]
