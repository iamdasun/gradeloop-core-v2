package migrations

import (
	"fmt"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// Migrator runs all database migrations for the assessment service.
type Migrator struct {
	db     *gorm.DB
	logger *zap.Logger
}

// NewMigrator creates a new Migrator.
func NewMigrator(db *gorm.DB, logger *zap.Logger) *Migrator {
	return &Migrator{
		db:     db,
		logger: logger,
	}
}

// Run executes all registered migrations in order.
func (m *Migrator) Run() error {
	m.logger.Info("running database migrations...")

	// AutoMigrate creates/updates all tables to match the domain models.
	if err := m.db.AutoMigrate(
		&domain.Assignment{},
		&domain.Submission{},
		&domain.SubmissionGroup{},
		&domain.AssignmentRubricCriterion{},
		&domain.AssignmentTestCase{},
		&domain.AssignmentSampleAnswer{},
	); err != nil {
		return fmt.Errorf("auto migrate tables: %w", err)
	}

	// Index on course_instance_id for fast course-scoped lookups.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_assignments_course_instance_id
		ON assignments(course_instance_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on assignments(course_instance_id)", zap.Error(err))
	}

	// Partial index on is_active for fast active-assignment queries.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_assignments_is_active
		ON assignments(is_active)
		WHERE is_active = true
	`).Error; err != nil {
		m.logger.Warn("failed to create index on assignments(is_active)", zap.Error(err))
	}

	// Index on created_by for auditing / user-scoped queries.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_assignments_created_by
		ON assignments(created_by)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on assignments(created_by)", zap.Error(err))
	}

	// Composite index to speed up listing active assignments for a course instance.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_assignments_course_instance_active
		ON assignments(course_instance_id, is_active)
	`).Error; err != nil {
		m.logger.Warn("failed to create composite index on assignments(course_instance_id, is_active)", zap.Error(err))
	}

	// ── Submissions indexes ───────────────────────────────────────────────────

	// Composite index for fast per-user version history lookups.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS assignment_user_idx
		ON submissions(assignment_id, user_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index assignment_user_idx", zap.Error(err))
	}

	// Composite index for fast per-group version history lookups.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS assignment_group_idx
		ON submissions(assignment_id, group_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index assignment_group_idx", zap.Error(err))
	}

	// Partial index on is_latest for O(1) latest-submission lookups.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS latest_idx
		ON submissions(is_latest)
		WHERE is_latest = true
	`).Error; err != nil {
		m.logger.Warn("failed to create partial index latest_idx", zap.Error(err))
	}

	// GIN index on the members JSONB column for fast @> containment queries
	// used when checking group membership.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_groups_members_gin
		ON groups USING GIN (members)
	`).Error; err != nil {
		m.logger.Warn("failed to create GIN index on groups.members", zap.Error(err))
	}

	// Index on groups.assignment_id for fast assignment-scoped group lookups.
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_groups_assignment_id
		ON groups(assignment_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on groups(assignment_id)", zap.Error(err))
	}

	// ── Judge0 execution columns migration ────────────────────────────────────
	// These columns are added for Judge0 code execution integration

	// Add language_id column to submissions
	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS language_id INTEGER
	`).Error; err != nil {
		m.logger.Warn("failed to add language_id column to submissions", zap.Error(err))
	}

	// Add execution result columns to submissions
	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS execution_stdout TEXT
	`).Error; err != nil {
		m.logger.Warn("failed to add execution_stdout column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS execution_stderr TEXT
	`).Error; err != nil {
		m.logger.Warn("failed to add execution_stderr column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS compile_output TEXT
	`).Error; err != nil {
		m.logger.Warn("failed to add compile_output column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS execution_status VARCHAR(50)
	`).Error; err != nil {
		m.logger.Warn("failed to add execution_status column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS execution_status_id INTEGER
	`).Error; err != nil {
		m.logger.Warn("failed to add execution_status_id column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS execution_time VARCHAR(20)
	`).Error; err != nil {
		m.logger.Warn("failed to add execution_time column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS memory_used INTEGER
	`).Error; err != nil {
		m.logger.Warn("failed to add memory_used column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS test_cases_passed INTEGER DEFAULT 0
	`).Error; err != nil {
		m.logger.Warn("failed to add test_cases_passed column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS total_test_cases INTEGER DEFAULT 0
	`).Error; err != nil {
		m.logger.Warn("failed to add total_test_cases column", zap.Error(err))
	}

	if err := m.db.Exec(`
		ALTER TABLE submissions
		ADD COLUMN IF NOT EXISTS test_case_results JSONB
	`).Error; err != nil {
		m.logger.Warn("failed to add test_case_results column", zap.Error(err))
	}

	// Index on execution_status for filtering by execution result
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_submissions_execution_status
		ON submissions(execution_status)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on submissions(execution_status)", zap.Error(err))
	}

	// ── Schema cleanup migrations ─────────────────────────────────────────────
	// Drop legacy columns that were superseded by dedicated tables.
	// Each statement is idempotent (IF EXISTS) so replaying is safe.

	// assignments.sample_answer (jsonb) was an early design that stored the
	// sample answer inline on the assignment row.  It has been replaced by the
	// assignment_sample_answers table and must never be re-created.
	if err := m.db.Exec(`
		ALTER TABLE assignments DROP COLUMN IF EXISTS sample_answer
	`).Error; err != nil {
		m.logger.Warn("failed to drop legacy assignments.sample_answer column", zap.Error(err))
	}

	m.logger.Info("migrations completed successfully")
	return nil
}
