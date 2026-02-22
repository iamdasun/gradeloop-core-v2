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
	"github.com/gradeloop/assessment-service/internal/client"
	"github.com/gradeloop/assessment-service/internal/config"
	"github.com/gradeloop/assessment-service/internal/handler"
	"github.com/gradeloop/assessment-service/internal/middleware"
	"github.com/gradeloop/assessment-service/internal/repository"
	"github.com/gradeloop/assessment-service/internal/repository/migrations"
	"github.com/gradeloop/assessment-service/internal/router"
	"github.com/gradeloop/assessment-service/internal/service"
	"github.com/gradeloop/assessment-service/internal/utils"
	"go.uber.org/zap"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error starting assessment-service: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// ── Configuration ────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("loading config: %w", err)
	}

	// ── Logger ───────────────────────────────────────────────────────────────
	if err := utils.InitLogger(); err != nil {
		return fmt.Errorf("initialising logger: %w", err)
	}
	defer utils.Sync()

	logger := utils.GetLogger()

	// ── Database ─────────────────────────────────────────────────────────────
	db, err := repository.NewPostgresDatabase(cfg, logger)
	if err != nil {
		return fmt.Errorf("connecting to database: %w", err)
	}
	defer db.Close()

	// ── Migrations ───────────────────────────────────────────────────────────
	migrator := migrations.NewMigrator(db.DB, logger)
	if err := migrator.Run(); err != nil {
		return fmt.Errorf("running migrations: %w", err)
	}

	// ── Audit client ─────────────────────────────────────────────────────────
	auditClient := client.NewAuditClient(cfg.IAMServiceURL, logger)

	// ── Repositories ─────────────────────────────────────────────────────────
	assignmentRepo := repository.NewAssignmentRepository(db.DB)

	// ── Services ─────────────────────────────────────────────────────────────
	assignmentService := service.NewAssignmentService(assignmentRepo, auditClient, logger)

	// ── Handlers ─────────────────────────────────────────────────────────────
	healthHandler := handler.NewHealthHandler()
	assignmentHandler := handler.NewAssignmentHandler(assignmentService, logger)

	// ── Fiber app ────────────────────────────────────────────────────────────
	app := fiber.New(fiber.Config{
		AppName:      "assessment-service",
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

	// ── Routes ───────────────────────────────────────────────────────────────
	router.SetupRoutes(app, router.Config{
		HealthHandler:     healthHandler,
		AssignmentHandler: assignmentHandler,
		JWTSecretKey:      []byte(cfg.JWT.SecretKey),
	})

	// ── Graceful shutdown ────────────────────────────────────────────────────
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		addr := fmt.Sprintf(":%s", cfg.Server.Port)
		logger.Info("starting server", zap.String("address", addr))

		if err := app.Listen(addr); err != nil {
			logger.Error("server listen error", zap.Error(err))
		}
	}()

	<-sigChan
	logger.Info("shutdown signal received, stopping server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := app.ShutdownWithContext(ctx); err != nil {
		logger.Error("server shutdown error", zap.Error(err))
		return fmt.Errorf("shutting down server: %w", err)
	}

	logger.Info("server stopped gracefully")
	return nil
}
