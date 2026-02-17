package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	App      AppConfig
	DB       DBConfig
	RabbitMQ RabbitMQConfig
	SMTP     SMTPConfig
}

type AppConfig struct {
	Port string
	Env  string
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

type RabbitMQConfig struct {
	URL string
}

type SMTPConfig struct {
	Host      string
	Port      int
	Username  string
	Password  string
	EmailFrom string
}

func LoadConfig() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	return &Config{
		App: AppConfig{
			Port: getEnv("APP_PORT", "8082"),
			Env:  getEnv("APP_ENV", "development"),
		},
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			Name:     getEnv("DB_NAME", "email-db"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		RabbitMQ: RabbitMQConfig{
			URL: getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		},
		SMTP: SMTPConfig{
			Host:      getEnv("SMTP_HOST", "localhost"),
			Port:      getEnvAsInt("SMTP_PORT", 1025),
			Username:  getEnv("SMTP_USER", getEnv("SMTP_USERNAME", "")),
			Password:  getEnv("SMTP_PASS", getEnv("SMTP_PASSWORD", "")),
			EmailFrom: getEnv("EMAIL_FROM", "noreply@gradeloop.com"),
		},
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return fallback
}
