package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/config"
	"github.com/gradeloop/academic-service/internal/handler"
	"github.com/gradeloop/academic-service/internal/middleware"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/repository/migrations"
	"github.com/gradeloop/academic-service/internal/router"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
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

	if err := utils.InitLogger(); err != nil {
		return fmt.Errorf("initializing logger: %w", err)
	}
	defer utils.Sync()

	logger := utils.GetLogger()

	db, err := repository.NewPostgresDatabase(cfg, logger)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer db.Close()

	migrator := migrations.NewMigrator(db.DB, logger)
	if err := migrator.Run(); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	// Run seeder to create initial data
	seeder := migrations.NewSeeder(db.DB, logger)
	if err := seeder.Seed(); err != nil {
		return fmt.Errorf("running seeder: %w", err)
	}

	baseRepo := repository.NewBaseRepository(db.DB)
	defer baseRepo.Close()

	baseService := service.NewBaseService(db.DB)
	defer baseService.Close()

	// Initialize audit client
	auditClient := client.NewAuditClient(cfg.IAMServiceURL, logger)

	// Initialize repositories
	facultyRepo := repository.NewFacultyRepository(db.DB)
	leadershipRepo := repository.NewFacultyLeadershipRepository(db.DB)

	// Initialize services
	facultyService := service.NewFacultyService(db.DB, facultyRepo, leadershipRepo, auditClient, logger)

	// Initialize handlers
	healthHandler := handler.NewHealthHandler()
	facultyHandler := handler.NewFacultyHandler(facultyService, logger)

	app := fiber.New(fiber.Config{
		AppName:      "academic-service",
		ErrorHandler: utils.ErrorHandler,
	})

	app.Use(middleware.Recovery())
	app.Use(middleware.Logger())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     []string{cfg.FrontendURL, "http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID"},
		AllowCredentials: true,
	}))

	router.SetupRoutes(app, router.Config{
		HealthHandler:  healthHandler,
		FacultyHandler: facultyHandler,
		JWTSecretKey:   []byte(cfg.JWT.SecretKey),
	})

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
