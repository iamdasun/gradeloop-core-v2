package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/handler"
	"github.com/gradeloop/iam-service/internal/middleware"
)

type Config struct {
	HealthHandler     *handler.HealthHandler
	AuthHandler       *handler.AuthHandler
	UserHandler       *handler.UserHandler
	BulkImportHandler *handler.BulkImportHandler
	JWTSecretKey      []byte
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)

	// API v1 group
	api := app.Group("/api/v1")

	// Public auth routes
	auth := api.Group("/auth")
	auth.Post("/login", cfg.AuthHandler.Login)
	auth.Post("/refresh", cfg.AuthHandler.RefreshToken)
	auth.Post("/logout", cfg.AuthHandler.Logout)
	auth.Post("/forgot-password", cfg.AuthHandler.ForgotPassword)
	auth.Post("/reset-password", cfg.AuthHandler.ResetPassword)

	// Protected auth routes (require authentication)
	authProtected := api.Group("/auth", middleware.AuthMiddleware(cfg.JWTSecretKey))
	authProtected.Post("/change-password", cfg.AuthHandler.ChangePassword)
	authProtected.Get("/profile", cfg.UserHandler.GetProfile)
	authProtected.Patch("/profile/avatar", cfg.UserHandler.UpdateAvatar)

	// User routes with authentication middleware (admin-only operations)
	users := api.Group("/users", middleware.AuthMiddleware(cfg.JWTSecretKey))
	users.Get("/", middleware.RequireAdmin(), cfg.UserHandler.GetUsers)
	users.Post("/bulk", cfg.UserHandler.GetUsersByIDs)
	users.Get("/:id", cfg.UserHandler.GetUserByID)
	users.Post("/", middleware.RequireAdmin(), cfg.UserHandler.CreateUser)
	users.Put("/:id", middleware.RequireAdmin(), cfg.UserHandler.UpdateUser)
	users.Delete("/:id", middleware.RequireSuperAdmin(), cfg.UserHandler.DeleteUser)
	users.Post("/:id/restore", middleware.RequireAdmin(), cfg.UserHandler.RestoreUser)

	// Bulk import routes
	users.Get("/import/template", middleware.RequireAdmin(), cfg.BulkImportHandler.DownloadTemplate)
	users.Post("/import/preview", middleware.RequireAdmin(), cfg.BulkImportHandler.PreviewImport)
	users.Post("/import/execute", middleware.RequireAdmin(), cfg.BulkImportHandler.ExecuteImport)



	// Admin routes with authentication middleware
	adminProtected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))
	cfg.AuthHandler.RegisterAdminRoutes(adminProtected)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "iam-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})
}
