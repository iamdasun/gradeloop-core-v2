package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// CourseInstanceHandler handles course-instance HTTP requests.
type CourseInstanceHandler struct {
	courseInstanceService service.CourseInstanceService
	logger                *zap.Logger
}

// NewCourseInstanceHandler creates a new CourseInstanceHandler.
func NewCourseInstanceHandler(courseInstanceService service.CourseInstanceService, logger *zap.Logger) *CourseInstanceHandler {
	return &CourseInstanceHandler{
		courseInstanceService: courseInstanceService,
		logger:                logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /course-instances
// ─────────────────────────────────────────────────────────────────────────────

// CreateCourseInstance handles POST /course-instances
func (h *CourseInstanceHandler) CreateCourseInstance(c fiber.Ctx) error {
	var req dto.CreateCourseInstanceRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	instance, err := h.courseInstanceService.CreateCourseInstance(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toCourseInstanceResponse(instance))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /course-instances/:id
// ─────────────────────────────────────────────────────────────────────────────

// UpdateCourseInstance handles PUT /course-instances/:id
func (h *CourseInstanceHandler) UpdateCourseInstance(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.UpdateCourseInstanceRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	instance, err := h.courseInstanceService.UpdateCourseInstance(id, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toCourseInstanceResponse(instance))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches/:id/course-instances
// ─────────────────────────────────────────────────────────────────────────────

// ListCourseInstancesByBatch handles GET /batches/:id/course-instances
func (h *CourseInstanceHandler) ListCourseInstancesByBatch(c fiber.Ctx) error {
	batchID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	instances, err := h.courseInstanceService.ListCourseInstancesByBatch(batchID)
	if err != nil {
		return err
	}

	responses := make([]dto.CourseInstanceResponse, len(instances))
	for i, inst := range instances {
		responses[i] = *toCourseInstanceResponse(&inst)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"course_instances": responses,
		"count":            len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

// toCourseInstanceResponse converts a domain.CourseInstance to its DTO
// representation.
func toCourseInstanceResponse(ci *domain.CourseInstance) *dto.CourseInstanceResponse {
	return &dto.CourseInstanceResponse{
		ID:            ci.ID,
		CourseID:      ci.CourseID,
		SemesterID:    ci.SemesterID,
		BatchID:       ci.BatchID,
		Status:        ci.Status,
		MaxEnrollment: ci.MaxEnrollment,
		CreatedAt:     ci.CreatedAt,
		UpdatedAt:     ci.UpdatedAt,
	}
}
