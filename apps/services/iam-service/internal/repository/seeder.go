package repository

import (
	"log"
	"os"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/utils"
	"gorm.io/gorm"
)

func Seed(db *gorm.DB) error {
	log.Println("Seeding database...")

	// 1. Seed Permissions
	permissions := []string{
		domain.PermissionUserCreate,
		domain.PermissionUserRead,
		domain.PermissionUserUpdate,
		domain.PermissionUserDelete,
		domain.PermissionRoleCreate,
		domain.PermissionRoleRead,
		domain.PermissionRoleUpdate,
		domain.PermissionRoleDelete,
		domain.PermissionRoleAssign,
		domain.PermissionAuditRead,
	}

	permMap := make(map[string]domain.Permission)

	for _, permName := range permissions {
		var perm domain.Permission
		if err := db.Where("name = ?", permName).First(&perm).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				perm = domain.Permission{ID: utils.GenerateUUID(), Name: permName, Description: "System Permission"}
				if err := db.Create(&perm).Error; err != nil {
					return err
				}
				log.Printf("Created Permission: %s", permName)
			} else {
				return err
			}
		}
		permMap[permName] = perm
	}

	// 2. Seed Roles and Assign Permissions
	roles := map[string][]string{
		domain.RoleSuperAdmin: permissions, // Super Admin gets all permissions
		domain.RoleAdmin: {
			domain.PermissionUserCreate,
			domain.PermissionUserRead,
			domain.PermissionUserUpdate,
			domain.PermissionRoleRead,
			domain.PermissionRoleAssign,
			domain.PermissionAuditRead,
		},
		domain.RoleInstructor: {
			domain.PermissionUserRead,
		},
		domain.RoleStudent: {
			// Students might have limited read permissions or specific ones
		},
	}

	for roleName, rolePerms := range roles {
		var role domain.Role
		if err := db.Where("name = ?", roleName).First(&role).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				role = domain.Role{ID: utils.GenerateUUID(), Name: roleName, Description: "System Role"}
				if err := db.Create(&role).Error; err != nil {
					return err
				}
				log.Printf("Created Role: %s", roleName)
			} else {
				return err
			}
		}

		// Assign Permissions to Role
		var permsToAssign []domain.Permission
		for _, pName := range rolePerms {
			if p, ok := permMap[pName]; ok {
				permsToAssign = append(permsToAssign, p)
			}
		}

		if len(permsToAssign) > 0 {
			if err := db.Model(&role).Association("Permissions").Replace(permsToAssign); err != nil {
				return err
			}
		}
	}

	// 3. Seed Super Admin User
	superAdminEmail := os.Getenv("SUPER_ADMIN_EMAIL")
	if superAdminEmail == "" {
		superAdminEmail = "superadmin@gradeloop.com"
	}
	superAdminPass := os.Getenv("SUPER_ADMIN_PASSWORD")
	if superAdminPass == "" {
		superAdminPass = "superadmin"
	}

	var superAdmin domain.User
	if err := db.Where("email = ?", superAdminEmail).First(&superAdmin).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// Check if a user with the same EmployeeID already exists (to avoid duplicate key error)
			var existingUser domain.User
			if err := db.Where("employee_id = ?", "SYSADMIN").First(&existingUser).Error; err == nil {
				// User exists with SYSADMIN ID but different email. Update it.
				hashedPassword, _ := utils.HashPassword(superAdminPass)
				existingUser.Email = superAdminEmail
				existingUser.PasswordHash = hashedPassword
				existingUser.FullName = "Super Admin"
				existingUser.IsActive = true
				
				if err := db.Save(&existingUser).Error; err != nil {
					return err
				}
				log.Printf("Updated existing SYSADMIN user to: %s", superAdminEmail)
				superAdmin = existingUser
			} else {
				// Create Super Admin
				hashedPassword, _ := utils.HashPassword(superAdminPass)

				superAdmin = domain.User{
					ID:           utils.GenerateUUID(),
					Email:        superAdminEmail,
					FullName:     "Super Admin",
					PasswordHash: hashedPassword,
					UserType:     domain.UserTypeEmployee,
					IsActive:     true,
					// Create dummy employee details for validation if strict
					EmployeeID:   &[]string{"SYSADMIN"}[0],
					Designation:  &[]string{"System Administrator"}[0],
					EmployeeType: &[]string{"Permanent"}[0],
				}
				if err := db.Create(&superAdmin).Error; err != nil {
					return err
				}
				log.Printf("Created Super Admin: %s", superAdminEmail)
			}
		} else {
			return err
		}
	}

	// Always ensure Super Admin Role is assigned
	var saRole domain.Role
	if err := db.Where("name = ?", domain.RoleSuperAdmin).First(&saRole).Error; err == nil {
		// Check if user already has this role to avoid duplicates if specific DB constraints exist (though GORM handles association append well usually)
		// Better to just Append which GORM handles (if not exists) or Replace if we want to enforce ONLY this role?
		// For Super Admin, we probably just want to ensure they HAVE it.
		// Using Append with a check or just Append. GORM's Append shouldn't duplicate if set up correctly, but let's be safe.
		var existingRoles []domain.Role
		if err := db.Model(&superAdmin).Association("Roles").Find(&existingRoles, "id = ?", saRole.ID); err != nil {
			return err
		}

		if len(existingRoles) == 0 {
			if err := db.Model(&superAdmin).Association("Roles").Append(&saRole); err != nil {
				return err
			}
			log.Printf("Assigned Super Admin Role to: %s", superAdminEmail)
		}
	}

	log.Println("Seeding completed.")
	return nil
}
