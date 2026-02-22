package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// FacultyHandler handles faculty-related HTTP requests
type FacultyHandler struct {
	facultyService service.FacultyService
	logger         *zap.Logger
}

// NewFacultyHandler creates a new faculty handler
func NewFacultyHandler(facultyService service.FacultyService, logger *zap.Logger) *FacultyHandler {
	return &FacultyHandler{
		facultyService: facultyService,
		logger:         logger,
	}
}

// CreateFaculty handles POST /faculties
func (h *FacultyHandler) CreateFaculty(c fiber.Ctx) error {
	var req dto.CreateFacultyRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	// Get user info from context (username from IAM JWT)
	username, ok := c.Locals("username").(string)
	if !ok || username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	// For now, use username as email for audit logging
	// TODO: Fetch actual user details from IAM service if needed
	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	// Use 0 as placeholder user_id since we're using UUID-based auth
	faculty, err := h.facultyService.CreateFaculty(&req, 0, username, ipAddress, userAgent)
	if err != nil {
		return err
	}

	response := h.toFacultyResponse(faculty)
	return c.Status(fiber.StatusCreated).JSON(response)
}

// UpdateFaculty handles PUT /faculties/:id
func (h *FacultyHandler) UpdateFaculty(c fiber.Ctx) error {
	idParam := c.Params("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		return utils.ErrBadRequest("invalid faculty id")
	}

	var req dto.UpdateFacultyRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	// Get user info from context (username from IAM JWT)
	username, ok := c.Locals("username").(string)
	if !ok || username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	// Use 0 as placeholder user_id since we're using UUID-based auth
	faculty, err := h.facultyService.UpdateFaculty(id, &req, 0, username, ipAddress, userAgent)
	if err != nil {
		return err
	}

	response := h.toFacultyResponse(faculty)
	return c.Status(fiber.StatusOK).JSON(response)
}

// DeactivateFaculty handles PATCH /faculties/:id/deactivate
func (h *FacultyHandler) DeactivateFaculty(c fiber.Ctx) error {
	idParam := c.Params("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		return utils.ErrBadRequest("invalid faculty id")
	}

	// Get user info from context (username from IAM JWT)
	username, ok := c.Locals("username").(string)
	if !ok || username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	ipAddress := c.IP()
	userAgent := c.Get("User-Agent")

	// Use 0 as placeholder user_id since we're using UUID-based auth
	if err := h.facultyService.DeactivateFaculty(id, 0, username, ipAddress, userAgent); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "faculty deactivated successfully",
	})
}

// GetFaculty handles GET /faculties/:id
func (h *FacultyHandler) GetFaculty(c fiber.Ctx) error {
	idParam := c.Params("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		return utils.ErrBadRequest("invalid faculty id")
	}

	faculty, err := h.facultyService.GetFacultyByID(id)
	if err != nil {
		return err
	}

	response := h.toFacultyResponse(faculty)
	return c.Status(fiber.StatusOK).JSON(response)
}

// ListFaculties handles GET /faculties
func (h *FacultyHandler) ListFaculties(c fiber.Ctx) error {
	var query dto.ListFacultiesQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	faculties, err := h.facultyService.ListFaculties(query.IncludeInactive)
	if err != nil {
		return err
	}

	responses := make([]dto.FacultyResponse, len(faculties))
	for i, faculty := range faculties {
		responses[i] = *h.toFacultyResponse(&faculty)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"faculties": responses,
		"count":     len(responses),
	})
}

// GetFacultyLeaders handles GET /faculties/:id/leaders
func (h *FacultyHandler) GetFacultyLeaders(c fiber.Ctx) error {
	idParam := c.Params("id")
	id, err := uuid.Parse(idParam)
	if err != nil {
		return utils.ErrBadRequest("invalid faculty id")
	}

	leaders, err := h.facultyService.GetFacultyLeaders(id)
	if err != nil {
		return err
	}

	responses := make([]dto.FacultyLeadershipResponse, len(leaders))
	for i, leader := range leaders {
		responses[i] = dto.FacultyLeadershipResponse{
			FacultyID: leader.FacultyID,
			UserID:    leader.UserID,
			Role:      leader.Role,
			IsActive:  leader.IsActive,
			CreatedAt: leader.CreatedAt,
			UpdatedAt: leader.UpdatedAt,
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"leaders": responses,
		"count":   len(responses),
	})
}

// toFacultyResponse converts domain.Faculty to dto.FacultyResponse
func (h *FacultyHandler) toFacultyResponse(faculty *domain.Faculty) *dto.FacultyResponse {
	response := &dto.FacultyResponse{
		ID:          faculty.ID,
		Name:        faculty.Name,
		Code:        faculty.Code,
		Description: faculty.Description,
		IsActive:    faculty.IsActive,
		CreatedAt:   faculty.CreatedAt,
		UpdatedAt:   faculty.UpdatedAt,
	}

	if len(faculty.Leaders) > 0 {
		response.Leaders = make([]dto.FacultyLeadershipResponse, len(faculty.Leaders))
		for i, leader := range faculty.Leaders {
			response.Leaders[i] = dto.FacultyLeadershipResponse{
				FacultyID: leader.FacultyID,
				UserID:    leader.UserID,
				Role:      leader.Role,
				IsActive:  leader.IsActive,
				CreatedAt: leader.CreatedAt,
				UpdatedAt: leader.UpdatedAt,
			}
		}
	}

	return response
}
