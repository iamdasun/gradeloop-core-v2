package seeder

import (
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func Seed(db *gorm.DB) error {
	log.Println("Seeding super admin...")
	superAdminEmail := os.Getenv("SUPER_ADMIN_EMAIL")
	if superAdminEmail == "" {
		superAdminEmail = "admin@gradeloop.com"
	}

	var user domain.User
	if err := db.Where("email = ?", superAdminEmail).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			superAdminPassword := os.Getenv("SUPER_ADMIN_PASSWORD")
			if superAdminPassword == "" {
				superAdminPassword = "AdminPassword123!"
				log.Printf("WARNING: Using default super admin password. Please change it immediately.")
			}

			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(superAdminPassword), bcrypt.DefaultCost)
			if err != nil {
				return fmt.Errorf("failed to hash password: %w", err)
			}

			user = domain.User{
				ID:           uuid.New(),
				Email:        superAdminEmail,
				PasswordHash: string(hashedPassword),
				UserType:     "super_admin",
				IsActive:     true,
			}

			if err := db.Create(&user).Error; err != nil {
				return fmt.Errorf("failed to create super admin: %w", err)
			}
			log.Printf("Created super admin user: %s", superAdminEmail)
		} else {
			return fmt.Errorf("failed to check super admin: %w", err)
		}
	} else {
		log.Printf("Super admin already exists: %s", superAdminEmail)
	}

	return nil
}
