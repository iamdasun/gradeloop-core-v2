package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Server      ServerConfig
	Database    DatabaseConfig
	JWT         JWTConfig
	FrontendURL string
}

type ServerConfig struct {
	Port          string
	EnablePrefork bool
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

type JWTConfig struct {
	SecretKey          string
	AccessTokenExpiry  int64  // in minutes
	RefreshTokenExpiry int64  // in days
	CookieSecure       bool   // whether to set Secure flag on cookies
	CookieSameSite     string // SameSite setting for cookies
}

func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("loading .env file: %w", err)
		}
	}

	dbPort := getEnv("DB_PORT", "5432")
	dbSSLMode := getEnv("DB_SSLMODE", "disable")

	return &Config{
		Server: ServerConfig{
			Port:          getEnv("SERVER_PORT", "8081"),
			EnablePrefork: getEnvAsBool("ENABLE_PREFORK", false),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     dbPort,
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			Name:     getEnv("DB_NAME", "iam_db"),
			SSLMode:  dbSSLMode,
		},
		JWT: JWTConfig{
			SecretKey:          getEnv("JWT_SECRET_KEY", ""),
			AccessTokenExpiry:  getEnvAsInt64("JWT_ACCESS_TOKEN_EXPIRY", 15), // 15 minutes
			RefreshTokenExpiry: getEnvAsInt64("JWT_REFRESH_TOKEN_EXPIRY", 7), // 7 days
			CookieSecure:       getEnvAsBool("JWT_COOKIE_SECURE", false),
			CookieSameSite:     getEnv("JWT_COOKIE_SAMESITE", "Lax"),
		},
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
	}, nil
}

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
