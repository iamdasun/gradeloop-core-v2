package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// EnrollmentHandler handles student enrollment HTTP requests.
type EnrollmentHandler struct {
	enrollmentService service.EnrollmentService
	logger            *zap.Logger
}

// NewEnrollmentHandler creates a new EnrollmentHandler.
func NewEnrollmentHandler(enrollmentService service.EnrollmentService, logger *zap.Logger) *EnrollmentHandler {
	return &EnrollmentHandler{
		enrollmentService: enrollmentService,
		logger:            logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /enrollments
// ─────────────────────────────────────────────────────────────────────────────

// EnrollStudent handles POST /enrollments
func (h *EnrollmentHandler) EnrollStudent(c fiber.Ctx) error {
	var req dto.EnrollmentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	enrollment, err := h.enrollmentService.EnrollStudent(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toEnrollmentResponse(enrollment))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /course-instances/:id/enrollments
// ─────────────────────────────────────────────────────────────────────────────

// GetEnrollments handles GET /course-instances/:id/enrollments
func (h *EnrollmentHandler) GetEnrollments(c fiber.Ctx) error {
	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	enrollments, err := h.enrollmentService.GetEnrollments(instanceID)
	if err != nil {
		return err
	}

	responses := make([]dto.EnrollmentResponse, len(enrollments))
	for i, e := range enrollments {
		responses[i] = *toEnrollmentResponse(&e)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"enrollments": responses,
		"count":       len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /enrollments/:instanceID/:userID
// ─────────────────────────────────────────────────────────────────────────────

// UpdateEnrollment handles PUT /enrollments/:instanceID/:userID
func (h *EnrollmentHandler) UpdateEnrollment(c fiber.Ctx) error {
	instanceID, err := parseUUID(c, "instanceID")
	if err != nil {
		return err
	}

	userID, err := parseUUID(c, "userID")
	if err != nil {
		return err
	}

	var req dto.UpdateEnrollmentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	enrollment, err := h.enrollmentService.UpdateEnrollment(instanceID, userID, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toEnrollmentResponse(enrollment))
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

// toEnrollmentResponse converts a domain.Enrollment to its DTO representation.
func toEnrollmentResponse(e *domain.Enrollment) *dto.EnrollmentResponse {
	return &dto.EnrollmentResponse{
		CourseInstanceID: e.CourseInstanceID,
		UserID:           e.UserID,
		Status:           e.Status,
		FinalGrade:       e.FinalGrade,
		EnrolledAt:       e.EnrolledAt,
	}
}
