package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gradeloop/assessment-service/internal/utils"
)

// Claims mirrors the JWT structure emitted by the IAM Service.
type Claims struct {
	UserID      string   `json:"user_id"`
	Username    string   `json:"username"`
	RoleName    string   `json:"role_name"`
	Permissions []string `json:"permissions"`
	jwt.RegisteredClaims
}

// normalizeRole converts role names to a canonical snake_case lowercase form
// so that "Super Admin" and "super_admin" are treated identically.
func normalizeRole(role string) string {
	normalized := strings.ToLower(strings.TrimSpace(role))
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}

// AuthMiddleware validates the Bearer JWT in the Authorization header and
// populates fiber.Ctx locals with user_id, username, role_name and permissions.
func AuthMiddleware(secretKey []byte) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return utils.ErrUnauthorized("missing authorization header")
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			return utils.ErrUnauthorized("invalid authorization header format")
		}

		tokenString := parts[1]

		token, err := jwt.ParseWithClaims(
			tokenString,
			&Claims{},
			func(token *jwt.Token) (interface{}, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, utils.ErrUnauthorized("invalid signing method")
				}
				return secretKey, nil
			},
		)
		if err != nil {
			return utils.ErrUnauthorized("invalid token")
		}

		claims, ok := token.Claims.(*Claims)
		if !ok || !token.Valid {
			return utils.ErrUnauthorized("invalid token claims")
		}

		c.Locals("user_id", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("role_name", claims.RoleName)
		c.Locals("permissions", claims.Permissions)

		return c.Next()
	}
}

// RequireRole is a middleware that enforces a single required role.
// Both "Super Admin" and "super_admin" formats are accepted.
func RequireRole(role string) fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("no role found")
		}

		if normalizeRole(roleName) == normalizeRole(role) {
			return c.Next()
		}

		return utils.ErrForbidden("insufficient role")
	}
}

// RequireAnyRole is a middleware that passes when the caller holds at least
// one of the listed roles.
func RequireAnyRole(roles ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		roleName, ok := c.Locals("role_name").(string)
		if !ok || roleName == "" {
			return utils.ErrForbidden("no role found")
		}

		normalizedUser := normalizeRole(roleName)
		for _, r := range roles {
			if normalizedUser == normalizeRole(r) {
				return c.Next()
			}
		}

		return utils.ErrForbidden("insufficient role")
	}
}
