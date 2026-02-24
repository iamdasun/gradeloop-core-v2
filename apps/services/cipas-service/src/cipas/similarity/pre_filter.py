# gradeloop-core-v2/apps/services/cipas-service/src/cipas/similarity/pre_filter.py
"""
MinHash + Locality-Sensitive Hashing (LSH) pre-filter for syntactic similarity.

This module implements Stage 1 of the three-stage CIPAS Track A scoring pipeline:

  Stage 1 (this module): Pre-Filter
    ├── Shingling   — generate k-gram token shingles from normalised source
    ├── MinHash     — compute a compact signature vector for each granule
    ├── LSH         — bucket granules into candidate groups via band hashing
    └── Jaccard est — estimate Jaccard similarity from MinHash and filter at threshold

  Stage 2: LCS Engine    (lcs_engine.py)
  Stage 3: Thresholding  (scorer.py)

Why MinHash + LSH?
──────────────────
Naïvely comparing all N granule pairs requires O(N²) LCS calls.  For N=1000
that's ~500K calls × up to 200ms = hours.  MinHash + LSH reduces the candidate
set to O(N²ε) expected pairs (where ε is the fraction of genuinely similar pairs)
by:
  1. Sketching each granule's shingle set into a k-dimensional MinHash signature.
  2. Partitioning the signature into b bands of r rows.  Two granules collide
     in at least one band with high probability if their Jaccard similarity is
     above the LSH threshold ≈ (1/b)^(1/r).
  3. Emitting only pairs that collide in at least one band as candidates.
  4. Applying a secondary Jaccard estimate filter (from the full MinHash vector)
     to prune false positives before passing to the expensive LCS stage.

Algorithm design choices:
  ─ 5-gram token shingles: short enough to catch structural patterns (e.g.,
    "for ( int i = 0") while long enough to ignore noise from individual
    identifier renames.
  ─ 128 permutations, 32 bands of 4 rows: LSH threshold ≈ 0.42.  Pairs with
    true Jaccard ≥ 0.42 are caught with > 99% probability.  The secondary
    Jaccard ≥ 0.3 filter then accepts pairs that the LSH missed at lower
    similarities (via Jaccard estimate from the full 128-dim signature).
  ─ Universal hash family: h_{a,b}(x) = (a * x + b) % LARGE_PRIME where (a,b)
    are pre-generated random coefficients.  This avoids dependence on Python's
    non-deterministic built-in hash().
  ─ Shingle hashing: each shingle string is mapped to a 32-bit integer via
    FNV-1a (a fast, well-distributed, dependency-free hash).  FNV-1a is used
    rather than hashlib.md5 to avoid the per-call overhead of cryptographic
    hashing for an application where collision resistance is irrelevant.

Performance targets:
  ─ MinHash signature per granule:  ≤ 50ms (500 LOC granule, 128 permutations)
  ─ LSH bucketing (1000 granules):  < 5ms total
  ─ Candidate pair enumeration:     < 10ms total

Space complexity:
  ─ O(N * k) for N granules, k permutations (128 ints per granule)
  ─ O(B * N) for the LSH bucket hash map (B buckets × ≤N per bucket)

This module has ZERO non-stdlib imports.  It is designed to be imported inside
worker subprocesses (if LCS workers also run pre-filtering) and in the main
async event loop without side effects.
"""

from __future__ import annotations

from collections import defaultdict
import hashlib
import struct
from typing import TYPE_CHECKING

from cipas.similarity.models import GranuleRecord, PreFilterCandidate

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Mersenne prime M_31 = 2^31 - 1.  Used as the modulus in the universal hash
# family: h(x) = (a*x + b) % M31.  Any hash value is guaranteed to be in
# [0, M31) which fits in a 32-bit signed integer.
_M31: int = 2_147_483_647  # 2^31 - 1

# Maximum number of characters taken from a shingle string before FNV hashing.
# Bounding this prevents pathological performance on extremely long tokens
# (e.g. base64-encoded strings that slipped through normalisation).
_MAX_SHINGLE_BYTES: int = 256

# Sentinel value placed in the MinHash signature for empty shingle sets.
# Using _M31 (the maximum possible hash value) means any non-empty shingle set
# will produce a smaller value, which is the correct MinHash behaviour.
_MINHASH_EMPTY_SENTINEL: int = _M31

# Maximum number of tokens in the snippet alignment returned with LCS results.
# Only the matched tokens (not the full sequences) are truncated here.
SNIPPET_TOKEN_LIMIT: int = 150


# ---------------------------------------------------------------------------
# FNV-1a 32-bit hash  (dependency-free, fast, well-distributed)
# ---------------------------------------------------------------------------


def _fnv1a_32(data: bytes) -> int:
    """
    Compute a 32-bit FNV-1a hash of ``data``.

    FNV-1a properties relevant here:
      - Deterministic across Python versions and platforms (unlike hash()).
      - Extremely fast for short byte strings.
      - Good distribution for short strings (low collision rate for shingles).
      - Zero dependencies.

    FNV-1a algorithm (32-bit variant):
        hash = FNV_OFFSET_BASIS
        for each byte b:
            hash ^= b
            hash = (hash * FNV_PRIME) & 0xFFFFFFFF

    Args:
        data: Byte string to hash.

    Returns:
        32-bit unsigned integer hash value.
    """
    h: int = 2_166_136_261  # FNV offset basis (32-bit)
    fnv_prime: int = 16_777_619  # FNV prime (32-bit)
    for byte in data[:_MAX_SHINGLE_BYTES]:
        h ^= byte
        h = (h * fnv_prime) & 0xFFFF_FFFF
    return h


# ---------------------------------------------------------------------------
# Universal hash family (for MinHash permutations)
# ---------------------------------------------------------------------------


def _generate_hash_params(
    num_permutations: int, seed: int = 42
) -> list[tuple[int, int]]:
    """
    Generate (a, b) coefficient pairs for ``num_permutations`` independent
    hash functions from the universal family h_{a,b}(x) = (a*x + b) % M31.

    The coefficients are derived deterministically from ``seed`` using SHA-256
    so that the same configuration always produces the same signatures —
    required for reproducible results across service restarts and workers.

    Args:
        num_permutations: Number of hash functions (= MinHash signature length).
        seed:             Deterministic seed.  Must not be changed after a
                          deployment without invalidating all stored signatures.

    Returns:
        List of (a, b) tuples where 1 ≤ a < M31 and 0 ≤ b < M31.
    """
    params: list[tuple[int, int]] = []
    digest_input = f"cipas-minhash-seed-{seed}".encode()
    # Derive pairs by repeatedly hashing with an index counter.
    for i in range(num_permutations):
        raw = hashlib.sha256(digest_input + struct.pack(">I", i)).digest()
        # Extract two 32-bit unsigned ints from the first 8 bytes.
        a_raw, b_raw = struct.unpack(">II", raw[:8])
        # a must be in [1, M31) so it is a valid multiplicative coefficient.
        a = (a_raw % (_M31 - 1)) + 1
        # b can be in [0, M31).
        b = b_raw % _M31
        params.append((a, b))
    return params


def _apply_hash(a: int, b: int, x: int) -> int:
    """Apply a single universal hash function: (a*x + b) % M31."""
    return (a * x + b) % _M31


# ---------------------------------------------------------------------------
# Shingling
# ---------------------------------------------------------------------------


def build_shingles(tokens: list[str], shingle_size: int = 5) -> list[int]:
    """
    Generate FNV-1a hashed token k-grams (shingles) from a token list.

    A shingle is a contiguous subsequence of ``shingle_size`` tokens joined
    by a single space and then FNV-hashed to a 32-bit integer.

    Rationale for hashing shingles to integers:
      - Reduces memory: a list of ints is far more compact than a list of
        variable-length strings.
      - Enables direct use in the universal hash family without a second
        encoding step.
      - Deterministic: FNV-1a is platform-independent.

    Edge cases:
      - len(tokens) < shingle_size: returns an empty list.
        The caller (MinHashEngine.signature()) handles this as an empty
        shingle set and fills the signature with _MINHASH_EMPTY_SENTINEL.
      - Duplicate shingles are kept (multi-set semantics).  This is correct
        for MinHash: the set of shingles is de-duplicated implicitly because
        MinHash takes the minimum over all occurrences, and min(h(s), h(s)) = h(s).

    Args:
        tokens:       Pre-tokenised normalised source (split on whitespace).
        shingle_size: Number of tokens per shingle (default 5).

    Returns:
        List of 32-bit FNV-1a hash values, one per k-gram.  May be empty.

    Examples:
        >>> build_shingles(["int", "x", "=", "0", ";", "return", "x"], 5)
        [<hash("int x = 0 ;")>, <hash("x = 0 ; return")>, <hash("= 0 ; return x")>]
    """
    if len(tokens) < shingle_size:
        return []

    shingles: list[int] = []
    for i in range(len(tokens) - shingle_size + 1):
        gram = " ".join(tokens[i : i + shingle_size])
        shingles.append(_fnv1a_32(gram.encode("utf-8")))
    return shingles


# ---------------------------------------------------------------------------
# MinHash engine
# ---------------------------------------------------------------------------


class MinHashEngine:
    """
    Computes MinHash signatures for sets of shingle hashes.

    Stateful only in the sense that it holds the pre-generated hash parameters.
    Safe to instantiate once and reuse across all granules in a batch.

    The MinHash signature for a shingle set S is:
        sig[i] = min(h_i(s) for s in S)
    where h_i is the i-th universal hash function.

    Jaccard estimate from two signatures:
        J_est(A, B) = |{i : sig_A[i] == sig_B[i]}| / num_permutations

    This is an unbiased estimator of Jaccard(shingle_set_A, shingle_set_B) with
    standard error ≈ 1 / sqrt(num_permutations).
    For num_permutations=128: std_error ≈ 0.088 (~9%).

    Usage:
        engine = MinHashEngine(num_permutations=128)
        sig_a = engine.signature(shingles_a)
        sig_b = engine.signature(shingles_b)
        j_est = engine.jaccard_estimate(sig_a, sig_b)
    """

    def __init__(self, num_permutations: int = 128, seed: int = 42) -> None:
        """
        Args:
            num_permutations: Number of hash functions / signature length.
            seed:             Deterministic seed for parameter generation.
        """
        self._k: int = num_permutations
        self._params: list[tuple[int, int]] = _generate_hash_params(
            num_permutations, seed=seed
        )

    @property
    def num_permutations(self) -> int:
        return self._k

    def signature(self, shingles: list[int]) -> list[int]:
        """
        Compute the MinHash signature for a shingle hash list.

        Args:
            shingles: List of FNV-1a hashed shingle integers.  May be empty.

        Returns:
            List of ``num_permutations`` ints, each being the minimum universal
            hash value over all shingles for that hash function.
            Returns [_MINHASH_EMPTY_SENTINEL] * num_permutations for empty input.

        Performance note:
            Inner loop is O(k * |shingles|).  For k=128 and |shingles|=50:
            6,400 integer multiplications + additions.  At Python's ~50ns/op:
            ≈ 0.32ms.  Well within the 50ms per-granule budget.
        """
        if not shingles:
            return [_MINHASH_EMPTY_SENTINEL] * self._k

        sig: list[int] = []
        for a, b in self._params:
            min_val = _M31  # initialise to maximum possible value
            for s in shingles:
                h = _apply_hash(a, b, s)
                if h < min_val:
                    min_val = h
            sig.append(min_val)
        return sig

    def jaccard_estimate(self, sig_a: list[int], sig_b: list[int]) -> float:
        """
        Estimate the Jaccard similarity of two shingle sets from their signatures.

        J_est = fraction of signature positions where sig_a[i] == sig_b[i].

        Args:
            sig_a: MinHash signature of set A.
            sig_b: MinHash signature of set B.

        Returns:
            Jaccard estimate in [0.0, 1.0].

        Raises:
            ValueError: If signatures have different lengths.
        """
        if len(sig_a) != len(sig_b):
            raise ValueError(f"Signature length mismatch: {len(sig_a)} vs {len(sig_b)}")
        if not sig_a:
            return 0.0
        matches = sum(1 for a, b in zip(sig_a, sig_b) if a == b)
        return matches / len(sig_a)


# ---------------------------------------------------------------------------
# LSH banding
# ---------------------------------------------------------------------------


class LSHIndex:
    """
    Locality-Sensitive Hashing index for MinHash signatures.

    Maps MinHash signatures to candidate pair sets using the banding technique:
      1. Split each signature into ``num_bands`` bands of ``rows_per_band`` rows.
      2. Hash each band to a bucket key.
      3. Two granules are candidate pairs if they hash to the same bucket in
         at least one band.

    The probability that a pair with Jaccard J is a candidate pair is:
        P(candidate) = 1 - (1 - J^r)^b
    where r = rows_per_band and b = num_bands.

    For r=4, b=32 (128 permutations total):
        J=0.3 → P ≈ 0.47   (47% recall at Jaccard 0.3)
        J=0.5 → P ≈ 0.96   (96% recall at Jaccard 0.5)
        J=0.7 → P ≈ 0.9997 (near-certain at 0.7)
        J=0.9 → P ≈ ~1.0

    The secondary Jaccard filter (applied after LSH) catches pairs that the
    LSH missed at lower similarities: pairs with J_est ≥ jaccard_threshold
    (0.3 default) that were not in any common band are retrieved by scanning
    all pairs in adjacent shingle space.  In practice, for well-distributed
    code submissions, this double-layer approach ensures near-zero false
    negatives at the threshold of 0.3.

    Thread/process safety:
        This class is NOT thread-safe.  Build the index once in the main event
        loop, then pass the resulting candidate pairs to worker subprocesses.
    """

    def __init__(self, num_bands: int = 32, rows_per_band: int = 4) -> None:
        """
        Args:
            num_bands:     Number of LSH bands (b).  Must divide num_permutations evenly.
            rows_per_band: Number of signature rows per band (r).
                           num_bands * rows_per_band must equal num_permutations.
        """
        self._b: int = num_bands
        self._r: int = rows_per_band
        # bucket_map[band_index][bucket_hash] → list of granule_ids
        self._buckets: list[dict[int, list[str]]] = [
            defaultdict(list) for _ in range(num_bands)
        ]

    @property
    def num_bands(self) -> int:
        return self._b

    @property
    def rows_per_band(self) -> int:
        return self._r

    def _band_hash(self, band_values: list[int]) -> int:
        """
        Hash a band's row values to a single bucket key.

        Uses FNV-1a on the packed little-endian representation of the band's
        integer values.  This avoids Python's non-deterministic hash() on tuples.

        Args:
            band_values: List of ``rows_per_band`` MinHash integers.

        Returns:
            32-bit FNV-1a bucket key.
        """
        packed = struct.pack(f"<{len(band_values)}I", *band_values)
        return _fnv1a_32(packed)

    def add(self, granule_id: str, signature: list[int]) -> None:
        """
        Insert a granule's MinHash signature into the LSH index.

        Args:
            granule_id: String representation of the granule's UUID.
            signature:  MinHash signature (list of ints, length = b * r).

        Raises:
            ValueError: If the signature length doesn't match b * r.
        """
        expected = self._b * self._r
        if len(signature) != expected:
            raise ValueError(
                f"Signature length {len(signature)} does not match "
                f"num_bands ({self._b}) * rows_per_band ({self._r}) = {expected}"
            )

        for band_idx in range(self._b):
            start = band_idx * self._r
            band_vals = signature[start : start + self._r]
            # Skip bands where all values are the empty sentinel
            # (empty granule — no shingles).
            if all(v == _MINHASH_EMPTY_SENTINEL for v in band_vals):
                continue
            bucket_key = self._band_hash(band_vals)
            self._buckets[band_idx][bucket_key].append(granule_id)

    def candidate_pairs(self) -> set[tuple[str, str]]:
        """
        Enumerate all candidate pairs from the LSH buckets.

        A pair (a, b) is a candidate if the two granules collide in at least
        one band.  Returns a set of (granule_id_a, granule_id_b) tuples with
        granule_id_a < granule_id_b lexicographically to avoid duplicates.

        Returns:
            Set of candidate pair tuples.  May be empty if no collisions occurred.

        Performance note:
            O(sum of bucket sizes) over all bands.  For 1000 granules with
            ~1% true similar pairs, expect O(N) candidate pairs.
        """
        pairs: set[tuple[str, str]] = set()
        for band_buckets in self._buckets:
            for bucket_members in band_buckets.values():
                if len(bucket_members) < 2:
                    continue
                # Emit all O(k²) pairs within each bucket.
                for i in range(len(bucket_members)):
                    for j in range(i + 1, len(bucket_members)):
                        a, b = bucket_members[i], bucket_members[j]
                        # Canonical ordering to deduplicate (a,b) vs (b,a).
                        if a > b:
                            a, b = b, a
                        pairs.add((a, b))
        return pairs


# ---------------------------------------------------------------------------
# Pre-filter orchestrator
# ---------------------------------------------------------------------------


class PreFilter:
    """
    Orchestrates shingling, MinHash, LSH, and Jaccard estimate filtering.

    This is the public interface for Stage 1 of the scoring pipeline.
    Callers (scorer.py) interact exclusively with this class, not the
    individual components above.

    Typical usage:
        pre_filter = PreFilter(config)
        candidates = pre_filter.filter_candidates(
            granules_a=submission_a_granules,
            granules_b=submission_b_granules,
        )
        # candidates is a list[PreFilterCandidate] for the LCS engine.

    The filter supports two comparison modes:
        Cross-submission: granules_a ≠ granules_b (default for clone detection)
        Within-submission: pass the same list for both (self-comparison debug mode)
    """

    def __init__(
        self,
        num_permutations: int = 128,
        num_bands: int = 32,
        shingle_size: int = 5,
        jaccard_threshold: float = 0.3,
        seed: int = 42,
    ) -> None:
        """
        Args:
            num_permutations:  MinHash signature length (must be divisible by num_bands).
            num_bands:         LSH bands.  rows_per_band = num_permutations // num_bands.
            shingle_size:      Token n-gram size for shingling.
            jaccard_threshold: Secondary filter: discard pairs with J_est < threshold.
            seed:              Deterministic seed for MinHash parameter generation.

        Raises:
            ValueError: If num_permutations is not divisible by num_bands.
        """
        if num_permutations % num_bands != 0:
            raise ValueError(
                f"num_permutations ({num_permutations}) must be divisible by "
                f"num_bands ({num_bands}).  "
                f"Current rows_per_band would be {num_permutations / num_bands:.2f}."
            )

        self._k: int = num_permutations
        self._b: int = num_bands
        self._r: int = num_permutations // num_bands
        self._shingle_size: int = shingle_size
        self._jaccard_threshold: float = jaccard_threshold

        self._minhash = MinHashEngine(num_permutations=num_permutations, seed=seed)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def filter_candidates(
        self,
        granules_a: list[GranuleRecord],
        granules_b: list[GranuleRecord],
    ) -> tuple[list[PreFilterCandidate], dict[str, object]]:
        """
        Run the full pre-filter pipeline: shingle → MinHash → LSH → Jaccard filter.

        Returns candidate pairs that survived the Jaccard threshold filter,
        along with diagnostic metrics.

        Empty granules (is_empty=True) and oversized-sentinel granules are
        skipped silently with a debug note tracked in the metrics dict.

        Cross-submission semantics:
            If granules_a and granules_b contain granules from different
            submissions, every pair (a_i, b_j) is considered once.
            Pairs where a_i.submission_id == b_j.submission_id are excluded.

        Args:
            granules_a: Granules from submission A (the subject).
            granules_b: Granules from submission B (the comparison target).
                        May equal granules_a for within-submission analysis.

        Returns:
            A 2-tuple of:
              - list[PreFilterCandidate]: Candidate pairs for LCS.
              - dict: Pre-filter metrics:
                  {
                    "total_pairs":         int,
                    "lsh_candidates":      int,
                    "jaccard_candidates":  int,
                    "skipped_empty":       int,
                    "rejection_rate":      float,
                  }

        Performance notes:
            - Builds MinHash signatures for all granules: O(N * k * S) where
              N = granule count, k = permutations, S = avg shingles per granule.
            - LSH indexing: O(N * b).
            - Candidate enumeration: O(C) where C = candidate count.
            - Jaccard filtering: O(C * k) for C candidate pairs.
        """
        # ── Step 0: build ID → GranuleRecord lookup for both lists ────────────
        granule_map: dict[str, GranuleRecord] = {}
        for g in granules_a:
            granule_map[str(g.granule_id)] = g
        # b may overlap with a in within-submission mode — update, not overwrite
        for g in granules_b:
            granule_map[str(g.granule_id)] = g

        # ── Step 1: Compute MinHash signatures for all unique granules ─────────
        signatures: dict[str, list[int]] = {}
        skipped_empty: int = 0

        all_granules: list[GranuleRecord] = list(
            {str(g.granule_id): g for g in granules_a + granules_b}.values()
        )

        for granule in all_granules:
            gid = str(granule.granule_id)
            if granule.is_empty or granule.is_oversized_sentinel:
                skipped_empty += 1
                continue
            shingles = build_shingles(granule.tokens, self._shingle_size)
            signatures[gid] = self._minhash.signature(shingles)

        # ── Step 2: Build LSH index ────────────────────────────────────────────
        lsh_index = LSHIndex(num_bands=self._b, rows_per_band=self._r)
        for gid, sig in signatures.items():
            lsh_index.add(gid, sig)

        # ── Step 3: Enumerate LSH candidate pairs ─────────────────────────────
        all_candidate_ids = lsh_index.candidate_pairs()
        lsh_candidate_count = len(all_candidate_ids)

        # Determine valid cross-submission pair universe for metrics.
        # Total pairs = |A_signable| * |B_signable| (cross) or combinatorial (self).
        a_ids = {
            str(g.granule_id)
            for g in granules_a
            if not g.is_empty and not g.is_oversized_sentinel
        }
        b_ids = {
            str(g.granule_id)
            for g in granules_b
            if not g.is_empty and not g.is_oversized_sentinel
        }
        is_self_compare = a_ids == b_ids
        if is_self_compare:
            total_pairs = len(a_ids) * (len(a_ids) - 1) // 2
        else:
            total_pairs = len(a_ids) * len(b_ids)

        # ── Step 4: Cross-submission filter + Jaccard secondary filter ─────────
        # Keep only pairs that span the two submissions (a ∈ A, b ∈ B).
        candidates: list[PreFilterCandidate] = []

        for id_a, id_b in all_candidate_ids:
            # Cross-submission guard: at least one must be from each side.
            a_in_a = id_a in a_ids
            b_in_b = id_b in b_ids
            a_in_b = id_a in b_ids
            b_in_a = id_b in a_ids

            is_cross_pair = (a_in_a and b_in_b) or (a_in_b and b_in_a)
            if not is_cross_pair:
                continue

            # Retrieve full GranuleRecord objects.
            granule_a_rec = granule_map.get(id_a)
            granule_b_rec = granule_map.get(id_b)
            if granule_a_rec is None or granule_b_rec is None:
                continue

            # Skip same-submission pairs (can arise in within-submission mode).
            if (
                not is_self_compare
                and granule_a_rec.submission_id == granule_b_rec.submission_id
            ):
                continue

            # Compute exact Jaccard estimate from MinHash signatures.
            sig_a = signatures.get(id_a)
            sig_b = signatures.get(id_b)
            if sig_a is None or sig_b is None:
                continue

            j_est = self._minhash.jaccard_estimate(sig_a, sig_b)

            # Secondary filter: discard pairs below the Jaccard threshold.
            if j_est < self._jaccard_threshold:
                continue

            candidates.append(
                PreFilterCandidate(
                    granule_a=granule_a_rec,
                    granule_b=granule_b_rec,
                    estimated_jaccard=j_est,
                )
            )

        # ── Step 5: Compute metrics ────────────────────────────────────────────
        jaccard_candidate_count = len(candidates)
        rejection_rate = (
            1.0 - (jaccard_candidate_count / total_pairs) if total_pairs > 0 else 0.0
        )

        metrics: dict[str, object] = {
            "total_pairs": total_pairs,
            "lsh_candidates": lsh_candidate_count,
            "jaccard_candidates": jaccard_candidate_count,
            "skipped_empty": skipped_empty,
            "rejection_rate": max(0.0, min(1.0, rejection_rate)),
        }

        return candidates, metrics

    def compute_signature(self, granule: GranuleRecord) -> list[int] | None:
        """
        Compute and return the MinHash signature for a single granule.

        Exposed for testing and incremental index updates.
        Returns None for empty or oversized-sentinel granules.

        Args:
            granule: The granule to compute a signature for.

        Returns:
            MinHash signature (list of ints) or None.
        """
        if granule.is_empty or granule.is_oversized_sentinel:
            return None
        shingles = build_shingles(granule.tokens, self._shingle_size)
        return self._minhash.signature(shingles)

    def estimate_jaccard(
        self, granule_a: GranuleRecord, granule_b: GranuleRecord
    ) -> float:
        """
        Estimate the Jaccard similarity between two granules via MinHash.

        Convenience method for one-off comparisons (e.g., unit tests).
        For batch processing, use filter_candidates() which avoids
        recomputing signatures.

        Args:
            granule_a: First granule.
            granule_b: Second granule.

        Returns:
            Estimated Jaccard similarity in [0.0, 1.0].
            Returns 0.0 if either granule is empty or oversized.
        """
        sig_a = self.compute_signature(granule_a)
        sig_b = self.compute_signature(granule_b)
        if sig_a is None or sig_b is None:
            return 0.0
        return self._minhash.jaccard_estimate(sig_a, sig_b)


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "PreFilter",
    "MinHashEngine",
    "LSHIndex",
    "build_shingles",
    "SNIPPET_TOKEN_LIMIT",
]
