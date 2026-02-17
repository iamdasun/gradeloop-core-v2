package router

import (
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/handler"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/middleware"
	"github.com/gofiber/fiber/v3"
)

type Config struct {
	UserHandler  *handler.UserHandler
	AuthHandler  *handler.AuthHandler
	RoleHandler  *handler.RoleHandler
	AuditHandler *handler.AuditHandler
	RBAC         *middleware.RBACMiddleware
}

func SetupRoutes(app *fiber.App, config Config) {
	// Global Middleware
	// app.Use(logger.New()) // if desired

	// Public Routes
	auth := app.Group("/auth")
	auth.Post("/login", config.AuthHandler.Login)
	auth.Post("/refresh", config.AuthHandler.Refresh)
	auth.Post("/logout", config.AuthHandler.Logout)
	auth.Post("/request-reset", config.AuthHandler.RequestPasswordReset)
	auth.Post("/reset-password", config.AuthHandler.ResetPassword)
	auth.Post("/change-password", middleware.AuthMiddleware(), config.AuthHandler.ChangePassword)
	auth.Get("/session", middleware.AuthMiddleware(), config.AuthHandler.Session)

	// Protected Routes
	// api := app.Group("/api", middleware.AuthMiddleware()) // /api prefix? Or just root?
	// Prompt says: POST /users, etc. Not /api/users.
	// So let's use root group with middleware.

	// We can group users/roles.

	// Authorization Middleware Check
	// We assume AuthMiddleware sets user_id in locals.

	users := app.Group("/users", middleware.AuthMiddleware())
	users.Post("/", config.RBAC.RequirePermission("USER_CREATE"), config.UserHandler.CreateUser)
	users.Get("/", config.RBAC.RequirePermission("USER_READ"), config.UserHandler.ListUsers)
	users.Get("/:id", config.RBAC.RequirePermission("USER_READ"), config.UserHandler.GetUser)
	users.Put("/:id", config.RBAC.RequirePermission("USER_UPDATE"), config.UserHandler.UpdateUser)
	users.Delete("/:id", config.RBAC.RequirePermission("USER_DELETE"), config.UserHandler.DeleteUser)
	users.Post("/:id/roles", config.RBAC.RequirePermission("ROLE_ASSIGN"), config.UserHandler.AssignRole)

	roles := app.Group("/roles", middleware.AuthMiddleware())
	roles.Post("/", config.RBAC.RequireRole("SUPER_ADMIN"), config.RoleHandler.CreateRole)   // Only Super Admin?
	roles.Get("/", config.RBAC.RequirePermission("USER_READ"), config.RoleHandler.ListRoles) // Or specific perm?
	roles.Post("/:id/permissions", config.RBAC.RequireRole("SUPER_ADMIN"), config.RoleHandler.AssignPermission)

	// Audit Logs
	audit := app.Group("/audit-logs", middleware.AuthMiddleware())
	audit.Get("/", config.RBAC.RequireRole("SUPER_ADMIN"), config.AuditHandler.ListLogs)

}
