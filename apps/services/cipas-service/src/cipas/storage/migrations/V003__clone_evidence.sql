-- gradeloop-core-v2/apps/services/cipas-service/src/cipas/storage/migrations/V003__clone_evidence.sql
-- E15/US10: Clone Evidence Interpretation and Visualization
--
-- This migration adds tables for storing and querying clone evidence data:
--   1. clone_classes: Groups of submissions connected by clone relationships
--                     (Union-Find clustering results)
--   2. clone_evidence: Detailed evidence for each clone pair (code snippets,
--                      matching lines, granule references)
--
-- These tables support the instructor-facing visualization features:
--   - Interactive clone graph (Sigma.js/Cytoscape.js)
--   - Clone class summaries (collusion ring detection)
--   - Side-by-side code comparison evidence

-- ---------------------------------------------------------------------------
-- Table: clone_classes
-- ---------------------------------------------------------------------------
-- Stores the results of Union-Find clustering on clone pairs.
-- Each row represents a connected component (collusion ring).
--
-- Performance notes:
--   - submission_ids is an array for efficient containment queries
--   - Index on assignment_id for fast filtering by assignment
--   - Index on size for finding large collusion rings

CREATE TABLE IF NOT EXISTS clone_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,

    -- Cluster metadata
    submission_ids UUID[] NOT NULL,  -- Array of submission UUIDs in this class
    size INTEGER NOT NULL CHECK (size >= 2),  -- Number of submissions (≥2 for a class)
    avg_similarity DOUBLE PRECISION NOT NULL CHECK (avg_similarity >= 0.0 AND avg_similarity <= 1.0),
    pair_count INTEGER NOT NULL CHECK (pair_count >= 1),  -- Number of clone pairs in class

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure size matches array length
    CONSTRAINT chk_size_matches_array
        CHECK (size = array_length(submission_ids, 1))
);

-- Index for fast assignment filtering
CREATE INDEX IF NOT EXISTS idx_clone_classes_assignment
    ON clone_classes(assignment_id);

-- Index for finding large collusion rings
CREATE INDEX IF NOT EXISTS idx_clone_classes_size
    ON clone_classes(size DESC);

-- GIN index for containment queries (find classes containing a submission)
CREATE INDEX IF NOT EXISTS idx_clone_classes_submission_ids
    ON clone_classes USING GIN (submission_ids);

-- Index for finding recent classes
CREATE INDEX IF NOT EXISTS idx_clone_classes_created
    ON clone_classes(created_at DESC);

-- ---------------------------------------------------------------------------
-- Table: clone_evidence
-- ---------------------------------------------------------------------------
-- Stores detailed evidence for each clone pair, including code snippets
-- and matching line information for instructor review.
--
-- Performance notes:
--   - Composite index on (submission_id, matched_submission_id) for fast lookups
--   - Index on similarity_score for threshold-based queries
--   - Stores normalized code snippets for side-by-side comparison

CREATE TABLE IF NOT EXISTS clone_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,

    -- Clone pair references
    submission_id UUID NOT NULL,
    matched_submission_id UUID NOT NULL,

    -- Granule-level detail
    granule_a_id UUID NOT NULL REFERENCES granules(id) ON DELETE CASCADE,
    granule_b_id UUID NOT NULL REFERENCES granules(id) ON DELETE CASCADE,

    -- Similarity metrics
    similarity_score DOUBLE PRECISION NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
    clone_type VARCHAR(20) NOT NULL CHECK (clone_type IN ('type1', 'type2')),

    -- Code evidence
    submission_a_code TEXT NOT NULL,  -- Normalized code from submission A
    submission_b_code TEXT NOT NULL,  -- Normalized code from submission B
    matching_lines INTEGER[] NOT NULL DEFAULT '{}',  -- 0-based line indices that match
    snippet_match TEXT,  -- The actual matching code snippet (LCS result)

    -- Line number context
    snippet_start_line INTEGER NOT NULL DEFAULT 1,
    snippet_end_line INTEGER NOT NULL DEFAULT 1,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure submission IDs are different (no self-comparison)
    CONSTRAINT chk_different_submissions
        CHECK (submission_id != matched_submission_id),

    -- Ensure line numbers are valid
    CONSTRAINT chk_line_numbers
        CHECK (snippet_start_line >= 1 AND snippet_end_line >= snippet_start_line)
);

-- Composite index for fast pair lookups (bidirectional)
CREATE INDEX IF NOT EXISTS idx_clone_evidence_pair
    ON clone_evidence(submission_id, matched_submission_id);

-- Index for threshold-based queries
CREATE INDEX IF NOT EXISTS idx_clone_evidence_score
    ON clone_evidence(similarity_score DESC);

-- Index for assignment filtering
CREATE INDEX IF NOT EXISTS idx_clone_evidence_assignment
    ON clone_evidence(assignment_id);

-- Index for clone type filtering
CREATE INDEX IF NOT EXISTS idx_clone_evidence_type
    ON clone_evidence(clone_type);

-- Index for granule lookups
CREATE INDEX IF NOT EXISTS idx_clone_evidence_granules
    ON clone_evidence(granule_a_id, granule_b_id);

-- ---------------------------------------------------------------------------
-- Comments for documentation
-- ---------------------------------------------------------------------------

COMMENT ON TABLE clone_classes IS
    'Groups of submissions connected by clone relationships (Union-Find clustering results). '
    'Each row represents a potential collusion ring.';

COMMENT ON COLUMN clone_classes.submission_ids IS
    'Array of submission UUIDs in this clone class.';

COMMENT ON COLUMN clone_classes.size IS
    'Number of submissions in the class (≥2 for a valid class).';

COMMENT ON COLUMN clone_classes.avg_similarity IS
    'Average similarity score across all edges in the class.';

COMMENT ON COLUMN clone_classes.pair_count IS
    'Number of clone pairs that formed this class.';

COMMENT ON TABLE clone_evidence IS
    'Detailed evidence for each clone pair, including normalized code snippets '
    'and matching line numbers for instructor review.';

COMMENT ON COLUMN clone_evidence.submission_a_code IS
    'Normalized code from submission A (whitespace/comments removed).';

COMMENT ON COLUMN clone_evidence.submission_b_code IS
    'Normalized code from submission B (whitespace/comments removed).';

COMMENT ON COLUMN clone_evidence.matching_lines IS
    '0-based line indices that match between the two submissions.';

COMMENT ON COLUMN clone_evidence.snippet_match IS
    'The actual matching code snippet from LCS backtracking.';

-- ---------------------------------------------------------------------------
-- View: v_clone_class_summary
-- ---------------------------------------------------------------------------
-- Convenience view for querying clone class statistics.

CREATE OR REPLACE VIEW v_clone_class_summary AS
SELECT
    cc.id AS class_id,
    cc.assignment_id,
    cc.size AS submission_count,
    cc.avg_similarity,
    cc.pair_count,
    cc.created_at,
    -- Count total granules involved across all submissions
    COUNT(DISTINCT g.id) AS total_granules,
    -- Get the highest similarity pair in this class
    MAX(ce.similarity_score) AS max_pair_similarity
FROM clone_classes cc
LEFT JOIN granules g ON g.submission_id = ANY(cc.submission_ids)
LEFT JOIN clone_evidence ce ON ce.assignment_id = cc.assignment_id
    AND (ce.submission_id = ANY(cc.submission_ids)
         OR ce.matched_submission_id = ANY(cc.submission_ids))
GROUP BY cc.id, cc.assignment_id, cc.size, cc.avg_similarity, cc.pair_count, cc.created_at;

COMMENT ON VIEW v_clone_class_summary IS
    'Convenience view for clone class statistics including granule counts and max similarity.';

-- ---------------------------------------------------------------------------
-- Trigger: Update clone_classes.updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_clone_classes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clone_classes_updated_at
    BEFORE UPDATE ON clone_classes
    FOR EACH ROW
    EXECUTE FUNCTION update_clone_classes_updated_at();

-- ---------------------------------------------------------------------------
-- Migration version tracking
-- ---------------------------------------------------------------------------

-- This migration is version V003
-- Applied after V002__similarity_reports.sql
