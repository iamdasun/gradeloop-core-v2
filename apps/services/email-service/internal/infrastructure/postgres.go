package infrastructure

import (
	"fmt"
	"log"

	"github.com/gradeloop/email-service/internal/config"
	"github.com/gradeloop/email-service/internal/domain"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func NewPostgresDB(cfg *config.Config) *gorm.DB {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DB.Host, cfg.DB.Port, cfg.DB.User, cfg.DB.Password, cfg.DB.Name, cfg.DB.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	log.Println("Connected to database successfully")

	// Auto Migration
	err = db.AutoMigrate(
		&domain.EmailTemplate{},
		&domain.EmailMessage{},
		&domain.EmailRecipient{},
		&domain.EmailAttachment{},
		&domain.EmailLog{},
	)
	if err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	return db
}
