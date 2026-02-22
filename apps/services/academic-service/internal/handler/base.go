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
