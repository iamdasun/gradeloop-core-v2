package migrations

import (
	"fmt"
	"os"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Seeder struct {
	db     *gorm.DB
	logger *zap.Logger
}

func NewSeeder(db *gorm.DB, logger *zap.Logger) *Seeder {
	return &Seeder{
		db:     db,
		logger: logger,
	}
}

func (s *Seeder) Seed() error {
	if err := s.seedRoles(); err != nil {
		return fmt.Errorf("seeding roles: %w", err)
	}

	if err := s.seedPermissions(); err != nil {
		return fmt.Errorf("seeding permissions: %w", err)
	}

	if err := s.seedRolePermissions(); err != nil {
		return fmt.Errorf("seeding role_permissions: %w", err)
	}

	if err := s.seedSuperAdmin(); err != nil {
		return fmt.Errorf("seeding super_admin: %w", err)
	}

	s.logger.Info("database seeding completed successfully")
	return nil
}

func (s *Seeder) seedRoles() error {
	roles := []struct {
		Name         string
		UserType     string
		IsSystemRole bool
	}{
		{Name: "super_admin", UserType: "all", IsSystemRole: true},
		{Name: "admin", UserType: "all", IsSystemRole: true},
		{Name: "employee", UserType: "employee", IsSystemRole: true},
		{Name: "student", UserType: "student", IsSystemRole: true},
	}

	for _, roleData := range roles {
		var role domain.Role
		result := s.db.Where(domain.Role{Name: roleData.Name}).
			Attrs(domain.Role{
				ID:           uuid.New(),
				UserType:     roleData.UserType,
				IsSystemRole: roleData.IsSystemRole,
			}).
			FirstOrCreate(&role)

		if result.Error != nil {
			return result.Error
		}

		// If role already exists but doesn't have user_type set, update it
		if result.RowsAffected == 0 && (role.UserType == "" || role.UserType != roleData.UserType) {
			if err := s.db.Model(&role).Update("user_type", roleData.UserType).Error; err != nil {
				s.logger.Error("failed to update role user_type",
					zap.String("role", roleData.Name),
					zap.Error(err))
				return err
			}
			s.logger.Info("updated existing role with user_type",
				zap.String("role", roleData.Name),
				zap.String("user_type", roleData.UserType))
		}
	}

	return nil
}

func (s *Seeder) seedPermissions() error {
	permissions := []domain.Permission{
		{Name: "users:read", Description: "View user information"},
		{Name: "users:write", Description: "Create and update users"},
		{Name: "users:delete", Description: "Delete users"},
		{Name: "roles:read", Description: "View roles"},
		{Name: "roles:write", Description: "Create and update roles"},
		{Name: "roles:delete", Description: "Delete roles"},
		{Name: "permissions:read", Description: "View permissions"},
		{Name: "permissions:write", Description: "Manage permissions"},
		{Name: "students:read", Description: "View student profiles"},
		{Name: "students:write", Description: "Manage student profiles"},
		{Name: "employees:read", Description: "View employee profiles"},
		{Name: "employees:write", Description: "Manage employee profiles"},
	}

	for _, permData := range permissions {
		var perm domain.Permission
		if err := s.db.Where(domain.Permission{Name: permData.Name}).
			Attrs(domain.Permission{ID: uuid.New(), Description: permData.Description}).
			FirstOrCreate(&perm).Error; err != nil {
			return err
		}
	}

	return nil
}

func (s *Seeder) seedRolePermissions() error {
	var superAdminRole domain.Role
	if err := s.db.Where("name = ?", "super_admin").First(&superAdminRole).Error; err != nil {
		return err
	}

	var permissions []domain.Permission
	if err := s.db.Find(&permissions).Error; err != nil {
		return err
	}

	type RolePermission struct {
		RoleID       uuid.UUID `gorm:"type:uuid;primaryKey"`
		PermissionID uuid.UUID `gorm:"type:uuid;primaryKey"`
	}

	for _, perm := range permissions {
		rp := RolePermission{
			RoleID:       superAdminRole.ID,
			PermissionID: perm.ID,
		}
		if err := s.db.FirstOrCreate(&rp).Error; err != nil {
			return err
		}
	}

	return nil
}

func (s *Seeder) seedSuperAdmin() error {
	email := os.Getenv("SUPER_ADMIN_USERNAME")
	password := os.Getenv("SUPER_ADMIN_PASSWORD")

	if email == "" || password == "" {
		s.logger.Info("skipping super admin seeding (SUPER_ADMIN_USERNAME or SUPER_ADMIN_PASSWORD not set)")
		return nil
	}

	if password == "Admin@1234" || password == "password" || password == "changeme" {
		s.logger.Warn("refusing to seed super admin with default/weak password")
		return fmt.Errorf("password cannot be a default value")
	}

	var superAdminRole domain.Role
	if err := s.db.Where("name = ?", "super_admin").First(&superAdminRole).Error; err != nil {
		return err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	var existingUser domain.User
	if err := s.db.Where("email = ?", email).First(&existingUser).Error; err == nil {
		// User exists, update password and ensure it's active
		updates := map[string]interface{}{
			"password_hash":              string(hashedPassword),
			"is_active":                  true,
			"is_password_reset_required": false,
			"role_id":                    superAdminRole.ID,
		}

		// Update username and email to match the email
		updates["username"] = email
		updates["email"] = email

		if err := s.db.Model(&existingUser).Updates(updates).Error; err != nil {
			return fmt.Errorf("updating super admin user: %w", err)
		}

		return nil
	} else if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("checking for existing user: %w", err)
	}

	// User doesn't exist, create new one
	user := domain.User{
		ID:                      uuid.New(),
		Username:                email,
		Email:                   email,
		PasswordHash:            string(hashedPassword),
		RoleID:                  &superAdminRole.ID,
		IsActive:                true,
		IsPasswordResetRequired: false,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return fmt.Errorf("creating super admin user: %w", err)
	}

	return nil
}
