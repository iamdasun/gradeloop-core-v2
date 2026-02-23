package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v3"

	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/service"
	"github.com/gradeloop/iam-service/internal/storage"
)

type UserHandler struct {
	userService  service.UserService
	minioStorage *storage.MinIOStorage
}

func NewUserHandler(userService service.UserService, minioStorage *storage.MinIOStorage) *UserHandler {
	return &UserHandler{
		userService:  userService,
		minioStorage: minioStorage,
	}
}

// CreateUser creates a new user with a temporary password and activation token
func (h *UserHandler) CreateUser(c fiber.Ctx) error {
	var req dto.CreateUserRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context (set by AuthMiddleware)
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.userService.CreateUser(c.RequestCtx(), &req, permissions)
	if err != nil {
		return handleUserError(err)
	}

	return c.Status(fiber.StatusCreated).JSON(response)
}

// GetUsers returns a paginated list of users
func (h *UserHandler) GetUsers(c fiber.Ctx) error {
	page, err := strconv.Atoi(c.Query("page", "1"))
	if err != nil {
		page = 1
	}

	limit, err := strconv.Atoi(c.Query("limit", "10"))
	if err != nil {
		limit = 10
	}

	userType := c.Query("user_type", "all")
	roleID := c.Query("role_id", "")

	response, err := h.userService.GetUsers(c.RequestCtx(), page, limit, userType, roleID)
	if err != nil {
		return handleUserError(err)
	}

	return c.JSON(response)
}

// UpdateUser updates an existing user
func (h *UserHandler) UpdateUser(c fiber.Ctx) error {
	id := c.Params("id")
	var req dto.UpdateUserRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	response, err := h.userService.UpdateUser(c.RequestCtx(), id, &req)
	if err != nil {
		return handleUserError(err)
	}

	return c.JSON(response)
}

// DeleteUser soft deletes a user
func (h *UserHandler) DeleteUser(c fiber.Ctx) error {
	id := c.Params("id")

	if err := h.userService.DeleteUser(c.RequestCtx(), id); err != nil {
		return handleUserError(err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// RestoreUser restores a soft deleted user
func (h *UserHandler) RestoreUser(c fiber.Ctx) error {
	id := c.Params("id")

	if err := h.userService.RestoreUser(c.RequestCtx(), id); err != nil {
		return handleUserError(err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// GetProfile returns the profile of the current authenticated user
func (h *UserHandler) GetProfile(c fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	response, err := h.userService.GetProfile(c.RequestCtx(), userID)
	if err != nil {
		return handleUserError(err)
	}

	return c.JSON(response)
}

// UpdateAvatar uploads a new avatar image to MinIO and updates the user record.
// Accepted formats: JPEG, PNG, GIF, WebP — max 5 MB.
func (h *UserHandler) UpdateAvatar(c fiber.Ctx) error {
	userID, ok := c.Locals("user_id").(string)
	if !ok || userID == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	file, err := c.FormFile("avatar")
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "No avatar file provided")
	}

	// 5 MB hard limit — keep in sync with the Traefik buffering middleware.
	const maxSize = 5 * 1024 * 1024
	if file.Size > maxSize {
		return fiber.NewError(fiber.StatusBadRequest, "Avatar file too large (max 5 MB)")
	}

	avatarURL, err := h.minioStorage.UploadAvatar(c.RequestCtx(), userID, file)
	if err != nil {
		return fiber.NewError(fiber.StatusUnprocessableEntity, err.Error())
	}

	response, err := h.userService.UpdateAvatar(c.RequestCtx(), userID, avatarURL)
	if err != nil {
		return handleUserError(err)
	}

	return c.JSON(response)
}

func handleUserError(err error) error {
	switch err {
	case service.ErrUnauthorized:
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	case service.ErrUsernameTaken:
		return fiber.NewError(fiber.StatusConflict, "Username already exists")
	case service.ErrEmailTaken:
		return fiber.NewError(fiber.StatusConflict, "Email already exists")
	case service.ErrRoleNotFound:
		return fiber.NewError(fiber.StatusBadRequest, "Role not found")
	case service.ErrInvalidActivationToken:
		return fiber.NewError(fiber.StatusBadRequest, "Invalid activation token")
	case service.ErrActivationTokenExpired:
		return fiber.NewError(fiber.StatusBadRequest, "Activation token expired")
	case service.ErrUserAlreadyActive:
		return fiber.NewError(fiber.StatusBadRequest, "User is already active")
	case service.ErrUserNotFound:
		return fiber.NewError(fiber.StatusNotFound, "User not found")
	default:
		return err
	}
}
