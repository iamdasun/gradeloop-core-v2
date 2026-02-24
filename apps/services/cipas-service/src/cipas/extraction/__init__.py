# gradeloop-core-v2/apps/services/cipas-service/src/cipas/extraction/__init__.py
"""
CIPAS extraction package.

Exposes the public interface for the granule extraction layer:

  - GranuleExtractor        Transforms RawGranule → serialisable dict
  - extract_granules()      Module-level convenience function (used in worker)
  - compute_file_hash()     SHA-256 of raw file bytes (used before dispatch)
  - type1_normalise()       Type-1 source normalisation (strip comments + whitespace)
  - type1_normalise_bytes() Convenience wrapper: bytes → normalised str
  - OVERSIZED_SENTINEL_HASH Sentinel hash value for oversized granules

Callers (primarily cipas/ingestion/worker.py) import from this package:

    from cipas.extraction import extract_granules, compute_file_hash

The normaliser is also importable directly for testing:

    from cipas.extraction import type1_normalise
    normalised = type1_normalise("def foo():  # comment\\n    return 1")
"""

from cipas.extraction.granule_extractor import (
    OVERSIZED_SENTINEL_HASH,
    GranuleExtractor,
    compute_file_hash,
    extract_granules,
)
from cipas.extraction.normalizer import (
    type1_normalise,
    type1_normalise_bytes,
)

__all__ = [
    "GranuleExtractor",
    "extract_granules",
    "compute_file_hash",
    "OVERSIZED_SENTINEL_HASH",
    "type1_normalise",
    "type1_normalise_bytes",
]
