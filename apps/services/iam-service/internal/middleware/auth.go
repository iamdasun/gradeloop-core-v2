package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/iam-service/internal/domain"
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
		c.Locals("email", claims.Email)
		c.Locals("user_type", claims.UserType)
		c.Locals("full_name", claims.FullName)

		return c.Next()
	}
}

// RequireUserType creates a middleware that checks if the user has any of the allowed user types
func RequireUserType(allowedUserTypes ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userType, ok := c.Locals("user_type").(string)
		if !ok || userType == "" {
			return fiber.NewError(fiber.StatusForbidden, "User type required")
		}

		for _, allowedType := range allowedUserTypes {
			if userType == allowedType {
				return c.Next()
			}
		}

		return fiber.NewError(fiber.StatusForbidden, "Insufficient privileges")
	}
}

// RequireAdmin creates a middleware that requires admin or super_admin access
func RequireAdmin() fiber.Handler {
	return RequireUserType(domain.UserTypeAdmin, domain.UserTypeSuperAdmin)
}

// RequireSuperAdmin creates a middleware that requires super_admin access
func RequireSuperAdmin() fiber.Handler {
	return RequireUserType(domain.UserTypeSuperAdmin)
}

// RequireInstructor creates a middleware that requires instructor, admin or super_admin access
func RequireInstructor() fiber.Handler {
	return RequireUserType(domain.UserTypeInstructor, domain.UserTypeAdmin, domain.UserTypeSuperAdmin)
}

// RequireStudent creates a middleware that requires student access (or higher)
func RequireStudent() fiber.Handler {
	return RequireUserType(domain.UserTypeStudent, domain.UserTypeInstructor, domain.UserTypeAdmin, domain.UserTypeSuperAdmin)
}

// RequireNonStudent creates a middleware that requires instructor/admin/super_admin access (excludes students)
func RequireNonStudent() fiber.Handler {
	return RequireUserType(domain.UserTypeInstructor, domain.UserTypeAdmin, domain.UserTypeSuperAdmin)
}
