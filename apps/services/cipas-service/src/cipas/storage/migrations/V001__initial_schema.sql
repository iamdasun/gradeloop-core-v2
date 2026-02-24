-- =============================================================================
-- V001__initial_schema.sql
-- CIPAS Phase 1 — Initial database schema
--
-- Applied by the migration runner in cipas/storage/db.py on first startup.
-- Idempotent: all CREATE statements use IF NOT EXISTS.
--
-- Extensions required:
--   vector     → pgvector (pre-installed in pgvector/pgvector:pg16 image)
--   uuid-ossp  → gen_random_uuid() fallback (we generate UUIDs in app layer,
--                but this is useful for ad-hoc queries and future triggers)
--   pg_trgm    → GIN trigram indexes for future fuzzy name search on granules
--
-- Table creation order respects foreign key dependencies:
--   1. submissions   (root entity — no FK deps)
--   2. files         (FK → submissions)
--   3. granules      (FK → files; submission_id denormalised, no FK for perf)
--   4. embeddings    (FK → granules; Phase 2 — created but unpopulated)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- submissions
--
-- Root entity for a batch parse request.
-- One submission = one POST /api/v1/cipas/submissions request.
-- Tracks lifecycle status from PROCESSING → terminal state.
--
-- Indexes:
--   idx_submissions_assignment_id  → find all submissions for an assignment
--   idx_submissions_submitted_by   → find all submissions by a user
--   idx_submissions_status         → partial index on PROCESSING only
--                                    (stale-submission cleanup query)
--   idx_submissions_created_at     → time-range queries, DESC for recent-first
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS submissions (
    id               UUID         NOT NULL,
    assignment_id    UUID         NOT NULL,
    submitted_by     UUID         NOT NULL,
    -- Status lifecycle: PROCESSING → COMPLETED | PARTIAL | FAILED
    status           VARCHAR(20)  NOT NULL DEFAULT 'PROCESSING'
                                  CONSTRAINT ck_submissions_status
                                  CHECK (status IN ('PROCESSING','COMPLETED','PARTIAL','FAILED')),
    -- file_count includes duplicates; parsed files may be fewer.
    file_count       SMALLINT     NOT NULL
                                  CONSTRAINT ck_submissions_file_count
                                  CHECK (file_count > 0 AND file_count <= 200),
    -- granule_count is updated atomically when status is set to terminal.
    granule_count    INTEGER      NOT NULL DEFAULT 0
                                  CONSTRAINT ck_submissions_granule_count
                                  CHECK (granule_count >= 0),
    -- Populated on PARTIAL or FAILED status to summarise what went wrong.
    error_message    TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Populated when status transitions to a terminal state.
    completed_at     TIMESTAMPTZ,

    CONSTRAINT pk_submissions PRIMARY KEY (id)
);

-- Supports: "find all submissions for assignment X" (assessment-service query)
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id
    ON submissions (assignment_id);

-- Supports: "find all submissions by user Y" (student history view)
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_by
    ON submissions (submitted_by);

-- Partial index: only indexes rows in PROCESSING state.
-- Used by the stale-submission cleanup query on startup.
-- Very small index (most submissions are in terminal states).
CREATE INDEX IF NOT EXISTS idx_submissions_processing
    ON submissions (status, created_at)
    WHERE status = 'PROCESSING';

-- Supports: recent-first listing, time-range analytics queries.
CREATE INDEX IF NOT EXISTS idx_submissions_created_at
    ON submissions (created_at DESC);

-- -----------------------------------------------------------------------------
-- files
--
-- One row per uploaded source file per submission.
-- Includes duplicate files (same file_hash) — each gets its own record with
-- parse_status=SKIPPED; granules are on the canonical file's record.
--
-- Denormalised columns:
--   file_hash   → denormalised here AND on granules for cross-submission
--                 deduplication queries ("has this file been seen before?")
--
-- Indexes:
--   idx_files_submission_id  → primary access pattern: all files for a submission
--   idx_files_file_hash      → deduplication: has this exact file been processed?
--   idx_files_language       → per-language statistics and filtering
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS files (
    id               UUID         NOT NULL,
    submission_id    UUID         NOT NULL
                                  CONSTRAINT fk_files_submission
                                  REFERENCES submissions (id)
                                  ON DELETE CASCADE,
    -- Sanitised basename only (no path components).
    filename         VARCHAR(512) NOT NULL,
    language         VARCHAR(32)  NOT NULL
                                  CONSTRAINT ck_files_language
                                  CHECK (language IN ('python','java','c')),
    -- SHA-256 hex digest of raw file bytes (64 lowercase hex chars).
    file_hash        CHAR(64)     NOT NULL,
    byte_size        INTEGER      NOT NULL
                                  CONSTRAINT ck_files_byte_size
                                  CHECK (byte_size > 0),
    line_count       INTEGER      NOT NULL DEFAULT 0
                                  CONSTRAINT ck_files_line_count
                                  CHECK (line_count >= 0),
    parse_status     VARCHAR(20)  NOT NULL DEFAULT 'PARSED'
                                  CONSTRAINT ck_files_parse_status
                                  CHECK (parse_status IN ('PARSED','FAILED','UNSUPPORTED','SKIPPED')),
    -- Populated when parse_status = FAILED; contains the error_code + detail.
    error_message    TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_files PRIMARY KEY (id)
);

-- Primary access pattern: list all files for a submission.
CREATE INDEX IF NOT EXISTS idx_files_submission_id
    ON files (submission_id);

-- Cross-submission deduplication: "find all submissions that contain this file".
-- Also used by Phase 2 incremental processing to skip re-parsing known files.
CREATE INDEX IF NOT EXISTS idx_files_file_hash
    ON files (file_hash);

-- Per-language breakdowns in analytics queries.
CREATE INDEX IF NOT EXISTS idx_files_language
    ON files (language);

-- Compound: submission + parse_status for quick "how many failed in this batch?"
CREATE INDEX IF NOT EXISTS idx_files_submission_parse_status
    ON files (submission_id, parse_status);

-- -----------------------------------------------------------------------------
-- granules
--
-- One row per extracted structural unit (class, function, or loop).
-- This is the core table for clone detection.
--
-- Denormalised columns (intentional):
--   submission_id  → avoids joining through files to reach submissions in
--                    self-join clone detection queries on large result sets.
--   file_hash      → enables "find all granules with the same content as
--                    any file in submission X" without a join.
--
-- Hash columns:
--   granule_hash     → SHA-256 of Type-1 normalised source. Equality = Type-1 clone.
--   ast_fingerprint  → SHA-256 of DFS node-type sequence. Equality = structural match.
--                      Combined with granule_hash != → Type-2 clone candidate.
--
-- Line numbers are 1-indexed (converted from tree-sitter's 0-indexed output).
--
-- Indexes (ordered by expected query frequency):
--   idx_granules_granule_hash      → Type-1 clone detection self-join (PRIMARY)
--   idx_granules_ast_fingerprint   → Type-2 candidate detection self-join
--   idx_granules_submission_id     → submission-scoped reads
--   idx_granules_file_id           → file-level rollup (count per file)
--   idx_granules_submission_type   → most common filtered query pattern
--   idx_granules_type_language     → cross-language structural queries (Phase 2)
--   idx_granules_name_trgm         → fuzzy function/class name search (Phase 2)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS granules (
    id               UUID         NOT NULL,
    file_id          UUID         NOT NULL
                                  CONSTRAINT fk_granules_file
                                  REFERENCES files (id)
                                  ON DELETE CASCADE,
    -- Denormalised: no FK so bulk INSERTs do not pay FK-check overhead per row.
    -- Maintained consistent with files.submission_id at write time by the pipeline.
    submission_id    UUID         NOT NULL,
    granule_type     VARCHAR(32)  NOT NULL
                                  CONSTRAINT ck_granules_type
                                  CHECK (granule_type IN ('class','function','loop')),
    language         VARCHAR(32)  NOT NULL
                                  CONSTRAINT ck_granules_language
                                  CHECK (language IN ('python','java','c')),
    -- Denormalised from files.file_hash for clone self-join performance.
    file_hash        CHAR(64)     NOT NULL,
    -- SHA-256 of Type-1 normalised source.
    -- All-zeros sentinel ('000...0') = oversized granule (excluded from clone queries).
    granule_hash     CHAR(64)     NOT NULL,
    -- SHA-256 of DFS node-type sequence (structure only, no identifiers).
    ast_fingerprint  CHAR(64)     NOT NULL,
    -- 1-indexed line numbers (tree-sitter 0-indexed, converted in extractor).
    start_line       INTEGER      NOT NULL
                                  CONSTRAINT ck_granules_start_line
                                  CHECK (start_line >= 1),
    end_line         INTEGER      NOT NULL
                                  CONSTRAINT ck_granules_end_line
                                  CHECK (end_line >= 1),
    -- Identifier name (e.g. class/function/method name). NULL for anonymous loops.
    name             VARCHAR(512),
    -- Type-1 normalised source: comments stripped, whitespace collapsed.
    -- Empty string for oversized granules.
    normalized_source TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_granules PRIMARY KEY (id),
    CONSTRAINT ck_granules_line_order CHECK (end_line >= start_line)
);

-- ── Clone detection indexes ──────────────────────────────────────────────────

-- Type-1 exact clone detection: self-join on granule_hash.
-- Most frequently used index in clone detection queries.
-- FILLFACTOR 80: leave 20% free space per page for future row updates
-- (granule_hash is never updated, but the index benefits from reduced page
-- splits as new granules are inserted in non-sorted order).
CREATE INDEX IF NOT EXISTS idx_granules_granule_hash
    ON granules (granule_hash)
    WITH (fillfactor = 80);

-- Type-2 structural clone candidate detection: self-join on ast_fingerprint
-- WHERE granule_hash differs.
CREATE INDEX IF NOT EXISTS idx_granules_ast_fingerprint
    ON granules (ast_fingerprint)
    WITH (fillfactor = 80);

-- ── Access pattern indexes ───────────────────────────────────────────────────

-- Submission-scoped reads: "list all granules for submission X".
-- Most common read pattern from the API.
CREATE INDEX IF NOT EXISTS idx_granules_submission_id
    ON granules (submission_id);

-- File-level rollup: "count granules per file in submission X".
CREATE INDEX IF NOT EXISTS idx_granules_file_id
    ON granules (file_id);

-- Compound submission + type: most common filtered query pattern.
-- e.g. "how many functions were extracted from submission X?"
CREATE INDEX IF NOT EXISTS idx_granules_submission_type
    ON granules (submission_id, granule_type);

-- Cross-language structural queries (Phase 2 cross-language clone detection).
CREATE INDEX IF NOT EXISTS idx_granules_type_language
    ON granules (granule_type, language);

-- ── Phase 2 text search index ─────────────────────────────────────────────────

-- GIN trigram index on granule name for fuzzy function/class name search.
-- e.g. "find all granules whose name is similar to 'calculateTotal'"
-- Uses pg_trgm extension (enabled above).
-- Created as non-blocking to avoid locking the table during index build.
-- In production environments where this migration runs against an existing
-- table with data, use CREATE INDEX CONCURRENTLY (must be outside a transaction).
-- For the initial empty-table case, standard CREATE INDEX is faster.
CREATE INDEX IF NOT EXISTS idx_granules_name_trgm
    ON granules USING gin (name gin_trgm_ops)
    WHERE name IS NOT NULL;

-- -----------------------------------------------------------------------------
-- embeddings
--
-- Stores embedding vectors for granules. Phase 1: schema present, no rows.
-- Phase 2: the embedding generation service populates this table.
--
-- Vector dimensionality: 768 matches CodeBERT-family models (GraphCodeBERT,
-- CodeBERT-base, UniXcoder-base). If a 1024-dim model is adopted in Phase 2,
-- this column must be recreated — the model_id column allows tracking which
-- model produced each embedding so incompatible vectors are never compared.
--
-- HNSW index: NOT created in this migration. The index build is expensive
-- on large tables and must be run in a maintenance window using:
--   SET maintenance_work_mem = '2GB';
--   CREATE INDEX CONCURRENTLY idx_embeddings_hnsw_cosine
--     ON embeddings USING hnsw (embedding vector_cosine_ops)
--     WITH (m = 16, ef_construction = 64);
--
-- The index creation DDL is documented here for reference but commented out
-- so it does not execute inline with schema creation.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS embeddings (
    id             UUID         NOT NULL,
    granule_id     UUID         NOT NULL
                                CONSTRAINT fk_embeddings_granule
                                REFERENCES granules (id)
                                ON DELETE CASCADE,
    -- Identifies the embedding model (e.g. "graphcodebert-base").
    -- Multiple models can coexist in this table; each produces independent rows.
    model_id       VARCHAR(128) NOT NULL,
    -- Semver of the model checkpoint (e.g. "1.0.0", "20240101").
    -- Combined with model_id, uniquely identifies the model artifact.
    model_version  VARCHAR(64)  NOT NULL,
    -- pgvector column: 768-dimensional float vector.
    -- NULL is not allowed — every row must have a complete embedding.
    embedding      vector(768)  NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_embeddings PRIMARY KEY (id),
    -- Prevents duplicate embeddings for the same granule + model combination.
    CONSTRAINT uq_embeddings_granule_model
        UNIQUE (granule_id, model_id, model_version)
);

-- Standard B-tree index for granule-level embedding lookup.
-- "Fetch all embeddings for granule X" — used by the similarity endpoint.
CREATE INDEX IF NOT EXISTS idx_embeddings_granule_id
    ON embeddings (granule_id);

-- Model-scoped index: "fetch all embeddings produced by model M".
-- Used by the embedding generation service to resume interrupted jobs.
CREATE INDEX IF NOT EXISTS idx_embeddings_model
    ON embeddings (model_id, model_version);

-- HNSW index DDL reference (execute manually in Phase 2 maintenance window):
--
--   SET maintenance_work_mem = '2GB';
--   CREATE INDEX CONCURRENTLY idx_embeddings_hnsw_cosine
--       ON embeddings
--       USING hnsw (embedding vector_cosine_ops)
--       WITH (m = 16, ef_construction = 64);
--
-- After creation, tune ef_search per workload:
--   SET hnsw.ef_search = 100;   -- higher recall, slower queries (default: 40)

-- -----------------------------------------------------------------------------
-- schema_migrations
--
-- Tracks which migration scripts have been applied.
-- Managed by cipas/storage/db.py's _run_migrations() function.
-- Created by the migration runner itself (before running other migrations),
-- but included here for documentation completeness.
-- The IF NOT EXISTS guard makes this idempotent.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(256) NOT NULL,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_schema_migrations PRIMARY KEY (version)
);

-- =============================================================================
-- End of V001__initial_schema.sql
-- =============================================================================
