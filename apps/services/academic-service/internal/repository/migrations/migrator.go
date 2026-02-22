package migrations

import (
	"fmt"

	"github.com/gradeloop/academic-service/internal/domain"
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
		&domain.Course{},
		&domain.Program{},
		&domain.Semester{},
		&domain.Enrollment{},
		&domain.Faculty{},
		&domain.FacultyLeadership{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}

	m.logger.Info("migrations completed successfully")
	return nil
}
