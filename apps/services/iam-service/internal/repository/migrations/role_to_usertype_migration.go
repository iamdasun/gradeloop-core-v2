package migrations

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// MigrateRoleToUserType migrates existing users from role-based system to user_type system
func MigrateRoleToUserType(db *gorm.DB) error {
	log.Println("Starting migration from role-based system to user_type system...")

	// Check if user_type column exists
	if !db.Migrator().HasColumn("users", "user_type") {
		log.Println("Adding user_type column to users table...")
		if err := db.Exec("ALTER TABLE users ADD COLUMN user_type VARCHAR(50) DEFAULT ''").Error; err != nil {
			return fmt.Errorf("failed to add user_type column: %w", err)
		}
	}

	// Migration mapping from role names to user types
	// This should match your existing role names in the database
	roleMapping := map[string]string{
		"super_admin": "super_admin",
		"admin":       "admin",
		"student":     "student",
		"employee":    "instructor", // Map employee to instructor
		"instructor":  "instructor",
	}

	// Update users with user_type based on their role
	for roleName, userType := range roleMapping {
		log.Printf("Migrating users with role '%s' to user_type '%s'...", roleName, userType)

		result := db.Exec(`
			UPDATE users 
			SET user_type = ? 
			WHERE role_id IS NOT NULL 
			AND role_id IN (
				SELECT id FROM roles WHERE LOWER(name) = LOWER(?)
			)
			AND (user_type = '' OR user_type IS NULL)
		`, userType, roleName)

		if result.Error != nil {
			return fmt.Errorf("failed to migrate users with role %s: %w", roleName, result.Error)
		}

		log.Printf("Migrated %d users from role '%s' to user_type '%s'", result.RowsAffected, roleName, userType)
	}

	// Handle users without roles (set default based on profiles)
	log.Println("Setting user_type for users without roles based on profiles...")

	// Set students based on user_profile_students
	result := db.Exec(`
		UPDATE users 
		SET user_type = 'student'
		WHERE (user_type = '' OR user_type IS NULL)
		AND id IN (SELECT user_id FROM user_profile_students)
	`)
	if result.Error != nil {
		return fmt.Errorf("failed to set user_type for students: %w", result.Error)
	}
	log.Printf("Set user_type='student' for %d users based on student profiles", result.RowsAffected)

	// Set instructors based on user_profile_instructors (or legacy user_profile_employees)
	result = db.Exec(`
		UPDATE users 
		SET user_type = 'instructor'
		WHERE (user_type = '' OR user_type IS NULL)
		AND (
			id IN (SELECT user_id FROM user_profile_instructors)
			OR id IN (SELECT user_id FROM user_profile_employees)
		)
	`)
	if result.Error != nil {
		return fmt.Errorf("failed to set user_type for instructors: %w", result.Error)
	}
	log.Printf("Set user_type='instructor' for %d users based on instructor/employee profiles", result.RowsAffected)

	// Set default user_type for remaining users (fallback to 'student')
	result = db.Exec(`
		UPDATE users 
		SET user_type = 'student'
		WHERE user_type = '' OR user_type IS NULL
	`)
	if result.Error != nil {
		return fmt.Errorf("failed to set default user_type: %w", result.Error)
	}
	log.Printf("Set default user_type='student' for %d remaining users", result.RowsAffected)

	// Verify migration
	var totalUsers, migratedUsers int64
	if err := db.Model(&struct{ ID string }{}).Table("users").Count(&totalUsers).Error; err != nil {
		return fmt.Errorf("failed to count total users: %w", err)
	}

	if err := db.Model(&struct{ ID string }{}).Table("users").Where("user_type != '' AND user_type IS NOT NULL").Count(&migratedUsers).Error; err != nil {
		return fmt.Errorf("failed to count migrated users: %w", err)
	}

	log.Printf("Migration verification: %d/%d users have user_type set", migratedUsers, totalUsers)

	if migratedUsers != totalUsers {
		return fmt.Errorf("migration incomplete: %d users still missing user_type", totalUsers-migratedUsers)
	}

	log.Println("Migration from role-based system to user_type system completed successfully!")
	return nil
}

// CleanupLegacyTables removes old role and permission tables after successful migration
// WARNING: This is destructive and should only be run after confirming the migration worked correctly
func CleanupLegacyTables(db *gorm.DB) error {
	log.Println("WARNING: Starting cleanup of legacy role/permission tables...")
	log.Println("This operation is irreversible. Make sure you have a backup!")

	// Drop foreign key constraints first
	tables := []string{
		"role_permissions", // many-to-many table
		"permissions",      // permissions table
		"roles",            // roles table
	}

	// Remove role_id column from users table
	if db.Migrator().HasColumn("users", "role_id") {
		log.Println("Dropping role_id column from users table...")
		if err := db.Migrator().DropColumn("users", "role_id"); err != nil {
			return fmt.Errorf("failed to drop role_id column: %w", err)
		}
		log.Println("Dropped role_id column from users table")
	}

	// Drop legacy tables
	for _, table := range tables {
		if db.Migrator().HasTable(table) {
			log.Printf("Dropping table: %s", table)
			if err := db.Migrator().DropTable(table); err != nil {
				return fmt.Errorf("failed to drop table %s: %w", table, err)
			}
			log.Printf("Dropped table: %s", table)
		}
	}

	log.Println("Legacy table cleanup completed successfully!")
	return nil
}
