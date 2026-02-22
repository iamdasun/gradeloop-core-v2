package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gradeloop/academic-service/internal/utils"
)

// Claims matches the JWT structure from IAM Service
type Claims struct {
	UserID      string   `json:"user_id"`   // Changed: UUID string from IAM
	Username    string   `json:"username"`  // Changed: Added username field
	RoleName    string   `json:"role_name"` // Changed: Single role string from IAM
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

// normalizeRole converts role names to a standard format for comparison
// Handles: "Super Admin" -> "super_admin", "super_admin" -> "super_admin"
func normalizeRole(role string) string {
	// Convert to lowercase and replace spaces with underscores
	normalized := strings.ToLower(strings.TrimSpace(role))
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}

func AuthMiddleware(secretKey []byte) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return utils.ErrUnauthorized("Missing authorization header")
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return utils.ErrUnauthorized("Invalid authorization header format")
		}

		tokenString := parts[1]

		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, utils.ErrUnauthorized("Invalid signing method")
			}
			return secretKey, nil
		})

		if err != nil {
			return utils.ErrUnauthorized("Invalid token")
		}

		claims, ok := token.Claims.(*Claims)
		if !ok || !token.Valid {
			return utils.ErrUnauthorized("Invalid token claims")
		}

		// Store claims in context for handlers to access
		c.Locals("user_id", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("role_name", claims.RoleName)
		c.Locals("permissions", claims.Permissions)

		return c.Next()
	}
}

func RequirePermission(permission string) fiber.Handler {
	return func(c fiber.Ctx) error {
		permissions, ok := c.Locals("permissions").([]string)
		if !ok {
			return utils.ErrForbidden("No permissions found")
		}

		for _, p := range permissions {
			if p == permission {
				return c.Next()
			}
		}

		return utils.ErrForbidden("Insufficient permissions")
	}
}

// RequireRole checks if the user has the required role
// Supports both formats: "Super Admin" and "super_admin"
func RequireRole(role string) fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("No role found")
		}

		// Normalize both roles for comparison
		normalizedUserRole := normalizeRole(roleName)
		normalizedRequiredRole := normalizeRole(role)

		if normalizedUserRole == normalizedRequiredRole {
			return c.Next()
		}

		return utils.ErrForbidden("Insufficient role")
	}
}
