# gradeloop-core-v2/apps/services/cipas-service/src/cipas/extraction/normalizer.py
"""
Source normaliser for Type-1 clone detection.

Normalisation is the process of canonicalising source code so that two code
fragments that differ only in cosmetically irrelevant ways (whitespace, comments,
indentation) produce identical normalised strings — and therefore identical
granule hashes (Type-1 exact clone detection).

Phase 1 implements Type-1 normalisation only:
  - Strip single-line comments  (// ... and # ...)
  - Strip block comments        (/* ... */)
  - Collapse all whitespace sequences to a single space
  - Strip leading / trailing whitespace from the result

The normalised string is stored in granules.normalized_source and is the input
to SHA-256 hashing to produce granules.granule_hash.

Phase 2 (Type-2) will add identifier renaming on top of Type-1 normalisation.
The normaliser is designed so that Type-2 normalisation is a second pass on the
already Type-1 normalised string — i.e.:
    type2_normalised = rename_identifiers(type1_normalise(source))

This module has ZERO non-stdlib imports.  It must be importable in any context:
event loop, subprocess worker, test harness, or CLI — with no side effects.

Implementation notes:
  - All regexes are compiled once at module load time (module-level constants)
    to avoid recompilation on every call.
  - Block comment stripping uses re.DOTALL so the pattern matches across newlines.
  - The order of operations matters:
      1. Strip block comments first (they may span lines that contain //)
      2. Strip single-line comments
      3. Collapse whitespace
    If single-line comments were stripped first, a line like:
        x = 1; // comment with /* fake block start
    would leave a dangling /* that confuses the block comment regex.
  - String literals are NOT modified.  This preserves Type-1 semantics:
    two functions that differ only in a string literal value are NOT Type-1
    clones.  Phase 2 (Type-3 normalisation) may optionally replace string
    literal contents with a placeholder token.
  - The normaliser is language-agnostic: it applies the same rules to Python,
    Java, and C source.  This is correct for Phase 1 because:
      - Python uses # for single-line comments.
      - Java and C use // for single-line comments and /* */ for blocks.
      - Neither Python nor Java nor C uses the other's comment syntax in a
        way that would cause false stripping (e.g., // inside a Python
        string is not a comment, but the normaliser would strip it — this
        is accepted as a Phase 1 approximation).
    Phase 2 can switch to AST-based comment removal (using the already-parsed
    tree-sitter Tree to locate comment nodes precisely) for higher fidelity.
  - ReDoS hardening: the block comment regex uses a possessive-equivalent
    pattern (/\*[\s\S]*?\*/) with re.DOTALL rather than /\*.*?\*/ to prevent
    catastrophic backtracking on deeply nested or malformed comment-like
    sequences.  The per-file size limit (1MB) additionally bounds worst-case
    regex execution time.
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Compiled regex patterns  (compiled once at module load time)
# ---------------------------------------------------------------------------

# Block comments: /* ... */
# re.DOTALL makes . match newlines so multi-line block comments are stripped.
# Non-greedy (*?) prevents the pattern from consuming everything between the
# first /* and the last */ in a file.
_BLOCK_COMMENT_RE: re.Pattern[str] = re.compile(
    r"/\*[\s\S]*?\*/",
    re.DOTALL,
)

# Single-line comments: // ... (Java, C style)
# Matches // to end of line.  re.MULTILINE makes $ match before each \n.
_SINGLE_LINE_COMMENT_SLASH_RE: re.Pattern[str] = re.compile(
    r"//[^\n]*",
    re.MULTILINE,
)

# Single-line comments: # ... (Python style)
# Matches # to end of line.
# NOTE: This also strips # inside Python string literals (e.g. "hello # world").
# This is an accepted Phase 1 approximation.  Phase 2 should use the
# tree-sitter comment node positions to strip comments precisely.
_SINGLE_LINE_COMMENT_HASH_RE: re.Pattern[str] = re.compile(
    r"#[^\n]*",
    re.MULTILINE,
)

# Whitespace collapse: replace any sequence of whitespace chars with one space.
# Includes spaces, tabs, newlines, carriage returns, form feeds, vertical tabs.
_WHITESPACE_RE: re.Pattern[str] = re.compile(r"\s+")

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def type1_normalise(source: str) -> str:
    """
    Apply Type-1 normalisation to a source code string.

    Type-1 clones are identical code fragments after removing whitespace and
    comment differences.  Two granules are Type-1 clones iff:
        type1_normalise(granule_a.source) == type1_normalise(granule_b.source)

    This is equivalent to: granule_a.granule_hash == granule_b.granule_hash
    since granule_hash = SHA-256(type1_normalise(source)).

    Processing order:
        1. Strip /* ... */ block comments (handles multi-line blocks first)
        2. Strip // ... single-line comments
        3. Strip # ... single-line comments (Python)
        4. Collapse all whitespace sequences to a single space
        5. Strip leading/trailing whitespace from the result

    Args:
        source: Raw source code string (UTF-8 decoded, may include comments,
                mixed indentation, Windows/Unix line endings).

    Returns:
        Normalised source string.  Never raises — malformed input produces
        a best-effort normalised output.  Empty input returns "".

    Examples:
        >>> type1_normalise("def foo():\\n    # comment\\n    return 1")
        'def foo(): return 1'

        >>> type1_normalise("int x = 1; /* assign */ int y = 2;")
        'int x = 1; int y = 2;'

        >>> type1_normalise("x = 1  //  comment\\ny = 2")
        'x = 1 y = 2'
    """
    if not source:
        return ""

    # Step 1: Strip block comments /* ... */
    # Must come before single-line comment stripping to handle:
    #   x = 1; // comment with /* embedded fake block start
    # If we stripped // first, the /* would remain and confuse the block regex.
    result = _BLOCK_COMMENT_RE.sub(" ", source)

    # Step 2: Strip // single-line comments (Java, C)
    result = _SINGLE_LINE_COMMENT_SLASH_RE.sub(" ", result)

    # Step 3: Strip # single-line comments (Python)
    result = _SINGLE_LINE_COMMENT_HASH_RE.sub(" ", result)

    # Step 4: Collapse all whitespace (spaces, tabs, newlines) to single space.
    result = _WHITESPACE_RE.sub(" ", result)

    # Step 5: Strip leading and trailing whitespace.
    return result.strip()


def type1_normalise_bytes(source_bytes: bytes) -> str:
    """
    Convenience wrapper: decode bytes to str and apply Type-1 normalisation.

    Args:
        source_bytes: Raw UTF-8 encoded source bytes (as returned by
                      RawGranule.source_bytes or FileItem.content).

    Returns:
        Normalised source string.

    Notes:
        - Decoding uses errors="replace" so that non-UTF-8 sequences (e.g.
          from binary files that slipped past validation) produce replacement
          characters (U+FFFD) rather than raising UnicodeDecodeError.
        - The resulting normalised string will contain replacement characters
          if the input was non-UTF-8.  The granule will still be hashed and
          stored, but its normalised_source will be semantically meaningless.
          This is acceptable — the file should have been rejected by the
          InvalidEncodingError validator in the ingestion layer before reaching
          the normaliser.  The replacement-character behaviour is a safety net,
          not the expected code path.
    """
    decoded = source_bytes.decode("utf-8", errors="replace")
    return type1_normalise(decoded)


# ---------------------------------------------------------------------------
# Phase 2 stubs  (not implemented; defined here to document the planned API)
# ---------------------------------------------------------------------------


def type2_normalise(source: str) -> str:
    """
    [PHASE 2 STUB] Apply Type-2 normalisation (identifier renaming).

    Type-2 clones are structurally identical code that differ only in
    identifier names and literal values.  Normalisation renames all
    identifiers to a canonical form (e.g., VAR_0, VAR_1, ...) and replaces
    all string/numeric literals with a placeholder token (e.g., LITERAL).

    This requires the AST (not just the raw source) to accurately identify
    identifier nodes vs. keyword nodes vs. literal nodes.  The tree-sitter
    Tree is available in the worker process; this function will receive
    the RawGranule (which carries node_type_sequence but not a live Node
    reference after the worker returns).

    Implementation plan for Phase 2:
        1. Re-parse the normalised granule source (or use the already-parsed
           sub-tree from the parent file parse — requires node reference
           persistence which is currently not stored).
        2. Walk the AST; for each `identifier` node, replace its text with
           VAR_N where N is an incremental counter within the granule scope.
        3. For each string/number literal node, replace with LITERAL.
        4. Reconstruct the source from the modified tokens.

    For now, raises NotImplementedError to signal that this is not ready.
    """
    raise NotImplementedError(
        "Type-2 normalisation (identifier renaming) is scheduled for Phase 2. "
        "It requires AST-level token substitution which is not yet implemented."
    )


def type3_normalise(source: str) -> str:
    """
    [PHASE 2 STUB] Prepare source for Type-3 near-miss clone detection.

    Type-3 clones are near-miss copies: nearly identical code with some
    statements added, removed, or modified.  Detection requires approximate
    string matching (MinHash, edit distance) or embedding-based similarity
    rather than exact hash comparison.

    This function would produce a further-normalised form suitable as input
    to a MinHash/LSH pipeline (e.g., tokenise into n-grams) or an embedding
    model.

    For now, raises NotImplementedError.
    """
    raise NotImplementedError(
        "Type-3 normalisation is scheduled for Phase 2. "
        "It requires MinHash/LSH or embedding-model integration."
    )


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "type1_normalise",
    "type1_normalise_bytes",
    "type2_normalise",
    "type3_normalise",
]
