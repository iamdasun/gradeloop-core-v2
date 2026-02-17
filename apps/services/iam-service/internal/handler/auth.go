package handler

import (
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/service"
	"github.com/gofiber/fiber/v3"
)

type AuthHandler struct {
	authService service.AuthService
}

func NewAuthHandler(authService service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req dto.LoginRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	res, err := h.authService.Login(c.Context(), req, c.IP(), c.Get("User-Agent"))
	if err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func (h *AuthHandler) Refresh(c fiber.Ctx) error {
	var req dto.RefreshRequest
	cookie := c.Cookies("refresh_token")
	if cookie != "" {
		req.RefreshToken = cookie
	} else {
		if err := c.Bind().Body(&req); err != nil {
			return errors.New(400, "Invalid request body", err)
		}
	}

	if req.RefreshToken == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Refresh token required"})
	}

	res, err := h.authService.RefreshToken(c.Context(), req.RefreshToken, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return c.Status(401).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	var req dto.LogoutRequest
	cookie := c.Cookies("refresh_token")
	if cookie != "" {
		req.RefreshToken = cookie
	} else {
		c.Bind().Body(&req)
	}

	userID := ""
	if uid := c.Locals("user_id"); uid != nil {
		userID = uid.(string)
	}

	if err := h.authService.Logout(c.Context(), req.RefreshToken, req.All, userID); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(200)
}

func (h *AuthHandler) RequestPasswordReset(c fiber.Ctx) error {
	type Request struct {
		Email string `json:"email" validate:"required,email"`
	}
	var req Request
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	err := h.authService.RequestPasswordReset(c.Context(), req.Email)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"message": "If an account with that email exists, we’ve sent a password reset link.",
	})
}

func (h *AuthHandler) ResetPassword(c fiber.Ctx) error {
	type Request struct {
		Token       string `json:"token" validate:"required"`
		NewPassword string `json:"new_password" validate:"required,min=6"`
	}
	var req Request
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	if err := h.authService.ResetPassword(c.Context(), req.Token, req.NewPassword); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Password reset successfully"})
}

func (h *AuthHandler) ChangePassword(c fiber.Ctx) error {
	var req dto.ChangePasswordRequest
	if err := c.Bind().Body(&req); err != nil {
		return errors.New(400, "Invalid request body", err)
	}

	userID := c.Locals("user_id").(string)
	if err := h.authService.ChangePassword(c.Context(), userID, req.OldPassword, req.NewPassword); err != nil {
		if appErr, ok := err.(*errors.AppError); ok {
			return c.Status(appErr.Code).JSON(fiber.Map{"error": appErr.Message})
		}
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "Password changed successfully"})
}
