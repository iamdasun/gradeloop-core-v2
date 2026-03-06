package handler

import (
	"context"
	"errors"
	"net/http"

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
	batchService            service.BatchService
	batchMemberService      service.BatchMemberService
	iamClient               *client.IAMClient
	logger                  *zap.Logger
}

// NewInstructorHandler creates a new InstructorHandler.
func NewInstructorHandler(
	courseInstructorService service.CourseInstructorService,
	enrollmentService service.EnrollmentService,
	courseService service.CourseService,
	batchService service.BatchService,
	batchMemberService service.BatchMemberService,
	iamClient *client.IAMClient,
	logger *zap.Logger,
) *InstructorHandler {
	return &InstructorHandler{
		courseInstructorService: courseInstructorService,
		enrollmentService:       enrollmentService,
		courseService:           courseService,
		batchService:            batchService,
		batchMemberService:      batchMemberService,
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

// verifyInstructorAssignment checks the instructor is assigned to the course instance.
func (h *InstructorHandler) verifyInstructorAssignment(instanceID, userID uuid.UUID) error {
	instructors, err := h.courseInstructorService.GetInstructors(instanceID)
	if err != nil {
		return err
	}
	for _, inst := range instructors {
		if inst.UserID == userID {
			return nil
		}
	}
	return utils.ErrForbidden("you are not assigned to this course instance")
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/instructor-courses/:id/enrollments
// ─────────────────────────────────────────────────────────────────────────────

// EnrollStudent enrolls an individual student in the course instance.
func (h *InstructorHandler) EnrollStudent(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	if err := h.verifyInstructorAssignment(instanceID, userID); err != nil {
		return err
	}

	var body struct {
		UserID string `json:"user_id"`
		Status string `json:"status"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	enrollUserID, err := uuid.Parse(body.UserID)
	if err != nil {
		return utils.ErrBadRequest("invalid user_id")
	}

	status := body.Status
	if status == "" {
		status = "Enrolled"
	}

	username := requireUsername(c)

	enrollment, err := h.enrollmentService.EnrollStudent(&dto.EnrollmentRequest{
		CourseInstanceID: instanceID,
		UserID:           enrollUserID,
		Status:           status,
		AllowIndividual:  true,
	}, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	resp := dto.EnrollmentResponse{
		CourseInstanceID: enrollment.CourseInstanceID,
		UserID:           enrollment.UserID,
		Status:           enrollment.Status,
		FinalGrade:       enrollment.FinalGrade,
		EnrolledAt:       enrollment.EnrolledAt,
	}

	token := c.Get("Authorization")
	userInfo, iamErr := h.iamClient.GetUserInfo(context.Background(), token, enrollUserID.String())
	if iamErr == nil && userInfo != nil {
		resp.StudentID = userInfo.StudentID
		resp.FullName = userInfo.FullName
		resp.Email = userInfo.Email
	}

	return c.Status(fiber.StatusCreated).JSON(resp)
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/instructor-courses/:id/students/:userID
// ─────────────────────────────────────────────────────────────────────────────

// UnenrollStudent removes a student's enrollment from the course instance.
func (h *InstructorHandler) UnenrollStudent(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	targetUserID, err := parseUUID(c, "userID")
	if err != nil {
		return err
	}

	if err := h.verifyInstructorAssignment(instanceID, userID); err != nil {
		return err
	}

	username := requireUsername(c)

	if err := h.enrollmentService.RemoveEnrollment(instanceID, targetUserID, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/instructor-courses/:id/enroll-batch
// ─────────────────────────────────────────────────────────────────────────────

// EnrollBatch enrolls all members of a batch. Already-enrolled students are
// skipped; partial success details are returned in the response.
func (h *InstructorHandler) EnrollBatch(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	if err := h.verifyInstructorAssignment(instanceID, userID); err != nil {
		return err
	}

	var req dto.EnrollBatchRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}
	if req.BatchID == uuid.Nil {
		return utils.ErrBadRequest("batch_id is required")
	}

	members, err := h.batchMemberService.GetBatchMembers(req.BatchID)
	if err != nil {
		return err
	}

	if len(members) == 0 {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"enrolled": 0, "skipped": 0, "total": 0, "skipped_users": []interface{}{},
		})
	}

	username := requireUsername(c)
	enrolled := 0
	skipped := 0
	skippedUsers := make([]uuid.UUID, 0)

	for _, member := range members {
		_, enrollErr := h.enrollmentService.EnrollStudent(&dto.EnrollmentRequest{
			CourseInstanceID: instanceID,
			UserID:           member.UserID,
			Status:           "Enrolled",
			AllowIndividual:  true,
		}, username, c.IP(), c.Get("User-Agent"))
		if enrollErr != nil {
			var appErr *utils.AppError
			if errors.As(enrollErr, &appErr) && appErr.Code == http.StatusConflict {
				skipped++
				skippedUsers = append(skippedUsers, member.UserID)
			} else {
				return enrollErr
			}
		} else {
			enrolled++
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"enrolled":      enrolled,
		"skipped":       skipped,
		"total":         len(members),
		"skipped_users": skippedUsers,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-courses/batches
// ─────────────────────────────────────────────────────────────────────────────

// ListAvailableBatches returns all active batches with member counts.
// Used by the Add Students modal so instructors can enroll an entire batch.
func (h *InstructorHandler) ListAvailableBatches(c fiber.Ctx) error {
	if _, err := instructorUserID(c); err != nil {
		return err
	}

	batches, err := h.batchService.ListBatches(false)
	if err != nil {
		return err
	}

	results := make([]dto.BatchEnrollmentStats, 0, len(batches))
	for _, b := range batches {
		members, memberErr := h.batchMemberService.GetBatchMembers(b.ID)
		memberCount := 0
		if memberErr == nil {
			memberCount = len(members)
		}
		results = append(results, dto.BatchEnrollmentStats{
			BatchID:      b.ID,
			Name:         b.Name,
			Code:         b.Code,
			StartYear:    b.StartYear,
			EndYear:      b.EndYear,
			IsActive:     b.IsActive,
			TotalMembers: memberCount,
		})
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"batches": results,
		"count":   len(results),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-courses/:id/enrolled-batches
// ─────────────────────────────────────────────────────────────────────────────

// GetEnrolledBatches returns active batches that have ≥1 member enrolled in
// the given course instance, with per-batch enrollment counts.
func (h *InstructorHandler) GetEnrolledBatches(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	if err := h.verifyInstructorAssignment(instanceID, userID); err != nil {
		return err
	}

	enrollments, err := h.enrollmentService.GetEnrollments(instanceID)
	if err != nil {
		return err
	}

	enrolledSet := make(map[uuid.UUID]struct{}, len(enrollments))
	for _, e := range enrollments {
		enrolledSet[e.UserID] = struct{}{}
	}

	batches, err := h.batchService.ListBatches(false)
	if err != nil {
		return err
	}

	results := make([]dto.BatchEnrollmentStats, 0)
	for _, b := range batches {
		members, memberErr := h.batchMemberService.GetBatchMembers(b.ID)
		if memberErr != nil {
			h.logger.Warn("failed to get batch members", zap.Error(memberErr), zap.String("batch_id", b.ID.String()))
			continue
		}

		enrolledCount := 0
		for _, m := range members {
			if _, ok := enrolledSet[m.UserID]; ok {
				enrolledCount++
			}
		}

		if enrolledCount > 0 {
			results = append(results, dto.BatchEnrollmentStats{
				BatchID:       b.ID,
				Name:          b.Name,
				Code:          b.Code,
				StartYear:     b.StartYear,
				EndYear:       b.EndYear,
				IsActive:      b.IsActive,
				TotalMembers:  len(members),
				EnrolledCount: enrolledCount,
			})
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"batches": results,
		"count":   len(results),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/instructor-courses/:id/enrolled-batches/:batchID
// ─────────────────────────────────────────────────────────────────────────────

// UnenrollBatch removes all batch members from the course instance enrollment.
// Members who are not enrolled are silently skipped.
func (h *InstructorHandler) UnenrollBatch(c fiber.Ctx) error {
	userID, err := instructorUserID(c)
	if err != nil {
		return err
	}

	instanceID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	batchID, err := parseUUID(c, "batchID")
	if err != nil {
		return err
	}

	if err := h.verifyInstructorAssignment(instanceID, userID); err != nil {
		return err
	}

	members, err := h.batchMemberService.GetBatchMembers(batchID)
	if err != nil {
		return err
	}

	username := requireUsername(c)
	removed := 0

	for _, member := range members {
		if removeErr := h.enrollmentService.RemoveEnrollment(instanceID, member.UserID, username, c.IP(), c.Get("User-Agent")); removeErr != nil {
			var appErr *utils.AppError
			if errors.As(removeErr, &appErr) && appErr.Code == http.StatusNotFound {
				continue // not enrolled — skip silently
			}
			return removeErr
		}
		removed++
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"removed": removed,
		"total":   len(members),
	})
}
