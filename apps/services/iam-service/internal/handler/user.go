package handler

import (
	"strconv"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/gofiber/fiber/v3"
)

type UserHandler struct {
	userService service.UserService
}

func NewUserHandler(userService service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) CreateUser(c fiber.Ctx) error {
	var req dto.CreateUserRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	user, err := h.userService.CreateUser(c.Context(), req)
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(201).JSON(fiber.Map{
		"user":    user,
		"message": "User created successfully. Verification email sent.",
	})
}

func (h *UserHandler) GetUser(c fiber.Ctx) error {
	id := c.Params("id")
	user, err := h.userService.GetUser(c.Context(), id)
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(user)
}

func (h *UserHandler) ListUsers(c fiber.Ctx) error {
	skip, _ := strconv.Atoi(c.Query("skip", "0"))
	limit, _ := strconv.Atoi(c.Query("limit", "10"))

	users, err := h.userService.ListUsers(c.Context(), skip, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(users)
}

func (h *UserHandler) UpdateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var req dto.UpdateUserRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	user, err := h.userService.UpdateUser(c.Context(), id, req)
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(user)
}

func (h *UserHandler) DeleteUser(c fiber.Ctx) error {
	id := c.Params("id")
	if err := h.userService.DeleteUser(c.Context(), id); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func (h *UserHandler) AssignRole(c fiber.Ctx) error {
	id := c.Params("id")
	var req dto.AssignRoleRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	if err := h.userService.AssignRole(c.Context(), id, req.RoleID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(200)
}
