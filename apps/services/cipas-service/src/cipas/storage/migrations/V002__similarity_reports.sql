-- =============================================================================
-- V002__similarity_reports.sql
-- CIPAS Track A — Similarity Scoring Schema
--
-- Creates the two tables that back the syntactic similarity scoring pipeline:
--
--   similarity_reports   — one row per POST /similarity-analysis request;
--                          tracks lifecycle (RUNNING → COMPLETED | FAILED)
--                          and aggregate metrics.
--
--   clone_matches        — one row per confirmed clone pair per report;
--                          stores score, type, and aligned snippet.
--
-- Applied by the migration runner in cipas/storage/db.py on startup.
-- Idempotent: all CREATE statements use IF NOT EXISTS.
--
-- Table creation order:
--   1. similarity_reports  (root entity — FK target for clone_matches)
--   2. clone_matches       (FK → similarity_reports)
--
-- Foreign-key design:
--   clone_matches.report_id → similarity_reports.id
--     ON DELETE CASCADE  so that dropping a report row also drops its matches.
--
--   clone_matches.granule_a_id / granule_b_id → granules.id
--     Intentionally NOT a hard FK to avoid cascaded deletes when granules are
--     purged.  Referential integrity is enforced at the application layer.
--     (Same pattern used for granules.submission_id in V001.)
--
--   similarity_reports.submission_a_id / submission_b_id / assignment_id
--     NOT hard FKs to submissions / assignments — those tables live in
--     separate microservices (assessment-service).  Application layer enforces
--     existence before insert.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- similarity_reports
--
-- One row per similarity analysis run.
--
-- Lifecycle:
--   INSERT with status='RUNNING' at job start   (create_report)
--   UPDATE to  status='COMPLETED'/'FAILED'       (complete_report / fail_report)
--
-- Metrics columns are NULL while status='RUNNING' and populated on completion.
--
-- config_json stores the ScoringConfig used for this run as JSONB so that
-- historical runs are auditable even after the service defaults change.
--
-- Indexes:
--   idx_sim_reports_submission_a  → GET /submissions/{id}/similarity-analysis list
--   idx_sim_reports_submission_b  → reverse lookup (comparison target)
--   idx_sim_reports_assignment    → GET /assignments/{id}/similarity-reports
--   idx_sim_reports_status        → partial index on RUNNING (stale job cleanup)
--   idx_sim_reports_created_at    → time-range queries, recent-first listing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS similarity_reports (
    id                          UUID            NOT NULL,
    submission_a_id             UUID            NOT NULL,
    submission_b_id             UUID            NOT NULL,
    assignment_id               UUID            NOT NULL,

    -- Lifecycle status
    status                      VARCHAR(20)     NOT NULL DEFAULT 'RUNNING'
                                                CONSTRAINT ck_sim_reports_status
                                                CHECK (status IN ('RUNNING','COMPLETED','FAILED')),

    -- Serialised ScoringConfig (JSONB for structured querying)
    config_json                 JSONB           NOT NULL DEFAULT '{}',

    -- Aggregate metrics — NULL while status='RUNNING'
    total_pairs                 BIGINT,
    pre_filter_candidates       BIGINT,
    lcs_comparisons_run         BIGINT,
    pre_filter_rejection_rate   DOUBLE PRECISION
                                CONSTRAINT ck_sim_reports_rejection_rate
                                CHECK (pre_filter_rejection_rate IS NULL
                                       OR (pre_filter_rejection_rate >= 0.0
                                           AND pre_filter_rejection_rate <= 1.0)),
    clones_flagged              INTEGER
                                CONSTRAINT ck_sim_reports_clones_flagged
                                CHECK (clones_flagged IS NULL OR clones_flagged >= 0),
    duration_seconds            DOUBLE PRECISION
                                CONSTRAINT ck_sim_reports_duration
                                CHECK (duration_seconds IS NULL OR duration_seconds >= 0.0),

    -- Error detail — non-NULL only when status='FAILED'
    error_message               TEXT,

    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    -- NULL while RUNNING; set when status transitions to terminal state
    completed_at                TIMESTAMPTZ,

    CONSTRAINT pk_similarity_reports PRIMARY KEY (id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary access pattern: all reports for a given subject submission
CREATE INDEX IF NOT EXISTS idx_sim_reports_submission_a
    ON similarity_reports (submission_a_id, created_at DESC);

-- Reverse lookup: reports where this submission is the comparison target
CREATE INDEX IF NOT EXISTS idx_sim_reports_submission_b
    ON similarity_reports (submission_b_id, created_at DESC);

-- Instructor-level view: all reports for an assignment
CREATE INDEX IF NOT EXISTS idx_sim_reports_assignment
    ON similarity_reports (assignment_id, created_at DESC);

-- Partial index for RUNNING status only — stale-job recovery queries on startup
-- Very small index (most reports transition to terminal states quickly).
CREATE INDEX IF NOT EXISTS idx_sim_reports_running
    ON similarity_reports (created_at)
    WHERE status = 'RUNNING';

-- GIN index on config_json for querying by threshold value
-- Example: WHERE (config_json->>'syntactic_clone_threshold')::float > 0.8
CREATE INDEX IF NOT EXISTS idx_sim_reports_config_gin
    ON similarity_reports USING GIN (config_json);


-- ---------------------------------------------------------------------------
-- clone_matches
--
-- One row per confirmed clone pair per report.
-- Only pairs with similarity_score >= syntactic_clone_threshold are stored.
--
-- similarity_score is stored as DOUBLE PRECISION (8 bytes, IEEE 754).
-- clone_type is one of 'type1' (exact) or 'type2' (renamed).
-- snippet_match stores the space-separated LCS token excerpt (≤ 4096 chars).
--
-- Indexes:
--   idx_clone_matches_report        → primary access: all matches for a report
--   idx_clone_matches_submission    → all clones involving a submission
--   idx_clone_matches_score         → sort/filter by similarity score
--   idx_clone_matches_type          → filter by type1 / type2
--   idx_clone_matches_granule_pair  → lookup by granule IDs (dedup check)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clone_matches (
    id                      UUID            NOT NULL,
    report_id               UUID            NOT NULL,

    -- The two submissions involved in this clone pair.
    -- submission_id         = the subject (submission A from the report).
    -- matched_submission_id = the comparison target (submission B).
    submission_id           UUID            NOT NULL,
    matched_submission_id   UUID            NOT NULL,

    -- The two granule UUIDs that form the clone pair.
    -- granule_a_id is always from submission_id.
    -- granule_b_id is always from matched_submission_id.
    granule_a_id            UUID            NOT NULL,
    granule_b_id            UUID            NOT NULL,

    -- LCS similarity score in [0.0, 1.0].
    -- 1.0 for TYPE1 (exact) clones; [threshold, 1.0) for TYPE2.
    similarity_score        DOUBLE PRECISION NOT NULL
                            CONSTRAINT ck_clone_matches_score
                            CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),

    clone_type              VARCHAR(10)     NOT NULL
                            CONSTRAINT ck_clone_matches_type
                            CHECK (clone_type IN ('type1', 'type2')),

    -- Representative excerpt of the common token subsequence.
    -- Space-separated, truncated to 4096 characters.
    -- Empty string when snippet extraction was skipped.
    snippet_match           TEXT            NOT NULL DEFAULT '',

    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_clone_matches PRIMARY KEY (id),

    -- Cascade: deleting a report removes all its match rows.
    CONSTRAINT fk_clone_matches_report
        FOREIGN KEY (report_id)
        REFERENCES similarity_reports (id)
        ON DELETE CASCADE
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary access: retrieve all matches for a report, sorted by score
CREATE INDEX IF NOT EXISTS idx_clone_matches_report
    ON clone_matches (report_id, similarity_score DESC);

-- Supports: "show all clones involving submission X" (student / instructor view)
CREATE INDEX IF NOT EXISTS idx_clone_matches_submission_a
    ON clone_matches (submission_id, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_clone_matches_submission_b
    ON clone_matches (matched_submission_id, similarity_score DESC);

-- Supports: threshold slider — filter matches above a chosen score
CREATE INDEX IF NOT EXISTS idx_clone_matches_score
    ON clone_matches (similarity_score DESC);

-- Supports: filter by clone type (e.g. show only type1 exact copies)
CREATE INDEX IF NOT EXISTS idx_clone_matches_type
    ON clone_matches (clone_type);

-- Composite index for deduplication check: has this granule pair already been
-- flagged in another report for the same assignment?
CREATE INDEX IF NOT EXISTS idx_clone_matches_granule_pair
    ON clone_matches (granule_a_id, granule_b_id);
