package handler

import (
	"context"
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/service"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"go.uber.org/zap"
)

// SubmissionHandler handles submission-related HTTP requests.
type SubmissionHandler struct {
	submissionService service.SubmissionService
	logger            *zap.Logger
}

// NewSubmissionHandler creates a new SubmissionHandler.
func NewSubmissionHandler(submissionService service.SubmissionService, logger *zap.Logger) *SubmissionHandler {
	return &SubmissionHandler{
		submissionService: submissionService,
		logger:            logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /submissions
// ─────────────────────────────────────────────────────────────────────────────

// CreateSubmission handles POST /submissions.
// It validates the request, versions the submission, persists the metadata row
// with status="queued", and publishes the job to the message queue for async
// MinIO upload.  Returns 202 Accepted immediately so the HTTP path is never
// blocked by object-storage I/O.  The caller must be authenticated; the user_id
// is extracted from the JWT locals populated by AuthMiddleware.
func (h *SubmissionHandler) CreateSubmission(c fiber.Ctx) error {
	var req dto.CreateSubmissionRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	userID := requireUserID(c)
	if userID == uuid.Nil {
		return utils.ErrUnauthorized("user not authenticated")
	}

	submission, err := h.submissionService.CreateSubmission(
		&req,
		userID,
		username,
		c.IP(),
		c.Get("User-Agent"),
	)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusAccepted).JSON(toSubmissionResponse(submission))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /submissions/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetSubmission handles GET /submissions/:id.
// Returns the submission metadata without the code body; use
// GET /submissions/:id/code to retrieve the source code from object storage.
func (h *SubmissionHandler) GetSubmission(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	submission, err := h.submissionService.GetSubmission(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toSubmissionResponse(submission))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /submissions/:id/code
// ─────────────────────────────────────────────────────────────────────────────

// GetSubmissionCode handles GET /submissions/:id/code.
// Retrieves the raw source code from MinIO and returns it together with
// identifying metadata so callers don't need a second round-trip.
func (h *SubmissionHandler) GetSubmissionCode(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	// Load metadata first so we can include it in the response envelope.
	submission, err := h.submissionService.GetSubmission(id)
	if err != nil {
		return err
	}

	code, err := h.submissionService.GetSubmissionCode(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(dto.SubmissionCodeResponse{
		SubmissionID: submission.ID,
		AssignmentID: submission.AssignmentID,
		Language:     submission.Language,
		Version:      submission.Version,
		Code:         code,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /submissions/:id  — immutable; always 405
// ─────────────────────────────────────────────────────────────────────────────

// UpdateSubmission handles PUT /submissions/:id.
// Submissions are immutable records — direct mutation is forbidden.
// Callers should create a new submission to produce the next version.
func (h *SubmissionHandler) UpdateSubmission(_ fiber.Ctx) error {
	return utils.ErrMethodNotAllowed("submissions are immutable; create a new submission to update")
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /assignments/:id/submissions
// ─────────────────────────────────────────────────────────────────────────────

// ListSubmissions handles GET /assignments/:id/submissions.
// Returns all submission versions for the given assignment and owner scope
// (user_id or group_id query param), sorted newest-first.
func (h *SubmissionHandler) ListSubmissions(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	userID, groupID, err := parseOwnerQueryParams(c)
	if err != nil {
		return err
	}

	submissions, err := h.submissionService.ListSubmissions(assignmentID, userID, groupID)
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
// GET /assignments/:id/latest
// ─────────────────────────────────────────────────────────────────────────────

// GetLatestSubmission handles GET /assignments/:id/latest.
// Returns the single submission with is_latest=true for the given assignment
// and owner scope (user_id or group_id query param).
func (h *SubmissionHandler) GetLatestSubmission(c fiber.Ctx) error {
	assignmentID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	userID, groupID, err := parseOwnerQueryParams(c)
	if err != nil {
		return err
	}

	submission, err := h.submissionService.GetLatestSubmission(assignmentID, userID, groupID)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toSubmissionResponse(submission))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /run-code
// ─────────────────────────────────────────────────────────────────────────────

// RunCode handles POST /run-code.
// Executes code via Judge0 without creating a persistent submission.
// Requires authentication and enrollment in the assignment's course.
func (h *SubmissionHandler) RunCode(c fiber.Ctx) error {
	var req dto.RunCodeRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	userID := requireUserID(c)
	if userID == uuid.Nil {
		return utils.ErrUnauthorized("user not authenticated")
	}

	ctx := context.Background()
	result, err := h.submissionService.RunCode(ctx, &req, userID)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(result)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// parseOwnerQueryParams reads the optional user_id and group_id query
// parameters.  Exactly one must be provided; both absent or both present
// returns a 400 error.
func parseOwnerQueryParams(c fiber.Ctx) (*uuid.UUID, *uuid.UUID, error) {
	rawUserID := c.Query("user_id")
	rawGroupID := c.Query("group_id")

	if rawUserID == "" && rawGroupID == "" {
		return nil, nil, utils.ErrBadRequest("one of user_id or group_id query parameter is required")
	}
	if rawUserID != "" && rawGroupID != "" {
		return nil, nil, utils.ErrBadRequest("only one of user_id or group_id may be provided")
	}

	if rawUserID != "" {
		id, err := parseQueryUUID(rawUserID, "user_id")
		if err != nil {
			return nil, nil, err
		}
		return &id, nil, nil
	}

	id, err := parseQueryUUID(rawGroupID, "group_id")
	if err != nil {
		return nil, nil, err
	}
	return nil, &id, nil
}

// toSubmissionResponse converts a domain.Submission to its DTO representation.
func toSubmissionResponse(s *domain.Submission) dto.SubmissionResponse {
	response := dto.SubmissionResponse{
		ID:           s.ID,
		AssignmentID: s.AssignmentID,
		UserID:       s.UserID,
		GroupID:      s.GroupID,
		StoragePath:  s.StoragePath,
		Language:     s.Language,
		LanguageID:   s.LanguageID,
		Status:       s.Status,
		Version:      s.Version,
		IsLatest:     s.IsLatest,
		Judge0JobID:  s.Judge0JobID,
		SubmittedAt:  s.SubmittedAt,
	}

	// Add execution results if available
	if s.ExecutionStatus != "" {
		response.ExecutionStdout = s.ExecutionStdout
		response.ExecutionStderr = s.ExecutionStderr
		response.CompileOutput = s.CompileOutput
		response.ExecutionStatus = s.ExecutionStatus
		response.ExecutionStatusID = s.ExecutionStatusID
		response.ExecutionTime = s.ExecutionTime
		response.MemoryUsed = s.MemoryUsed
		response.TestCasesPassed = s.TestCasesPassed
		response.TotalTestCases = s.TotalTestCases

		// Deserialize test case results if present
		if len(s.TestCaseResults) > 0 {
			var results []domain.TestCaseResult
			if err := json.Unmarshal(s.TestCaseResults, &results); err == nil {
				response.TestCaseResults = results
			}
		}
	}

	return response
}
