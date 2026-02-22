package handler

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/gradeloop/assessment-service/internal/domain"
	"github.com/gradeloop/assessment-service/internal/dto"
	"github.com/gradeloop/assessment-service/internal/utils"
)

// parseQueryUUID parses a raw UUID string from a query parameter.
// Returns a 400 Bad Request AppError when the value is malformed.
func parseQueryUUID(raw, paramName string) (uuid.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, utils.ErrBadRequest("invalid " + paramName + ": must be a valid UUID")
	}
	return id, nil
}

// parseUUID reads a route parameter by name and parses it as a UUID.
// Returns a 400 Bad Request AppError when the value is missing or malformed.
func parseUUID(c fiber.Ctx, param string) (uuid.UUID, error) {
	raw := c.Params(param)
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, utils.ErrBadRequest("invalid " + param + ": must be a valid UUID")
	}
	return id, nil
}

// requireUsername extracts the authenticated username stored in fiber.Ctx locals
// by the JWT auth middleware.  Returns an empty string when not present.
func requireUsername(c fiber.Ctx) string {
	username, _ := c.Locals("username").(string)
	return username
}

// requireUserID extracts the authenticated user's UUID from fiber.Ctx locals.
// The IAM Service stores user_id as a UUID string.  Returns uuid.Nil when the
// local is absent or cannot be parsed.
func requireUserID(c fiber.Ctx) uuid.UUID {
	raw, _ := c.Locals("user_id").(string)
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil
	}
	return id
}

// toAssignmentResponse converts a domain.Assignment to its DTO representation.
func toAssignmentResponse(a *domain.Assignment) dto.AssignmentResponse {
	return dto.AssignmentResponse{
		ID:               a.ID,
		CourseInstanceID: a.CourseInstanceID,

		Title:       a.Title,
		Description: a.Description,
		Code:        a.Code,

		ReleaseAt: a.ReleaseAt,
		DueAt:     a.DueAt,
		LateDueAt: a.LateDueAt,

		AllowLateSubmissions: a.AllowLateSubmissions,
		EnforceTimeLimit:     a.EnforceTimeLimit,

		AllowGroupSubmission: a.AllowGroupSubmission,
		MaxGroupSize:         a.MaxGroupSize,

		EnableAIAssistant:      a.EnableAIAssistant,
		EnableSocraticFeedback: a.EnableSocraticFeedback,
		AllowRegenerate:        a.AllowRegenerate,

		IsActive:  a.IsActive,
		CreatedBy: a.CreatedBy,

		CreatedAt: a.CreatedAt,
		UpdatedAt: a.UpdatedAt,
	}
}
