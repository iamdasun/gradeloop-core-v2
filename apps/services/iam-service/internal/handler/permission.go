package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/service"
)

type PermissionHandler struct {
	permissionService service.PermissionService
}

func NewPermissionHandler(permissionService service.PermissionService) *PermissionHandler {
	return &PermissionHandler{
		permissionService: permissionService,
	}
}

func (h *PermissionHandler) CreatePermission(c fiber.Ctx) error {
	var req dto.CreatePermissionRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.permissionService.CreatePermission(c.RequestCtx(), &req, permissions)
	if err != nil {
		return handlePermissionError(err)
	}

	return c.Status(fiber.StatusCreated).JSON(response)
}

func (h *PermissionHandler) GetAllPermissions(c fiber.Ctx) error {
	response, err := h.permissionService.GetAllPermissions(c.RequestCtx())
	if err != nil {
		return handlePermissionError(err)
	}

	return c.JSON(response)
}

func handlePermissionError(err error) error {
	switch err {
	case service.ErrUnauthorized:
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	case service.ErrPermissionAlreadyExists:
		return fiber.NewError(fiber.StatusConflict, "Permission already exists")
	default:
		return err
	}
}
