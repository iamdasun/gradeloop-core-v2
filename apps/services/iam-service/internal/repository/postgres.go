package repository

import (
	"fmt"
	"log"
	"os"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type PostgresRepository struct {
	DB *gorm.DB
}

func NewPostgresRepository() (*PostgresRepository, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"),
		os.Getenv("POSTGRES_SSLMODE"),
	)

	// Config for Aiven or other providers if needed, simplified for now based on envs
	if os.Getenv("POSTGRES_URL_BASE") != "" {
		log.Println("Using POSTGRES_URL_BASE is not fully implemented in this refactor yet, relying on DB_* vars")
	}

	config := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	db, err := gorm.Open(postgres.Open(dsn), config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return &PostgresRepository{DB: db}, nil
}

func (r *PostgresRepository) AutoMigrate() error {
	log.Println("Starting AutoMigrate...")
	err := r.DB.AutoMigrate(
		&domain.User{},
		&domain.Role{},
		&domain.Permission{},
		&domain.AuditLog{},
		&domain.PasswordResetToken{},
		&domain.RefreshToken{},
	)
	if err != nil {
		return fmt.Errorf("auto migration failed: %w", err)
	}

	// Cleanup legacy columns from previous schema versions
	if err := r.DB.Exec("ALTER TABLE roles DROP COLUMN IF EXISTS role_name").Error; err != nil {
		log.Printf("Warning: failed to drop legacy column role_name: %v", err)
	}

	log.Println("AutoMigrate completed.")
	return nil
}

// Seed is now handled in seeder.go and called from main.go
