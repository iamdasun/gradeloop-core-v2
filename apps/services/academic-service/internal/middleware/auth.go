package middleware

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gradeloop/academic-service/internal/utils"
)

// Claims matches the JWT structure from IAM Service
type Claims struct {
	UserID   string `json:"user_id"`   // UUID string from IAM
	Email    string `json:"email"`     // Email from IAM (used as identifier)
	UserType string `json:"user_type"` // User type: student, instructor, admin, super_admin
	jwt.RegisteredClaims
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
		c.Locals("username", claims.Email)
		c.Locals("user_type", claims.UserType)

		fmt.Printf("[DEBUG AuthMiddleware] path=%s user_id='%s' username='%s' user_type='%s'\n",
			c.Path(), claims.UserID, claims.Email, claims.UserType)

		return c.Next()
	}
}

// RequireUserType checks if the user has the required user type
func RequireUserType(userType string) fiber.Handler {
	return func(c fiber.Ctx) error {
		currentUserType, ok := c.Locals("user_type").(string)
		if !ok || currentUserType == "" {
			return utils.ErrForbidden("No user type found")
		}

		if currentUserType == userType {
			return c.Next()
		}

		return utils.ErrForbidden("Insufficient privileges")
	}
}

// RequireAnyUserType checks if the user has any of the required user types
func RequireAnyUserType(userTypes ...string) fiber.Handler {
	return func(c fiber.Ctx) error {
		currentUserType, ok := c.Locals("user_type").(string)
		if !ok || currentUserType == "" {
			fmt.Printf("[DEBUG RequireAnyUserType] No user type found in locals\n")
			return utils.ErrForbidden("No user type found")
		}

		fmt.Printf("[DEBUG RequireAnyUserType] User type: '%s'\n", currentUserType)

		// Check if user has any of the required user types
		for _, ut := range userTypes {
			fmt.Printf("[DEBUG RequireAnyUserType] Checking against: '%s'\n", ut)
			if currentUserType == ut {
				fmt.Printf("[DEBUG RequireAnyUserType] ✓ MATCH! Allowing access\n")
				return c.Next()
			}
		}

		fmt.Printf("[DEBUG RequireAnyUserType] ✗ NO MATCH! User type '%s' not in %v\n", currentUserType, userTypes)
		return utils.ErrForbidden("Insufficient privileges")
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
