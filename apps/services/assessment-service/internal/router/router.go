package router

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/assessment-service/internal/handler"
	"github.com/gradeloop/assessment-service/internal/middleware"
	"github.com/gradeloop/assessment-service/internal/utils"
)

// Config holds all handler dependencies required to set up routes.
type Config struct {
	HealthHandler     *handler.HealthHandler
	AssignmentHandler *handler.AssignmentHandler
	JWTSecretKey      []byte
}

// requireAdminRole is a route-level middleware that allows access only to
// users whose role normalises to "super_admin" or "admin".
func requireAdminRole() fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("no role found")
		}

		normalized := strings.ToLower(strings.TrimSpace(roleName))
		normalized = strings.ReplaceAll(normalized, " ", "_")

		if normalized == "super_admin" || normalized == "admin" {
			return c.Next()
		}

		return utils.ErrForbidden("requires super_admin or admin role")
	}
}

// SetupRoutes registers all HTTP routes on the provided Fiber app.
func SetupRoutes(app *fiber.App, cfg Config) {
	// Health check — unauthenticated
	cfg.HealthHandler.RegisterRoutes(app)

	// Root info endpoint
	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "assessment-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})

	// ── API v1 ────────────────────────────────────────────────────────────────
	api := app.Group("/api/v1")

	// All routes below require a valid JWT issued by the IAM Service.
	protected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))

	// Debug endpoint — useful for verifying token parsing in development.
	protected.Get("/debug/auth", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"user_id":       c.Locals("user_id"),
			"username":      c.Locals("username"),
			"role_name":     c.Locals("role_name"),
			"permissions":   c.Locals("permissions"),
			"authenticated": true,
		})
	})

	// ── Assignments ───────────────────────────────────────────────────────────
	// All assignment mutations require super_admin or admin role.
	assignments := protected.Group("/assignments", requireAdminRole())

	// POST   /api/v1/assignments                                  — create
	assignments.Post("/", cfg.AssignmentHandler.CreateAssignment)

	// GET    /api/v1/assignments/course-instance/:courseInstanceId — list by course instance
	// NOTE: Must be registered BEFORE GET /:id so that the literal segment
	// "course-instance" is not swallowed as a UUID parameter value.
	assignments.Get("/course-instance/:courseInstanceId", cfg.AssignmentHandler.ListAssignmentsByCourseInstance)

	// GET    /api/v1/assignments/:id                              — get by ID (active only)
	assignments.Get("/:id", cfg.AssignmentHandler.GetAssignment)

	// PATCH  /api/v1/assignments/:id                              — update / soft-delete
	assignments.Patch("/:id", cfg.AssignmentHandler.UpdateAssignment)
}
