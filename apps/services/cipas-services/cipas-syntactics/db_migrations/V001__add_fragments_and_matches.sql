-- ============================================================================
-- V001__add_fragments_and_matches.sql
-- Phase 5: Database schema additions for CIPAS Syntactic Cascade.
-- Compatible with PostgreSQL 14+.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Assignment Templates
--    Stores blacklisted token-set hashes for instructor skeleton code.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_templates (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     TEXT        NOT NULL,
    -- JSON array of abstract token sets (each represented as a sorted JSON array)
    -- e.g. [["FUNC_DEF","V","(","V","RETURN","V"], ...]
    template_fragment_hashes  JSONB       NOT NULL DEFAULT '[]',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_templates_assignment_id
    ON assignment_templates (assignment_id);

COMMENT ON TABLE assignment_templates IS
    'Instructor skeleton template fragments per assignment. '
    'Student fragments that match these are discarded (template filter).';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Fragments
--    One row per code fragment extracted from a student submission.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fragments (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     TEXT        NOT NULL,
    student_id        TEXT        NOT NULL,
    assignment_id     TEXT        NOT NULL,
    language          TEXT        NOT NULL CHECK (language IN ('java','python','c','csharp')),
    -- MinHash signature serialised by pickle (128 permutations, ~1.5 KB)
    lsh_signature     BYTEA,
    -- Abstract token stream as JSON array  e.g. ["FUNC_DEF","V","(","ITERATION",...]
    abstract_tokens   JSONB       NOT NULL DEFAULT '[]',
    -- Original source text
    raw_source        TEXT        NOT NULL,
    token_count       INT         NOT NULL DEFAULT 0,
    -- Byte offset of this fragment within the original submission file
    byte_offset       INT         NOT NULL DEFAULT 0,
    fragment_type     TEXT        NOT NULL DEFAULT 'structural'
                                  CHECK (fragment_type IN ('structural','window','whole_file','regex_block')),
    node_type         TEXT,           -- CST node type (e.g. 'function_definition')
    is_template       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fragments_submission_id
    ON fragments (submission_id);
CREATE INDEX IF NOT EXISTS idx_fragments_student_id
    ON fragments (student_id);
CREATE INDEX IF NOT EXISTS idx_fragments_assignment_id
    ON fragments (assignment_id);
CREATE INDEX IF NOT EXISTS idx_fragments_assignment_student
    ON fragments (assignment_id, student_id);

COMMENT ON TABLE fragments IS
    'Code fragments extracted from student submissions. '
    'lsh_signature enables O(1) candidate retrieval via MinHash LSH.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Clone Matches
--    One row per confirmed (or non-confirmed) cascade result for a
--    candidate fragment pair.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clone_matches (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    frag_a_id         UUID        NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
    frag_b_id         UUID        NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
    -- The owning students (denormalised for fast dashboard queries)
    student_a         TEXT        NOT NULL,
    student_b         TEXT        NOT NULL,
    assignment_id     TEXT        NOT NULL,
    clone_type        TEXT        NOT NULL DEFAULT 'Non-Syntactic'
                                  CHECK (clone_type IN ('Type-1','Type-2','Type-3','Non-Syntactic')),
    confidence        FLOAT       NOT NULL DEFAULT 0.0
                                  CHECK (confidence >= 0.0 AND confidence <= 1.0),
    is_clone          BOOLEAN     NOT NULL DEFAULT FALSE,
    -- Full feature vector for the evidence view (jaccard, dice, lev_ratio, …)
    features          JSONB,
    -- Pretty-printed / blinded normalised code for side-by-side diff
    normalized_code_a TEXT,
    normalized_code_b TEXT,
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ensure we store at most one result per ordered pair
    CONSTRAINT uq_clone_matches_pair UNIQUE (frag_a_id, frag_b_id)
);

CREATE INDEX IF NOT EXISTS idx_clone_matches_assignment
    ON clone_matches (assignment_id);
CREATE INDEX IF NOT EXISTS idx_clone_matches_students
    ON clone_matches (student_a, student_b, assignment_id);
CREATE INDEX IF NOT EXISTS idx_clone_matches_is_clone
    ON clone_matches (assignment_id, is_clone)
    WHERE is_clone = TRUE;
CREATE INDEX IF NOT EXISTS idx_clone_matches_confidence
    ON clone_matches (assignment_id, confidence DESC)
    WHERE is_clone = TRUE;

COMMENT ON TABLE clone_matches IS
    'Results of the CIPAS Syntactic Cascade for each candidate fragment pair. '
    'confidence is stored as the XGBoost edge weight between the two students.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Plagiarism Groups
--    Connected components of the student graph, refreshed periodically.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plagiarism_groups (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id     TEXT        NOT NULL,
    group_index       INT         NOT NULL,   -- rank within assignment (1 = largest)
    member_ids        JSONB       NOT NULL,   -- ["stu_1", "stu_2", ...]
    -- Serialised edge list for the instructor dashboard
    edge_summary      JSONB,
    member_count      INT         NOT NULL DEFAULT 0,
    max_confidence    FLOAT       NOT NULL DEFAULT 0.0,
    dominant_type     TEXT        NOT NULL DEFAULT 'Unknown',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plagiarism_groups_assignment
    ON plagiarism_groups (assignment_id, group_index);

COMMENT ON TABLE plagiarism_groups IS
    'Connected components of the student clone graph, computed on demand. '
    'member_ids is a JSON array of student IDs forming a potential collusion ring.';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Optional: LSH Bucket Metadata (for debugging / audit)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lsh_bucket_metadata (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fragment_id       UUID        NOT NULL REFERENCES fragments(id) ON DELETE CASCADE,
    -- List of bucket hash keys this fragment landed in
    bucket_keys       JSONB       NOT NULL DEFAULT '[]',
    num_perm          INT         NOT NULL DEFAULT 128,
    threshold         FLOAT       NOT NULL DEFAULT 0.3,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lsh_bucket_metadata_fragment
    ON lsh_bucket_metadata (fragment_id);

COMMENT ON TABLE lsh_bucket_metadata IS
    'Audit table: which LSH buckets each fragment was assigned to. '
    'Not required for core functionality; useful for debugging LSH behaviour.';

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Helper view: Confirmed clones per assignment
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW confirmed_clones_summary AS
SELECT
    cm.assignment_id,
    cm.student_a,
    cm.student_b,
    cm.clone_type,
    cm.confidence,
    cm.detected_at,
    f_a.submission_id  AS submission_a,
    f_b.submission_id  AS submission_b
FROM clone_matches cm
JOIN fragments f_a ON f_a.id = cm.frag_a_id
JOIN fragments f_b ON f_b.id = cm.frag_b_id
WHERE cm.is_clone = TRUE
ORDER BY cm.assignment_id, cm.confidence DESC;

COMMENT ON VIEW confirmed_clones_summary IS
    'Convenience view for the instructor dashboard: confirmed clone pairs per assignment.';
