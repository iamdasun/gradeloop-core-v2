package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the assessment service.
type Config struct {
	Server         ServerConfig
	Database       DatabaseConfig
	JWT            JWTConfig
	MinIO          MinIOConfig
	RabbitMQ       RabbitMQConfig
	Judge0         Judge0Config
	FrontendURL    string
	IAMServiceURL  string
	AcademicSvcURL string
}

// ServerConfig holds HTTP server settings.
type ServerConfig struct {
	Port          string
	EnablePrefork bool
}

// DatabaseConfig holds PostgreSQL connection settings.
type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

// JWTConfig holds JWT signing settings.
type JWTConfig struct {
	SecretKey string
}

// MinIOConfig holds object-storage connection settings.
type MinIOConfig struct {
	Endpoint   string
	AccessKey  string
	SecretKey  string
	BucketName string
	UseSSL     bool
}

// RabbitMQConfig holds AMQP broker connection settings.
type RabbitMQConfig struct {
	// URL is the full AMQP connection string, e.g.
	// amqp://guest:guest@rabbitmq:5672/
	URL string

	// SubmissionWorkers is the number of concurrent goroutines that may
	// process submission jobs simultaneously.  Defaults to 8.
	SubmissionWorkers int
}

// Judge0Config holds Judge0 code execution service settings.
type Judge0Config struct {
	// URL is the base URL of the Judge0 instance, e.g.
	// http://judge0:2358 or http://localhost:2358
	URL string

	// APIKey is the optional authentication token for Judge0.
	APIKey string

	// Timeout is the maximum time to wait for code execution.
	// Defaults to 30 seconds.
	Timeout time.Duration

	// MaxPayloadSize is the maximum allowed source code size in bytes.
	// Defaults to 64KB (65536 bytes).
	MaxPayloadSize int64
}

// Load reads configuration from environment variables, falling back to
// sensible defaults. A missing .env file is silently ignored.
func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("loading .env file: %w", err)
		}
	}

	return &Config{
		Server: ServerConfig{
			Port:          getEnv("SERVER_PORT", "8084"),
			EnablePrefork: getEnvAsBool("ENABLE_PREFORK", false),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			Name:     getEnv("DB_NAME", "assessment_db"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		JWT: JWTConfig{
			SecretKey: getEnv("JWT_SECRET_KEY", ""),
		},
		MinIO: MinIOConfig{
			Endpoint:   getEnv("MINIO_ENDPOINT", "localhost:9000"),
			AccessKey:  getEnv("MINIO_ACCESS_KEY", "minio"),
			SecretKey:  getEnv("MINIO_SECRET_KEY", "minio123"),
			BucketName: getEnv("MINIO_BUCKET", "submissions"),
			UseSSL:     getEnvAsBool("MINIO_USE_SSL", false),
		},
		RabbitMQ: RabbitMQConfig{
			URL:               getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
			SubmissionWorkers: getEnvAsInt("RABBITMQ_SUBMISSION_WORKERS", 8),
		},
		Judge0: Judge0Config{
			URL:            getEnv("JUDGE0_URL", "http://localhost:2358"),
			APIKey:         getEnv("JUDGE0_API_KEY", ""),
			Timeout:        time.Duration(getEnvAsInt("JUDGE0_TIMEOUT_SECONDS", 30)) * time.Second,
			MaxPayloadSize: getEnvAsInt64("JUDGE0_MAX_PAYLOAD_SIZE", 65536),
		},
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:3000"),
		IAMServiceURL:  getEnv("IAM_SERVICE_URL", "http://localhost:8081"),
		AcademicSvcURL: getEnv("ACADEMIC_SERVICE_URL", "http://localhost:8083"),
	}, nil
}

// DSN returns a PostgreSQL connection string built from the database config.
func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.Name,
		c.Database.SSLMode,
	)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	result, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return result
}

func getEnvAsInt(key string, defaultValue int) int {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	result, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}
	return result
}

func getEnvAsInt64(key string, defaultValue int64) int64 {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	result, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return defaultValue
	}
	return result
}
