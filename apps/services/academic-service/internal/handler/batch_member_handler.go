package handler

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/service"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// BatchMemberHandler handles batch-member HTTP requests.
type BatchMemberHandler struct {
	batchMemberService service.BatchMemberService
	logger             *zap.Logger
}

// NewBatchMemberHandler creates a new BatchMemberHandler.
func NewBatchMemberHandler(batchMemberService service.BatchMemberService, logger *zap.Logger) *BatchMemberHandler {
	return &BatchMemberHandler{
		batchMemberService: batchMemberService,
		logger:             logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /batch-members
// ─────────────────────────────────────────────────────────────────────────────

// AddBatchMember handles POST /batch-members
func (h *BatchMemberHandler) AddBatchMember(c fiber.Ctx) error {
	var req dto.AddBatchMemberRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	member, err := h.batchMemberService.AddBatchMember(&req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(toBatchMemberResponse(member))
}

// AddMembersToBatch handles POST /batch-members/bulk
func (h *BatchMemberHandler) AddMembersToBatch(c fiber.Ctx) error {
	var req dto.BulkAddBatchMembersRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.batchMemberService.AddMembersToBatch(&req, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "batch members added successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches/:id/members
// ─────────────────────────────────────────────────────────────────────────────

// GetBatchMembers handles GET /batches/:id/members
func (h *BatchMemberHandler) GetBatchMembers(c fiber.Ctx) error {
	batchID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	members, err := h.batchMemberService.GetBatchMembers(batchID)
	if err != nil {
		return err
	}

	responses := make([]dto.BatchMemberResponse, len(members))
	for i, m := range members {
		responses[i] = *toBatchMemberResponse(&m)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"members": responses,
		"count":   len(responses),
	})
}

// GetBatchMembersDetailed handles GET /batches/:id/members/detailed
func (h *BatchMemberHandler) GetBatchMembersDetailed(c fiber.Ctx) error {
	batchID, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	// Get token from header to pass to IAM client
	token := c.Get("Authorization")

	members, err := h.batchMemberService.GetBatchMembersDetailed(context.Background(), batchID, token)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"members": members,
		"count":   len(members),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /batch-members/:batchID/:userID
// ─────────────────────────────────────────────────────────────────────────────

// RemoveBatchMember handles DELETE /batch-members/:batchID/:userID
func (h *BatchMemberHandler) RemoveBatchMember(c fiber.Ctx) error {
	batchID, err := parseUUID(c, "batchID")
	if err != nil {
		return err
	}

	userID, err := parseUUID(c, "userID")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.batchMemberService.RemoveBatchMember(batchID, userID, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "batch member removed successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

// toBatchMemberResponse converts a domain.BatchMember to its DTO representation.
func toBatchMemberResponse(m *domain.BatchMember) *dto.BatchMemberResponse {
	return &dto.BatchMemberResponse{
		BatchID:    m.BatchID,
		UserID:     m.UserID,
		Status:     m.Status,
		EnrolledAt: m.EnrolledAt,
	}
}
