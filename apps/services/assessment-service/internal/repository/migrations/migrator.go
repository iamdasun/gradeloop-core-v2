package migrations

import (
	"fmt"

	"github.com/gradeloop/assessment-service/internal/domain"
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

	// AutoMigrate creates/updates the assignments table to match the domain model.
	if err := m.db.AutoMigrate(
		&domain.Assignment{},
	); err != nil {
		return fmt.Errorf("auto migrate assignments: %w", err)
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

	m.logger.Info("migrations completed successfully")
	return nil
}
