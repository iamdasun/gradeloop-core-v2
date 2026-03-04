package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/service"
)

type Handler interface {
	RegisterRoutes(app *fiber.App)
}

type BaseHandler struct {
	Service service.Service
}

func NewBaseHandler(service service.Service) *BaseHandler {
	return &BaseHandler{
		Service: service,
	}
}

func (h *BaseHandler) RegisterRoutes(app *fiber.App) {
}

// requireUsername is a package-level helper (shared across handlers in this
// package) that extracts the username claim set by AuthMiddleware.
func requireUsername(c fiber.Ctx) string {
	username, _ := c.Locals("username").(string)
	return username
}
