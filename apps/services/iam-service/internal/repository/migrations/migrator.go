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

	// Run custom migrations
	if err := m.migrateRoleUserType(); err != nil {
		return fmt.Errorf("user_type migration failed: %w", err)
	}

	m.logger.Info("database migrations completed successfully")
	return nil
}

func (m *Migrator) migrateRoleUserType() error {
	m.logger.Info("migrating existing roles to add user_type")

	// Check if user_type column exists
	if !m.db.Migrator().HasColumn(&domain.Role{}, "user_type") {
		m.logger.Info("user_type column does not exist, will be created by AutoMigrate")
		return nil
	}

	// Update existing roles with user_type based on their names
	type roleUpdate struct {
		Name     string
		UserType string
	}

	updates := []roleUpdate{
		{Name: "super_admin", UserType: "all"},
		{Name: "admin", UserType: "all"},
		{Name: "employee", UserType: "employee"},
		{Name: "student", UserType: "student"},
	}

	for _, update := range updates {
		result := m.db.Model(&domain.Role{}).
			Where("name = ? AND (user_type = '' OR user_type IS NULL)", update.Name).
			Update("user_type", update.UserType)

		if result.Error != nil {
			m.logger.Error("failed to update role user_type",
				zap.String("role", update.Name),
				zap.Error(result.Error))
			return result.Error
		}

		if result.RowsAffected > 0 {
			m.logger.Info("updated role user_type",
				zap.String("role", update.Name),
				zap.String("user_type", update.UserType),
				zap.Int64("rows_affected", result.RowsAffected))
		}
	}

	// Set any remaining roles without user_type to 'all'
	result := m.db.Model(&domain.Role{}).
		Where("user_type = '' OR user_type IS NULL").
		Update("user_type", "all")

	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected > 0 {
		m.logger.Info("set default user_type for remaining roles",
			zap.Int64("rows_affected", result.RowsAffected))
	}

	m.logger.Info("role user_type migration completed")
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
