"""
MinHash + LSH Candidate Retrieval — Phase 2.

Uses ``datasketch`` to build 128-permutation MinHash signatures for every
Fragment and bucket them via Locality Sensitive Hashing (LSH).  Only pairs
that share at least one LSH bucket are promoted to the CIPAS Syntactic
Cascade, reducing the O(N²) workload by ~95 %.

Architecture
────────────
                 ┌──────────────┐
  new fragment → │ MinHashIndexer│─► LSH.insert(key, minhash)
                 └──────────────┘
                        │  query(minhash)
                        ▼
                 candidate_keys  ──► CascadeWorker (Phase 3)

Persistence model
──────────────────
``MinHashIndexer`` keeps the in-process ``datasketch.MinHashLSH`` object as
the authoritative index.  The serialised MinHash bytes for each fragment are
returned so callers can store them in the DB (Fragments.lsh_signature column).
The LSH bucket membership itself is rebuilt from stored signatures on service
restart via ``MinHashIndexer.rebuild_from_db()``.

Usage
-----
    from clone_detection.lsh_index import MinHashIndexer, deserialize_minhash

    indexer = MinHashIndexer(num_perm=128, threshold=0.3)
    sig_bytes = indexer.index(fragment)
    candidates = indexer.query(fragment)  # returns list[str] of fragment_ids
"""

from __future__ import annotations

import pickle
from typing import Iterable, Optional

from datasketch import MinHash, MinHashLSH

from .preprocessor import Fragment
from .utils.common_setup import setup_logging

logger = setup_logging(__name__)

# ────────────────────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────────────────────

DEFAULT_NUM_PERM: int = 128  # signature length (hash count)
DEFAULT_THRESHOLD: float = 0.3  # minimum Jaccard for bucket sharing
# low enough to catch Type-3; ~95 % reduction
DEFAULT_BANDS: Optional[int] = None  # let datasketch choose b/r split


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────


def _build_minhash(tokens: list[str], num_perm: int = DEFAULT_NUM_PERM) -> MinHash:
    """Create a MinHash signature from an abstract token list."""
    m = MinHash(num_perm=num_perm)
    for token in tokens:
        m.update(token.encode("utf-8"))
    return m


def serialize_minhash(minhash: MinHash) -> bytes:
    """Serialise a MinHash object to bytes for DB storage."""
    return pickle.dumps(minhash)


def deserialize_minhash(data: bytes) -> MinHash:
    """Deserialise a MinHash from bytes."""
    return pickle.loads(data)  # noqa: S301


# ────────────────────────────────────────────────────────────────────────────
# MinHashIndexer
# ────────────────────────────────────────────────────────────────────────────


class MinHashIndexer:
    """
    In-process MinHash LSH index.

    Thread-safety: ``datasketch.MinHashLSH`` uses Python dicts internally;
    use an external lock when accessing from multiple threads / Celery workers.

    Parameters
    ----------
    num_perm:  Number of permutations (signature length).  Higher = more
               accurate but more memory.  128 is a good default.
    threshold: Jaccard similarity threshold for two fragments to share a
               bucket.  0.3 keeps recall high while cutting ~95 % of pairs.
    weights:   Tuple (false_positive_weight, false_negative_weight) passed to
               datasketch to tune the b/r split.  Default (0.5, 0.5) is balanced.
    """

    def __init__(
        self,
        num_perm: int = DEFAULT_NUM_PERM,
        threshold: float = DEFAULT_THRESHOLD,
        weights: tuple[float, float] = (0.5, 0.5),
    ) -> None:
        self._num_perm = num_perm
        self._threshold = threshold
        self._lsh = MinHashLSH(threshold=threshold, num_perm=num_perm, weights=weights)
        # fragment_id → MinHash, for re-query and rebuild
        self._store: dict[str, MinHash] = {}

    # ── Indexing ────────────────────────────────────────────────────────────

    def index(self, fragment: Fragment) -> bytes:
        """
        Add a fragment to the LSH index.

        ``fragment.fragment_id`` must be set before calling this method.
        Returns the serialised MinHash bytes (store in DB as
        ``Fragments.lsh_signature``).

        Raises ``ValueError`` if ``fragment_id`` is None.
        """
        if fragment.fragment_id is None:
            raise ValueError("fragment.fragment_id must be set before indexing")

        minhash = _build_minhash(fragment.abstract_tokens, self._num_perm)

        # Guard against duplicate keys (idempotent re-index)
        if fragment.fragment_id in self._store:
            try:
                self._lsh.remove(fragment.fragment_id)
            except Exception:
                pass

        self._lsh.insert(fragment.fragment_id, minhash)
        self._store[fragment.fragment_id] = minhash

        sig_bytes = serialize_minhash(minhash)
        fragment.lsh_signature = sig_bytes
        return sig_bytes

    def index_batch(self, fragments: Iterable[Fragment]) -> dict[str, bytes]:
        """
        Index a batch of fragments.

        Returns a mapping fragment_id → signature_bytes.
        """
        result: dict[str, bytes] = {}
        for frag in fragments:
            try:
                result[frag.fragment_id] = self.index(frag)  # type: ignore[index]
            except Exception as exc:
                logger.warning("Failed to index fragment %s: %s", frag.fragment_id, exc)
        return result

    # ── Querying ────────────────────────────────────────────────────────────

    def query(self, fragment: Fragment) -> list[str]:
        """
        Return fragment_ids that share at least one LSH bucket with *fragment*.

        The queried fragment does NOT need to be in the index.
        """
        minhash = _build_minhash(fragment.abstract_tokens, self._num_perm)
        try:
            candidates = self._lsh.query(minhash)
        except Exception as exc:
            logger.warning("LSH query failed: %s", exc)
            return []
        # Exclude self
        return [c for c in candidates if c != fragment.fragment_id]

    def query_by_tokens(self, abstract_tokens: list[str]) -> list[str]:
        """Query directly from abstract tokens (no Fragment object needed)."""
        minhash = _build_minhash(abstract_tokens, self._num_perm)
        try:
            return list(self._lsh.query(minhash))
        except Exception as exc:
            logger.warning("LSH query failed: %s", exc)
            return []

    def query_by_signature(self, sig_bytes: bytes) -> list[str]:
        """Query using previously-serialised signature bytes."""
        minhash = deserialize_minhash(sig_bytes)
        try:
            return list(self._lsh.query(minhash))
        except Exception as exc:
            logger.warning("LSH query (from bytes) failed: %s", exc)
            return []

    # ── Jaccard approximation ───────────────────────────────────────────────

    def jaccard(self, frag_id_a: str, frag_id_b: str) -> float:
        """
        Return the approximate Jaccard similarity between two indexed fragments.

        Returns 0.0 if either fragment is not indexed.
        """
        mh_a = self._store.get(frag_id_a)
        mh_b = self._store.get(frag_id_b)
        if mh_a is None or mh_b is None:
            return 0.0
        return mh_a.jaccard(mh_b)

    # ── Rebuild from persisted signatures ──────────────────────────────────

    def rebuild_from_db(self, records: Iterable[tuple[str, bytes]]) -> int:
        """
        Rebuild the in-memory LSH index from persisted signature bytes.

        ``records`` should yield ``(fragment_id, lsh_signature_bytes)`` pairs.
        Returns the number of fragments loaded.
        """
        count = 0
        for frag_id, sig_bytes in records:
            try:
                minhash = deserialize_minhash(sig_bytes)
                if frag_id not in self._store:
                    self._lsh.insert(frag_id, minhash)
                    self._store[frag_id] = minhash
                count += 1
            except Exception as exc:
                logger.warning("Could not reload fragment %s: %s", frag_id, exc)
        logger.info("Rebuilt LSH index with %d fragments", count)
        return count

    # ── Housekeeping ────────────────────────────────────────────────────────

    def remove(self, fragment_id: str) -> None:
        """Remove a fragment from the index (e.g. when a submission is deleted)."""
        if fragment_id in self._store:
            try:
                self._lsh.remove(fragment_id)
            except Exception:
                pass
            del self._store[fragment_id]

    def size(self) -> int:
        """Number of fragments currently indexed."""
        return len(self._store)

    def clear(self) -> None:
        """Reset the entire index (useful in tests)."""
        self._lsh = MinHashLSH(threshold=self._threshold, num_perm=self._num_perm)
        self._store.clear()


# ────────────────────────────────────────────────────────────────────────────
# Candidate pair deduplification helper
# ────────────────────────────────────────────────────────────────────────────


def deduplicate_pairs(pairs: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """
    Deduplicate (a, b) / (b, a) candidate pairs and drop self-pairs.

    Returns a list of canonicalised (min_id, max_id) tuples.
    """
    seen: set[tuple[str, str]] = set()
    result: list[tuple[str, str]] = []
    for a, b in pairs:
        if a == b:
            continue
        key = (min(a, b), max(a, b))
        if key not in seen:
            seen.add(key)
            result.append(key)
    return result


def generate_candidate_pairs(
    indexer: MinHashIndexer,
    new_fragments: list[Fragment],
) -> list[tuple[str, str]]:
    """
    For each new fragment, query the LSH and collect candidate pairs.

    Pairs are deduped and self-pairs removed.  The new fragments must be
    indexed first (so they appear in results for other fragments' queries).

    Returns a list of (fragment_id_a, fragment_id_b) pairs.
    """
    raw_pairs: list[tuple[str, str]] = []
    for frag in new_fragments:
        if frag.fragment_id is None:
            continue
        neighbours = indexer.query(frag)
        for nb_id in neighbours:
            raw_pairs.append((frag.fragment_id, nb_id))

    return deduplicate_pairs(raw_pairs)
