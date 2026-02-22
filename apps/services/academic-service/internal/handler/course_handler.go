package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// CourseHandler handles course-related HTTP requests.
type CourseHandler struct {
	courseService service.CourseService
	logger        *zap.Logger
}

// NewCourseHandler creates a new CourseHandler.
func NewCourseHandler(courseService service.CourseService, logger *zap.Logger) *CourseHandler {
	return &CourseHandler{
		courseService: courseService,
		logger:        logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /courses
// ─────────────────────────────────────────────────────────────────────────────

// CreateCourse handles POST /courses
func (h *CourseHandler) CreateCourse(c fiber.Ctx) error {
	var req dto.CreateCourseRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	course, err := h.courseService.CreateCourse(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toCourseResponse(course))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /courses
// ─────────────────────────────────────────────────────────────────────────────

// ListCourses handles GET /courses
func (h *CourseHandler) ListCourses(c fiber.Ctx) error {
	var query dto.ListCoursesQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	courses, err := h.courseService.ListCourses(query.IncludeInactive)
	if err != nil {
		return err
	}

	responses := make([]dto.CourseResponse, len(courses))
	for i, course := range courses {
		responses[i] = *toCourseResponse(&course)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"courses": responses,
		"count":   len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /courses/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetCourse handles GET /courses/:id
func (h *CourseHandler) GetCourse(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	course, err := h.courseService.GetCourse(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toCourseResponse(course))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /courses/:id
// ─────────────────────────────────────────────────────────────────────────────

// UpdateCourse handles PUT /courses/:id
func (h *CourseHandler) UpdateCourse(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.UpdateCourseRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	course, err := h.courseService.UpdateCourse(id, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(toCourseResponse(course))
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /courses/:id/deactivate
// ─────────────────────────────────────────────────────────────────────────────

// DeactivateCourse handles PATCH /courses/:id/deactivate
func (h *CourseHandler) DeactivateCourse(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.courseService.DeactivateCourse(id, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "course deactivated successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /courses/:id/prerequisites
// ─────────────────────────────────────────────────────────────────────────────

// AddPrerequisite handles POST /courses/:id/prerequisites
func (h *CourseHandler) AddPrerequisite(c fiber.Ctx) error {
	courseID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.AddPrerequisiteRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	prereq, err := h.courseService.AddPrerequisite(courseID, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toCoursePrerequisiteResponse(prereq))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /courses/:id/prerequisites
// ─────────────────────────────────────────────────────────────────────────────

// ListPrerequisites handles GET /courses/:id/prerequisites
func (h *CourseHandler) ListPrerequisites(c fiber.Ctx) error {
	courseID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	prereqs, err := h.courseService.ListPrerequisites(courseID)
	if err != nil {
		return err
	}

	responses := make([]dto.CoursePrerequisiteResponse, len(prereqs))
	for i, p := range prereqs {
		responses[i] = *toCoursePrerequisiteResponse(&p)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"prerequisites": responses,
		"count":         len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /courses/:id/prerequisites/:prereqID
// ─────────────────────────────────────────────────────────────────────────────

// RemovePrerequisite handles DELETE /courses/:id/prerequisites/:prereqID
func (h *CourseHandler) RemovePrerequisite(c fiber.Ctx) error {
	courseID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	prereqID, err := parseUUID(c, "prereqID")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.courseService.RemovePrerequisite(courseID, prereqID, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "prerequisite removed successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

func toCourseResponse(c *domain.Course) *dto.CourseResponse {
	return &dto.CourseResponse{
		ID:          c.ID,
		Code:        c.Code,
		Title:       c.Title,
		Description: c.Description,
		Credits:     c.Credits,
		IsActive:    c.IsActive,
		CreatedAt:   c.CreatedAt,
		UpdatedAt:   c.UpdatedAt,
	}
}

func toCoursePrerequisiteResponse(p *domain.CoursePrerequisite) *dto.CoursePrerequisiteResponse {
	resp := &dto.CoursePrerequisiteResponse{
		CourseID:             p.CourseID,
		PrerequisiteCourseID: p.PrerequisiteCourseID,
	}
	if p.PrerequisiteCourse != nil {
		cr := toCourseResponse(p.PrerequisiteCourse)
		resp.PrerequisiteCourse = cr
	}
	return resp
}
