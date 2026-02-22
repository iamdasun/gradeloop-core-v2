package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/handler"
	"github.com/gradeloop/academic-service/internal/middleware"
)

type Config struct {
	HealthHandler  *handler.HealthHandler
	FacultyHandler *handler.FacultyHandler
	JWTSecretKey   []byte
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)

	// API v1 group
	api := app.Group("/api/v1")

	// Protected routes (require authentication)
	protected := api.Group("", middleware.AuthMiddleware(cfg.JWTSecretKey))

	// Super Admin only routes
	superAdmin := protected.Group("", middleware.RequireRole("super_admin"))

	// Faculty routes
	faculties := superAdmin.Group("/faculties")
	faculties.Post("/", cfg.FacultyHandler.CreateFaculty)
	faculties.Get("/", cfg.FacultyHandler.ListFaculties)
	faculties.Get("/:id", cfg.FacultyHandler.GetFaculty)
	faculties.Put("/:id", cfg.FacultyHandler.UpdateFaculty)
	faculties.Patch("/:id/deactivate", cfg.FacultyHandler.DeactivateFaculty)
	faculties.Get("/:id/leaders", cfg.FacultyHandler.GetFacultyLeaders)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "academic-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})
}
