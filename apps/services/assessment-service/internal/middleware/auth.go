package middleware

import (
	"strings"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

// Claims mirrors the JWT structure emitted by the IAM Service.
type Claims struct {
	UserID   string `json:"user_id"`
	Email    string `json:"email"`
	UserType string `json:"user_type"` // student, instructor, admin, super_admin
	jwt.RegisteredClaims
}

// AuthMiddleware validates the Bearer JWT in the Authorization header and
// populates fiber.Ctx locals with user_id, username, user_type.
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
		c.Locals("username", claims.Email)
		c.Locals("user_type", claims.UserType)

		return c.Next()
	}
}

// RequireUserType is a middleware that enforces a single required user type.
func RequireUserType(userType string) fiber.Handler {
	return func(c fiber.Ctx) error {
		currentUserType, ok := c.Locals("user_type").(string)
		if !ok || currentUserType == "" {
			return utils.ErrForbidden("no user type found")
		}

		if currentUserType == userType {
			return c.Next()
		}

		return utils.ErrForbidden("insufficient privileges")
	}
}

// RequireAnyUserType is a middleware that passes when the caller holds at least
// one of the listed user types.
func RequireAnyUserType(userTypes ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		currentUserType, ok := c.Locals("user_type").(string)
		if !ok || currentUserType == "" {
			return utils.ErrForbidden("no user type found")
		}

		for _, ut := range userTypes {
			if currentUserType == ut {
				return c.Next()
			}
		}

		return utils.ErrForbidden("insufficient privileges")
	}
}

// RequireAdmin requires admin or super_admin access
func RequireAdmin() fiber.Handler {
	return RequireAnyUserType("admin", "super_admin")
}

// RequireSuperAdmin requires super_admin access
func RequireSuperAdmin() fiber.Handler {
	return RequireUserType("super_admin")
}

// RequireInstructor requires instructor, admin, or super_admin access
func RequireInstructor() fiber.Handler {
	return RequireAnyUserType("instructor", "admin", "super_admin")
}
