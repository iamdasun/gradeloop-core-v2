package handler

import (
	"github.com/gofiber/fiber/v3"
)

// HealthHandler handles health-check endpoints.
type HealthHandler struct{}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

// RegisterRoutes registers the health check route on the root app.
func (h *HealthHandler) RegisterRoutes(app *fiber.App) {
	app.Get("/health", h.Health)
}

// Health handles GET /health
func (h *HealthHandler) Health(c fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status":  "ok",
		"service": "assessment-service",
	})
}
