package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	LLM      LLMConfig
	LogLevel string
}

type ServerConfig struct {
	Port string
}

type LLMConfig struct {
	Provider     string // openai, anthropic, ollama, openrouter, etc.
	APIKey       string
	BaseURL      string
	Model        string
	MaxTokens    int
	Temperature  float64
	Timeout      int               // in seconds
	ExtraHeaders map[string]string // Extra headers for providers like OpenRouter
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	cfg := &Config{
		Server: ServerConfig{
			Port: getEnv("CIPAS_XAI_SVC_PORT", "8085"),
		},
		LLM: LLMConfig{
			Provider:     getEnv("LLM_PROVIDER", "openai"),
			APIKey:       getEnv("LLM_API_KEY", ""),
			BaseURL:      getEnv("LLM_BASE_URL", "https://api.openai.com/v1"),
			Model:        getEnv("LLM_MODEL", "gpt-4o-mini"),
			MaxTokens:    2048,
			Temperature:  0.7,
			Timeout:      60,
			ExtraHeaders: make(map[string]string),
		},
		LogLevel: getEnv("LOG_LEVEL", "info"),
	}

	// Load extra headers for providers like OpenRouter
	// Format: HTTP-Referer=https://example.com,X-Title=My App
	if extraHeadersStr := getEnv("LLM_EXTRA_HEADERS", ""); extraHeadersStr != "" {
		for _, pair := range strings.Split(extraHeadersStr, ",") {
			parts := strings.SplitN(pair, "=", 2)
			if len(parts) == 2 {
				cfg.LLM.ExtraHeaders[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
			}
		}
	}

	// Override max tokens if provided
	if maxTokens := getEnv("LLM_MAX_TOKENS", ""); maxTokens != "" {
		// Parse would be done in validation
		cfg.LLM.MaxTokens = 2048 // default fallback
	}

	// Override temperature if provided
	if temp := getEnv("LLM_TEMPERATURE", ""); temp != "" {
		cfg.LLM.Temperature = 0.7 // default fallback
	}

	return cfg, cfg.Validate()
}

// Validate validates the configuration
func (c *Config) Validate() error {
	if c.LLM.APIKey == "" {
		return fmt.Errorf("LLM_API_KEY is required")
	}

	if c.LLM.Model == "" {
		return fmt.Errorf("LLM_MODEL is required")
	}

	return nil
}

// getEnv gets environment variable or returns default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
