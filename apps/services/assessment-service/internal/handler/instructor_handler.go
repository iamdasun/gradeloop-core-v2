package handler

import (
	"encoding/json"
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
// course instances. Optionally filter by ?course_instance_id=uuid.
func (h *InstructorHandler) GetMyAssignments(c fiber.Ctx) error {
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}

	userID := requireUserID(c)

	// Optional filter by course_instance_id query parameter
	filterCourseID := c.Query("course_instance_id")
	var targetCourseIDs map[uuid.UUID]bool

	if filterCourseID != "" {
		filterID, err := uuid.Parse(filterCourseID)
		if err != nil {
			return utils.ErrBadRequest("invalid course_instance_id format")
		}
		// Verify instructor is assigned to this course instance
		if !courseIDs[filterID] {
			return utils.ErrForbidden("you are not assigned to this course instance")
		}
		// Only query this one course instance
		targetCourseIDs = map[uuid.UUID]bool{filterID: true}
	} else {
		// Query all assigned course instances
		targetCourseIDs = courseIDs
	}

	var allAssignments []dto.AssignmentResponse
	for ciID := range targetCourseIDs {
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

	// List all submissions across all owners (instructor-scoped: no user/group filter).
	submissions, err := h.submissionService.ListAllSubmissionsForAssignment(assignmentID)
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-assignments/:id/rubric
// ─────────────────────────────────────────────────────────────────────────────

func (h *InstructorHandler) GetAssignmentRubric(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(assignmentID)
	if err != nil {
		return err
	}
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}
	if !courseIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	criteria, err := h.assignmentService.GetAssignmentRubric(assignmentID)
	if err != nil {
		return err
	}

	items := make([]dto.RubricCriterionResponse, 0, len(criteria))
	totalWeight := 0
	for _, cr := range criteria {
		totalWeight += cr.Weight
		items = append(items, dto.RubricCriterionResponse{
			ID:          cr.ID.String(),
			Name:        cr.Name,
			Description: cr.Description,
			GradingMode: cr.GradingMode,
			Weight:      cr.Weight,
			Bands:       json.RawMessage(cr.Bands),
			OrderIndex:  cr.OrderIndex,
		})
	}
	return c.Status(fiber.StatusOK).JSON(dto.ListRubricResponse{
		AssignmentID: assignmentID.String(),
		Criteria:     items,
		TotalWeight:  totalWeight,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-assignments/:id/test-cases
// ─────────────────────────────────────────────────────────────────────────────

func (h *InstructorHandler) GetAssignmentTestCases(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(assignmentID)
	if err != nil {
		return err
	}
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}
	if !courseIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not assigned to this course instance")
	}

	testCases, err := h.assignmentService.GetAssignmentTestCases(assignmentID)
	if err != nil {
		return err
	}

	items := make([]dto.TestCaseResponse, 0, len(testCases))
	for _, tc := range testCases {
		items = append(items, dto.TestCaseResponse{
			ID:             tc.ID.String(),
			Description:    tc.Description,
			Input:          tc.Input,
			ExpectedOutput: tc.ExpectedOutput,
			IsHidden:       tc.IsHidden,
			OrderIndex:     tc.OrderIndex,
		})
	}
	return c.Status(fiber.StatusOK).JSON(dto.ListTestCasesResponse{
		AssignmentID: assignmentID.String(),
		TestCases:    items,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/instructor-assignments/:id/sample-answer
// ─────────────────────────────────────────────────────────────────────────────

func (h *InstructorHandler) GetAssignmentSampleAnswer(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(assignmentID)
	if err != nil {
		return err
	}
	courseIDs, err := h.instructorCourseIDs(c)
	if err != nil {
		return err
	}
	if !courseIDs[assignment.CourseInstanceID] {
		return utils.ErrForbidden("you are not assigned to this course instance")
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
