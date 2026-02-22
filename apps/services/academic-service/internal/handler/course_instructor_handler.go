package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// CourseInstructorHandler handles course-instructor HTTP requests.
type CourseInstructorHandler struct {
	courseInstructorService service.CourseInstructorService
	logger                  *zap.Logger
}

// NewCourseInstructorHandler creates a new CourseInstructorHandler.
func NewCourseInstructorHandler(courseInstructorService service.CourseInstructorService, logger *zap.Logger) *CourseInstructorHandler {
	return &CourseInstructorHandler{
		courseInstructorService: courseInstructorService,
		logger:                  logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /course-instructors
// ─────────────────────────────────────────────────────────────────────────────

// AssignInstructor handles POST /course-instructors
func (h *CourseInstructorHandler) AssignInstructor(c fiber.Ctx) error {
	var req dto.AssignInstructorRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	instructor, err := h.courseInstructorService.AssignInstructor(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toCourseInstructorResponse(instructor))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /course-instances/:id/instructors
// ─────────────────────────────────────────────────────────────────────────────

// GetInstructors handles GET /course-instances/:id/instructors
func (h *CourseInstructorHandler) GetInstructors(c fiber.Ctx) error {
	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	instructors, err := h.courseInstructorService.GetInstructors(instanceID)
	if err != nil {
		return err
	}

	responses := make([]dto.CourseInstructorResponse, len(instructors))
	for i, inst := range instructors {
		responses[i] = *toCourseInstructorResponse(&inst)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"instructors": responses,
		"count":       len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /course-instructors/:instanceID/:userID
// ─────────────────────────────────────────────────────────────────────────────

// RemoveInstructor handles DELETE /course-instructors/:instanceID/:userID
func (h *CourseInstructorHandler) RemoveInstructor(c fiber.Ctx) error {
	instanceID, err := parseUUID(c, "instanceID")
	if err != nil {
		return err
	}

	userID, err := parseUUID(c, "userID")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.courseInstructorService.RemoveInstructor(instanceID, userID, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "instructor removed successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

// toCourseInstructorResponse converts a domain.CourseInstructor to its DTO
// representation.
func toCourseInstructorResponse(ci *domain.CourseInstructor) *dto.CourseInstructorResponse {
	return &dto.CourseInstructorResponse{
		CourseInstanceID: ci.CourseInstanceID,
		UserID:           ci.UserID,
		Role:             ci.Role,
	}
}
