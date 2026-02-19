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
	s.logger.Info("seeding database")

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
	roles := []domain.Role{
		{Name: "super_admin", IsSystemRole: true},
		{Name: "admin", IsSystemRole: true},
		{Name: "employee", IsSystemRole: true},
		{Name: "student", IsSystemRole: true},
	}

	for _, role := range roles {
		role.ID = uuid.New()
		if err := s.db.Where(domain.Role{Name: role.Name}).FirstOrCreate(&role).Error; err != nil {
			return err
		}
		s.logger.Info("seeded role", zap.String("name", role.Name))
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

	for _, perm := range permissions {
		perm.ID = uuid.New()
		if err := s.db.Where(domain.Permission{Name: perm.Name}).FirstOrCreate(&perm).Error; err != nil {
			return err
		}
		s.logger.Info("seeded permission", zap.String("name", perm.Name))
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

	s.logger.Info("seeded role_permissions for super_admin")
	return nil
}

func (s *Seeder) seedSuperAdmin() error {
	email := os.Getenv("SUPER_ADMIN_EMAIL")
	password := os.Getenv("SUPER_ADMIN_PASSWORD")

	if email == "" || password == "" {
		s.logger.Info("skipping super admin seeding (SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD not set)")
		return nil
	}

	var superAdminRole domain.Role
	if err := s.db.Where("name = ?", "super_admin").First(&superAdminRole).Error; err != nil {
		return err
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	user := domain.User{
		ID:           uuid.New(),
		Username:     "superadmin",
		Email:        email,
		PasswordHash: string(hashedPassword),
		RoleID:       &superAdminRole.ID,
		IsActive:     true,
	}

	if err := s.db.Where(domain.User{Email: email}).FirstOrCreate(&user).Error; err != nil {
		return err
	}

	s.logger.Info("seeded super admin user", zap.String("email", email))
	return nil
}
