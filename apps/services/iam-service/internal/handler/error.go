package handler

import (
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/gofiber/fiber/v3"
)

func ErrorHandler(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	if e, ok := err.(*errors.AppError); ok {
		code = e.Code
		message = e.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"status":  code,
		"error":   message,
		"message": err.Error(),
	})
}
