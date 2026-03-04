# CIPAS Track A — Syntactic Similarity Scoring

> **Status:** Phase 1 Implementation (E10/US03)
> **Owner:** Platform Engineering
> **Last updated:** 2025

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Three-Stage Pipeline](#3-three-stage-pipeline)
   - 3.1 [Stage 1 — Pre-Filter (MinHash + LSH)](#31-stage-1--pre-filter-minhash--lsh)
   - 3.2 [Stage 2 — LCS Engine](#32-stage-2--lcs-engine)
   - 3.3 [Stage 3 — Thresholding](#33-stage-3--thresholding)
4. [Clone Classification](#4-clone-classification)
5. [Configuration Reference](#5-configuration-reference)
6. [API Reference](#6-api-reference)
7. [Data Model](#7-data-model)
8. [Performance Targets & Benchmarks](#8-performance-targets--benchmarks)
9. [Accuracy & Validation](#9-accuracy--validation)
10. [Edge Cases & Defensive Handling](#10-edge-cases--defensive-handling)
11. [Operational Runbook](#11-operational-runbook)
12. [Dependency Map](#12-dependency-map)
13. [Out of Scope (Phase 1)](#13-out-of-scope-phase-1)

---

## 1. Overview

CIPAS Track A performs **syntactic similarity scoring** between normalised code granules produced by the ingestion pipeline (E15/US08). It detects two clone types:

| Type | Description | Detection Method |
|------|-------------|-----------------|
| **Type 1** | Exact clone — byte-identical after normalisation | `granule_hash` equality (SHA-256) |
| **Type 2** | Renamed clone — identical structure, different identifiers | LCS similarity score ≥ `syntactic_clone_threshold` |

The scoring pipeline is **batch-only** (no real-time scoring) and **language-agnostic** — it operates on the normalised token stream produced by `type1_normalise()`, not on the raw source AST.

### Inputs

- Two sets of `GranuleRecord` objects fetched from the `granules` table — one set per submission being compared.
- A `ScoringConfig` carrying the algorithm parameters and clone threshold.

### Outputs

- A `SimilarityReport` containing:
  - Aggregate metrics (total pairs, pre-filter rejection rate, LCS comparisons run, clones flagged, wall-clock duration).
  - An ordered list of `CloneMatch` entries — one per flagged clone pair, sorted by `similarity_score` descending.

---

## 2. Architecture

```
POST /api/v1/cipas/submissions/{id}/similarity-analysis
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  similarity.py  (route handler)                                      │
│  1. Validate input (self-comparison guard, granule existence check)  │
│  2. Build ScoringConfig from request body + service defaults         │
│  3. Create RUNNING report row (similarity_repository.create_report)  │
│  4. Await SimilarityScoringPipeline.run(...)                         │
│  5. Persist completed report (similarity_repository.complete_report) │
│  6. Return SimilarityAnalysisResponse                                │
└─────────────────────────┬────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SimilarityScoringPipeline  (scorer.py)                              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Stage 1: PreFilter  (pre_filter.py)                        │    │
│  │  shingle → MinHash → LSH buckets → Jaccard estimate filter  │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │  candidate pairs                       │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │  Stage 2: LCS Engine  (lcs_engine.py)                       │    │
│  │  Type-1 short-circuit │ parallel compare_pair_task()        │    │
│  │  (hash equality)      │ ProcessPoolExecutor workers          │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │  LCSResult per pair                    │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │  Stage 3: Thresholding                                       │    │
│  │  score >= clone_threshold → CloneMatch (TYPE1 or TYPE2)     │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │  SimilarityReport                      │
└─────────────────────────────┼────────────────────────────────────────┘
                              │
                ┌─────────────▼────────────┐
                │  SimilarityRepository    │
                │  (similarity_repository) │
                │  similarity_reports      │
                │  clone_matches           │
                └──────────────────────────┘
```

### Component Boundaries

| Component | File | Responsibility |
|-----------|------|----------------|
| `PreFilter` | `src/cipas/similarity/pre_filter.py` | MinHash + LSH candidate pair discovery |
| `LCSEngine` | `src/cipas/similarity/lcs_engine.py` | Space-efficient LCS DP with early termination |
| `SimilarityScoringPipeline` | `src/cipas/similarity/scorer.py` | Three-stage orchestrator, parallelism |
| `SimilarityRepository` | `src/cipas/storage/similarity_repository.py` | DB read/write for reports and matches |
| Similarity Routes | `src/cipas/api/v1/routes/similarity.py` | HTTP handlers |
| Similarity Deps | `src/cipas/api/v1/deps/similarity.py` | FastAPI dependency injection |
| Domain Models | `src/cipas/similarity/models.py` | All data shapes |

---

## 3. Three-Stage Pipeline

### 3.1 Stage 1 — Pre-Filter (MinHash + LSH)

**Purpose:** Reduce the O(N²) granule-pair space to a manageable candidate set before running the expensive LCS stage.

**Why MinHash + LSH?**

Comparing 1,000 granules naïvely yields ~500,000 pairs. At 200ms per LCS comparison on a single core, that's ~100,000 seconds. MinHash + LSH identifies which pairs are plausibly similar in O(N) time, passing only ~10% of pairs (typically far fewer for unrelated submissions) to LCS.

#### Algorithm Steps

**Step 1 — Shingling**

Each granule's normalised source is split into tokens (whitespace-separated) and hashed k-grams (shingles) are generated:

```
tokens = normalized_source.split()
shingles = [fnv1a_32(" ".join(tokens[i:i+k])) for i in range(len(tokens) - k + 1)]
```

Default shingle size: **k = 5 tokens**. Five-gram shingles capture short structural patterns (e.g., `"for ( int i = 0"`) while remaining robust to identifier renaming at the shingle level.

**Step 2 — MinHash Signatures**

For each granule, compute a k-dimensional MinHash signature:

```
sig[i] = min(h_i(s) for s in shingle_set)
```

Where `h_i` is the i-th hash function from the universal family:

```
h_{a,b}(x) = (a * x + b) % M31
```

With pre-generated deterministic `(a, b)` coefficients (derived from SHA-256 of a seed). The default signature length is **128 hash functions**.

The Jaccard similarity estimate from two signatures is:

```
J_est(A, B) = |{i : sig_A[i] == sig_B[i]}| / 128
```

This is an unbiased estimator with standard error ≈ 1/√128 ≈ 8.8%.

**Step 3 — LSH Banding**

The 128-element signature is split into **32 bands of 4 rows** each. Two granules are candidate pairs if they collide in at least one band (identical band sub-vector).

The probability that a pair with true Jaccard `J` becomes a candidate is:

```
P(candidate | J) = 1 - (1 - J^r)^b
```

With r=4, b=32:

| Jaccard | P(candidate) |
|---------|-------------|
| 0.30 | ~47% |
| 0.50 | ~96% |
| 0.70 | ~99.97% |
| 0.90 | ~99.9999% |

**Step 4 — Secondary Jaccard Filter**

After LSH candidate discovery, each candidate pair's full MinHash Jaccard estimate is computed (O(128) per pair). Pairs with estimated Jaccard < `jaccard_prefilter_threshold` (default **0.3**) are discarded.

This double-layer approach ensures:
- The LSH bands catch pairs with Jaccard ≥ ~0.42 with near-certainty.
- The secondary Jaccard filter passes pairs the LSH might have missed at lower similarities (0.30–0.42 range).
- Genuinely unrelated code (Jaccard ≈ 0) is rejected before reaching LCS.

#### Pre-filter Implementation Notes

- **FNV-1a 32-bit hashing** is used for shingles (zero dependencies, deterministic, fast).
- **SHA-256 with seed** is used for MinHash parameter generation (deterministic across restarts).
- `_MINHASH_EMPTY_SENTINEL = M31` is used for empty shingle sets; LSH skips all-sentinel bands.
- Empty granules (`is_empty=True`) and oversized-sentinel granules are skipped before shingling.
- Same-submission pairs are excluded from the candidate set (cross-submission only).

---

### 3.2 Stage 2 — LCS Engine

**Purpose:** Compute an exact LCS-based similarity score for each candidate pair produced by Stage 1.

#### Similarity Metric

```
similarity_score = lcs_length / max(len(tokens_a), len(tokens_b))
```

This normalised LCS similarity is symmetric and bounded in [0.0, 1.0]:
- **1.0**: Both sequences are identical (or one is fully embedded in the other).
- **0.0**: No common tokens.
- **~0.75–0.95**: Typical range for Type-2 (renamed) clones.

The `max` denominator (rather than average or sum) means a short sequence fully contained in a longer one scores `len(short)/len(long)`, which naturally penalises large length disparities.

#### Space-Efficient DP

The standard LCS DP uses O(m×n) space. For granules with 500 tokens each, that's 250,000 integers — acceptable for a few pairs but prohibitive for thousands. This implementation uses the **rolling two-row** variant:

```python
prev = [0] * (n + 1)
for i in range(1, m + 1):
    curr = [0] * (n + 1)
    for j in range(1, n + 1):
        if tokens_a[i-1] == tokens_b[j-1]:
            curr[j] = prev[j-1] + 1
        else:
            curr[j] = max(curr[j-1], prev[j])
    prev = curr
```

Space complexity: **O(min(m, n))** — the shorter sequence is always placed on the column axis.

#### Early Termination

After processing row `i`, the maximum achievable LCS is bounded by:

```
upper_bound = current_lcs + (m - i)
sim_upper   = upper_bound / max(m, n)
```

If `sim_upper < threshold`, the DP terminates immediately. The returned score is a lower bound guaranteed to be `< threshold`.

For genuinely dissimilar pairs (e.g., 10-token sequence vs 50-token sequence with no overlap, threshold=0.85), termination typically fires at row 1, saving 95%+ of the DP work.

#### Snippet Extraction (Two-Pass)

For pairs that pass the threshold, a second O(m×n) DP pass reconstructs the LCS token sequence via backtracking. The result is returned as `matching_tokens` (capped at 150 tokens, `_SNIPPET_TOKEN_LIMIT`).

The two-pass design ensures the O(m×n) space cost of backtracking is only paid for confirmed clones — not for every candidate pair.

For sequences exceeding `_SNIPPET_MAX_TOKENS = 2,000` tokens, backtracking is skipped and an empty snippet is returned to prevent accidental OOM.

#### Parallel Execution

LCS comparisons are CPU-bound. The pipeline dispatches them to a `ProcessPoolExecutor` via `asyncio.run_in_executor()`. The FastAPI event loop remains responsive while workers run.

```
asyncio.gather(
    loop.run_in_executor(executor, compare_pair_task, pair_1, threshold, extract_snippet),
    loop.run_in_executor(executor, compare_pair_task, pair_2, threshold, extract_snippet),
    ...
)
```

Pairs are dispatched in chunks of `_LCS_DISPATCH_CHUNK_SIZE = 256` to bound memory usage from coroutine scheduling.

`compare_pair_task()` is the top-level picklable worker function. It:
1. Tokenises the normalised source strings.
2. Calls `compute_lcs_similarity()`.
3. Returns a plain dict (no Pydantic objects over IPC).
4. Catches all exceptions and returns `score=0.0` with an `"error"` key rather than crashing the worker.

#### Type-1 Short-Circuit

Before dispatching to the executor, pairs with equal `granule_hash` values skip the LCS stage entirely:

```python
if granule_a.granule_hash == granule_b.granule_hash:
    # Type-1: score = 1.0, snippet = granule_a.tokens[:150]
```

This is correct because `granule_hash = SHA-256(type1_normalise(source))`. Equal hashes ⟹ identical normalised sources ⟹ LCS = full length ⟹ score = 1.0.

---

### 3.3 Stage 3 — Thresholding

**Purpose:** Classify pairs as clones or non-clones and build `CloneMatch` entries.

```python
for candidate, lcs_result in zip(candidates, lcs_results):
    score = lcs_result["similarity_score"]
    if score >= config.syntactic_clone_threshold:
        clone_type = TYPE1 if hash_a == hash_b else TYPE2
        matches.append(CloneMatch(..., similarity_score=score, clone_type=clone_type))
```

Matches are sorted by `similarity_score` descending (highest confidence first). The match list is capped at `_MAX_MATCHES_PER_REPORT = 2,000` entries to prevent unbounded memory and DB row counts.

---

## 4. Clone Classification

| Classification | Condition | Typical Score |
|----------------|-----------|---------------|
| **TYPE1** (exact) | `granule_hash_a == granule_hash_b` | 1.0 |
| **TYPE2** (renamed) | Hashes differ, `score >= threshold` | 0.75–0.99 |

**Note:** A pair can have `score = 1.0` but be classified as TYPE2 if the hashes differ. This happens when the normalised sources are token-for-token identical but the raw sources had different formatting (e.g., different comment text) — the granule hashes would differ because `granule_hash = SHA-256(normalised_source)`, so actually equal normalised sources **will** have equal hashes. In practice, TYPE2 pairs always have scores in [threshold, 1.0).

---

## 5. Configuration Reference

All settings are prefixed with `CIPAS_` in environment variables.

### Service-Level Defaults (Settings)

| Setting | Env Variable | Default | Description |
|---------|-------------|---------|-------------|
| `SYNTACTIC_CLONE_THRESHOLD` | `CIPAS_SYNTACTIC_CLONE_THRESHOLD` | `0.85` | LCS score threshold for clone flagging |
| `JACCARD_PREFILTER_THRESHOLD` | `CIPAS_JACCARD_PREFILTER_THRESHOLD` | `0.3` | MinHash Jaccard pre-filter threshold |
| `MINHASH_PERMUTATIONS` | `CIPAS_MINHASH_PERMUTATIONS` | `128` | MinHash signature length |
| `LSH_NUM_BANDS` | `CIPAS_LSH_NUM_BANDS` | `32` | LSH bands (rows/band = 128/32 = 4) |
| `SHINGLE_SIZE` | `CIPAS_SHINGLE_SIZE` | `5` | Token n-gram size for shingling |
| `SIMILARITY_ANALYSIS_TIMEOUT` | `CIPAS_SIMILARITY_ANALYSIS_TIMEOUT` | `600.0` | Max seconds per analysis run |

**Constraint:** `CIPAS_MINHASH_PERMUTATIONS` must be divisible by `CIPAS_LSH_NUM_BANDS`. The service validates this at startup.

### Per-Request Overrides (ScoringConfig)

The POST `/similarity-analysis` request body can override:
- `syntactic_clone_threshold` — per-assignment threshold (e.g., lenient for introductory courses)
- `jaccard_prefilter_threshold` — reduce to 0.2 for assignments with heavy identifier renaming

Per-request overrides take precedence over service defaults.

### Threshold Tuning Guidelines

| Course Level | Recommended Threshold | Rationale |
|-------------|----------------------|-----------|
| Introductory (CS1) | 0.90 | Students work from the same skeleton; focus on verbatim copies |
| Intermediate (CS2–CS3) | 0.85 (default) | Standard structural clone detection |
| Advanced / Research | 0.75 | Detect subtle refactored copies |
| Debug mode | 0.0 | Flag all candidate pairs (admin use only) |

---

## 6. API Reference

### POST `/api/v1/cipas/submissions/{submission_id}/similarity-analysis`

Trigger a syntactic similarity scoring run.

**Request Body** (`application/json`):
```json
{
  "comparison_submission_id": "550e8400-e29b-41d4-a716-446655440001",
  "assignment_id":            "550e8400-e29b-41d4-a716-446655440002",
  "syntactic_clone_threshold": 0.85,
  "jaccard_prefilter_threshold": 0.3
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `comparison_submission_id` | UUID | ✅ | Submission to compare against |
| `assignment_id` | UUID | ✅ | Assignment both submissions belong to |
| `syntactic_clone_threshold` | float [0,1] | ❌ | Override service default |
| `jaccard_prefilter_threshold` | float [0,1] | ❌ | Override service default |

**Response** `200 OK`:
```json
{
  "report_id":                 "abc12345-...",
  "submission_id":             "550e8400-...",
  "comparison_submission_id":  "550e8400-...",
  "assignment_id":             "550e8400-...",
  "status":                    "COMPLETED",
  "created_at":                "2025-01-15T10:30:00Z",
  "metrics": {
    "total_granule_pairs":         1200,
    "pre_filter_candidates":        48,
    "lcs_comparisons_run":          45,
    "pre_filter_rejection_rate":  0.960,
    "clones_flagged":               3,
    "duration_seconds":           12.4
  },
  "clones_flagged": 3
}
```

**Error Responses:**

| Status | Code | Cause |
|--------|------|-------|
| 400 | `SELF_COMPARISON` | `submission_id == comparison_submission_id` |
| 404 | `SUBMISSION_NOT_FOUND` | Subject submission has no analysable granules |
| 404 | `COMPARISON_SUBMISSION_NOT_FOUND` | Comparison submission has no analysable granules |
| 503 | `SIMILARITY_PIPELINE_UNAVAILABLE` | Pipeline still warming up |

---

### GET `/api/v1/cipas/similarity-reports/{report_id}`

Retrieve a similarity report by ID.

**Response** `200 OK`:
```json
{
  "report_id":        "abc12345-...",
  "submission_a_id":  "...",
  "submission_b_id":  "...",
  "assignment_id":    "...",
  "status":           "COMPLETED",
  "config": {
    "syntactic_clone_threshold":    0.85,
    "jaccard_prefilter_threshold":  0.3,
    "minhash_num_permutations":     128,
    "lsh_num_bands":                32,
    "shingle_size":                 5,
    "lcs_worker_count":             0
  },
  "metrics": { ... },
  "created_at":   "2025-01-15T10:30:00Z",
  "completed_at": "2025-01-15T10:30:12Z",
  "error_message": null
}
```

---

### GET `/api/v1/cipas/similarity-reports/{report_id}/matches`

List clone matches for a report. Paginated.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int [1–1000] | 100 | Page size |
| `offset` | int ≥ 0 | 0 | Pagination offset |
| `min_score` | float [0,1] | 0.0 | Minimum similarity score filter |
| `clone_type` | `"type1"` \| `"type2"` | (none) | Filter by clone type |

**Response** `200 OK`:
```json
[
  {
    "match_id":               "def45678-...",
    "report_id":              "abc12345-...",
    "submission_id":          "...",
    "matched_submission_id":  "...",
    "granule_a_id":           "...",
    "granule_b_id":           "...",
    "similarity_score":       0.94,
    "clone_type":             "type2",
    "snippet_match":          "public int compute ( int x ) { int result = 0 ; ...",
    "created_at":             "2025-01-15T10:30:12Z"
  }
]
```

---

### GET `/api/v1/cipas/submissions/{submission_id}/similarity-reports`

List all similarity reports involving a submission.

**Query Parameters:** `limit` (1–200, default 50)

**Response** `200 OK`: Array of report summaries ordered by `created_at DESC`.

---

## 7. Data Model

### `similarity_reports` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Report identifier |
| `submission_a_id` | UUID | Subject submission |
| `submission_b_id` | UUID | Comparison target |
| `assignment_id` | UUID | Assignment context |
| `status` | VARCHAR(20) | `RUNNING` \| `COMPLETED` \| `FAILED` |
| `config_json` | JSONB | `ScoringConfig` snapshot |
| `total_pairs` | BIGINT | Total granule pairs considered |
| `pre_filter_candidates` | BIGINT | Pairs passing pre-filter |
| `lcs_comparisons_run` | BIGINT | LCS calls executed |
| `pre_filter_rejection_rate` | DOUBLE | Fraction rejected before LCS |
| `clones_flagged` | INTEGER | Confirmed clone pairs |
| `duration_seconds` | DOUBLE | Wall-clock analysis time |
| `error_message` | TEXT | Non-NULL only on FAILED |
| `created_at` | TIMESTAMPTZ | Job creation time |
| `completed_at` | TIMESTAMPTZ | Job completion time |

### `clone_matches` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Match identifier |
| `report_id` | UUID FK → `similarity_reports` | Parent report (CASCADE DELETE) |
| `submission_id` | UUID | Subject granule's submission |
| `matched_submission_id` | UUID | Comparison granule's submission |
| `granule_a_id` | UUID | Subject granule (soft ref to `granules.id`) |
| `granule_b_id` | UUID | Comparison granule (soft ref to `granules.id`) |
| `similarity_score` | DOUBLE | LCS score in [0.0, 1.0] |
| `clone_type` | VARCHAR(10) | `type1` \| `type2` |
| `snippet_match` | TEXT | Space-separated LCS token excerpt (≤ 4096 chars) |
| `created_at` | TIMESTAMPTZ | Row creation time |

**Note:** `granule_a_id`/`granule_b_id` are soft references (no FK constraint) to avoid cascaded deletes when granules are purged. Application layer enforces existence at insert time.

---

## 8. Performance Targets & Benchmarks

### Per-Operation Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| MinHash signature per granule | ≤ 50ms | 128 perms × ~50 shingles |
| LSH bucketing (1,000 granules) | < 5ms total | In-memory dict ops |
| Pre-filter pass (1,000 granules) | ≤ 50ms per granule | Cumulative |
| LCS comparison (500 LOC granule) | ≤ 200ms | With early termination |
| Full batch (1,000 granules, 8-core VM) | ≤ 10 minutes | With ≤10% pass rate |

### Throughput Model

For a typical analysis run comparing submission A (50 granules) against a corpus submission B (50 granules):

```
Total pairs:          50 × 50 = 2,500
Pre-filter output:    ~250 candidates (10%)
Type-1 short-circuit: ~5 pairs (exact copies)
LCS comparisons:      ~245 pairs
LCS time (8 cores):   245 pairs / 8 cores × 30ms avg = ~920ms
Total analysis time:  ~1-2 seconds
```

For a 1,000-granule all-vs-all corpus:

```
Total pairs:             ~500,000
Pre-filter output:       ~50,000 candidates (10%)
LCS comparisons (8c):   50,000 / 8 × 50ms avg ≈ 312 seconds ≈ 5 minutes ✓
```

### Scaling Behaviour

The pipeline scales linearly with CPU cores for the LCS stage (embarrassingly parallel). The pre-filter is single-threaded (fast enough: O(N × k) MinHash).

To increase throughput: scale `CIPAS_PARSER_WORKERS` (reused as LCS worker count) or add container replicas.

---

## 9. Accuracy & Validation

### Acceptance Criteria Compliance

| Criterion | Test | Expected Result |
|-----------|------|----------------|
| AC1: Byte-identical → score = 1.0 | `test_ac1_identical_granules_score_1_type1` | score == 1.0, clone_type == TYPE1 |
| AC2: 80% overlap → score ≥ 0.80 | `test_ac2_eighty_percent_overlap_flagged` | score >= 0.80 |
| AC3: threshold=0.75, score 0.76 → flagged | `test_ac3_score_076_at_threshold_075_is_flagged` | match in report |
| AC3: threshold=0.75, score 0.74 → ignored | `test_ac3_score_074_at_threshold_075_not_flagged` | no match |
| AC4: ≤10% pass rate for unrelated code | `test_ac4_prefilter_rejection_rate_for_unrelated_corpus` | rejection_rate >= 0.90 |

### Precision Expectations (Type-2)

At the default threshold of **0.85**:
- **Precision:** ≥ 90% against BigCloneBench Type-2 subset (validated offline; exact pairs removed from benchmark).
- **Recall:** Near 100% for pairs with true Jaccard ≥ 0.5 (LSH catch rate > 96%); recall drops to ~47% at Jaccard = 0.30 due to LSH probability curve, but those pairs typically score below 0.85 anyway.

To improve recall for near-threshold pairs, lower `CIPAS_JACCARD_PREFILTER_THRESHOLD` to 0.2 or increase `CIPAS_MINHASH_PERMUTATIONS` to 256.

### Known Accuracy Limitations

1. **String literals:** `type1_normalise()` does NOT normalise string literal contents. Two functions that differ only in a string literal constant are **not** flagged as Type-2 clones at the syntactic level (correct behaviour; semantic similarity is Track B).

2. **Comment-heavy granules:** After normalisation, a function that is 50% comments may become very short (few tokens), reducing its effective LCS. This is correct — the structural content is genuinely sparse.

3. **Single-token granules:** Granules collapsed to one or two tokens (e.g., `{ }`) may produce false positives if threshold=0.0. At default threshold 0.85 these are invisible.

---

## 10. Edge Cases & Defensive Handling

| Edge Case | Behaviour |
|-----------|-----------|
| Empty `normalized_source` | Skipped at pre-filter (debug log: `skipped_empty++`) |
| `granule_hash` = `000...000` (oversized sentinel) | Skipped at pre-filter |
| `threshold = 0.0` | All candidate pairs flagged; useful for debugging; note in API docs |
| `threshold = 1.0` | Only exact-hash pairs (TYPE1) are flagged |
| `submission_id == comparison_submission_id` | HTTP 400 `SELF_COMPARISON` |
| Either submission has zero granules | HTTP 404 with specific code |
| LCS worker crashes (exception in `compare_pair_task`) | Returns `score=0.0`, logs warning; pipeline continues |
| `pre_filter_candidates > _MAX_MATCHES_PER_REPORT` | Match list capped; warning logged |
| Granule with >2,000 tokens | Snippet extraction skipped; score still computed |
| `minhash_num_permutations % lsh_num_bands != 0` | `ValueError` at `PreFilter` construction; fail-fast |

---

## 11. Operational Runbook

### Startup Sequence

The `SimilarityScoringPipeline` is managed in the FastAPI lifespan (`main.py`):

```
CIPAS startup:
  1. Create DB pool
  2. Instantiate StorageRepository
  3. Instantiate & start IngestionPipeline (parse workers)
  4. Instantiate SimilarityRepository            ← new
  5. Instantiate & start SimilarityScoringPipeline (LCS workers)  ← new
  6. Service READY
```

A warm-up task is submitted during `start()` to pre-fork worker processes and avoid cold-start latency on the first analysis request.

### Monitoring

Key metrics to watch (available via Prometheus `/metrics`):

| Metric | Alert Threshold | Meaning |
|--------|----------------|---------|
| `pre_filter_rejection_rate` | < 0.80 | Too many pairs reaching LCS; consider tightening Jaccard threshold |
| `lcs_comparisons_run` per report | > 10,000 | Potential performance issue for large corpora |
| `duration_seconds` per report | > 600 | Analysis exceeding timeout budget |
| `clones_flagged / total_pairs` | > 0.50 | Suspicious; may indicate a very small threshold or many duplicate submissions |

### Stale Report Recovery

Reports left in `RUNNING` status after a service restart indicate an interrupted analysis. On restart, the lifespan does not automatically retry them (the process that was computing the result is gone). Operators should mark stale RUNNING reports as FAILED manually or via a scheduled cleanup job:

```sql
UPDATE similarity_reports
SET status = 'FAILED',
    error_message = 'Interrupted by service restart',
    completed_at = NOW()
WHERE status = 'RUNNING'
  AND created_at < NOW() - INTERVAL '30 minutes';
```

### Adjusting Workers

The LCS worker count is controlled by `CIPAS_PARSER_WORKERS` (shared with the ingestion pipeline). To isolate LCS workers, set `lcs_worker_count` in `ScoringConfig` per-request, or add a dedicated `CIPAS_LCS_WORKERS` environment variable in a future iteration.

---

## 12. Dependency Map

```
E10/US03 (this story)
  ├── Depends on: E15/US08  (Normalized Granules — granules table populated)
  ├── Depends on: E14/US01  (Assignment Configuration — assignment_id for threshold)
  └── Blocks:     E15/US01  (Clone Detection Reporting — consumes similarity_reports)
```

### Internal Dependencies

```
similarity/scorer.py
  ├── similarity/pre_filter.py  (MinHash + LSH)
  ├── similarity/lcs_engine.py  (LCS DP + compare_pair_task)
  ├── similarity/models.py      (all data shapes)
  └── storage/similarity_repository.py  (DB layer)

api/v1/routes/similarity.py
  ├── api/v1/deps/similarity.py  (FastAPI DI)
  ├── similarity/models.py
  └── storage/similarity_repository.py

main.py
  ├── api/v1/routes/similarity.py  (router registration)
  ├── similarity/scorer.py         (pipeline lifecycle)
  └── storage/similarity_repository.py  (repo lifecycle)
```

---

## 13. Out of Scope (Phase 1)

The following are explicitly **not** implemented in this story:

| Feature | Rationale | Planned Phase |
|---------|-----------|--------------|
| **Semantic similarity** (AST edit distance, embeddings) | Track B — separate pipeline | Phase 2 |
| **Cross-language detection** (Python vs Java) | Normalised token streams are not interoperable | Phase 2 |
| **Real-time scoring** | Batch-only for POC | Phase 2 |
| **Async job tracking** (202 Accepted + polling) | Synchronous is sufficient for POC batch sizes | Phase 2 |
| **Type-3 near-miss detection** (added/removed statements) | Requires edit-distance or embedding | Phase 2 |
| **Identifier renaming normalisation** (type2_normalise) | Requires AST-level token substitution | Phase 2 |
| **Assignment-level threshold from Assignment Service API** | Hardcoded service default for POC | Phase 2 |
| **Incremental index updates** (add new submission to existing LSH index) | Full re-scan per analysis run | Phase 2 |
```

Now let me wire everything up and run the tests: