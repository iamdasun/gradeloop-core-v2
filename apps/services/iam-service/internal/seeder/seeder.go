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

var permissions = []domain.Permission{
	{Name: "users:read", Description: "Read users"},
	{Name: "users:write", Description: "Create and update users"},
	{Name: "users:delete", Description: "Delete users"},
	{Name: "roles:read", Description: "Read roles"},
	{Name: "roles:write", Description: "Create and update roles"},
	{Name: "roles:delete", Description: "Delete roles"},
	{Name: "permissions:read", Description: "Read permissions"},
	{Name: "permissions:write", Description: "Create and update permissions"},
}

var roles = []struct {
	Name         string
	IsSystemRole bool
	Permissions  []string
}{
	{
		Name:         "Super Admin",
		IsSystemRole: true,
		Permissions:  []string{"users:read", "users:write", "users:delete", "roles:read", "roles:write", "roles:delete", "permissions:read", "permissions:write"},
	},
	{
		Name:         "Admin",
		IsSystemRole: true,
		Permissions:  []string{"users:read", "users:write", "roles:read", "roles:write", "permissions:read"},
	},
	{
		Name:         "Student",
		IsSystemRole: true,
		Permissions:  []string{},
	},
	{
		Name:         "Employee",
		IsSystemRole: true,
		Permissions:  []string{},
	},
}

func Seed(db *gorm.DB) error {
	log.Println("Seeding permissions...")
	for _, p := range permissions {
		var perm domain.Permission
		if err := db.Where("name = ?", p.Name).First(&perm).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				p.ID = uuid.New()
				if err := db.Create(&p).Error; err != nil {
					return fmt.Errorf("failed to create permission %s: %w", p.Name, err)
				}
				log.Printf("Created permission: %s", p.Name)
			} else {
				return fmt.Errorf("failed to check permission %s: %w", p.Name, err)
			}
		} else {
			// Update description if needed, or just skip
			log.Printf("Permission already exists: %s", p.Name)
		}
	}

	log.Println("Seeding roles...")
	for _, r := range roles {
		var role domain.Role
		if err := db.Where("name = ?", r.Name).First(&role).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				role = domain.Role{
					ID:           uuid.New(),
					Name:         r.Name,
					IsSystemRole: r.IsSystemRole,
				}
				if err := db.Create(&role).Error; err != nil {
					return fmt.Errorf("failed to create role %s: %w", r.Name, err)
				}
				log.Printf("Created role: %s", r.Name)
			} else {
				return fmt.Errorf("failed to check role %s: %w", r.Name, err)
			}
		}

		// Assign permissions
		var perms []domain.Permission
		if len(r.Permissions) > 0 {
			if err := db.Where("name IN ?", r.Permissions).Find(&perms).Error; err != nil {
				return fmt.Errorf("failed to find permissions for role %s: %w", r.Name, err)
			}

			if err := db.Model(&role).Association("Permissions").Replace(&perms); err != nil {
				return fmt.Errorf("failed to assign permissions to role %s: %w", r.Name, err)
			}
			log.Printf("Assigned permissions to role: %s", r.Name)
		}
	}

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

			// Find Super Admin role
			var superAdminRole domain.Role
			if err := db.Where("name = ?", "Super Admin").First(&superAdminRole).Error; err != nil {
				return fmt.Errorf("failed to find Super Admin role: %w", err)
			}

			user = domain.User{
				ID:           uuid.New(),
				Username:     "superadmin",
				Email:        superAdminEmail,
				PasswordHash: string(hashedPassword),
				RoleID:       &superAdminRole.ID,
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
