package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/cipas-xai/internal/client"
	"github.com/gradeloop/cipas-xai/internal/config"
	"github.com/gradeloop/cipas-xai/internal/handler"
	"github.com/gradeloop/cipas-xai/internal/router"
	"github.com/gradeloop/cipas-xai/internal/service"
	"go.uber.org/zap"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting application: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// Initialize logger
	logger, err := initLogger(cfg.LogLevel)
	if err != nil {
		return fmt.Errorf("initializing logger: %w", err)
	}
	defer logger.Sync()

	logger.Info("starting cipas-xai",
		zap.String("provider", cfg.LLM.Provider),
		zap.String("model", cfg.LLM.Model),
		zap.String("port", cfg.Server.Port),
	)

	// Initialize LLM client
	llmClient := client.NewOpenAIClient(
		cfg.LLM.APIKey,
		cfg.LLM.BaseURL,
		cfg.LLM.Model,
		cfg.LLM.MaxTokens,
		cfg.LLM.Temperature,
		cfg.LLM.ExtraHeaders,
		time.Duration(cfg.LLM.Timeout)*time.Second,
		logger,
	)

	// Initialize services
	chatService := service.NewChatService(llmClient, logger)

	// Initialize handlers
	chatHandler := handler.NewChatHandler(chatService, logger)

	// Create Fiber app
	app := fiber.New(fiber.Config{
		AppName:      "cipas-xai",
		ErrorHandler: errorHandler,
	})

	// Setup routes
	router.SetupRoutes(app, router.Config{
		ChatHandler: chatHandler,
	})

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Server.Port)
		logger.Info("starting server", zap.String("address", addr))

		if err := app.Listen(addr); err != nil {
			logger.Error("failed to start server", zap.Error(err))
		}
	}()

	<-sigChan

	logger.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(ctx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
		return fmt.Errorf("shutting down server: %w", err)
	}

	logger.Info("server stopped gracefully")
	return nil
}

func initLogger(level string) (*zap.Logger, error) {
	var zapLevel zap.AtomicLevel
	switch level {
	case "debug":
		zapLevel = zap.NewAtomicLevelAt(zap.DebugLevel)
	case "info":
		zapLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	case "warn":
		zapLevel = zap.NewAtomicLevelAt(zap.WarnLevel)
	case "error":
		zapLevel = zap.NewAtomicLevelAt(zap.ErrorLevel)
	default:
		zapLevel = zap.NewAtomicLevelAt(zap.InfoLevel)
	}

	cfg := zap.NewProductionConfig()
	cfg.Level = zapLevel
	return cfg.Build()
}

func errorHandler(c fiber.Ctx, err error) error {
	// Log the error
	fmt.Printf("Error: %v\n", err)

	// Return JSON error response
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
		"error": "Internal server error",
	})
}
