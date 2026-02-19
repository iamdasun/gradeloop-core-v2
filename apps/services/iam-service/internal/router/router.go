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

	// Public auth routes
	auth := app.Group("/auth")
	auth.Post("/login", cfg.AuthHandler.Login)
	auth.Post("/refresh", cfg.AuthHandler.RefreshToken)
	auth.Post("/logout", cfg.AuthHandler.Logout)
	auth.Post("/activate", cfg.AuthHandler.Activate)
	auth.Post("/forgot-password", cfg.AuthHandler.ForgotPassword)
	auth.Post("/reset-password", cfg.AuthHandler.ResetPassword)

	// Protected auth routes (require authentication)
	authProtected := app.Group("/auth", middleware.AuthMiddleware(cfg.JWTSecretKey))
	authProtected.Post("/change-password", cfg.AuthHandler.ChangePassword)

	// User routes with authentication middleware (admin-only operations)
	users := app.Group("/users", middleware.AuthMiddleware(cfg.JWTSecretKey))
	users.Post("/", cfg.UserHandler.CreateUser)

	// Role routes with authentication middleware
	roles := app.Group("/roles", middleware.AuthMiddleware(cfg.JWTSecretKey))
	roles.Get("/", cfg.RoleHandler.GetAllRoles)
	roles.Get("/:id", cfg.RoleHandler.GetRoleByID)
	roles.Post("/", middleware.RequirePermission("roles:write"), cfg.RoleHandler.CreateRole)
	roles.Put("/:id", middleware.RequirePermission("roles:write"), cfg.RoleHandler.UpdateRole)
	roles.Delete("/:id", middleware.RequirePermission("roles:delete"), cfg.RoleHandler.DeleteRole)
	roles.Post("/:id/permissions", middleware.RequirePermission("roles:write"), cfg.RoleHandler.AssignPermission)

	// Permission routes with authentication middleware
	permissions := app.Group("/permissions", middleware.AuthMiddleware(cfg.JWTSecretKey))
	permissions.Get("/", cfg.PermissionHandler.GetAllPermissions)
	permissions.Post("/", middleware.RequirePermission("permissions:write"), cfg.PermissionHandler.CreatePermission)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "iam-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})
}
