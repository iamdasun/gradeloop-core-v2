package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/service"
)

type AuthHandler struct {
	authService     service.AuthService
	userService     service.UserService
	passwordService service.PasswordService
	cookieSecure    bool
	cookieSameSite  string
}

func NewAuthHandler(
	authService service.AuthService,
	userService service.UserService,
	passwordService service.PasswordService,
	cookieSecure bool,
	cookieSameSite string,
) *AuthHandler {
	return &AuthHandler{
		authService:     authService,
		userService:     userService,
		passwordService: passwordService,
		cookieSecure:    cookieSecure,
		cookieSameSite:  cookieSameSite,
	}
}

func (h *AuthHandler) RegisterRoutes(app *fiber.App) {
	auth := app.Group("/auth")

	auth.Post("/login", h.Login)
	auth.Post("/refresh", h.RefreshToken)
	auth.Post("/logout", h.Logout)
	auth.Post("/activate", h.Activate)
	auth.Post("/forgot-password", h.ForgotPassword)
	auth.Post("/reset-password", h.ResetPassword)
	auth.Post("/change-password", h.ChangePassword)
}

// RegisterAdminRoutes registers admin-only routes
func (h *AuthHandler) RegisterAdminRoutes(router fiber.Router) {
	router.Post("/admin/users/:id/revoke-sessions", h.RevokeUserSessions)
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

	// Set refresh token in httpOnly cookie
	cookie := new(fiber.Cookie)
	cookie.Name = "refresh_token"
	cookie.Value = response.RefreshToken
	cookie.Path = "/"
	cookie.Expires = time.Now().Add(7 * 24 * time.Hour) // 7 days (should match service config)
	cookie.HTTPOnly = true
	cookie.Secure = h.cookieSecure
	cookie.SameSite = h.cookieSameSite

	c.Cookie(cookie)

	// Remove refresh token from response body
	response.RefreshToken = ""

	return c.JSON(response)
}

func (h *AuthHandler) RefreshToken(c fiber.Ctx) error {
	// Get refresh token from cookie
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "No refresh token provided")
	}

	response, err := h.authService.RefreshToken(c.RequestCtx(), refreshToken)
	if err != nil {
		return handleAuthError(err)
	}

	// Set new refresh token in httpOnly cookie
	cookie := new(fiber.Cookie)
	cookie.Name = "refresh_token"
	cookie.Value = response.RefreshToken
	cookie.Path = "/"
	cookie.Expires = time.Now().Add(7 * 24 * time.Hour)
	cookie.HTTPOnly = true
	cookie.Secure = h.cookieSecure
	cookie.SameSite = h.cookieSameSite

	c.Cookie(cookie)

	// Remove refresh token from response body
	response.RefreshToken = ""

	return c.JSON(response)
}

func (h *AuthHandler) Logout(c fiber.Ctx) error {
	refreshToken := c.Cookies("refresh_token")
	if refreshToken == "" {
		return fiber.ErrBadRequest
	}

	if err := h.authService.Logout(c.RequestCtx(), refreshToken); err != nil {
		return handleAuthError(err)
	}

	// Clear refresh token cookie
	cookie := new(fiber.Cookie)
	cookie.Name = "refresh_token"
	cookie.Path = "/"
	cookie.Expires = time.Now().Add(-1 * time.Hour)
	cookie.HTTPOnly = true
	cookie.Secure = h.cookieSecure
	cookie.SameSite = h.cookieSameSite

	c.Cookie(cookie)

	return c.JSON(fiber.Map{
		"message": "logged out successfully",
	})
}

func (h *AuthHandler) Activate(c fiber.Ctx) error {
	var req dto.ActivateUserRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	if req.Token == "" || req.Password == "" {
		return fiber.ErrBadRequest
	}

	response, err := h.userService.ActivateUser(c.RequestCtx(), req.Token, req.Password)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) ChangePassword(c fiber.Ctx) error {
	var req dto.ChangePasswordRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	// Get user ID from context (set by AuthMiddleware)
	userIDStr, ok := c.Locals("user_id").(string)
	if !ok || userIDStr == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}

	response, err := h.passwordService.ChangePassword(c.RequestCtx(), userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) ForgotPassword(c fiber.Ctx) error {
	var req dto.ForgotPasswordRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	response, err := h.passwordService.ForgotPassword(c.RequestCtx(), req.Email)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) ResetPassword(c fiber.Ctx) error {
	var req dto.ResetPasswordRequest

	if err := c.Bind().Body(&req); err != nil {
		return fiber.ErrBadRequest
	}

	response, err := h.passwordService.ResetPassword(c.RequestCtx(), req.Token, req.NewPassword)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
}

func (h *AuthHandler) RevokeUserSessions(c fiber.Ctx) error {
	userID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.ErrBadRequest
	}

	// Get actor permissions from context
	permissions, ok := c.Locals("permissions").([]string)
	if !ok || permissions == nil {
		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}

	response, err := h.authService.RevokeUserSessions(c.RequestCtx(), userID, permissions)
	if err != nil {
		return handleAuthError(err)
	}

	return c.JSON(response)
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
	case service.ErrInvalidActivationToken:
		return fiber.NewError(fiber.StatusBadRequest, "Invalid activation token")
	case service.ErrActivationTokenExpired:
		return fiber.NewError(fiber.StatusBadRequest, "Activation token expired")
	case service.ErrUserAlreadyActive:
		return fiber.NewError(fiber.StatusBadRequest, "User is already active")
	case service.ErrCurrentPasswordInvalid:
		return fiber.NewError(fiber.StatusUnauthorized, "Current password is incorrect")
	case service.ErrNewPasswordSameAsOld:
		return fiber.NewError(fiber.StatusBadRequest, "New password must be different from current password")
	case service.ErrPasswordTooWeak:
		return fiber.NewError(fiber.StatusBadRequest, "Password does not meet security requirements. Must be at least 8 characters with uppercase, lowercase, number, and special character.")
	case service.ErrPasswordResetTokenInvalid:
		return fiber.NewError(fiber.StatusBadRequest, "Invalid password reset token")
	case service.ErrPasswordResetTokenExpired:
		return fiber.NewError(fiber.StatusBadRequest, "Password reset token has expired")
	case service.ErrPasswordResetTokenUsed:
		return fiber.NewError(fiber.StatusBadRequest, "Password reset token has already been used")
	default:
		return err
	}
}
