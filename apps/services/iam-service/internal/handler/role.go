package handler

import (
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/gofiber/fiber/v3"
)

type RoleHandler struct {
	roleService service.RoleService
}

func NewRoleHandler(roleService service.RoleService) *RoleHandler {
	return &RoleHandler{roleService: roleService}
}

func (h *RoleHandler) CreateRole(c fiber.Ctx) error {
	var req dto.CreateRoleRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	role, err := h.roleService.CreateRole(c.Context(), req)
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(role)
}

func (h *RoleHandler) ListRoles(c fiber.Ctx) error {
	roles, err := h.roleService.ListRoles(c.Context())
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(roles)
}

func (h *RoleHandler) AssignPermission(c fiber.Ctx) error {
	roleID := c.Params("id")
	type Request struct {
		PermissionID string `json:"permission_id" validate:"required"`
	}
	var req Request
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	if err := h.roleService.AssignPermission(c.Context(), roleID, req.PermissionID); err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(200)
}
