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
	if err := s.seedSuperAdmin(); err != nil {
		return fmt.Errorf("seeding super_admin: %w", err)
	}

	s.logger.Info("database seeding completed successfully")
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

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hashing password: %w", err)
	}

	var existingUser domain.User
	if err := s.db.Where("email = ?", email).First(&existingUser).Error; err == nil {
		// User exists, update password and ensure it's active with super_admin user_type
		updates := map[string]interface{}{
			"password_hash":              string(hashedPassword),
			"is_active":                  true,
			"is_password_reset_required": false,
			"user_type":                  "super_admin",
			"email":                      email,
		}

		if err := s.db.Model(&existingUser).Updates(updates).Error; err != nil {
			return fmt.Errorf("updating super admin user: %w", err)
		}

		s.logger.Info("updated existing super admin user", zap.String("email", email))
		return nil
	} else if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("checking for existing user: %w", err)
	}

	// User doesn't exist, create new one
	user := domain.User{
		ID:                      uuid.New(),
		Email:                   email,
		FullName:                "Super Admin",
		PasswordHash:            string(hashedPassword),
		UserType:                "super_admin",
		IsActive:                true,
		IsPasswordResetRequired: false,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return fmt.Errorf("creating super admin user: %w", err)
	}

	s.logger.Info("created super admin user", zap.String("email", email))
	return nil
}
