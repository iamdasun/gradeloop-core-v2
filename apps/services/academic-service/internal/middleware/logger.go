package middleware

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

func Logger() fiber.Handler {
	return func(c fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		logger := utils.GetLogger()
		logger.Info("request",
			zap.String("method", c.Method()),
			zap.String("path", c.Path()),
			zap.Int("status", c.Response().StatusCode()),
			zap.String("ip", c.IP()),
			zap.Duration("latency", time.Since(start)),
		)

		return err
	}
}

func Recovery() fiber.Handler {
	return func(c fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("Panic recovered: %v", r)

				_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"code":    fiber.StatusInternalServerError,
					"message": "Internal server error",
				})
			}
		}()

		return c.Next()
	}
}
