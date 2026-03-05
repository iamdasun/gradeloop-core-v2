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

	// Run user_type migration BEFORE AutoMigrate to handle existing data
	if err := m.migrateUsersToUserType(); err != nil {
		return fmt.Errorf("user_type migration failed: %w", err)
	}

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

	m.logger.Info("database migrations completed successfully")
	return nil
}

func (m *Migrator) migrateUsersToUserType() error {
	m.logger.Info("migrating existing users to user_type system")

	// First check if user_type column exists, if not create it as nullable
	if !m.db.Migrator().HasColumn(&domain.User{}, "user_type") {
		m.logger.Info("creating user_type column as nullable for migration")
		if err := m.db.Exec("ALTER TABLE users ADD COLUMN user_type VARCHAR(20) DEFAULT NULL").Error; err != nil {
			return fmt.Errorf("failed to add user_type column: %w", err)
		}
	}

	// Check if we need to migrate from role_id system
	if !m.db.Migrator().HasColumn(&domain.User{}, "role_id") {
		m.logger.Info("role_id column does not exist, skipping role-based migration")

		// Just ensure all users have a default user_type
		result := m.db.Exec("UPDATE users SET user_type = 'student' WHERE user_type IS NULL OR user_type = ''")
		if result.Error != nil {
			return fmt.Errorf("failed to set default user_type: %w", result.Error)
		}
		m.logger.Info("set default user_type for existing users", zap.Int64("affected", result.RowsAffected))
		return nil
	}

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
			{"instructor", "instructor"},
			{"student", "student"},
		}

		for _, update := range updateQueries {
			result := m.db.Exec(`
				UPDATE users 
				SET user_type = ? 
				WHERE role_id IN (
					SELECT id FROM roles WHERE LOWER(name) = LOWER(?)
				) AND (user_type IS NULL OR user_type = '')
			`, update.UserType, update.RoleName)

			if result.Error != nil {
				return fmt.Errorf("failed to migrate users with role %s: %w", update.RoleName, result.Error)
			}
			m.logger.Info("migrated users from role to user_type",
				zap.String("role", update.RoleName),
				zap.String("user_type", update.UserType),
				zap.Int64("affected", result.RowsAffected))
		}
	}

	// Handle users without roles - set based on profile tables
	if m.db.Migrator().HasTable("user_profile_students") {
		result := m.db.Exec(`
			UPDATE users 
			SET user_type = 'student'
			WHERE (user_type IS NULL OR user_type = '')
			AND id IN (SELECT user_id FROM user_profile_students)
		`)
		if result.Error != nil {
			return fmt.Errorf("failed to set user_type for students: %w", result.Error)
		}
		m.logger.Info("set user_type for students based on profile", zap.Int64("affected", result.RowsAffected))
	}

	if m.db.Migrator().HasTable("user_profile_instructors") {
		result := m.db.Exec(`
			UPDATE users 
			SET user_type = 'instructor'
			WHERE (user_type IS NULL OR user_type = '')
			AND id IN (SELECT user_id FROM user_profile_instructors)
		`)
		if result.Error != nil {
			return fmt.Errorf("failed to set user_type for instructors: %w", result.Error)
		}
		m.logger.Info("set user_type for instructors based on profile", zap.Int64("affected", result.RowsAffected))
	}

	// Set default user_type for any remaining users
	result := m.db.Exec("UPDATE users SET user_type = 'student' WHERE user_type IS NULL OR user_type = ''")
	if result.Error != nil {
		return fmt.Errorf("failed to set default user_type: %w", result.Error)
	}
	m.logger.Info("set default user_type for remaining users", zap.Int64("affected", result.RowsAffected))

	m.logger.Info("user_type migration completed successfully")
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
