-- Keystroke Service Database Schema
-- PostgreSQL Schema for persistent biometric storage, auth events, and forensic archiving

-- Database: keystroke-db (create via .env configuration)

-- =============================================================================
-- Table: user_biometrics
-- Purpose: Store user biometric templates with multi-phase enrollment support
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_biometrics (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    enrollment_phase VARCHAR(50) NOT NULL, -- 'baseline', 'transcription', 'stress', 'cognitive', 'adaptive'
    template_data BYTEA NOT NULL,         -- Serialized numpy array (128-dim embedding)
    template_std BYTEA,                   -- Standard deviation vector (optional)
    sample_count INTEGER DEFAULT 1,       -- Number of sequences used for this template
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,       -- Allow soft deletion/deactivation
    metadata JSONB,                       -- Additional info (device, browser, etc.)
    
    CONSTRAINT unique_user_phase UNIQUE (user_id, enrollment_phase)
);

-- Index for fast user lookups
CREATE INDEX idx_user_biometrics_user_id ON user_biometrics(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_user_biometrics_phase ON user_biometrics(enrollment_phase);

-- =============================================================================
-- Table: auth_events
-- Purpose: Timeline storage for instructor monitoring and forensic review
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth_events (
    id SERIAL PRIMARY KEY,
    event_id UUID DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    assignment_id VARCHAR(255),           -- Link to assessment service
    course_id VARCHAR(255),
    
    -- Timestamp info
    event_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    offset_seconds INTEGER NOT NULL,      -- Time into session (for timeline rendering)
    
    -- Authentication results
    similarity_score FLOAT,               -- 0-1 cosine similarity
    risk_score FLOAT,                     -- 0-1 risk score
    authenticated BOOLEAN NOT NULL,
    confidence_level VARCHAR(20),         -- 'HIGH', 'MEDIUM', 'LOW'
    
    -- Anomaly classification
    is_anomaly BOOLEAN DEFAULT FALSE,
    anomaly_type VARCHAR(50),             -- 'velocity_fluctuation', 'rhythm_shift', 'error_pattern_change', 'impostor_detected'
    is_struggling BOOLEAN DEFAULT FALSE,  -- From behavioral analysis
    
    -- Event metadata
    keystroke_sample_size INTEGER,
    threshold_used FLOAT,
    matched_phase VARCHAR(50),            -- Which enrollment phase matched best
    metadata JSONB,
    
    CONSTRAINT fk_auth_user_id CHECK (user_id IS NOT NULL)
);

-- Indexes for timeline queries
CREATE INDEX idx_auth_events_session ON auth_events(session_id, offset_seconds);
CREATE INDEX idx_auth_events_user_timestamp ON auth_events(user_id, event_timestamp);
CREATE INDEX idx_auth_events_anomaly ON auth_events(is_anomaly) WHERE is_anomaly = TRUE;
CREATE INDEX idx_auth_events_assignment ON auth_events(assignment_id) WHERE assignment_id IS NOT NULL;

-- =============================================================================
-- Table: keystroke_archives
-- Purpose: Permanent storage of session data after submission (forensic review)
-- =============================================================================
CREATE TABLE IF NOT EXISTS keystroke_archives (
    id SERIAL PRIMARY KEY,
    archive_id UUID DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    assignment_id VARCHAR(255),
    course_id VARCHAR(255),
    
    -- Compressed keystroke data
    events_json JSONB NOT NULL,           -- Compressed/full keystroke event log
    event_count INTEGER NOT NULL,
    session_duration_seconds INTEGER,
    
    -- Summary statistics (for quick access)
    average_risk_score FLOAT,
    max_risk_score FLOAT,
    anomaly_count INTEGER DEFAULT 0,
    authentication_failures INTEGER DEFAULT 0,
    
    -- Final submission info
    final_code TEXT,                      -- Final submitted code
    behavioral_analysis JSONB,            -- Cached analysis result
    
    -- Archiving metadata
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by VARCHAR(255),             -- System or admin user
    retention_until DATE,                 -- For GDPR compliance
    
    CONSTRAINT unique_session_archive UNIQUE (session_id)
);

-- Indexes for forensic queries
CREATE INDEX idx_keystroke_archives_user ON keystroke_archives(user_id);
CREATE INDEX idx_keystroke_archives_assignment ON keystroke_archives(assignment_id);
CREATE INDEX idx_keystroke_archives_archived_at ON keystroke_archives(archived_at);
CREATE INDEX idx_keystroke_archives_retention ON keystroke_archives(retention_until) WHERE retention_until IS NOT NULL;

-- =============================================================================
-- Table: enrollment_progress
-- Purpose: Track multi-phase enrollment status
-- =============================================================================
CREATE TABLE IF NOT EXISTS enrollment_progress (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    
    -- Phase completion tracking
    baseline_complete BOOLEAN DEFAULT FALSE,
    baseline_completed_at TIMESTAMP,
    
    transcription_complete BOOLEAN DEFAULT FALSE,
    transcription_completed_at TIMESTAMP,
    
    stress_complete BOOLEAN DEFAULT FALSE,
    stress_completed_at TIMESTAMP,
    
    cognitive_complete BOOLEAN DEFAULT FALSE,
    cognitive_completed_at TIMESTAMP,
    
    -- Overall status
    total_sessions INTEGER DEFAULT 0,
    enrollment_complete BOOLEAN DEFAULT FALSE,
    enrollment_completed_at TIMESTAMP,
    
    -- Metadata
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    device_info JSONB,
    
    CONSTRAINT fk_enrollment_user_id CHECK (user_id IS NOT NULL)
);

CREATE INDEX idx_enrollment_progress_status ON enrollment_progress(enrollment_complete);

-- =============================================================================
-- Functions and Triggers
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_biometrics_updated_at 
    BEFORE UPDATE ON user_biometrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_enrollment_progress_updated_at 
    BEFORE UPDATE ON enrollment_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Views for Common Queries
-- =============================================================================

-- View: User enrollment summary
CREATE OR REPLACE VIEW v_user_enrollment_summary AS
SELECT 
    ub.user_id,
    COUNT(DISTINCT ub.enrollment_phase) as phases_enrolled,
    SUM(ub.sample_count) as total_samples,
    ep.enrollment_complete,
    ep.total_sessions,
    MAX(ub.updated_at) as last_updated
FROM user_biometrics ub
LEFT JOIN enrollment_progress ep ON ub.user_id = ep.user_id
WHERE ub.is_active = TRUE
GROUP BY ub.user_id, ep.enrollment_complete, ep.total_sessions;

-- View: Session risk summary
CREATE OR REPLACE VIEW v_session_risk_summary AS
SELECT 
    session_id,
    user_id,
    assignment_id,
    COUNT(*) as auth_check_count,
    AVG(similarity_score) as avg_similarity,
    AVG(risk_score) as avg_risk,
    MAX(risk_score) as max_risk,
    SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) as anomaly_count,
    SUM(CASE WHEN NOT authenticated THEN 1 ELSE 0 END) as failure_count,
    MIN(event_timestamp) as session_start,
    MAX(event_timestamp) as session_end
FROM auth_events
GROUP BY session_id, user_id, assignment_id;

-- =============================================================================
-- Sample Data Cleanup (for development)
-- =============================================================================

-- Function to archive old sessions
CREATE OR REPLACE FUNCTION cleanup_old_auth_events(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Move to archives if not already archived
    INSERT INTO keystroke_archives (
        user_id, session_id, assignment_id, course_id,
        events_json, event_count, average_risk_score, max_risk_score,
        anomaly_count, authentication_failures
    )
    SELECT 
        user_id, session_id, assignment_id, course_id,
        jsonb_agg(row_to_json(ae.*)) as events_json,
        COUNT(*) as event_count,
        AVG(risk_score) as average_risk_score,
        MAX(risk_score) as max_risk_score,
        SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) as anomaly_count,
        SUM(CASE WHEN NOT authenticated THEN 1 ELSE 0 END) as authentication_failures
    FROM auth_events ae
    WHERE event_timestamp < (CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL)
      AND NOT EXISTS (
          SELECT 1 FROM keystroke_archives ka 
          WHERE ka.session_id = ae.session_id
      )
    GROUP BY user_id, session_id, assignment_id, course_id
    ON CONFLICT (session_id) DO NOTHING;
    
    -- Delete old events
    DELETE FROM auth_events
    WHERE event_timestamp < (CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grants (adjust based on your user setup)
-- =============================================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keystroke_service_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO keystroke_service_user;

-- =============================================================================
-- Comments for Documentation
-- =============================================================================
COMMENT ON TABLE user_biometrics IS 'Stores biometric templates with multi-phase enrollment support for stress-robust authentication';
COMMENT ON TABLE auth_events IS 'Real-time authentication event log for instructor timeline and continuous monitoring';
COMMENT ON TABLE keystroke_archives IS 'Permanent forensic storage of completed sessions with compressed event data';
COMMENT ON TABLE enrollment_progress IS 'Tracks multi-condition enrollment workflow progress per user';
COMMENT ON COLUMN user_biometrics.template_data IS 'Pickled numpy array (128-dim) - consider encryption in production';
COMMENT ON COLUMN auth_events.offset_seconds IS 'Time into session (seconds) - used for timeline rendering in instructor UI';
COMMENT ON COLUMN keystroke_archives.retention_until IS 'GDPR compliance - automatic deletion date';
