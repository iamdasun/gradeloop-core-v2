package middleware

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/assessment-service/internal/utils"
	"go.uber.org/zap"
)

// Logger returns a Fiber middleware that logs every request with method, path,
// status code, client IP, and elapsed time.
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

// Recovery returns a Fiber middleware that catches any panic that occurs during
// request handling and responds with a 500 Internal Server Error instead of
// crashing the process.
func Recovery() fiber.Handler {
	return func(c fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("panic recovered: %v", r)

				_ = c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"code":    fiber.StatusInternalServerError,
					"message": "Internal server error",
				})
			}
		}()

		return c.Next()
	}
}
