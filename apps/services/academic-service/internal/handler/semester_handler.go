package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// SemesterHandler handles semester-related HTTP requests.
type SemesterHandler struct {
	semesterService service.SemesterService
	logger          *zap.Logger
}

// NewSemesterHandler creates a new SemesterHandler.
func NewSemesterHandler(semesterService service.SemesterService, logger *zap.Logger) *SemesterHandler {
	return &SemesterHandler{
		semesterService: semesterService,
		logger:          logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /semesters
// ─────────────────────────────────────────────────────────────────────────────

// CreateSemester handles POST /semesters
func (h *SemesterHandler) CreateSemester(c fiber.Ctx) error {
	var req dto.CreateSemesterRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	semester, err := h.semesterService.CreateSemester(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toSemesterResponse(semester))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /semesters
// ─────────────────────────────────────────────────────────────────────────────

// ListSemesters handles GET /semesters
func (h *SemesterHandler) ListSemesters(c fiber.Ctx) error {
	var query dto.ListSemestersQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	semesters, err := h.semesterService.ListSemesters(query.IncludeInactive, query.TermType)
	if err != nil {
		return err
	}

	responses := make([]dto.SemesterResponse, len(semesters))
	for i, semester := range semesters {
		responses[i] = *toSemesterResponse(&semester)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"semesters": responses,
		"count":     len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /semesters/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetSemester handles GET /semesters/:id
func (h *SemesterHandler) GetSemester(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	semester, err := h.semesterService.GetSemester(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toSemesterResponse(semester))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /semesters/:id
// ─────────────────────────────────────────────────────────────────────────────

// UpdateSemester handles PUT /semesters/:id
func (h *SemesterHandler) UpdateSemester(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.UpdateSemesterRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	semester, err := h.semesterService.UpdateSemester(id, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toSemesterResponse(semester))
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /semesters/:id/deactivate
// ─────────────────────────────────────────────────────────────────────────────

// DeactivateSemester handles PATCH /semesters/:id/deactivate
func (h *SemesterHandler) DeactivateSemester(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.semesterService.DeactivateSemester(id, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "semester deactivated successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

func toSemesterResponse(s *domain.Semester) *dto.SemesterResponse {
	return &dto.SemesterResponse{
		ID:        s.ID,
		Name:      s.Name,
		Code:      s.Code,
		TermType:  s.TermType,
		StartDate: s.StartDate,
		EndDate:   s.EndDate,
		Status:    s.Status,
		IsActive:  s.IsActive,
		CreatedAt: s.CreatedAt,
		UpdatedAt: s.UpdatedAt,
	}
}
