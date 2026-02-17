package middleware

import (
	"fmt"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/rbac"
	"github.com/gofiber/fiber/v3"
)

// RBACMiddleware struct to hold the manager
type RBACMiddleware struct {
	manager *rbac.RBACManager
}

func NewRBACMiddleware(manager *rbac.RBACManager) *RBACMiddleware {
	return &RBACMiddleware{manager: manager}
}

func (m *RBACMiddleware) RequirePermission(perm string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userID := c.Locals("user_id")
		if userID == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		uidString := fmt.Sprintf("%v", userID) // Handle different types if any

		has, err := m.manager.HasPermission(c.Context(), uidString, perm)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "RBAC Error"})
		}
		if !has {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Permission Denied"})
		}

		return c.Next()
	}
}

func (m *RBACMiddleware) RequireRole(roleName string) fiber.Handler {
	return func(c fiber.Ctx) error {
		userID := c.Locals("user_id")
		if userID == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		uidString := fmt.Sprintf("%v", userID)

		has, err := m.manager.HasRole(c.Context(), uidString, roleName)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "RBAC Error"})
		}
		if !has {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Role Required"})
		}

		return c.Next()
	}
}
