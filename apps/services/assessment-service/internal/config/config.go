package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the assessment service.
type Config struct {
	Server        ServerConfig
	Database      DatabaseConfig
	JWT           JWTConfig
	FrontendURL   string
	IAMServiceURL string
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
		FrontendURL:   getEnv("FRONTEND_URL", "http://localhost:3000"),
		IAMServiceURL: getEnv("IAM_SERVICE_URL", "http://localhost:8081"),
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
