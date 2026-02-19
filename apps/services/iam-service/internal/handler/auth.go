package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/service"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{
		authService: authService,
	}
}

func (h *AuthHandler) RegisterRoutes(app *fiber.App) {
	auth := app.Group("/auth")

	auth.Post("/login", h.Login)
	auth.Post("/refresh", h.RefreshToken)
	auth.Post("/logout", h.Logout)
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req dto.LoginRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	if req.Username == "" || req.Password == "" {
		return fiber.ErrBadRequest
	}

	response, err := h.authService.Login(c.RequestCtx(), req.Username, req.Password)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) RefreshToken(c fiber.Ctx) error {
	var req dto.RefreshTokenRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	if req.RefreshToken == "" {
		return fiber.ErrBadRequest
	}

	response, err := h.authService.RefreshToken(c.RequestCtx(), req.RefreshToken)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	var req dto.RefreshTokenRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	if req.RefreshToken == "" {
		return fiber.ErrBadRequest
	}

	if err := h.authService.Logout(c.RequestCtx(), req.RefreshToken); err != nil {
		return handleAuthError(err)
	}

	return c.JSON(fiber.Map{
		"message": "logged out successfully",
	})
}

func handleAuthError(err error) error {
	switch err {
	case service.ErrInvalidCredentials:
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid username or password")
	case service.ErrUserInactive:
		return fiber.NewError(fiber.StatusForbidden, "User account is inactive")
	case service.ErrPasswordResetRequired:
		return fiber.NewError(fiber.StatusForbidden, "Password reset required")
	case service.ErrUserNotFound:
		return fiber.NewError(fiber.StatusNotFound, "User not found")
	case service.ErrRefreshTokenNotFound, service.ErrRefreshTokenExpired, service.ErrRefreshTokenRevoked:
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid or expired refresh token")
	default:
		return err
	}
}
