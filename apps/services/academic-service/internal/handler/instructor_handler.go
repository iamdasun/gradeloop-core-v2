package handler

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// InstructorHandler handles instructor-scoped HTTP requests.
// These endpoints are accessible to instructors, admins, and super admins.
type InstructorHandler struct {
	courseInstructorService service.CourseInstructorService
	enrollmentService       service.EnrollmentService
	courseService           service.CourseService
	iamClient               *client.IAMClient
	logger                  *zap.Logger
}

// NewInstructorHandler creates a new InstructorHandler.
func NewInstructorHandler(
	courseInstructorService service.CourseInstructorService,
	enrollmentService service.EnrollmentService,
	courseService service.CourseService,
	iamClient *client.IAMClient,
	logger *zap.Logger,
) *InstructorHandler {
	return &InstructorHandler{
		courseInstructorService: courseInstructorService,
		enrollmentService:       enrollmentService,
		courseService:           courseService,
		iamClient:               iamClient,
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
// instructor, including course details (code and title).
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
		// Fetch course instance to get the course_id
		courseInstance, err := h.courseInstructorService.GetCourseInstance(a.CourseInstanceID)
		if err != nil {
			h.logger.Warn("failed to fetch course instance", zap.Error(err), zap.String("instance_id", a.CourseInstanceID.String()))
			// Continue without course details if fetch fails
			responses[i] = dto.CourseInstructorResponse{
				CourseInstanceID: a.CourseInstanceID,
				UserID:           a.UserID,
				Role:             a.Role,
			}
			continue
		}

		// Fetch course details
		course, err := h.courseService.GetCourse(courseInstance.CourseID)
		if err != nil {
			h.logger.Warn("failed to fetch course details", zap.Error(err), zap.String("course_id", courseInstance.CourseID.String()))
			// Continue without course details if fetch fails
			responses[i] = dto.CourseInstructorResponse{
				CourseInstanceID: a.CourseInstanceID,
				UserID:           a.UserID,
				Role:             a.Role,
			}
			continue
		}

		responses[i] = dto.CourseInstructorResponse{
			CourseInstanceID: a.CourseInstanceID,
			CourseCode:       course.Code,
			CourseTitle:      course.Title,
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
// that the authenticated instructor is assigned to, including student profile details.
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
		// Fetch user info
		token := c.Get("Authorization")
		userInfo, err := h.iamClient.GetUserInfo(context.Background(), token, e.UserID.String())
		if err != nil {
			h.logger.Warn("failed to fetch user info", zap.Error(err), zap.String("user_id", e.UserID.String()))
			// Continue without profile details if fetch fails
			responses[i] = dto.EnrollmentResponse{
				CourseInstanceID: e.CourseInstanceID,
				UserID:           e.UserID,
				Status:           e.Status,
				FinalGrade:       e.FinalGrade,
				EnrolledAt:       e.EnrolledAt,
			}
			continue
		}

		responses[i] = dto.EnrollmentResponse{
			CourseInstanceID: e.CourseInstanceID,
			UserID:           e.UserID,
			StudentID:        userInfo.StudentID,
			FullName:         userInfo.FullName,
			Email:            userInfo.Email,
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
// that the authenticated instructor is assigned to, including employee profile details.
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
		// Fetch course details for course code and title
		courseInstance, err := h.courseInstructorService.GetCourseInstance(inst.CourseInstanceID)
		if err != nil {
			h.logger.Warn("failed to fetch course instance", zap.Error(err), zap.String("instance_id", inst.CourseInstanceID.String()))
			responses[i] = dto.CourseInstructorResponse{
				CourseInstanceID: inst.CourseInstanceID,
				UserID:           inst.UserID,
				Role:             inst.Role,
			}
			continue
		}

		course, err := h.courseService.GetCourse(courseInstance.CourseID)
		if err != nil {
			h.logger.Warn("failed to fetch course details", zap.Error(err), zap.String("course_id", courseInstance.CourseID.String()))
			responses[i] = dto.CourseInstructorResponse{
				CourseInstanceID: inst.CourseInstanceID,
				UserID:           inst.UserID,
				Role:             inst.Role,
			}
			continue
		}

		// Fetch employee profile
		token := c.Get("Authorization")
		userInfo, err := h.iamClient.GetUserInfo(context.Background(), token, inst.UserID.String())
		if err != nil {
			h.logger.Warn("failed to fetch user info", zap.Error(err), zap.String("user_id", inst.UserID.String()))
			// Continue without profile details if fetch fails
			responses[i] = dto.CourseInstructorResponse{
				CourseInstanceID: inst.CourseInstanceID,
				CourseCode:       course.Code,
				CourseTitle:      course.Title,
				UserID:           inst.UserID,
				Role:             inst.Role,
			}
			continue
		}

		responses[i] = dto.CourseInstructorResponse{
			CourseInstanceID: inst.CourseInstanceID,
			CourseCode:       course.Code,
			CourseTitle:      course.Title,
			UserID:           inst.UserID,
			Designation:      userInfo.Designation,
			FullName:         userInfo.FullName,
			Email:            userInfo.Email,
			Role:             inst.Role,
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"instructors": responses,
		"count":       len(responses),
	})
}
