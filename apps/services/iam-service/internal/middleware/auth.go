package middleware

import (
	"errors"
	"os"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

// AuthMiddleware validates the JWT token and sets the user context.
func AuthMiddleware() fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing authorization header"})
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token format"})
		}

		secret := os.Getenv("SECRET")
		if secret == "" {
			// Fallback or error? detailed log
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Server configuration error"})
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token claims"})
		}

		// Set user ID and claims in context
		// Assuming user_id is in claims as "user_id"
		if userID, ok := claims["user_id"]; ok {
			c.Locals("user_id", userID)
		} else {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Token missing user_id"})
		}

		// Keep raw claims if needed
		c.Locals("claims", claims)

		return c.Next()
	}
}
