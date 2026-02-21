package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/jwt"
)

// AuthMiddleware creates a middleware that validates JWT access tokens
// and stores user claims in context locals
func AuthMiddleware(secretKey []byte) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization header")
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid authorization format")
		}

		tokenString := parts[1]

		// Validate token
		claims, err := jwt.ValidateAccessToken(tokenString, secretKey)
		if err != nil {
			if err == jwt.ErrExpiredToken {
				return fiber.NewError(fiber.StatusUnauthorized, "Token expired")
			}
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
		}

		// Store claims in context for handlers to access
		c.Locals("user_id", claims.UserID.String())
		c.Locals("username", claims.Username)
		c.Locals("role_name", claims.RoleName)
		c.Locals("permissions", claims.Permissions)

		return c.Next()
	}
}

// RequirePermission creates a middleware that checks if the user has a specific permission
func RequirePermission(requiredPermission string) fiber.Handler {
	return func(c fiber.Ctx) error {
		permissions, ok := c.Locals("permissions").([]string)
		if !ok || permissions == nil {
			return fiber.NewError(fiber.StatusForbidden, "Permission denied")
		}

		for _, perm := range permissions {
			if perm == requiredPermission {
				return c.Next()
			}
		}

		return fiber.NewError(fiber.StatusForbidden, "Permission denied")
	}
}

// RequireRole creates a middleware that checks if the user has a specific role
func RequireRole(allowedRoles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return fiber.NewError(fiber.StatusForbidden, "Role required")
		}

		for _, allowedRole := range allowedRoles {
			if roleName == allowedRole {
				return c.Next()
			}
		}

		return fiber.NewError(fiber.StatusForbidden, "Insufficient role")
	}
}
