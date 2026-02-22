package utils

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v3"
)

type AppError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Err     error  `json:"-"`
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Message
}

func NewAppError(code int, message string, err error) *AppError {
	return &AppError{
		Code:    code,
		Message: message,
		Err:     err,
	}
}

func ErrorHandler(c fiber.Ctx, err error) error {
	var appErr *AppError

	if errors.As(err, &appErr) {
		return c.Status(appErr.Code).JSON(fiber.Map{
			"code":    appErr.Code,
			"message": appErr.Message,
		})
	}

	code := http.StatusInternalServerError
	message := "Internal server error"

	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) {
		code = fiberErr.Code
		message = fiberErr.Message
	}

	return c.Status(code).JSON(fiber.Map{
		"code":    code,
		"message": message,
	})
}

func ErrNotFound(message string) *AppError {
	return NewAppError(http.StatusNotFound, message, nil)
}

func ErrBadRequest(message string) *AppError {
	return NewAppError(http.StatusBadRequest, message, nil)
}

func ErrUnauthorized(message string) *AppError {
	return NewAppError(http.StatusUnauthorized, message, nil)
}

func ErrInternal(message string, err error) *AppError {
	return NewAppError(http.StatusInternalServerError, message, err)
}

func ErrConflict(message string) *AppError {
	return NewAppError(http.StatusConflict, message, nil)
}

func ErrForbidden(message string) *AppError {
	return NewAppError(http.StatusForbidden, message, nil)
}
