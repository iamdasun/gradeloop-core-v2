package migrations

import (
	"fmt"

	"github.com/gradeloop/iam-service/internal/domain"
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
	m.logger.Info("running database migrations")

	err := m.db.AutoMigrate(
		&domain.Role{},
		&domain.Permission{},
		&domain.User{},
		&domain.UserProfileStudent{},
		&domain.UserProfileEmployee{},
		&domain.RefreshToken{},
		&domain.PasswordResetToken{},
	)
	if err != nil {
		return fmt.Errorf("auto migration failed: %w", err)
	}

	m.logger.Info("database migrations completed successfully")
	return nil
}

func (m *Migrator) Rollback() error {
	m.logger.Info("rolling back all migrations")

	err := m.db.Migrator().DropTable(
		&domain.RefreshToken{},
		&domain.PasswordResetToken{},
		"role_permissions", // many2many table name
		&domain.UserProfileEmployee{},
		&domain.UserProfileStudent{},
		&domain.User{},
		&domain.Permission{},
		&domain.Role{},
	)
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}

	m.logger.Info("rollback completed")
	return nil
}
