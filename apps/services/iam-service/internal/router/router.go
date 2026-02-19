package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/handler"
)

type Config struct {
	HealthHandler *handler.HealthHandler
	AuthHandler   *handler.AuthHandler
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)
	cfg.AuthHandler.RegisterRoutes(app)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "iam-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})
}
