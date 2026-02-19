package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/service"
)

type RoleHandler struct {
	roleService service.RoleService
}

func NewRoleHandler(roleService service.RoleService) *RoleHandler {
	return &RoleHandler{
		roleService: roleService,
	}
}

func (h *RoleHandler) CreateRole(c fiber.Ctx) error {
	var req dto.CreateRoleRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.roleService.CreateRole(c.RequestCtx(), &req, permissions)
	if err != nil {
		return handleRoleError(err)
	}

	return c.Status(fiber.StatusCreated).JSON(response)
}

func (h *RoleHandler) GetRoleByID(c fiber.Ctx) error {
	roleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	response, err := h.roleService.GetRoleByID(c.RequestCtx(), roleID)
	if err != nil {
		return handleRoleError(err)
	}

	return c.JSON(response)
}

func (h *RoleHandler) GetAllRoles(c fiber.Ctx) error {
	response, err := h.roleService.GetAllRoles(c.RequestCtx())
	if err != nil {
		return handleRoleError(err)
	}

	return c.JSON(response)
}

func (h *RoleHandler) UpdateRole(c fiber.Ctx) error {
	roleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	var req dto.UpdateRoleRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.roleService.UpdateRole(c.RequestCtx(), roleID, &req, permissions)
	if err != nil {
		return handleRoleError(err)
	}

	return c.JSON(response)
}

func (h *RoleHandler) DeleteRole(c fiber.Ctx) error {
	roleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	if err := h.roleService.DeleteRole(c.RequestCtx(), roleID, permissions); err != nil {
		return handleRoleError(err)
	}

	return c.JSON(fiber.Map{
		"message": "Role deleted successfully",
	})
}

func (h *RoleHandler) AssignPermission(c fiber.Ctx) error {
	roleID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	var req dto.AssignPermissionRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	permissionID, err := uuid.Parse(req.PermissionID)
	if err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.roleService.AssignPermission(c.RequestCtx(), roleID, permissionID, permissions)
	if err != nil {
		return handleRoleError(err)
	}

	return c.JSON(response)
}

func handleRoleError(err error) error {
	switch err {
	case service.ErrUnauthorized:
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	case service.ErrRoleAlreadyExists:
		return fiber.NewError(fiber.StatusConflict, "Role already exists")
	case service.ErrSystemRoleCannotBeModified:
		return fiber.NewError(fiber.StatusForbidden, "System roles cannot be modified")
	case service.ErrSystemRoleCannotBeDeleted:
		return fiber.NewError(fiber.StatusForbidden, "System roles cannot be deleted")
	case service.ErrPermissionNotFound:
		return fiber.NewError(fiber.StatusBadRequest, "Permission not found")
	case service.ErrUserNotFound:
		return fiber.NewError(fiber.StatusNotFound, "Role not found")
	default:
		return err
	}
}
