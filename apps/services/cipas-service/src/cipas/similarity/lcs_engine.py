# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/lcs_engine.py
"""
Optimized Longest Common Subsequence (LCS) engine for syntactic similarity scoring.

This module implements Stage 2 of the three-stage CIPAS Track A scoring pipeline:

  Stage 1: Pre-Filter      (pre_filter.py)
  Stage 2 (this module): LCS Engine
    ├── Tokenisation      — split normalised source on whitespace
    ├── DP computation    — rolling two-row DP for O(min(m,n)) space
    ├── Early termination — abort when upper bound on score < threshold
    └── Snippet alignment — backtrack matching token blocks for snippet_match
  Stage 3: Thresholding   (scorer.py)

Algorithm overview
──────────────────
Classic LCS uses O(m×n) space which is prohibitive for large granule pairs.
This implementation uses the space-efficient two-row (rolling array) variant:

    prev[j] = LCS(tokens_a[:i-1], tokens_b[:j])
    curr[j] = LCS(tokens_a[:i],   tokens_b[:j])

Only two rows of length n+1 are maintained at any time, reducing space from
O(m×n) to O(min(m,n)) by always placing the shorter sequence on the column axis.

Similarity metric
─────────────────
    similarity_score = lcs_length / max(len(tokens_a), len(tokens_b))

This is a symmetric normalised LCS similarity:
  - 1.0  → sequences are identical (LCS = the full sequence)
  - 0.0  → sequences share no common tokens
  - For Type-2 clones with identifier renaming: typically 0.75–0.95 depending
    on the ratio of identifier tokens to structural tokens.

Early termination
─────────────────
After processing row i of the DP (i tokens of `a` consumed), the maximum
achievable LCS is bounded by:

    upper_bound = current_lcs + (m - i)

where (m - i) is the maximum number of additional tokens from `a` that could
still match something in `b`.  The corresponding similarity upper bound is:

    sim_upper = upper_bound / max(m, n)

If sim_upper < threshold, no matter what the remaining tokens of `a` do, the
final similarity cannot reach the threshold.  We terminate early and mark the
result as `terminated_early=True` with the score at the termination point
(which is guaranteed to be < threshold).

This yields a dramatic speedup for genuinely dissimilar pairs: most of the CPU
budget is freed before the DP completes even 10% of the rows.

Snippet alignment
─────────────────
When a pair passes the threshold (or when forced by the caller), we perform a
second, full O(m×n) DP pass to reconstruct which tokens are part of the LCS.
The matching tokens are returned as `matching_tokens` in the LCSResult.

For performance we cap snippet extraction to SNIPPET_TOKEN_LIMIT=150 tokens
(see pre_filter.py for the constant) to bound the size of the stored snippet.

Parallelism
───────────
This module is designed to be executed inside a ProcessPoolExecutor worker.
`compare_pair_task()` is the top-level picklable function dispatched via
run_in_executor.  It has NO module-level mutable state and is safe to call
from multiple worker processes simultaneously.

This module has ZERO non-stdlib imports.  It is importable in worker subprocesses
without loading FastAPI, asyncpg, Pydantic, or any other heavyweight dependency.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Maximum tokens included in the snippet_match output.
# Matches pre_filter.SNIPPET_TOKEN_LIMIT.
_SNIPPET_TOKEN_LIMIT: int = 150

# When the DP is reconstructed for snippet alignment, we cap the matrix size
# to avoid accidental O(N²) memory use on abnormally large token sequences.
# Granules with more tokens than this limit skip snippet extraction.
_SNIPPET_MAX_TOKENS: int = 2_000


# ---------------------------------------------------------------------------
# Tokenisation helper
# ---------------------------------------------------------------------------


def tokenise(normalised_source: str) -> list[str]:
    """
    Split a Type-1 normalised source string into a token list.

    Since type1_normalise() guarantees that all whitespace is collapsed to
    a single space and leading/trailing whitespace is stripped, splitting on
    whitespace is the canonical tokenisation.

    Args:
        normalised_source: Output of type1_normalise() — comments stripped,
                           whitespace collapsed.

    Returns:
        List of token strings.  Returns [] for empty or whitespace-only input.

    Examples:
        >>> tokenise("int x = 0 ; return x ;")
        ['int', 'x', '=', '0', ';', 'return', 'x', ';']
        >>> tokenise("")
        []
    """
    if not normalised_source or not normalised_source.strip():
        return []
    return normalised_source.split()


# ---------------------------------------------------------------------------
# Core LCS computation (two-row DP with early termination)
# ---------------------------------------------------------------------------


def _lcs_score_with_early_termination(
    tokens_a: list[str],
    tokens_b: list[str],
    threshold: float,
) -> tuple[int, bool]:
    """
    Compute the LCS length between two token sequences using space-efficient DP.

    Space: O(min(m, n))  — uses two rolling rows.
    Time:  O(m × n) worst-case, better with early termination.

    Early termination:
        After processing row i, if:
            (current_lcs + (m - i)) / max(m, n) < threshold
        it is impossible to reach `threshold` — terminate immediately.
        When threshold=0.0, early termination is disabled (bound is always ≥ 0).

    Args:
        tokens_a:  Token list for sequence A.  Shorter sequence placed on rows.
        tokens_b:  Token list for sequence B.  Longer sequence placed on columns.
        threshold: Score threshold for early termination.  Set to 0.0 to disable.

    Returns:
        A tuple (lcs_length, terminated_early):
          - lcs_length:      LCS length at completion (or at termination point).
          - terminated_early: True if DP was cut short by the early termination
                               criterion.  The returned lcs_length is a lower
                               bound on the true LCS; the true score is < threshold.

    Notes:
        - Always places the shorter sequence on the row axis to minimise the
          column array size.
        - Returns (0, False) for empty inputs.
        - Returns (min(m, n), False) immediately when the inputs are equal
          (short-circuit optimisation).
    """
    m, n = len(tokens_a), len(tokens_b)

    # Trivial cases.
    if m == 0 or n == 0:
        return 0, False

    # Short-circuit: identical sequences → LCS is the full length.
    if tokens_a == tokens_b:
        return m, False

    # Ensure a is the shorter sequence (row axis) for space efficiency.
    if m > n:
        tokens_a, tokens_b = tokens_b, tokens_a
        m, n = n, m
    # Now m <= n.

    max_possible: int = n  # max(m, n) == n after the swap
    prev: list[int] = [0] * (n + 1)

    for i in range(1, m + 1):
        curr: list[int] = [0] * (n + 1)
        a_tok = tokens_a[i - 1]
        for j in range(1, n + 1):
            if a_tok == tokens_b[j - 1]:
                curr[j] = prev[j - 1] + 1
            else:
                pj = prev[j]
                cj1 = curr[j - 1]
                curr[j] = pj if pj > cj1 else cj1

        # Early termination check.
        # Upper bound: current LCS (at end of this row) + remaining rows of a.
        current_lcs: int = curr[n]
        remaining: int = m - i
        if threshold > 0.0 and (current_lcs + remaining) / max_possible < threshold:
            # Even if ALL remaining tokens of a match something in b, we still
            # cannot reach the threshold.  Terminate early.
            return current_lcs, True

        prev = curr

    return prev[n], False


# ---------------------------------------------------------------------------
# LCS backtracking for snippet alignment
# ---------------------------------------------------------------------------


def _lcs_backtrack(
    tokens_a: list[str],
    tokens_b: list[str],
) -> list[str]:
    """
    Compute the full LCS matrix and backtrack to extract the matching tokens.

    This is a standard O(m×n) space DP followed by backtracking.  It is
    intentionally separate from the space-efficient scoring DP so that the
    space cost is only incurred when snippet extraction is needed (i.e., for
    pairs that pass the threshold).

    For granules exceeding _SNIPPET_MAX_TOKENS, backtracking is skipped and
    an empty list is returned to bound memory usage.

    Args:
        tokens_a: Token list for sequence A.
        tokens_b: Token list for sequence B.

    Returns:
        List of tokens in the LCS, in order.  At most _SNIPPET_TOKEN_LIMIT tokens.
        Returns [] if either sequence is empty or either exceeds _SNIPPET_MAX_TOKENS.
    """
    m, n = len(tokens_a), len(tokens_b)
    if m == 0 or n == 0:
        return []
    # Cap to avoid OOM on pathological inputs.
    if m > _SNIPPET_MAX_TOKENS or n > _SNIPPET_MAX_TOKENS:
        return []

    # Build the full DP table.
    dp: list[list[int]] = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if tokens_a[i - 1] == tokens_b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = dp[i - 1][j] if dp[i - 1][j] > dp[i][j - 1] else dp[i][j - 1]

    # Backtrack to recover the LCS token sequence.
    lcs_tokens: list[str] = []
    i, j = m, n
    while i > 0 and j > 0:
        if tokens_a[i - 1] == tokens_b[j - 1]:
            lcs_tokens.append(tokens_a[i - 1])
            i -= 1
            j -= 1
        elif dp[i - 1][j] > dp[i][j - 1]:
            i -= 1
        else:
            j -= 1

    lcs_tokens.reverse()
    return lcs_tokens[:_SNIPPET_TOKEN_LIMIT]


# ---------------------------------------------------------------------------
# Public LCS comparison function
# ---------------------------------------------------------------------------


def compute_lcs_similarity(
    tokens_a: list[str],
    tokens_b: list[str],
    *,
    threshold: float = 0.0,
    extract_snippet: bool = False,
) -> tuple[float, bool, list[str]]:
    """
    Compute the normalised LCS similarity score between two token sequences.

    This is the primary public function of the LCS engine.  It combines
    the space-efficient DP scoring pass with optional snippet backtracking.

    Similarity formula:
        score = lcs_length / max(len(tokens_a), len(tokens_b))

    Args:
        tokens_a:        Token list for the first granule.
        tokens_b:        Token list for the second granule.
        threshold:       Early termination threshold.  0.0 disables early
                         termination (always computes full LCS).
        extract_snippet: If True and the pair is NOT terminated early, run
                         the backtracking pass to populate matching_tokens.
                         Set to True only for pairs above the clone threshold
                         to avoid paying the O(m×n) space cost for all pairs.

    Returns:
        A 3-tuple (similarity_score, terminated_early, matching_tokens):
          - similarity_score (float): LCS score in [0.0, 1.0].
          - terminated_early (bool):  True if early termination fired.
            When True, similarity_score < threshold (guaranteed).
          - matching_tokens (list[str]): LCS token sequence for snippet alignment.
            Empty when terminated_early=True or extract_snippet=False.

    Edge cases:
        - Either sequence empty → (0.0, False, [])
        - Identical sequences  → (1.0, False, tokens_a[:SNIPPET_TOKEN_LIMIT])
        - Single-token sequences with no match → (0.0, False, [])

    Examples:
        >>> compute_lcs_similarity(["a", "b", "c"], ["a", "b", "c"])
        (1.0, False, [])
        >>> compute_lcs_similarity(["a", "b", "c"], ["a", "x", "c"], threshold=0.5)
        (0.6666..., False, [])
        >>> compute_lcs_similarity(["a"], ["z"], threshold=0.9)
        (0.0, True, [])
    """
    m, n = len(tokens_a), len(tokens_b)

    # Edge cases.
    if m == 0 or n == 0:
        return 0.0, False, []

    max_len: int = max(m, n)

    # Short-circuit: identical sequences.
    if tokens_a == tokens_b:
        snippet = tokens_a[:_SNIPPET_TOKEN_LIMIT] if extract_snippet else []
        return 1.0, False, snippet

    # Stage 1: space-efficient DP scoring with early termination.
    lcs_len, terminated_early = _lcs_score_with_early_termination(
        tokens_a, tokens_b, threshold
    )

    score: float = lcs_len / max_len

    # Stage 2: snippet extraction (only if not terminated early and requested).
    matching_tokens: list[str] = []
    if extract_snippet and not terminated_early:
        matching_tokens = _lcs_backtrack(tokens_a, tokens_b)

    return score, terminated_early, matching_tokens


# ---------------------------------------------------------------------------
# Worker task (picklable for ProcessPoolExecutor)
# ---------------------------------------------------------------------------


def compare_pair_task(
    pair_dict: dict[str, Any],
    threshold: float,
    extract_snippet: bool,
) -> dict[str, Any]:
    """
    Top-level picklable function for ProcessPoolExecutor dispatch.

    Takes a pair dictionary (not Pydantic objects, for IPC efficiency) and
    returns a plain dict result.  The orchestrator (scorer.py) reconstructs
    LCSResult from the returned dict.

    Args:
        pair_dict: {
            "granule_a_id":         str (UUID),
            "granule_b_id":         str (UUID),
            "normalized_source_a":  str,
            "normalized_source_b":  str,
        }
        threshold:       Early termination threshold.
        extract_snippet: Whether to run the snippet backtracking pass.

    Returns:
        Plain dict with schema:
        {
            "granule_a_id":     str,
            "granule_b_id":     str,
            "similarity_score": float,
            "terminated_early": bool,
            "matching_tokens":  list[str],
        }

    Notes:
        - Tokenisation is performed inside the worker so that only the raw
          normalised source strings (cheap to pickle) are sent over the pipe.
        - Empty sources produce a similarity_score of 0.0.
        - Any exception is caught and returns a score of 0.0 with an
          "error" key so the orchestrator can log it without crashing.
    """
    try:
        tokens_a = tokenise(pair_dict["normalized_source_a"])
        tokens_b = tokenise(pair_dict["normalized_source_b"])

        score, terminated_early, matching_tokens = compute_lcs_similarity(
            tokens_a,
            tokens_b,
            threshold=threshold,
            extract_snippet=extract_snippet,
        )

        return {
            "granule_a_id": pair_dict["granule_a_id"],
            "granule_b_id": pair_dict["granule_b_id"],
            "similarity_score": score,
            "terminated_early": terminated_early,
            "matching_tokens": matching_tokens,
        }

    except Exception as exc:  # noqa: BLE001
        return {
            "granule_a_id": pair_dict.get("granule_a_id", ""),
            "granule_b_id": pair_dict.get("granule_b_id", ""),
            "similarity_score": 0.0,
            "terminated_early": False,
            "matching_tokens": [],
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# LCSEngine  (thin wrapper for the scoring pipeline)
# ---------------------------------------------------------------------------


class LCSEngine:
    """
    Stateless wrapper around the LCS comparison functions.

    Provides a consistent interface for the scorer.py orchestrator.
    Instantiated once per scoring run; holds no mutable state.

    Usage in scorer.py:
        engine = LCSEngine(threshold=config.syntactic_clone_threshold)
        for candidate in candidates:
            result = engine.compare(candidate.granule_a, candidate.granule_b)
    """

    def __init__(
        self,
        threshold: float = 0.85,
        extract_snippet: bool = True,
    ) -> None:
        """
        Args:
            threshold:       Clone detection threshold.  Pairs at or above this
                             score are flagged.  Also used for early termination.
            extract_snippet: Whether to extract snippet alignment for pairs that
                             meet the threshold.  Disable for benchmarking.
        """
        self._threshold = threshold
        self._extract_snippet = extract_snippet

    def compare(
        self,
        normalized_source_a: str,
        normalized_source_b: str,
        *,
        granule_a_id: UUID,
        granule_b_id: UUID,
    ) -> dict[str, Any]:
        """
        Compare two normalised source strings and return a result dict.

        Calls compute_lcs_similarity() with early termination enabled at
        self._threshold, and snippet extraction only for pairs meeting the
        threshold (to avoid paying O(m×n) space for non-clone pairs).

        Args:
            normalized_source_a: Type-1 normalised source of granule A.
            normalized_source_b: Type-1 normalised source of granule B.
            granule_a_id:        UUID of granule A.
            granule_b_id:        UUID of granule B.

        Returns:
            Result dict with the same schema as compare_pair_task().
        """
        tokens_a = tokenise(normalized_source_a)
        tokens_b = tokenise(normalized_source_b)

        # First pass: scoring with early termination.
        score, terminated_early, _ = compute_lcs_similarity(
            tokens_a, tokens_b, threshold=self._threshold, extract_snippet=False
        )

        # Second pass: snippet extraction only for pairs above the threshold.
        matching_tokens: list[str] = []
        if self._extract_snippet and not terminated_early and score >= self._threshold:
            _, _, matching_tokens = compute_lcs_similarity(
                tokens_a,
                tokens_b,
                threshold=0.0,  # no early termination for backtracking pass
                extract_snippet=True,
            )

        return {
            "granule_a_id": str(granule_a_id),
            "granule_b_id": str(granule_b_id),
            "similarity_score": score,
            "terminated_early": terminated_early,
            "matching_tokens": matching_tokens,
        }

    def compare_tokens(
        self,
        tokens_a: list[str],
        tokens_b: list[str],
        *,
        granule_a_id: UUID,
        granule_b_id: UUID,
    ) -> dict[str, Any]:
        """
        Compare pre-tokenised sequences directly (avoids re-tokenisation overhead).

        Useful when the caller has already tokenised the sources (e.g., to pass
        the same token lists to multiple comparisons or for unit testing).

        Args:
            tokens_a:     Pre-tokenised token list for granule A.
            tokens_b:     Pre-tokenised token list for granule B.
            granule_a_id: UUID of granule A.
            granule_b_id: UUID of granule B.

        Returns:
            Result dict with the same schema as compare_pair_task().
        """
        # First pass: scoring with early termination.
        score, terminated_early, _ = compute_lcs_similarity(
            tokens_a, tokens_b, threshold=self._threshold, extract_snippet=False
        )

        # Second pass: snippet extraction for above-threshold pairs.
        matching_tokens: list[str] = []
        if self._extract_snippet and not terminated_early and score >= self._threshold:
            _, _, matching_tokens = compute_lcs_similarity(
                tokens_a,
                tokens_b,
                threshold=0.0,
                extract_snippet=True,
            )

        return {
            "granule_a_id": str(granule_a_id),
            "granule_b_id": str(granule_b_id),
            "similarity_score": score,
            "terminated_early": terminated_early,
            "matching_tokens": matching_tokens,
        }


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "LCSEngine",
    "compare_pair_task",
    "compute_lcs_similarity",
    "tokenise",
]
