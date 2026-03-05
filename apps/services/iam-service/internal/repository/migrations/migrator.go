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
		&domain.User{},
		&domain.UserProfileStudent{},
		&domain.UserProfileInstructor{},
		&domain.RefreshToken{},
		&domain.PasswordResetToken{},
	)
	if err != nil {
		return fmt.Errorf("auto migration failed: %w", err)
	}

	// Run custom migrations
	if err := m.migrateUsersToUserType(); err != nil {
		return fmt.Errorf("user_type migration failed: %w", err)
	}

	m.logger.Info("database migrations completed successfully")
	return nil
}

func (m *Migrator) migrateUsersToUserType() error {
	m.logger.Info("migrating existing users to user_type system")

	// Check if user_type column exists on users table
	if !m.db.Migrator().HasColumn(&domain.User{}, "user_type") {
		m.logger.Info("user_type column does not exist on users table, will be created by AutoMigrate")
		return nil
	}

	// Check if role_id column still exists (for migration from old system)
	if m.db.Migrator().HasColumn(&domain.User{}, "role_id") {
		m.logger.Info("migrating users from role_id to user_type")

		// Update users based on their role names if roles table still exists
		if m.db.Migrator().HasTable("roles") {
			// Map role names to user types
			updateQueries := []struct {
				RoleName string
				UserType string
			}{
				{"super_admin", "super_admin"},
				{"admin", "admin"},
				{"employee", "instructor"},
				{"student", "student"},
			}

			for _, update := range updateQueries {
				result := m.db.Exec(`
					UPDATE users 
					SET user_type = ? 
					WHERE role_id IN (
						SELECT id FROM roles WHERE name = ?
					) AND (user_type IS NULL OR user_type = '')
				`, update.UserType, update.RoleName)

				if result.Error != nil {
					m.logger.Error("failed to update user user_type",
						zap.String("role", update.RoleName),
						zap.String("user_type", update.UserType),
						zap.Error(result.Error))
					return result.Error
				}

				if result.RowsAffected > 0 {
					m.logger.Info("migrated users to user_type",
						zap.String("role", update.RoleName),
						zap.String("user_type", update.UserType),
						zap.Int64("users_updated", result.RowsAffected))
				}
			}
		}

		// Set any remaining users without user_type to 'student' as default
		result := m.db.Model(&domain.User{}).
			Where("user_type IS NULL OR user_type = ''").
			Update("user_type", "student")

		if result.Error != nil {
			return result.Error
		}

		if result.RowsAffected > 0 {
			m.logger.Info("set default user_type for remaining users",
				zap.Int64("users_updated", result.RowsAffected))
		}
	}

	m.logger.Info("user type migration completed")
	return nil
}

func (m *Migrator) Rollback() error {
	m.logger.Info("rolling back all migrations")

	err := m.db.Migrator().DropTable(
		&domain.RefreshToken{},
		&domain.PasswordResetToken{},
		"role_permissions", // legacy many2many table name
		&domain.UserProfileInstructor{},
		&domain.UserProfileStudent{},
		&domain.User{},
		"permissions", // legacy permissions table
		"roles",       // legacy roles table
	)
	if err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}

	m.logger.Info("rollback completed")
	return nil
}
