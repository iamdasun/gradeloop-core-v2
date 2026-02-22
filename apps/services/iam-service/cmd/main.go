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
	"github.com/gradeloop/iam-service/internal/client"
	"github.com/gradeloop/iam-service/internal/config"
	"github.com/gradeloop/iam-service/internal/handler"
	"github.com/gradeloop/iam-service/internal/jwt"
	"github.com/gradeloop/iam-service/internal/middleware"
	"github.com/gradeloop/iam-service/internal/repository"
	"github.com/gradeloop/iam-service/internal/repository/migrations"
	"github.com/gradeloop/iam-service/internal/router"
	"github.com/gradeloop/iam-service/internal/service"
	"github.com/gradeloop/iam-service/internal/utils"
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

	// Run seeder to create initial data (roles, permissions, super admin)
	seeder := migrations.NewSeeder(db.DB, logger)
	if err := seeder.Seed(); err != nil {
		return fmt.Errorf("running seeder: %w", err)
	}

	baseRepo := repository.NewBaseRepository(db.DB)
	defer baseRepo.Close()

	authRepo := repository.NewAuthRepository(db.DB)
	userRepo := repository.NewUserRepository(db.DB)
	roleRepo := repository.NewRoleRepository(db.DB)
	permissionRepo := repository.NewPermissionRepository(db.DB)

	baseService := service.NewBaseService(db.DB)
	defer baseService.Close()

	// Initialize email client
	emailClient := client.NewEmailClient(cfg.EmailServiceURL)

	jwtInstance := jwt.NewJWT(
		cfg.JWT.SecretKey,
		cfg.JWT.AccessTokenExpiry,
		cfg.JWT.RefreshTokenExpiry,
	)

	authService := service.NewAuthService(
		db.DB,
		authRepo,
		jwtInstance,
		cfg.JWT.SecretKey,
		cfg.JWT.RefreshTokenExpiry,
	)

	userService := service.NewUserService(
		db.DB,
		userRepo,
		cfg.JWT.SecretKey,
		24, // Activation token expiry: 24 hours
		emailClient,
		cfg.FrontendURL,
	)

	passwordService := service.NewPasswordService(
		db.DB,
		authRepo,
		userRepo,
		cfg.JWT.SecretKey,
		1, // Password reset token expiry: 1 hour
		emailClient,
		cfg.FrontendURL,
	)

	roleService := service.NewRoleService(
		db.DB,
		roleRepo,
		permissionRepo,
	)

	permissionService := service.NewPermissionService(
		db.DB,
		permissionRepo,
	)

	healthHandler := handler.NewHealthHandler()
	authHandler := handler.NewAuthHandler(
		authService,
		userService,
		passwordService,
		cfg.JWT.CookieSecure,
		cfg.JWT.CookieSameSite,
	)
	userHandler := handler.NewUserHandler(userService)
	roleHandler := handler.NewRoleHandler(roleService)
	permissionHandler := handler.NewPermissionHandler(permissionService)

	app := fiber.New(fiber.Config{
		AppName:      "iam-service",
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
		HealthHandler:     healthHandler,
		AuthHandler:       authHandler,
		UserHandler:       userHandler,
		RoleHandler:       roleHandler,
		PermissionHandler: permissionHandler,
		JWTSecretKey:      []byte(cfg.JWT.SecretKey),
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
