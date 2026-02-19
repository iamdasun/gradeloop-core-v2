package router

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/handler"
	"github.com/gradeloop/iam-service/internal/middleware"
)

type Config struct {
	HealthHandler *handler.HealthHandler
	AuthHandler   *handler.AuthHandler
	UserHandler   *handler.UserHandler
	JWTSecretKey  []byte
}

func SetupRoutes(app *fiber.App, cfg Config) {
	cfg.HealthHandler.RegisterRoutes(app)
	cfg.AuthHandler.RegisterRoutes(app)

	// User routes with authentication middleware (admin-only operations)
	users := app.Group("/users", middleware.AuthMiddleware(cfg.JWTSecretKey))
	users.Post("/", cfg.UserHandler.CreateUser)

	app.Get("/", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "iam-service",
			"version": "1.0.0",
			"status":  "running",
		})
	})
}
