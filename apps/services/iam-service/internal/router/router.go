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
	RoleHandler       *handler.RoleHandler
	PermissionHandler *handler.PermissionHandler
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
	auth.Post("/activate", cfg.AuthHandler.Activate)
	auth.Post("/forgot-password", cfg.AuthHandler.ForgotPassword)
	auth.Post("/reset-password", cfg.AuthHandler.ResetPassword)

	// Protected auth routes (require authentication)
	authProtected := api.Group("/auth", middleware.AuthMiddleware(cfg.JWTSecretKey))
	authProtected.Post("/change-password", cfg.AuthHandler.ChangePassword)

	// User routes with authentication middleware (admin-only operations)
	users := api.Group("/users", middleware.AuthMiddleware(cfg.JWTSecretKey))
	users.Get("/", middleware.RequirePermission("users:read"), cfg.UserHandler.GetUsers)
	users.Post("/", middleware.RequirePermission("users:write"), cfg.UserHandler.CreateUser)
	users.Put("/:id", middleware.RequirePermission("users:write"), cfg.UserHandler.UpdateUser)
	users.Delete("/:id", middleware.RequirePermission("users:delete"), cfg.UserHandler.DeleteUser)
	users.Post("/:id/restore", middleware.RequirePermission("users:write"), cfg.UserHandler.RestoreUser)

	// Role routes with authentication middleware
	roles := api.Group("/roles", middleware.AuthMiddleware(cfg.JWTSecretKey))
	roles.Get("/", cfg.RoleHandler.GetAllRoles)
	roles.Get("/:id", cfg.RoleHandler.GetRoleByID)
	roles.Post("/", middleware.RequirePermission("roles:write"), cfg.RoleHandler.CreateRole)
	roles.Put("/:id", middleware.RequirePermission("roles:write"), cfg.RoleHandler.UpdateRole)
	roles.Delete("/:id", middleware.RequirePermission("roles:delete"), cfg.RoleHandler.DeleteRole)
	roles.Post("/:id/permissions", middleware.RequirePermission("roles:write"), cfg.RoleHandler.AssignPermission)

	// Permission routes with authentication middleware
	permissions := api.Group("/permissions", middleware.AuthMiddleware(cfg.JWTSecretKey))
	permissions.Get("/", cfg.PermissionHandler.GetAllPermissions)
	permissions.Post("/", middleware.RequirePermission("permissions:write"), cfg.PermissionHandler.CreatePermission)

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
