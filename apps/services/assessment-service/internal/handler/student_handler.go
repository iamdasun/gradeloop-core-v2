package handler

import (
	"strings"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/service"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// StudentHandler handles student-scoped assessment requests such as listing
// assignments for enrolled courses and viewing own submissions.
type StudentHandler struct {
	assignmentService service.AssignmentService
	submissionService service.SubmissionService
	academicClient    *client.AcademicClient
	logger            *zap.Logger
}

// NewStudentHandler creates a new StudentHandler.
func NewStudentHandler(
	assignmentService service.AssignmentService,
	submissionService service.SubmissionService,
	academicClient *client.AcademicClient,
	logger *zap.Logger,
) *StudentHandler {
	return &StudentHandler{
		assignmentService: assignmentService,
		submissionService: submissionService,
		academicClient:    academicClient,
		logger:            logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// studentEnrolledCourseIDs calls the Academic Service with the student's token
// and returns a set of course_instance_id UUIDs the student is enrolled in.
func (h *StudentHandler) studentEnrolledCourseIDs(c fiber.Ctx) (map[uuid.UUID]bool, error) {
	auth := c.Get("Authorization")
	parts := strings.SplitN(auth, " ", 2)
	token := ""
	if len(parts) == 2 && parts[0] == "Bearer" {
		token = parts[1]
	}
	if token == "" {
		return nil, utils.ErrUnauthorized("user not authenticated")
	}

	courses, err := h.academicClient.GetStudentCourses(token)
	if err != nil {
		h.logger.Error("failed to fetch student enrolled courses", zap.Error(err))
		return nil, utils.ErrInternal("failed to verify student enrollment", err)
	}

	ids := make(map[uuid.UUID]bool, len(courses))
	for _, course := range courses {
		id, err := uuid.Parse(course.CourseInstanceID)
		if err == nil {
			ids[id] = true
		}
	}

	return ids, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/student-assignments?course_instance_id=:id
// ─────────────────────────────────────────────────────────────────────────────

// ListMyAssignments lists all active assignments for a course instance the
// authenticated student is enrolled in.
func (h *StudentHandler) ListMyAssignments(c fiber.Ctx) error {
	rawCourseInstanceID := c.Query("course_instance_id")
	if rawCourseInstanceID == "" {
		return utils.ErrBadRequest("course_instance_id query parameter is required")
	}

	courseInstanceID, err := parseQueryUUID(rawCourseInstanceID, "course_instance_id")
	if err != nil {
		return err
	}

	// Verify the student is enrolled in this course instance.
	enrolledIDs, err := h.studentEnrolledCourseIDs(c)
	if err != nil {
		return err
	}
	if !enrolledIDs[courseInstanceID] {
		return utils.ErrForbidden("you are not enrolled in this course instance")
	}

	assignments, err := h.assignmentService.ListAssignmentsByCourseInstance(courseInstanceID)
	if err != nil {
		return err
	}

	responses := make([]dto.AssignmentResponse, len(assignments))
	for i := range assignments {
		responses[i] = toAssignmentResponse(&assignments[i])
	}

	return c.Status(fiber.StatusOK).JSON(dto.ListAssignmentsResponse{
		Assignments: responses,
		Count:       len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/student-assignments/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetAssignment returns a single assignment by ID.
// The authenticated student must be enrolled in the assignment's course instance.
func (h *StudentHandler) GetAssignment(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(id)
	if err != nil {
		return err
	}
	if assignment == nil {
		return utils.ErrNotFound("assignment not found")
	}

	// Verify the student is enrolled in the course instance that owns this assignment.
	enrolledIDs, err := h.studentEnrolledCourseIDs(c)
	if err != nil {
		return err
	}
	if !enrolledIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not enrolled in this course instance")
	}

	return c.Status(fiber.StatusOK).JSON(toAssignmentResponse(assignment))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/student-assignments/:id/sample-answer
// ─────────────────────────────────────────────────────────────────────────────

// GetAssignmentSampleAnswer returns the sample answer for an assignment.
// Used by the frontend to compute semantic similarity after a student submits.
// The authenticated student must be enrolled in the assignment's course instance.
func (h *StudentHandler) GetAssignmentSampleAnswer(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(assignmentID)
	if err != nil {
		return err
	}
	if assignment == nil {
		return utils.ErrNotFound("assignment not found")
	}

	// Verify the student is enrolled in the course instance that owns this assignment.
	enrolledIDs, err := h.studentEnrolledCourseIDs(c)
	if err != nil {
		return err
	}
	if !enrolledIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not enrolled in this course instance")
	}

	answer, err := h.assignmentService.GetAssignmentSampleAnswer(assignmentID)
	if err != nil {
		return err
	}
	if answer == nil {
		return utils.ErrNotFound("no sample answer for this assignment")
	}

	return c.Status(fiber.StatusOK).JSON(dto.SampleAnswerResponse{
		ID:           answer.ID.String(),
		AssignmentID: assignmentID.String(),
		LanguageID:   answer.LanguageID,
		Language:     answer.Language,
		Code:         answer.Code,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/student-submissions/me?assignment_id=:id
// ─────────────────────────────────────────────────────────────────────────────

// ListMySubmissions lists all submission versions the authenticated student
// has made for the given assignment.
func (h *StudentHandler) ListMySubmissions(c fiber.Ctx) error {
	rawAssignmentID := c.Query("assignment_id")
	if rawAssignmentID == "" {
		return utils.ErrBadRequest("assignment_id query parameter is required")
	}

	assignmentID, err := parseQueryUUID(rawAssignmentID, "assignment_id")
	if err != nil {
		return err
	}

	userID := requireUserID(c)
	if userID == uuid.Nil {
		return utils.ErrUnauthorized("user not authenticated")
	}

	submissions, err := h.submissionService.ListSubmissions(assignmentID, &userID, nil)
	if err != nil {
		return err
	}

	responses := make([]dto.SubmissionResponse, len(submissions))
	for i := range submissions {
		responses[i] = toSubmissionResponse(&submissions[i])
	}

	return c.Status(fiber.StatusOK).JSON(dto.ListSubmissionsResponse{
		Submissions: responses,
		Count:       len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/student-submissions/me/latest?assignment_id=:id
// ─────────────────────────────────────────────────────────────────────────────

// GetMyLatestSubmission returns the single latest (is_latest=true) submission
// for the authenticated student and the given assignment.
func (h *StudentHandler) GetMyLatestSubmission(c fiber.Ctx) error {
	rawAssignmentID := c.Query("assignment_id")
	if rawAssignmentID == "" {
		return utils.ErrBadRequest("assignment_id query parameter is required")
	}

	assignmentID, err := parseQueryUUID(rawAssignmentID, "assignment_id")
	if err != nil {
		return err
	}

	userID := requireUserID(c)
	if userID == uuid.Nil {
		return utils.ErrUnauthorized("user not authenticated")
	}

	submission, err := h.submissionService.GetLatestSubmission(assignmentID, &userID, nil)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toSubmissionResponse(submission))
}
