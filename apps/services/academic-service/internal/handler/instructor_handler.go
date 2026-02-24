package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// InstructorHandler handles instructor-scoped HTTP requests.
// These endpoints are accessible to employees, admins, and super admins.
type InstructorHandler struct {
	courseInstructorService service.CourseInstructorService
	enrollmentService       service.EnrollmentService
	logger                  *zap.Logger
}

// NewInstructorHandler creates a new InstructorHandler.
func NewInstructorHandler(
	courseInstructorService service.CourseInstructorService,
	enrollmentService service.EnrollmentService,
	logger *zap.Logger,
) *InstructorHandler {
	return &InstructorHandler{
		courseInstructorService: courseInstructorService,
		enrollmentService:       enrollmentService,
		logger:                  logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract user_id from JWT locals
// ─────────────────────────────────────────────────────────────────────────────

func instructorUserID(c fiber.Ctx) (uuid.UUID, error) {
	raw, _ := c.Locals("user_id").(string)
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, utils.ErrUnauthorized("user not authenticated")
	}
	return id, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-courses/me
// ─────────────────────────────────────────────────────────────────────────────

// GetMyCourses returns all course instance assignments for the authenticated
// instructor.
func (h *InstructorHandler) GetMyCourses(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	assignments, err := h.courseInstructorService.GetMyInstances(userID)
	if err != nil {
		return err
	}

	responses := make([]dto.CourseInstructorResponse, len(assignments))
	for i, a := range assignments {
		responses[i] = dto.CourseInstructorResponse{
			CourseInstanceID: a.CourseInstanceID,
			UserID:           a.UserID,
			Role:             a.Role,
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"courses": responses,
		"count":   len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-courses/:id/students
// ─────────────────────────────────────────────────────────────────────────────

// GetMyStudents returns all enrolled students for a specific course instance
// that the authenticated instructor is assigned to.
func (h *InstructorHandler) GetMyStudents(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	// Verify the instructor is assigned to this course instance
	instructor, err := h.courseInstructorService.GetInstructors(instanceID)
	if err != nil {
		return err
	}

	assigned := false
	for _, inst := range instructor {
		if inst.UserID == userID {
			assigned = true
			break
		}
	}
	if !assigned {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	// Fetch enrollments
	enrollments, err := h.enrollmentService.GetEnrollments(instanceID)
	if err != nil {
		return err
	}

	responses := make([]dto.EnrollmentResponse, len(enrollments))
	for i, e := range enrollments {
		responses[i] = dto.EnrollmentResponse{
			CourseInstanceID: e.CourseInstanceID,
			UserID:           e.UserID,
			Status:           e.Status,
			FinalGrade:       e.FinalGrade,
			EnrolledAt:       e.EnrolledAt,
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"enrollments": responses,
		"count":       len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-courses/:id/instructors
// ─────────────────────────────────────────────────────────────────────────────

// GetMyInstructors returns all co-instructors for a specific course instance
// that the authenticated instructor is assigned to.
func (h *InstructorHandler) GetMyInstructors(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	// Fetch all instructors — also serves as assignment verification
	instructors, err := h.courseInstructorService.GetInstructors(instanceID)
	if err != nil {
		return err
	}

	assigned := false
	for _, inst := range instructors {
		if inst.UserID == userID {
			assigned = true
			break
		}
	}
	if !assigned {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	responses := make([]dto.CourseInstructorResponse, len(instructors))
	for i, inst := range instructors {
		responses[i] = dto.CourseInstructorResponse{
			CourseInstanceID: inst.CourseInstanceID,
			UserID:           inst.UserID,
			Role:             inst.Role,
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"instructors": responses,
		"count":       len(responses),
	})
}
