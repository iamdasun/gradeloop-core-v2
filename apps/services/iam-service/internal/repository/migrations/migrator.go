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

	models := []interface{}{
		&domain.Role{},
		&domain.Permission{},
		&domain.User{},
		&domain.UserProfileStudent{},
		&domain.UserProfileEmployee{},
		&domain.RefreshToken{},
	}

	for _, model := range models {
		if err := m.db.AutoMigrate(model); err != nil {
			return fmt.Errorf("migrating %T: %w", model, err)
		}
		m.logger.Info("migrated", zap.String("model", fmt.Sprintf("%T", model)))
	}

	if err := m.createIndexes(); err != nil {
		return fmt.Errorf("creating indexes: %w", err)
	}

	if err := m.createJunctionTable(); err != nil {
		return fmt.Errorf("creating junction table: %w", err)
	}

	m.logger.Info("database migrations completed successfully")
	return nil
}

func (m *Migrator) createIndexes() error {
	indexes := []struct {
		table  string
		name   string
		column string
		where  string
	}{
		{"users", "idx_users_username", "username", "WHERE deleted_at IS NULL"},
		{"users", "idx_users_email", "email", "WHERE deleted_at IS NULL"},
		{"users", "idx_users_role_id", "role_id", ""},
		{"users", "idx_users_deleted_at", "deleted_at", ""},
		{"user_profiles_students", "idx_user_profiles_students_student_id", "student_id", ""},
		{"refresh_tokens", "idx_refresh_tokens_user_id", "user_id", ""},
		{"refresh_tokens", "idx_refresh_tokens_token_hash", "token_hash", ""},
		{"refresh_tokens", "idx_refresh_tokens_expires_at", "expires_at", ""},
		{"refresh_tokens", "idx_refresh_tokens_revoked_at", "revoked_at", ""},
	}

	for _, idx := range indexes {
		var err error
		if idx.where != "" {
			err = m.db.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s(%s) %s", idx.name, idx.table, idx.column, idx.where)).Error
		} else {
			err = m.db.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS %s ON %s(%s)", idx.name, idx.table, idx.column)).Error
		}
		if err != nil {
			return fmt.Errorf("creating index %s: %w", idx.name, err)
		}
	}

	return nil
}

func (m *Migrator) createJunctionTable() error {
	return m.db.Exec(`
		CREATE TABLE IF NOT EXISTS role_permissions (
			role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
			permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (role_id, permission_id)
		)
	`).Error
}

func (m *Migrator) Rollback() error {
	m.logger.Info("rolling back all migrations")

	tables := []string{
		"refresh_tokens",
		"role_permissions",
		"user_profiles_employees",
		"user_profiles_students",
		"users",
		"permissions",
		"roles",
	}

	for _, table := range tables {
		if err := m.db.Migrator().DropTable(table); err != nil {
			return fmt.Errorf("dropping table %s: %w", table, err)
		}
		m.logger.Info("dropped table", zap.String("table", table))
	}

	m.logger.Info("rollback completed")
	return nil
}
