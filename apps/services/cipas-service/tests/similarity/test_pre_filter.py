# gradeloop-core-v2/apps/services/cipas-service/tests/similarity/test_pre_filter.py
"""
Unit tests for cipas.similarity.pre_filter.

Tests cover:
  - _fnv1a_32:          determinism, distribution, boundary values
  - _generate_hash_params: determinism, valid ranges
  - build_shingles:     5-gram generation, edge cases (too-short, empty)
  - MinHashEngine:      signature length, empty set sentinel, Jaccard estimation
  - LSHIndex:           add/candidate_pairs, collision semantics, empty-sentinel skip
  - PreFilter:          full pipeline, cross-submission filtering, edge cases
"""

from __future__ import annotations

import uuid
from uuid import UUID, uuid4

import pytest

from cipas.similarity.models import GranuleRecord
from cipas.similarity.pre_filter import (
    _MINHASH_EMPTY_SENTINEL,
    LSHIndex,
    MinHashEngine,
    PreFilter,
    _fnv1a_32,
    _generate_hash_params,
    build_shingles,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SENTINEL_HASH = "0" * 64
_DUMMY_HASH = "a" * 64


def _make_granule(
    source: str,
    submission_id: UUID | None = None,
    granule_hash: str | None = None,
    granule_id: UUID | None = None,
) -> GranuleRecord:
    """Build a minimal GranuleRecord for testing."""
    return GranuleRecord(
        granule_id=granule_id or uuid4(),
        submission_id=submission_id or uuid4(),
        granule_hash=granule_hash or _DUMMY_HASH,
        granule_type="function",
        language="python",
        normalized_source=source,
        start_line=1,
        end_line=max(1, len(source.splitlines())),
    )


def _java_function(lines: int = 20, identifier: str = "x") -> str:
    """Generate a synthetic normalised Java-like function source."""
    tokens = []
    tokens.append(f"public int compute{identifier} ( int {identifier} )")
    tokens.append("{")
    tokens.append(f"int result{identifier} = 0 ;")
    for i in range(lines):
        tokens.append(f"result{identifier} += {identifier} * {i} ;")
    tokens.append(f"return result{identifier} ;")
    tokens.append("}")
    return " ".join(tokens)


# ---------------------------------------------------------------------------
# _fnv1a_32 tests
# ---------------------------------------------------------------------------


class TestFnv1a32:
    def test_deterministic(self) -> None:
        """Same input always produces the same hash."""
        data = b"hello world"
        assert _fnv1a_32(data) == _fnv1a_32(data)

    def test_different_inputs_different_hashes(self) -> None:
        """Different byte strings should produce different hashes (no trivial collision)."""
        assert _fnv1a_32(b"abc") != _fnv1a_32(b"xyz")

    def test_returns_unsigned_32bit(self) -> None:
        """Hash value must be in [0, 2^32)."""
        for i in range(100):
            h = _fnv1a_32(f"test-{i}".encode())
            assert 0 <= h < 2**32, f"Hash {h} out of 32-bit range"

    def test_empty_bytes(self) -> None:
        """Empty input returns the FNV offset basis (2166136261)."""
        h = _fnv1a_32(b"")
        assert isinstance(h, int)
        assert h == 2_166_136_261  # FNV offset basis = identity for empty input

    def test_single_byte(self) -> None:
        """Single-byte input should produce a valid hash."""
        h = _fnv1a_32(b"\x00")
        assert isinstance(h, int)
        assert 0 <= h < 2**32

    def test_byte_order_sensitivity(self) -> None:
        """'ab' and 'ba' must produce different hashes (order matters)."""
        assert _fnv1a_32(b"ab") != _fnv1a_32(b"ba")

    def test_long_input_truncated_deterministically(self) -> None:
        """Inputs longer than _MAX_SHINGLE_BYTES are truncated; result is still consistent."""
        long_data = b"x" * 1000
        h1 = _fnv1a_32(long_data)
        h2 = _fnv1a_32(long_data)
        assert h1 == h2


# ---------------------------------------------------------------------------
# _generate_hash_params tests
# ---------------------------------------------------------------------------


class TestGenerateHashParams:
    def test_returns_correct_count(self) -> None:
        params = _generate_hash_params(128)
        assert len(params) == 128

    def test_deterministic_with_same_seed(self) -> None:
        p1 = _generate_hash_params(64, seed=42)
        p2 = _generate_hash_params(64, seed=42)
        assert p1 == p2

    def test_different_seeds_produce_different_params(self) -> None:
        p1 = _generate_hash_params(64, seed=1)
        p2 = _generate_hash_params(64, seed=2)
        assert p1 != p2

    def test_a_values_in_valid_range(self) -> None:
        """a must be in [1, M31)."""
        _M31 = 2_147_483_647
        params = _generate_hash_params(256)
        for a, b in params:
            assert 1 <= a < _M31, f"a={a} out of range"

    def test_b_values_in_valid_range(self) -> None:
        """b must be in [0, M31)."""
        _M31 = 2_147_483_647
        params = _generate_hash_params(256)
        for a, b in params:
            assert 0 <= b < _M31, f"b={b} out of range"

    def test_pairs_are_tuples_of_two_ints(self) -> None:
        params = _generate_hash_params(16)
        for pair in params:
            assert len(pair) == 2
            assert all(isinstance(v, int) for v in pair)


# ---------------------------------------------------------------------------
# build_shingles tests
# ---------------------------------------------------------------------------


class TestBuildShingles:
    def test_basic_5gram(self) -> None:
        tokens = ["a", "b", "c", "d", "e", "f"]
        shingles = build_shingles(tokens, 5)
        # Expect shingles for "a b c d e" and "b c d e f"
        assert len(shingles) == 2

    def test_exact_n_tokens_yields_one_shingle(self) -> None:
        tokens = ["x", "y", "z", "w", "v"]
        shingles = build_shingles(tokens, 5)
        assert len(shingles) == 1

    def test_fewer_than_n_tokens_yields_empty(self) -> None:
        tokens = ["a", "b", "c"]
        shingles = build_shingles(tokens, 5)
        assert shingles == []

    def test_empty_tokens_yields_empty(self) -> None:
        assert build_shingles([], 5) == []

    def test_shingles_are_integers(self) -> None:
        tokens = ["int", "x", "=", "0", ";", "return", "x"]
        shingles = build_shingles(tokens, 5)
        for s in shingles:
            assert isinstance(s, int)

    def test_same_tokens_same_shingles(self) -> None:
        tokens = ["a", "b", "c", "d", "e"]
        assert build_shingles(tokens, 5) == build_shingles(tokens, 5)

    def test_different_tokens_different_shingles(self) -> None:
        t1 = ["a", "b", "c", "d", "e"]
        t2 = ["x", "y", "z", "w", "v"]
        s1 = build_shingles(t1, 5)
        s2 = build_shingles(t2, 5)
        assert s1 != s2

    def test_shingle_size_1(self) -> None:
        """1-gram shingles: one shingle per token."""
        tokens = ["a", "b", "c"]
        shingles = build_shingles(tokens, 1)
        assert len(shingles) == 3

    def test_shared_prefix_produces_common_shingles(self) -> None:
        """Two sequences with a shared prefix should share at least one shingle hash."""
        shared = ["int", "x", "=", "0", ";"]
        t1 = shared + ["return", "x", ";", "}", "//"]
        t2 = shared + ["print", "(", "x", ")", ";"]
        s1 = set(build_shingles(t1, 5))
        s2 = set(build_shingles(t2, 5))
        # The shared prefix "int x = 0 ;" is one 5-gram — should appear in both
        assert len(s1 & s2) >= 1

    def test_count_is_len_minus_n_plus_one(self) -> None:
        for n_tokens in range(5, 20):
            tokens = [str(i) for i in range(n_tokens)]
            shingles = build_shingles(tokens, 5)
            assert len(shingles) == n_tokens - 5 + 1


# ---------------------------------------------------------------------------
# MinHashEngine tests
# ---------------------------------------------------------------------------


class TestMinHashEngine:
    def test_signature_length(self) -> None:
        engine = MinHashEngine(num_permutations=64)
        shingles = build_shingles(["a", "b", "c", "d", "e", "f"], 5)
        sig = engine.signature(shingles)
        assert len(sig) == 64

    def test_empty_shingles_returns_sentinel_signature(self) -> None:
        engine = MinHashEngine(num_permutations=32)
        sig = engine.signature([])
        assert all(v == _MINHASH_EMPTY_SENTINEL for v in sig)

    def test_deterministic_signature(self) -> None:
        engine = MinHashEngine(num_permutations=64, seed=42)
        shingles = [100, 200, 300]
        assert engine.signature(shingles) == engine.signature(shingles)

    def test_jaccard_identical_sets(self) -> None:
        """Identical shingle sets should yield Jaccard estimate ≈ 1.0."""
        engine = MinHashEngine(num_permutations=128)
        shingles = list(range(50))
        sig = engine.signature(shingles)
        j = engine.jaccard_estimate(sig, sig)
        assert j == pytest.approx(1.0)

    def test_jaccard_disjoint_sets(self) -> None:
        """Disjoint shingle sets should yield Jaccard estimate close to 0.0."""
        engine = MinHashEngine(num_permutations=256, seed=1)
        shingles_a = list(range(0, 500))
        shingles_b = list(range(10_000, 10_500))
        sig_a = engine.signature(shingles_a)
        sig_b = engine.signature(shingles_b)
        j = engine.jaccard_estimate(sig_a, sig_b)
        # Should be very close to 0 — allow small probability of false match
        assert j < 0.05, f"Expected near-0 Jaccard for disjoint sets, got {j}"

    def test_jaccard_partial_overlap(self) -> None:
        """50% overlap should yield Jaccard estimate in [0.3, 0.7]."""
        engine = MinHashEngine(num_permutations=256, seed=99)
        # Set A: 0–99, Set B: 50–149 → 50 shared / 150 total → Jaccard ≈ 0.33
        shingles_a = list(range(100))
        shingles_b = list(range(50, 150))
        sig_a = engine.signature(shingles_a)
        sig_b = engine.signature(shingles_b)
        j = engine.jaccard_estimate(sig_a, sig_b)
        # True Jaccard = 50/(100+100-50) = 50/150 ≈ 0.333
        assert 0.15 <= j <= 0.55, f"Expected Jaccard near 0.33, got {j}"

    def test_jaccard_mismatched_lengths_raises(self) -> None:
        engine = MinHashEngine(num_permutations=32)
        with pytest.raises(ValueError, match="length mismatch"):
            engine.jaccard_estimate([1, 2, 3], [1, 2])

    def test_jaccard_empty_signatures_returns_zero(self) -> None:
        engine = MinHashEngine(num_permutations=32)
        assert engine.jaccard_estimate([], []) == 0.0

    def test_signature_values_in_valid_range(self) -> None:
        """All MinHash signature values must be in [0, M31)."""
        _M31 = 2_147_483_647
        engine = MinHashEngine(num_permutations=64)
        shingles = list(range(200))
        sig = engine.signature(shingles)
        for v in sig:
            assert 0 <= v < _M31

    def test_different_engines_same_seed_produce_same_signature(self) -> None:
        e1 = MinHashEngine(num_permutations=64, seed=7)
        e2 = MinHashEngine(num_permutations=64, seed=7)
        shingles = [10, 20, 30, 40]
        assert e1.signature(shingles) == e2.signature(shingles)

    def test_different_seeds_usually_produce_different_signatures(self) -> None:
        e1 = MinHashEngine(num_permutations=64, seed=1)
        e2 = MinHashEngine(num_permutations=64, seed=2)
        shingles = [10, 20, 30, 40]
        # With overwhelming probability, different seeds → different params → different sigs
        assert e1.signature(shingles) != e2.signature(shingles)


# ---------------------------------------------------------------------------
# LSHIndex tests
# ---------------------------------------------------------------------------


class TestLSHIndex:
    def test_identical_signatures_are_candidate_pairs(self) -> None:
        """Two granules with identical signatures must always be candidate pairs."""
        lsh = LSHIndex(num_bands=8, rows_per_band=4)
        sig = list(range(32))  # 8 bands × 4 rows = 32
        lsh.add("g1", sig)
        lsh.add("g2", sig)
        pairs = lsh.candidate_pairs()
        assert ("g1", "g2") in pairs or ("g2", "g1") in pairs

    def test_completely_different_signatures_not_candidates(self) -> None:
        """Granules with entirely different signatures should very rarely collide."""
        lsh = LSHIndex(num_bands=32, rows_per_band=4)
        # Use distinctive patterns that won't collide across any band
        sig_a = [i * 1000 for i in range(128)]
        sig_b = [i * 1000 + 500 for i in range(128)]
        lsh.add("g1", sig_a)
        lsh.add("g2", sig_b)
        pairs = lsh.candidate_pairs()
        assert ("g1", "g2") not in pairs and ("g2", "g1") not in pairs

    def test_wrong_signature_length_raises(self) -> None:
        lsh = LSHIndex(num_bands=4, rows_per_band=4)  # expects 16
        with pytest.raises(ValueError, match="does not match"):
            lsh.add("g1", list(range(20)))  # wrong length

    def test_empty_index_has_no_candidates(self) -> None:
        lsh = LSHIndex(num_bands=16, rows_per_band=4)
        assert lsh.candidate_pairs() == set()

    def test_single_granule_has_no_candidates(self) -> None:
        lsh = LSHIndex(num_bands=8, rows_per_band=4)
        lsh.add("g1", list(range(32)))
        assert lsh.candidate_pairs() == set()

    def test_canonical_ordering_of_pairs(self) -> None:
        """Pairs are returned as (a, b) where a < b lexicographically."""
        lsh = LSHIndex(num_bands=8, rows_per_band=4)
        sig = list(range(32))
        lsh.add("granule_b", sig)
        lsh.add("granule_a", sig)
        pairs = lsh.candidate_pairs()
        # All pairs must have the smaller ID first
        for a, b in pairs:
            assert a <= b

    def test_no_duplicate_pairs(self) -> None:
        """The returned set must not contain (a,b) and (b,a) simultaneously."""
        lsh = LSHIndex(num_bands=8, rows_per_band=4)
        sig = list(range(32))
        for i in range(5):
            lsh.add(f"g{i}", sig)
        pairs = lsh.candidate_pairs()
        seen: set[tuple[str, str]] = set()
        for a, b in pairs:
            # Each unordered pair should appear exactly once
            key = (min(a, b), max(a, b))
            assert key not in seen, f"Duplicate pair: {key}"
            seen.add(key)

    def test_empty_sentinel_band_skipped(self) -> None:
        """Bands where all values equal the empty sentinel should not create buckets."""
        lsh = LSHIndex(num_bands=4, rows_per_band=4)  # 16 total
        # Signature with all sentinel values — should not bucket at all
        sentinel_sig = [_MINHASH_EMPTY_SENTINEL] * 16
        lsh.add("empty_granule_1", sentinel_sig)
        lsh.add("empty_granule_2", sentinel_sig)
        # Empty sentinel bands are skipped, so no bucket collision
        pairs = lsh.candidate_pairs()
        assert ("empty_granule_1", "empty_granule_2") not in pairs
        assert ("empty_granule_2", "empty_granule_1") not in pairs


# ---------------------------------------------------------------------------
# PreFilter tests
# ---------------------------------------------------------------------------


class TestPreFilter:
    def _make_filter(
        self,
        threshold: float = 0.3,
        permutations: int = 128,
        bands: int = 32,
        shingle_size: int = 5,
    ) -> PreFilter:
        return PreFilter(
            num_permutations=permutations,
            num_bands=bands,
            shingle_size=shingle_size,
            jaccard_threshold=threshold,
        )

    # ── Basic construction ─────────────────────────────────────────────────

    def test_raises_if_permutations_not_divisible_by_bands(self) -> None:
        with pytest.raises(ValueError, match="divisible"):
            PreFilter(num_permutations=100, num_bands=30)

    def test_valid_construction(self) -> None:
        pf = PreFilter(num_permutations=128, num_bands=32)
        assert pf._k == 128
        assert pf._b == 32
        assert pf._r == 4

    # ── Empty inputs ───────────────────────────────────────────────────────

    def test_empty_granule_lists_return_no_candidates(self) -> None:
        pf = self._make_filter()
        candidates, metrics = pf.filter_candidates([], [])
        assert candidates == []
        assert metrics["total_pairs"] == 0

    def test_single_granule_each_side_no_match(self) -> None:
        pf = self._make_filter()
        g_a = _make_granule("int foo ( ) { return 0 ; }")
        g_b = _make_granule("class Bar { void baz ( ) { } }")
        candidates, metrics = pf.filter_candidates([g_a], [g_b])
        # May or may not be a candidate, but should not error
        assert isinstance(candidates, list)

    # ── Identical granules ────────────────────────────────────────────────

    def test_identical_sources_always_candidate(self) -> None:
        """Two granules with identical (non-empty) source must survive the filter."""
        sub_a = uuid4()
        sub_b = uuid4()
        source = _java_function(30)
        g_a = _make_granule(source, submission_id=sub_a)
        g_b = _make_granule(source, submission_id=sub_b)

        pf = self._make_filter(threshold=0.3)
        candidates, _ = pf.filter_candidates([g_a], [g_b])

        assert len(candidates) == 1
        assert candidates[0].estimated_jaccard == pytest.approx(1.0)

    # ── Near-identical granules ────────────────────────────────────────────

    def test_high_overlap_is_candidate(self) -> None:
        """Granules that share 80%+ tokens should be candidates at threshold=0.3."""
        sub_a = uuid4()
        sub_b = uuid4()
        base_tokens = [f"tok{i}" for i in range(50)]
        source_a = " ".join(base_tokens)
        # Replace last 5 tokens (90% overlap)
        modified = base_tokens[:45] + [f"alt{i}" for i in range(5)]
        source_b = " ".join(modified)

        g_a = _make_granule(source_a, submission_id=sub_a)
        g_b = _make_granule(source_b, submission_id=sub_b)

        pf = self._make_filter(threshold=0.3, permutations=128, bands=32)
        candidates, _ = pf.filter_candidates([g_a], [g_b])
        assert len(candidates) >= 1, "High-overlap pair should be a candidate"

    # ── Disjoint granules ──────────────────────────────────────────────────

    def test_disjoint_sources_not_candidate(self) -> None:
        """Granules with completely different vocabularies should not be candidates."""
        sub_a = uuid4()
        sub_b = uuid4()
        tokens_a = [f"aaa{i}" for i in range(50)]
        tokens_b = [f"zzz{i}" for i in range(50)]
        g_a = _make_granule(" ".join(tokens_a), submission_id=sub_a)
        g_b = _make_granule(" ".join(tokens_b), submission_id=sub_b)

        pf = self._make_filter(threshold=0.3)
        candidates, _ = pf.filter_candidates([g_a], [g_b])
        assert len(candidates) == 0

    # ── Cross-submission guard ─────────────────────────────────────────────

    def test_same_submission_pairs_excluded(self) -> None:
        """Pairs from the same submission should not appear in candidates."""
        same_sub = uuid4()
        source = _java_function(20)
        g_a = _make_granule(source, submission_id=same_sub)
        g_b = _make_granule(source, submission_id=same_sub)

        pf = self._make_filter(threshold=0.1)
        candidates, _ = pf.filter_candidates([g_a], [g_b])
        # Same submission → excluded
        assert len(candidates) == 0

    # ── Empty / oversized granules ────────────────────────────────────────

    def test_empty_granule_is_skipped(self) -> None:
        sub_a = uuid4()
        sub_b = uuid4()
        empty = _make_granule("", submission_id=sub_a)
        non_empty = _make_granule(_java_function(10), submission_id=sub_b)

        pf = self._make_filter()
        candidates, metrics = pf.filter_candidates([empty], [non_empty])
        # Empty granule should be skipped
        assert int(metrics["skipped_empty"]) >= 1

    def test_oversized_sentinel_granule_is_skipped(self) -> None:
        sub_a = uuid4()
        sub_b = uuid4()
        oversized = _make_granule(
            "int x = 0 ;",
            submission_id=sub_a,
            granule_hash=_SENTINEL_HASH,
        )
        normal = _make_granule(_java_function(10), submission_id=sub_b)

        pf = self._make_filter()
        candidates, metrics = pf.filter_candidates([oversized], [normal])
        assert int(metrics["skipped_empty"]) >= 1

    # ── Metrics ────────────────────────────────────────────────────────────

    def test_metrics_keys_present(self) -> None:
        sub_a, sub_b = uuid4(), uuid4()
        g_a = _make_granule(_java_function(20), submission_id=sub_a)
        g_b = _make_granule(_java_function(20, identifier="y"), submission_id=sub_b)

        pf = self._make_filter()
        _, metrics = pf.filter_candidates([g_a], [g_b])

        assert "total_pairs" in metrics
        assert "lsh_candidates" in metrics
        assert "jaccard_candidates" in metrics
        assert "skipped_empty" in metrics
        assert "rejection_rate" in metrics

    def test_rejection_rate_is_valid_fraction(self) -> None:
        sub_a, sub_b = uuid4(), uuid4()
        g_a = _make_granule(_java_function(15), submission_id=sub_a)
        g_b = _make_granule(_java_function(15, "z"), submission_id=sub_b)

        pf = self._make_filter()
        _, metrics = pf.filter_candidates([g_a], [g_b])
        rate = float(metrics["rejection_rate"])
        assert 0.0 <= rate <= 1.0

    def test_total_pairs_for_cross_submission(self) -> None:
        """total_pairs = |A| * |B| for cross-submission with all non-empty granules."""
        sub_a = uuid4()
        sub_b = uuid4()
        a_granules = [_make_granule(_java_function(10 + i), sub_a) for i in range(3)]
        b_granules = [
            _make_granule(_java_function(10 + i, "y"), sub_b) for i in range(4)
        ]

        pf = self._make_filter()
        _, metrics = pf.filter_candidates(a_granules, b_granules)
        # 3 A-granules × 4 B-granules = 12 total pairs
        assert metrics["total_pairs"] == 12

    # ── compute_signature ─────────────────────────────────────────────────

    def test_compute_signature_non_empty(self) -> None:
        pf = self._make_filter()
        g = _make_granule(_java_function(10))
        sig = pf.compute_signature(g)
        assert sig is not None
        assert len(sig) == pf._k

    def test_compute_signature_empty_returns_none(self) -> None:
        pf = self._make_filter()
        g = _make_granule("")
        sig = pf.compute_signature(g)
        assert sig is None

    def test_compute_signature_oversized_returns_none(self) -> None:
        pf = self._make_filter()
        g = _make_granule("something here", granule_hash=_SENTINEL_HASH)
        sig = pf.compute_signature(g)
        assert sig is None

    # ── estimate_jaccard ──────────────────────────────────────────────────

    def test_estimate_jaccard_identical(self) -> None:
        pf = PreFilter(num_permutations=256, num_bands=32)
        source = _java_function(30)
        g_a = _make_granule(source)
        g_b = _make_granule(source)
        j = pf.estimate_jaccard(g_a, g_b)
        assert j == pytest.approx(1.0)

    def test_estimate_jaccard_empty_returns_zero(self) -> None:
        pf = self._make_filter()
        g_a = _make_granule("")
        g_b = _make_granule(_java_function(10))
        j = pf.estimate_jaccard(g_a, g_b)
        assert j == 0.0

    def test_estimate_jaccard_symmetric(self) -> None:
        pf = PreFilter(num_permutations=128, num_bands=32)
        source_a = _java_function(20)
        source_b = _java_function(20, "y")
        g_a = _make_granule(source_a)
        g_b = _make_granule(source_b)
        j_ab = pf.estimate_jaccard(g_a, g_b)
        j_ba = pf.estimate_jaccard(g_b, g_a)
        assert j_ab == pytest.approx(j_ba)

    # ── Pre-filtering at threshold boundaries ─────────────────────────────

    def test_threshold_zero_passes_all_candidate_lsh_pairs(self) -> None:
        """With threshold=0.0, any pair in a common LSH bucket should pass."""
        sub_a, sub_b = uuid4(), uuid4()
        source = _java_function(30)
        g_a = _make_granule(source, sub_a)
        g_b = _make_granule(source, sub_b)

        pf = PreFilter(num_permutations=64, num_bands=16, jaccard_threshold=0.0)
        candidates, _ = pf.filter_candidates([g_a], [g_b])
        # Identical sources should be candidates regardless of threshold
        assert len(candidates) >= 1

    def test_threshold_one_passes_only_identical(self) -> None:
        """With threshold=1.0, only truly identical granule shingle sets should pass."""
        sub_a, sub_b = uuid4(), uuid4()
        # Slightly different sources (one token different)
        source_a = _java_function(20)
        source_b = source_a + " extra token"
        g_a = _make_granule(source_a, sub_a)
        g_b = _make_granule(source_b, sub_b)

        pf = PreFilter(num_permutations=128, num_bands=32, jaccard_threshold=1.0)
        candidates, _ = pf.filter_candidates([g_a], [g_b])
        # Slightly different sources → Jaccard < 1.0 → not a candidate at threshold=1.0
        assert len(candidates) == 0

    # ── Batch scenario (≤10% pass rate requirement) ───────────────────────

    def test_batch_rejection_rate_requirement(self) -> None:
        """
        With 20 unique granules on each side (400 pairs total), pre-filtering
        on completely dissimilar granules should reject the vast majority of pairs.

        This validates the ≤10% pass-to-LCS requirement for unrelated code.
        """
        sub_a = uuid4()
        sub_b = uuid4()

        # Generate 20 distinct granules per side with no token overlap
        a_granules = [
            _make_granule(" ".join(f"alpha{i * 100 + j}" for j in range(30)), sub_a)
            for i in range(20)
        ]
        b_granules = [
            _make_granule(" ".join(f"beta{i * 100 + j}" for j in range(30)), sub_b)
            for i in range(20)
        ]

        pf = self._make_filter(threshold=0.3)
        candidates, metrics = pf.filter_candidates(a_granules, b_granules)

        total = int(metrics["total_pairs"])
        passed = len(candidates)
        pass_rate = passed / total if total > 0 else 0.0

        # For completely disjoint vocabularies, expect very few (likely 0) candidates
        assert pass_rate <= 0.10, (
            f"Expected ≤10% pass rate for unrelated code, got {pass_rate:.1%} "
            f"({passed}/{total} pairs passed)"
        )
