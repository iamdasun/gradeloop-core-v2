package router

import (
	"strings"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/handler"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/middleware"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/gofiber/fiber/v3"
)

// Config holds all handler dependencies required to set up routes.
type Config struct {
	HealthHandler     *handler.HealthHandler
	AssignmentHandler *handler.AssignmentHandler
	SubmissionHandler *handler.SubmissionHandler
	GroupHandler      *handler.GroupHandler
	InstructorHandler *handler.InstructorHandler
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

	// GET    /api/v1/assignments/:id/submissions                  — list all versions
	// GET    /api/v1/assignments/:id/latest                       — get latest version
	// NOTE: These must be registered BEFORE GET /:id to prevent Fiber from
	// routing the literal sub-segments as UUID param values.
	assignments.Get("/:id/submissions", cfg.SubmissionHandler.ListSubmissions)
	assignments.Get("/:id/latest", cfg.SubmissionHandler.GetLatestSubmission)

	// GET    /api/v1/assignments/:id                              — get by ID (active only)
	assignments.Get("/:id", cfg.AssignmentHandler.GetAssignment)

	// PATCH  /api/v1/assignments/:id                              — update / soft-delete
	assignments.Patch("/:id", cfg.AssignmentHandler.UpdateAssignment)

	// ── Submissions ───────────────────────────────────────────────────────────
	// Submissions are accessible to all authenticated users (enrollment is
	// validated at the service layer for individual submissions).
	submissions := protected.Group("/submissions")

	// POST   /api/v1/submissions/run-code      — execute code without persistence
	submissions.Post("/run-code", cfg.SubmissionHandler.RunCode)

	// POST   /api/v1/submissions                — create (versioned, immutable)
	submissions.Post("/", cfg.SubmissionHandler.CreateSubmission)

	// GET    /api/v1/submissions/:id/code       — retrieve source code from MinIO
	// NOTE: Must be registered BEFORE GET /:id to prevent the literal "code"
	// segment from being swallowed as a UUID param value.
	submissions.Get("/:id/code", cfg.SubmissionHandler.GetSubmissionCode)

	// GET    /api/v1/submissions/:id            — get submission metadata
	submissions.Get("/:id", cfg.SubmissionHandler.GetSubmission)

	// PUT    /api/v1/submissions/:id            — always 405 (submissions are immutable)
	submissions.Put("/:id", cfg.SubmissionHandler.UpdateSubmission)

	// ── Instructor-scoped routes ────────────────────────────────────────────
	// Accessible to Employee + Admin + Super Admin.
	// PathPrefix: /api/v1/instructor-assignments — routed by Traefik
	// PathPrefix: /api/v1/instructor-submissions — routed by Traefik
	requireEmployeeOrAdmin := middleware.RequireAnyRole("Employee", "Admin", "Super Admin")

	instructorAssignments := protected.Group("/instructor-assignments", requireEmployeeOrAdmin)
	instructorAssignments.Get("/me", cfg.InstructorHandler.GetMyAssignments)
	instructorAssignments.Post("/", cfg.InstructorHandler.CreateAssignment)

	instructorSubmissions := protected.Group("/instructor-submissions", requireEmployeeOrAdmin)
	instructorSubmissions.Get("/assignment/:id", cfg.InstructorHandler.GetSubmissions)

	// ── Groups ────────────────────────────────────────────────────────────────
	// Groups are accessible to all authenticated users — a student may create
	// their own group for a group-enabled assignment.
	groups := protected.Group("/groups")

	// POST   /api/v1/groups                     — create a submission group
	groups.Post("/", cfg.GroupHandler.CreateGroup)

	// GET    /api/v1/groups/:id                 — get group metadata + members
	groups.Get("/:id", cfg.GroupHandler.GetGroup)
}
