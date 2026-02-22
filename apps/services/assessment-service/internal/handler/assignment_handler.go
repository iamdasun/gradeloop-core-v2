package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/assessment-service/internal/dto"
	"github.com/gradeloop/assessment-service/internal/service"
	"github.com/gradeloop/assessment-service/internal/utils"
	"go.uber.org/zap"
)

// AssignmentHandler handles assignment-related HTTP requests.
type AssignmentHandler struct {
	assignmentService service.AssignmentService
	logger            *zap.Logger
}

// NewAssignmentHandler creates a new AssignmentHandler.
func NewAssignmentHandler(assignmentService service.AssignmentService, logger *zap.Logger) *AssignmentHandler {
	return &AssignmentHandler{
		assignmentService: assignmentService,
		logger:            logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /assignments
// ─────────────────────────────────────────────────────────────────────────────

// CreateAssignment handles POST /assignments.
// It creates a new assignment linked to a CourseInstance from the Academics
// Service (logical reference — no FK enforced here).
func (h *AssignmentHandler) CreateAssignment(c fiber.Ctx) error {
	var req dto.CreateAssignmentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
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
// GET /assignments/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetAssignment handles GET /assignments/:id.
// Returns the assignment only if is_active = true.
func (h *AssignmentHandler) GetAssignment(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	assignment, err := h.assignmentService.GetAssignmentByID(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toAssignmentResponse(assignment))
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /assignments/:id
// ─────────────────────────────────────────────────────────────────────────────

// UpdateAssignment handles PATCH /assignments/:id.
// When the request body contains {"is_active": false} the assignment is
// soft-deleted and the audit action becomes ASSIGNMENT_DEACTIVATED.
// All other config fields may be updated in the same call.
func (h *AssignmentHandler) UpdateAssignment(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.UpdateAssignmentRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	assignment, err := h.assignmentService.UpdateAssignment(
		id,
		&req,
		username,
		c.IP(),
		c.Get("User-Agent"),
	)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toAssignmentResponse(assignment))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /assignments/course-instance/:courseInstanceId
// ─────────────────────────────────────────────────────────────────────────────

// ListAssignmentsByCourseInstance handles GET /assignments/course-instance/:courseInstanceId.
// Returns all active assignments belonging to the given CourseInstance.
// This route must be registered BEFORE GET /assignments/:id so that Fiber does
// not treat the literal segment "course-instance" as a UUID param value.
func (h *AssignmentHandler) ListAssignmentsByCourseInstance(c fiber.Ctx) error {
	courseInstanceID, err := parseUUID(c, "courseInstanceId")
	if err != nil {
		return err
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
