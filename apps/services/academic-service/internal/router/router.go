package router

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/handler"
	"github.com/gradeloop/academic-service/internal/middleware"
	"github.com/gradeloop/academic-service/internal/utils"
)

type Config struct {
	HealthHandler     *handler.HealthHandler
	FacultyHandler    *handler.FacultyHandler
	DepartmentHandler *handler.DepartmentHandler
	JWTSecretKey      []byte
}

// requireAdminRole is a custom middleware that checks for super_admin OR faculty_admin
func requireAdminRole() fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("No role found")
		}

		// Normalize role name (lowercase, replace spaces with underscores)
		normalized := strings.ToLower(strings.TrimSpace(roleName))
		normalized = strings.ReplaceAll(normalized, " ", "_")

		// Check if user has super_admin or faculty_admin role
		if normalized == "super_admin" || normalized == "faculty_admin" {
			return c.Next()
		}

		return utils.ErrForbidden("Requires super_admin or faculty_admin role")
	}
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)

	// API v1 group
	api := app.Group("/api/v1")

	// Protected routes (require authentication)
	protected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))

	// Super Admin only routes
	superAdmin := protected.Group("", middleware.RequireRole("super_admin"))

	// Faculty routes - Super Admin only
	faculties := superAdmin.Group("/faculties")
	faculties.Post("/", cfg.FacultyHandler.CreateFaculty)
	faculties.Get("/", cfg.FacultyHandler.ListFaculties)
	faculties.Get("/:id", cfg.FacultyHandler.GetFaculty)
	faculties.Put("/:id", cfg.FacultyHandler.UpdateFaculty)
	faculties.Patch("/:id/deactivate", cfg.FacultyHandler.DeactivateFaculty)
	faculties.Get("/:id/leaders", cfg.FacultyHandler.GetFacultyLeaders)

	// Department routes - Super Admin OR Faculty Admin
	departments := protected.Group("/departments", requireAdminRole())
	departments.Post("/", cfg.DepartmentHandler.CreateDepartment)
	departments.Get("/", cfg.DepartmentHandler.ListDepartments)
	departments.Get("/:id", cfg.DepartmentHandler.GetDepartment)
	departments.Put("/:id", cfg.DepartmentHandler.UpdateDepartment)
	departments.Patch("/:id/deactivate", cfg.DepartmentHandler.DeactivateDepartment)

	// Faculty departments endpoint - Super Admin OR Faculty Admin
	facultiesAdmin := protected.Group("/faculties", requireAdminRole())
	facultiesAdmin.Get("/:id/departments", cfg.DepartmentHandler.ListDepartmentsByFaculty)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "academic-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	// Debug endpoint to check auth and role
	protected.Get("/debug/auth", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":       c.Locals("user_id"),
			"username":      c.Locals("username"),
			"role_name":     c.Locals("role_name"),
			"permissions":   c.Locals("permissions"),
			"authenticated": true,
		})
	})
}
