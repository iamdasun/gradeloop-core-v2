-- ============================================================================
-- V002__add_similarity_reports_and_annotations.sql
-- Instructor Dashboard: Cached similarity reports and annotations
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Similarity Reports
--    Caches the complete AssignmentClusterResponse for quick retrieval
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS similarity_reports (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     TEXT        NOT NULL,
    language          TEXT        NOT NULL CHECK (language IN ('java','python','c','csharp')),
    submission_count  INT         NOT NULL DEFAULT 0,
    processed_count   INT         NOT NULL DEFAULT 0,
    failed_count      INT         NOT NULL DEFAULT 0,
    total_clone_pairs INT         NOT NULL DEFAULT 0,
    -- Full JSON response data (collusion_groups, per_submission stats)
    report_data       JSONB       NOT NULL,
    -- Processing metadata
    lsh_threshold     FLOAT       NOT NULL DEFAULT 0.3,
    min_confidence    FLOAT       NOT NULL DEFAULT 0.0,
    processing_time_seconds FLOAT,
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active report per assignment (replace on re-run)
CREATE UNIQUE INDEX IF NOT EXISTS idx_similarity_reports_assignment
    ON similarity_reports (assignment_id);

CREATE INDEX IF NOT EXISTS idx_similarity_reports_created
    ON similarity_reports (created_at DESC);

COMMENT ON TABLE similarity_reports IS
    'Cached assignment cluster reports for instructor dashboard. '
    'Contains collusion groups and per-submission stats as JSON.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Instructor Annotations
--    Instructor feedback on detected clone matches
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_annotations (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Link to the clone match (can be NULL for group-level annotations)
    match_id          UUID        REFERENCES clone_matches(id) ON DELETE CASCADE,
    -- Link to the plagiarism group (optional)
    group_id          UUID        REFERENCES plagiarism_groups(id) ON DELETE CASCADE,
    -- Assignment and instructor identifiers
    assignment_id     TEXT        NOT NULL,
    instructor_id     TEXT        NOT NULL,
    -- Annotation status
    status            TEXT        NOT NULL DEFAULT 'pending_review'
                                  CHECK (status IN (
                                      'pending_review',
                                      'confirmed_plagiarism',
                                      'false_positive',
                                      'acceptable_collaboration',
                                      'requires_investigation'
                                  )),
    -- Instructor comments
    comments          TEXT,
    -- Action taken
    action_taken      TEXT,       -- e.g., 'flagged_for_academic_board', 'dismissed'
    -- Timestamps
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ensure either match_id or group_id is set
    CONSTRAINT chk_annotation_target CHECK (
        match_id IS NOT NULL OR group_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_instructor_annotations_match
    ON instructor_annotations (match_id);
CREATE INDEX IF NOT EXISTS idx_instructor_annotations_group
    ON instructor_annotations (group_id);
CREATE INDEX IF NOT EXISTS idx_instructor_annotations_assignment
    ON instructor_annotations (assignment_id);
CREATE INDEX IF NOT EXISTS idx_instructor_annotations_status
    ON instructor_annotations (assignment_id, status);

COMMENT ON TABLE instructor_annotations IS
    'Instructor feedback on clone matches and plagiarism groups. '
    'Supports workflow states: pending, confirmed, false positive, etc.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Report Export History
--    Track exported reports for audit trail
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_exports (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id         UUID        NOT NULL REFERENCES similarity_reports(id) ON DELETE CASCADE,
    assignment_id     TEXT        NOT NULL,
    instructor_id     TEXT        NOT NULL,
    export_format     TEXT        NOT NULL CHECK (export_format IN ('pdf', 'csv', 'json')),
    -- Export metadata
    include_annotations BOOLEAN   NOT NULL DEFAULT TRUE,
    include_code      BOOLEAN     NOT NULL DEFAULT FALSE,
    export_filters    JSONB,      -- e.g., {"min_confidence": 0.8, "clone_types": ["Type-1"]}
    -- Timestamps
    exported_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_exports_report
    ON report_exports (report_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_assignment
    ON report_exports (assignment_id);

COMMENT ON TABLE report_exports IS
    'Audit trail for exported similarity reports. '
    'Tracks who exported what, when, and with which filters.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Helper view: Annotated clones summary
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW annotated_clones_summary AS
SELECT
    cm.id AS match_id,
    cm.assignment_id,
    cm.student_a,
    cm.student_b,
    cm.clone_type,
    cm.confidence,
    ia.status AS annotation_status,
    ia.comments AS annotation_comments,
    ia.instructor_id,
    ia.updated_at AS annotated_at,
    cm.detected_at
FROM clone_matches cm
LEFT JOIN instructor_annotations ia ON ia.match_id = cm.id
WHERE cm.is_clone = TRUE
ORDER BY cm.assignment_id, cm.confidence DESC;

COMMENT ON VIEW annotated_clones_summary IS
    'Instructor dashboard view: confirmed clones with annotation status.';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Helper functions for report generation
-- ──────────────────────────────────────────────────────────────────────────

-- Function: Get cluster statistics for an assignment
CREATE OR REPLACE FUNCTION get_cluster_stats(p_assignment_id TEXT)
RETURNS TABLE (
    total_submissions BIGINT,
    total_clones BIGINT,
    high_risk_count BIGINT,
    medium_risk_count BIGINT,
    low_risk_count BIGINT,
    flagged_students BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT f.submission_id) AS total_submissions,
        COUNT(DISTINCT cm.id) FILTER (WHERE cm.is_clone = TRUE) AS total_clones,
        COUNT(DISTINCT cm.id) FILTER (WHERE cm.is_clone = TRUE AND cm.confidence >= 0.85) AS high_risk_count,
        COUNT(DISTINCT cm.id) FILTER (WHERE cm.is_clone = TRUE AND cm.confidence >= 0.75 AND cm.confidence < 0.85) AS medium_risk_count,
        COUNT(DISTINCT cm.id) FILTER (WHERE cm.is_clone = TRUE AND cm.confidence < 0.75) AS low_risk_count,
        COUNT(DISTINCT CASE WHEN cm.is_clone = TRUE THEN cm.student_a END) +
        COUNT(DISTINCT CASE WHEN cm.is_clone = TRUE THEN cm.student_b END) AS flagged_students
    FROM fragments f
    LEFT JOIN clone_matches cm ON (cm.frag_a_id = f.id OR cm.frag_b_id = f.id)
        AND cm.assignment_id = p_assignment_id
    WHERE f.assignment_id = p_assignment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_cluster_stats IS
    'Calculate summary statistics for an assignment''s similarity report.';
