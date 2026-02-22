package migrations

import (
	"fmt"

	"github.com/gradeloop/academic-service/internal/domain"
	// enrollment management models are in the same domain package
	"go.uber.org/zap"
	"gorm.io/gorm"
)

type Migrator struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewMigrator(db *gorm.DB, logger *zap.Logger) *Migrator {
	return &Migrator{
		db:     db,
		logger: logger,
	}
}

func (m *Migrator) Run() error {
	m.logger.Info("running database migrations...")

	if err := m.db.AutoMigrate(
		// Placeholder models (seeder / legacy)
		&domain.Program{},
		// Course catalog
		&domain.Course{},
		&domain.CoursePrerequisite{},
		// Academic calendar
		&domain.Semester{},
		// Core academic hierarchy
		&domain.Faculty{},
		&domain.FacultyLeadership{},
		&domain.Department{},
		&domain.Degree{},
		&domain.Specialization{},
		&domain.Batch{},
		// Enrollment management
		&domain.BatchMember{},
		&domain.CourseInstance{},
		&domain.CourseInstructor{},
		&domain.Enrollment{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}

	// Add unique constraint for (faculty_id, code)
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_faculty_code
		ON departments(faculty_id, code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on departments", zap.Error(err))
	}

	// Add unique constraint for (department_id, code) on degrees
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_degrees_department_code
		ON degrees(department_id, code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on degrees", zap.Error(err))
	}

	// Add unique constraint for (degree_id, code) on specializations
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_specializations_degree_code
		ON specializations(degree_id, code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on specializations", zap.Error(err))
	}

	// Add unique constraint for (degree_id, code) on batches (partial — exclude soft-deleted)
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_degree_code
		ON batches(degree_id, code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on batches", zap.Error(err))
	}

	// Add index on parent_id for fast hierarchy traversal
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_batches_parent_id
		ON batches(parent_id)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create index on batches(parent_id)", zap.Error(err))
	}

	// Add index on degree_id for fast degree-scoped lookups
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_batches_degree_id
		ON batches(degree_id)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create index on batches(degree_id)", zap.Error(err))
	}

	// Unique constraint: (course_id, semester_id, batch_id) on course_instances
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_course_instances_unique
		ON course_instances(course_id, semester_id, batch_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on course_instances", zap.Error(err))
	}

	// Index on batch_id for fast batch-scoped lookups of course instances
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_course_instances_batch_id
		ON course_instances(batch_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on course_instances(batch_id)", zap.Error(err))
	}

	// Index on course_instance_id for fast enrollment lookups
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_enrollments_course_instance_id
		ON enrollments(course_instance_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on enrollments(course_instance_id)", zap.Error(err))
	}

	// Index on course_instance_id for fast instructor lookups
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_course_instructors_instance_id
		ON course_instructors(course_instance_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on course_instructors(course_instance_id)", zap.Error(err))
	}

	// Unique index on course code (partial — exclude soft-deleted)
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_code
		ON courses(code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on courses(code)", zap.Error(err))
	}

	// Index on is_active for fast active-course lookups
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_courses_is_active
		ON courses(is_active)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create index on courses(is_active)", zap.Error(err))
	}

	// Index on prerequisite_course_id for reverse-lookup
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_course_prerequisites_prereq_id
		ON course_prerequisites(prerequisite_course_id)
	`).Error; err != nil {
		m.logger.Warn("failed to create index on course_prerequisites(prerequisite_course_id)", zap.Error(err))
	}

	// Unique index on semester code (partial — exclude soft-deleted)
	if err := m.db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_semesters_code
		ON semesters(code)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create unique index on semesters(code)", zap.Error(err))
	}

	// Index on term_type + is_active for filtered semester queries
	if err := m.db.Exec(`
		CREATE INDEX IF NOT EXISTS idx_semesters_term_type
		ON semesters(term_type)
		WHERE deleted_at IS NULL
	`).Error; err != nil {
		m.logger.Warn("failed to create index on semesters(term_type)", zap.Error(err))
	}

	m.logger.Info("migrations completed successfully")
	return nil
}
