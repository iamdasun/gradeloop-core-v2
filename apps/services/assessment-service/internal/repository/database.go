package repository

import (
	"fmt"
	"time"

	"github.com/gradeloop/assessment-service/internal/config"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Database wraps a GORM DB instance and manages its lifecycle.
type Database struct {
	DB *gorm.DB
}

// NewPostgresDatabase opens a PostgreSQL connection using the provided config.
func NewPostgresDatabase(cfg *config.Config, log *zap.Logger) (*Database, error) {
	dsn := cfg.DSN()

	gormLogger := logger.New(
		&gormLoggerWrapper{log: log},
		logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:                 gormLogger,
		SkipDefaultTransaction: true,
		PrepareStmt:            true,
	})
	if err != nil {
		return nil, fmt.Errorf("connecting to postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("getting underlying sql.DB: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	return &Database{DB: db}, nil
}

// Close releases the underlying database connection pool.
func (d *Database) Close() error {
	sqlDB, err := d.DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// gormLoggerWrapper adapts a zap.Logger to the interface expected by GORM's
// logger.Writer.
type gormLoggerWrapper struct {
	log *zap.Logger
}

func (g *gormLoggerWrapper) Printf(message string, args ...interface{}) {
	g.log.Sugar().Infof(message, args...)
}
