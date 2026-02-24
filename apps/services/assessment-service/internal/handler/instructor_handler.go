package handler

import (
	"strings"

	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/service"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// InstructorHandler handles instructor-scoped assessment requests.
type InstructorHandler struct {
	assignmentService service.AssignmentService
	submissionService service.SubmissionService
	academicClient    *client.AcademicClient
	logger            *zap.Logger
}

// NewInstructorHandler creates a new InstructorHandler.
func NewInstructorHandler(
	assignmentService service.AssignmentService,
	submissionService service.SubmissionService,
	academicClient *client.AcademicClient,
	logger *zap.Logger,
) *InstructorHandler {
	return &InstructorHandler{
		assignmentService: assignmentService,
		submissionService: submissionService,
		academicClient:    academicClient,
		logger:            logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// extractToken pulls the raw JWT from the Authorization header.
func extractToken(c fiber.Ctx) string {
	auth := c.Get("Authorization")
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) == 2 && parts[0] == "Bearer" {
		return parts[1]
	}
	return ""
}

// instructorCourseIDs calls the Academic Service and returns the set of
// course_instance_id UUIDs the instructor is assigned to.
func (h *InstructorHandler) instructorCourseIDs(c fiber.Ctx) (map[uuid.UUID]bool, error) {
	token := extractToken(c)
	if token == "" {
		return nil, utils.ErrUnauthorized("user not authenticated")
	}

	courses, err := h.academicClient.GetInstructorCourses(token)
	if err != nil {
		h.logger.Error("failed to fetch instructor courses", zap.Error(err))
		return nil, utils.ErrInternal("failed to verify instructor courses", err)
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
// GET /api/v1/instructor-assignments/me
// ─────────────────────────────────────────────────────────────────────────────

// GetMyAssignments lists all assignments across the instructor's assigned
// course instances.
func (h *InstructorHandler) GetMyAssignments(c fiber.Ctx) error {
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}

	userID := requireUserID(c)

	var allAssignments []dto.AssignmentResponse
	for ciID := range courseIDs {
		assignments, err := h.assignmentService.ListAssignmentsByCourseInstance(ciID)
		if err != nil {
			h.logger.Warn("failed to list assignments for course instance",
				zap.String("course_instance_id", ciID.String()),
				zap.Error(err),
			)
			continue
		}
		for i := range assignments {
			// Enforce assignment ownership: only fetch assignments created by this instructor
			if assignments[i].CreatedBy == userID {
				allAssignments = append(allAssignments, toAssignmentResponse(&assignments[i]))
			}
		}
	}

	return c.Status(fiber.StatusOK).JSON(dto.ListAssignmentsResponse{
		Assignments: allAssignments,
		Count:       len(allAssignments),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/instructor-assignments
// ─────────────────────────────────────────────────────────────────────────────

// CreateAssignment creates a new assignment. The instructor must be assigned to
// the course instance specified in the request.
func (h *InstructorHandler) CreateAssignment(c fiber.Ctx) error {
	var req dto.CreateAssignmentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	// Verify the instructor is assigned to this course instance
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}
	if !courseIDs[req.CourseInstanceID] {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}
	createdBy := requireUserID(c)

	assignment, err := h.assignmentService.CreateAssignment(
		&req,
		createdBy,
		username,
		c.IP(),
		c.Get("User-Agent"),
	)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toAssignmentResponse(assignment))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-submissions/assignment/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetSubmissions lists all submissions for an assignment owned by one of the
// instructor's assigned course instances.
func (h *InstructorHandler) GetSubmissions(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	// Fetch the assignment to find its course_instance_id
	assignment, err := h.assignmentService.GetAssignmentByID(assignmentID)
	if err != nil {
		return err
	}
	if assignment == nil {
		return utils.ErrNotFound("assignment not found")
	}

	// Verify instructor is assigned to the assignment's course instance
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}
	if !courseIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	// List all submissions (nil user/group = all submissions)
	submissions, err := h.submissionService.ListSubmissions(assignmentID, nil, nil)
	if err != nil {
		return err
	}

	responses := make([]dto.SubmissionResponse, len(submissions))
	for i := range submissions {
		responses[i] = toInstructorSubmissionResponse(&submissions[i])
	}

	return c.Status(fiber.StatusOK).JSON(dto.ListSubmissionsResponse{
		Submissions: responses,
		Count:       len(responses),
	})
}

// toInstructorSubmissionResponse converts a domain.Submission to its DTO representation.
func toInstructorSubmissionResponse(s *domain.Submission) dto.SubmissionResponse {
	resp := dto.SubmissionResponse{
		ID:           s.ID,
		AssignmentID: s.AssignmentID,
		StoragePath:  s.StoragePath,
		Language:     s.Language,
		Status:       s.Status,
		Version:      s.Version,
		IsLatest:     s.IsLatest,
		Judge0JobID:  s.Judge0JobID,
		SubmittedAt:  s.SubmittedAt,
	}
	if s.UserID != nil {
		resp.UserID = s.UserID
	}
	if s.GroupID != nil {
		resp.GroupID = s.GroupID
	}
	return resp
}
