package main

import (
	"fmt"
	"log"

	"github.com/gradeloop/iam-service/internal/config"
	"github.com/gradeloop/iam-service/internal/repository"
	"github.com/gradeloop/iam-service/internal/repository/migrations"
	"github.com/gradeloop/iam-service/internal/seeder"
	"go.uber.org/zap"
)

func main() {
	fmt.Println("Seeder starting...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Error loading config: %v\n", err)
		log.Fatalf("Failed to load config: %v", err)
	}
	fmt.Println("Config loaded")

	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Connect to database
	fmt.Println("Connecting to database...")
	db, err := repository.NewPostgresDatabase(cfg, logger)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			logger.Error("Failed to close database connection", zap.Error(err))
		}
	}()
	fmt.Println("Database connected")

	// Pre-migration fix: Ensure username column exists and is populated
	fmt.Println("Running pre-migration fixes...")
	// 1. Add username column if not exists (nullable)
	if err := db.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100)`).Error; err != nil {
		fmt.Printf("Warning: Failed to add username column: %v\n", err)
	}
	// 2. Populate username with email for existing records where it's null
	if err := db.DB.Exec(`UPDATE users SET username = email WHERE username IS NULL OR username = ''`).Error; err != nil {
		fmt.Printf("Warning: Failed to update existing users with username: %v\n", err)
	}

	// 3. Cleanup orphaned refresh tokens before adding FK constraint
	if err := db.DB.Exec(`DELETE FROM refresh_tokens WHERE user_id NOT IN (SELECT id FROM users)`).Error; err != nil {
		fmt.Printf("Warning: Failed to cleanup orphaned refresh tokens: %v\n", err)
	}
	fmt.Println("Pre-migration fixes completed")

	// Run migrations
	fmt.Println("Running migrations...")
	migrator := migrations.NewMigrator(db.DB, logger)
	if err := migrator.Run(); err != nil {
		fmt.Printf("Migration failed: %v\n", err)
		log.Fatalf("Migration failed: %v", err)
	}
	fmt.Println("Migrations completed")

	// Run seeder
	fmt.Println("Running seeding logic...")
	if err := seeder.Seed(db.DB); err != nil {
		fmt.Printf("Seeding failed: %v\n", err)
		log.Fatalf("Seeding failed: %v", err)
	}

	fmt.Println("Seeding completed successfully")
}
