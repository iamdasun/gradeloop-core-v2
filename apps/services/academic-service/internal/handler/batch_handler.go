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

// BatchHandler handles batch-related HTTP requests.
type BatchHandler struct {
	batchService service.BatchService
	logger       *zap.Logger
}

// NewBatchHandler creates a new BatchHandler.
func NewBatchHandler(batchService service.BatchService, logger *zap.Logger) *BatchHandler {
	return &BatchHandler{
		batchService: batchService,
		logger:       logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /batches
// ─────────────────────────────────────────────────────────────────────────────

// CreateBatch handles POST /batches
func (h *BatchHandler) CreateBatch(c fiber.Ctx) error {
	var req dto.CreateBatchRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	userIDRaw, ok := c.Locals("user_id").(string)
	if !ok || userIDRaw == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	creatorID, err := uuid.Parse(userIDRaw)
	if err != nil {
		h.logger.Error("failed to parse user_id from context", zap.Error(err), zap.String("user_id", userIDRaw))
		return utils.ErrUnauthorized("invalid user session")
	}

	username, ok := c.Locals("username").(string)
	if !ok || username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	batch, err := h.batchService.CreateBatch(&req, creatorID, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(h.toBatchResponse(batch))
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /batches/:id
// ─────────────────────────────────────────────────────────────────────────────

// UpdateBatch handles PUT /batches/:id
func (h *BatchHandler) UpdateBatch(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var req dto.UpdateBatchRequest
	if err := c.Bind().JSON(&req); err != nil {
		return utils.ErrBadRequest("invalid request body")
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	batch, err := h.batchService.UpdateBatch(id, &req, username, c.IP(), c.Get("User-Agent"))
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(h.toBatchResponse(batch))
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /batches/:id/deactivate
// ─────────────────────────────────────────────────────────────────────────────

// DeactivateBatch handles PATCH /batches/:id/deactivate
func (h *BatchHandler) DeactivateBatch(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	username := requireUsername(c)
	if username == "" {
		return utils.ErrUnauthorized("user not authenticated")
	}

	if err := h.batchService.DeactivateBatch(id, username, c.IP(), c.Get("User-Agent")); err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "batch deactivated successfully",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches/:id
// ─────────────────────────────────────────────────────────────────────────────

// GetBatch handles GET /batches/:id
func (h *BatchHandler) GetBatch(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	batch, err := h.batchService.GetBatchByID(id)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(h.toBatchResponse(batch))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches
// ─────────────────────────────────────────────────────────────────────────────

// ListBatches handles GET /batches
func (h *BatchHandler) ListBatches(c fiber.Ctx) error {
	var query dto.ListBatchesQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	batches, err := h.batchService.ListBatches(query.IncludeInactive)
	if err != nil {
		return err
	}

	responses := make([]dto.BatchResponse, len(batches))
	for i, b := range batches {
		responses[i] = *h.toBatchResponse(&b)
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"batches": responses,
		"count":   len(responses),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches/tree
// ─────────────────────────────────────────────────────────────────────────────

// GetBatchTree handles GET /batches/tree — returns the full hierarchy.
func (h *BatchHandler) GetBatchTree(c fiber.Ctx) error {
	var query dto.ListBatchesQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	tree, err := h.batchService.GetBatchTree(query.IncludeInactive)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"tree":  tree,
		"count": len(tree),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /batches/:id/tree
// ─────────────────────────────────────────────────────────────────────────────

// GetBatchSubtree handles GET /batches/:id/tree — returns a subtree rooted at
// the given batch.
func (h *BatchHandler) GetBatchSubtree(c fiber.Ctx) error {
	id, err := parseUUID(c, "id")
	if err != nil {
		return err
	}

	var query dto.ListBatchesQuery
	if err := c.Bind().Query(&query); err != nil {
		return utils.ErrBadRequest("invalid query parameters")
	}

	subtree, err := h.batchService.GetBatchSubtree(id, query.IncludeInactive)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusOK).JSON(subtree)
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

// toBatchResponse converts a domain.Batch to its DTO representation.
func (h *BatchHandler) toBatchResponse(b *domain.Batch) *dto.BatchResponse {
	return &dto.BatchResponse{
		ID:               b.ID,
		ParentID:         b.ParentID,
		DegreeID:         b.DegreeID,
		SpecializationID: b.SpecializationID,
		Name:             b.Name,
		Code:             b.Code,
		StartYear:        b.StartYear,
		EndYear:          b.EndYear,
		IsActive:         b.IsActive,
		CreatedBy:        b.CreatedBy,
		CreatedAt:        b.CreatedAt,
		UpdatedAt:        b.UpdatedAt,
	}
}

// parseUUID parses a named route parameter as a UUID and returns a descriptive
// 400 error on failure.
func parseUUID(c fiber.Ctx, param string) (uuid.UUID, error) {
	raw := c.Params(param)
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, utils.ErrBadRequest("invalid " + param + " (must be a valid UUID)")
	}
	return id, nil
}
