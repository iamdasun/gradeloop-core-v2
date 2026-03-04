package service

import (
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// BatchService defines the business-logic contract for batch management.
type BatchService interface {
	CreateBatch(req *dto.CreateBatchRequest, creatorID uuid.UUID, username, ipAddress, userAgent string) (*domain.Batch, error)
	UpdateBatch(id uuid.UUID, req *dto.UpdateBatchRequest, username, ipAddress, userAgent string) (*domain.Batch, error)
	DeactivateBatch(id uuid.UUID, username, ipAddress, userAgent string) error
	GetBatchByID(id uuid.UUID) (*domain.Batch, error)
	ListBatches(includeInactive bool) ([]domain.Batch, error)
	GetBatchTree(includeInactive bool) ([]dto.BatchTreeResponse, error)
	GetBatchSubtree(id uuid.UUID, includeInactive bool) (*dto.BatchTreeResponse, error)
}

// batchService is the concrete implementation.
type batchService struct {
	db                 *gorm.DB
	batchRepo          repository.BatchRepository
	degreeRepo         repository.DegreeRepository
	specializationRepo repository.SpecializationRepository
	auditClient        *client.AuditClient
	logger             *zap.Logger
}

// NewBatchService wires all dependencies together.
func NewBatchService(
	db *gorm.DB,
	batchRepo repository.BatchRepository,
	degreeRepo repository.DegreeRepository,
	specializationRepo repository.SpecializationRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) BatchService {
	return &batchService{
		db:                 db,
		batchRepo:          batchRepo,
		degreeRepo:         degreeRepo,
		specializationRepo: specializationRepo,
		auditClient:        auditClient,
		logger:             logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateBatch
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) CreateBatch(
	req *dto.CreateBatchRequest,
	creatorID uuid.UUID,
	username, ipAddress, userAgent string,
) (*domain.Batch, error) {
	// 1. Basic field validation
	if err := s.validateCreateRequest(req); err != nil {
		return nil, err
	}

	batch := &domain.Batch{
		Name:      req.Name,
		Code:      req.Code,
		StartYear: req.StartYear,
		EndYear:   req.EndYear,
		IsActive:  true,
		CreatedBy: creatorID,
	}

	// 2. Resolve degree_id and specialization_id via parent (if supplied)
	if req.ParentID != nil {
		parent, err := s.batchRepo.GetBatchByID(*req.ParentID)
		if err != nil {
			s.logger.Error("failed to load parent batch", zap.Error(err))
			return nil, utils.ErrInternal("failed to load parent batch", err)
		}
		if parent == nil {
			return nil, utils.ErrNotFound("parent batch not found")
		}

		batch.ParentID = req.ParentID

		// Cycle detection: walk the ancestor chain to ensure no circular reference
		// would be introduced by this new batch claiming the parent as its parent.
		// Since the batch doesn't have an ID yet, we check whether the parent itself
		// is already a descendant of any batch that shares this would-be ID — which
		// is impossible for a brand-new record. Instead we guard against a caller
		// supplying a parent_id that is itself a descendant of a batch we intend to
		// nest under it (only relevant if the parent_id UUID was reused, but the
		// traversal is cheap and harmless to run unconditionally).
		//
		// More practically: if the caller somehow passes a parent whose own ancestor
		// chain forms a cycle in existing data, we detect and reject it here.
		if parent.ParentID != nil {
			if err := s.detectCycle((*req.ParentID), *parent.ParentID); err != nil {
				return nil, err
			}
		}

		// Degree inheritance: if not provided, inherit from parent
		if req.DegreeID == nil {
			batch.DegreeID = parent.DegreeID
		} else {
			// Provided — must match parent
			if *req.DegreeID != parent.DegreeID {
				return nil, utils.ErrBadRequest("degree mismatch with parent batch")
			}
			batch.DegreeID = *req.DegreeID
		}
	} else {
		// Root batch — degree_id is mandatory
		if req.DegreeID == nil {
			return nil, utils.ErrBadRequest("degree_id is required for root batches")
		}
		batch.DegreeID = *req.DegreeID
	}

	// 3. Verify degree exists
	degree, err := s.degreeRepo.GetDegreeByID(batch.DegreeID)
	if err != nil {
		s.logger.Error("failed to load degree", zap.Error(err))
		return nil, utils.ErrInternal("failed to load degree", err)
	}
	if degree == nil {
		return nil, utils.ErrNotFound("degree not found")
	}

	// 4. Specialization validation (optional but must belong to degree)
	if req.SpecializationID != nil {
		spec, err := s.specializationRepo.GetSpecializationByID(*req.SpecializationID)
		if err != nil {
			s.logger.Error("failed to load specialization", zap.Error(err))
			return nil, utils.ErrInternal("failed to load specialization", err)
		}
		if spec == nil {
			return nil, utils.ErrNotFound("specialization not found")
		}
		if spec.DegreeID != batch.DegreeID {
			return nil, utils.ErrBadRequest("specialization does not belong to the batch's degree")
		}
		batch.SpecializationID = req.SpecializationID
	}

	// 5. Unique code within degree check
	existing, err := s.batchRepo.GetBatchByCodeAndDegree(batch.Code, batch.DegreeID)
	if err != nil {
		s.logger.Error("failed to check batch code uniqueness", zap.Error(err))
		return nil, utils.ErrInternal("failed to check batch code uniqueness", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("a batch with this code already exists in the degree")
	}

	// 6. Save
	if err := s.batchRepo.CreateBatch(batch); err != nil {
		s.logger.Error("failed to create batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to create batch", err)
	}

	// 7. Audit log
	changes := map[string]interface{}{
		"name":      batch.Name,
		"code":      batch.Code,
		"degree_id": batch.DegreeID.String(),
		"is_active": batch.IsActive,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionBatchCreated),
		"batch",
		batch.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("batch created", zap.String("id", batch.ID.String()), zap.String("code", batch.Code))
	return batch, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateBatch
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) UpdateBatch(
	id uuid.UUID,
	req *dto.UpdateBatchRequest,
	username, ipAddress, userAgent string,
) (*domain.Batch, error) {
	// 1. Load existing batch
	batch, err := s.batchRepo.GetBatchByID(id)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return nil, utils.ErrNotFound("batch not found")
	}

	changes := make(map[string]interface{})

	// 2. Update allowed fields
	if req.Name != "" && req.Name != batch.Name {
		changes["name"] = map[string]interface{}{"old": batch.Name, "new": req.Name}
		batch.Name = req.Name
	}

	if req.StartYear != 0 && req.StartYear != batch.StartYear {
		changes["start_year"] = map[string]interface{}{"old": batch.StartYear, "new": req.StartYear}
		batch.StartYear = req.StartYear
	}

	if req.EndYear != 0 && req.EndYear != batch.EndYear {
		changes["end_year"] = map[string]interface{}{"old": batch.EndYear, "new": req.EndYear}
		batch.EndYear = req.EndYear
	}

	// Validate year range if both provided
	if batch.StartYear != 0 && batch.EndYear != 0 && batch.EndYear < batch.StartYear {
		return nil, utils.ErrBadRequest("end_year must be greater than or equal to start_year")
	}

	// Specialization update — validate it belongs to the batch's degree
	if req.SpecializationID != nil {
		spec, err := s.specializationRepo.GetSpecializationByID(*req.SpecializationID)
		if err != nil {
			s.logger.Error("failed to load specialization", zap.Error(err))
			return nil, utils.ErrInternal("failed to load specialization", err)
		}
		if spec == nil {
			return nil, utils.ErrNotFound("specialization not found")
		}
		if spec.DegreeID != batch.DegreeID {
			return nil, utils.ErrBadRequest("specialization does not belong to the batch's degree")
		}
		oldSpecID := ""
		if batch.SpecializationID != nil {
			oldSpecID = batch.SpecializationID.String()
		}
		changes["specialization_id"] = map[string]interface{}{
			"old": oldSpecID,
			"new": req.SpecializationID.String(),
		}
		batch.SpecializationID = req.SpecializationID
	}

	// is_active toggle
	if req.IsActive != nil && *req.IsActive != batch.IsActive {
		changes["is_active"] = map[string]interface{}{"old": batch.IsActive, "new": *req.IsActive}
		batch.IsActive = *req.IsActive
	}

	// 3. Persist
	if err := s.batchRepo.UpdateBatch(batch); err != nil {
		s.logger.Error("failed to update batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to update batch", err)
	}

	// 4. Cascade deactivation when batch is being deactivated
	if req.IsActive != nil && !*req.IsActive {
		if err := s.batchRepo.DeactivateSubtree(id); err != nil {
			s.logger.Error("failed to cascade deactivate subtree", zap.Error(err))
			// Log but don't fail the overall operation
			s.logger.Warn("batch updated but subtree deactivation failed",
				zap.String("batch_id", id.String()),
				zap.Error(err),
			)
		}
	}

	// 5. Audit log
	auditAction := string(client.AuditActionBatchUpdated)
	if req.IsActive != nil && !*req.IsActive {
		auditAction = string(client.AuditActionBatchDeactivated)
	}

	if auditErr := s.auditClient.LogAction(
		auditAction,
		"batch",
		batch.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("batch updated", zap.String("id", batch.ID.String()))
	return batch, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// DeactivateBatch
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) DeactivateBatch(
	id uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	batch, err := s.batchRepo.GetBatchByID(id)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return utils.ErrNotFound("batch not found")
	}

	// Mark root batch inactive
	batch.IsActive = false
	if err := s.batchRepo.UpdateBatch(batch); err != nil {
		s.logger.Error("failed to deactivate batch", zap.Error(err))
		return utils.ErrInternal("failed to deactivate batch", err)
	}

	// Cascade: deactivate entire subtree via recursive CTE
	if err := s.batchRepo.DeactivateSubtree(id); err != nil {
		s.logger.Error("failed to cascade deactivate subtree", zap.Error(err))
		s.logger.Warn("batch deactivated but subtree deactivation failed",
			zap.String("batch_id", id.String()),
			zap.Error(err),
		)
	}

	changes := map[string]interface{}{
		"is_active": map[string]interface{}{"old": true, "new": false},
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionBatchDeactivated),
		"batch",
		batch.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("batch deactivated", zap.String("id", id.String()))
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetBatchByID
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) GetBatchByID(id uuid.UUID) (*domain.Batch, error) {
	batch, err := s.batchRepo.GetBatchByID(id)
	if err != nil {
		s.logger.Error("failed to get batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to get batch", err)
	}
	if batch == nil {
		return nil, utils.ErrNotFound("batch not found")
	}
	return batch, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListBatches
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) ListBatches(includeInactive bool) ([]domain.Batch, error) {
	batches, err := s.batchRepo.ListBatches(includeInactive)
	if err != nil {
		s.logger.Error("failed to list batches", zap.Error(err))
		return nil, utils.ErrInternal("failed to list batches", err)
	}
	return batches, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetBatchTree  — full hierarchy (all root nodes + descendants)
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) GetBatchTree(includeInactive bool) ([]dto.BatchTreeResponse, error) {
	all, err := s.batchRepo.GetAllBatchesTree(includeInactive)
	if err != nil {
		s.logger.Error("failed to load batches for tree", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch tree", err)
	}

	return buildForest(all), nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetBatchSubtree — subtree rooted at a specific batch
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) GetBatchSubtree(id uuid.UUID, includeInactive bool) (*dto.BatchTreeResponse, error) {
	root, err := s.batchRepo.GetBatchByID(id)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch", err)
	}
	if root == nil {
		return nil, utils.ErrNotFound("batch not found")
	}

	all, err := s.batchRepo.GetAllBatchesTree(includeInactive)
	if err != nil {
		s.logger.Error("failed to load batches for subtree", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch subtree", err)
	}

	// Build an index by ID
	nodeMap := make(map[uuid.UUID]dto.BatchTreeResponse, len(all))
	for _, b := range all {
		nodeMap[b.ID] = batchToTreeNode(b)
	}

	tree := buildSubtree(id, nodeMap)
	return &tree, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Cycle detection helper — traverses ancestor chain and rejects cycles
// ─────────────────────────────────────────────────────────────────────────────

// detectCycle walks up the ancestor chain from startParentID.
// Returns an error if batchID appears in the chain (cycle detected).
func (s *batchService) detectCycle(batchID uuid.UUID, startParentID uuid.UUID) error {
	current := &startParentID
	visited := make(map[uuid.UUID]bool)

	for current != nil {
		if visited[*current] {
			// Shouldn't happen in valid data, but guard against infinite loops
			return utils.ErrBadRequest("batch hierarchy cycle detected")
		}
		if *current == batchID {
			return utils.ErrBadRequest("batch hierarchy cycle detected")
		}
		visited[*current] = true

		parent, err := s.batchRepo.GetBatchByID(*current)
		if err != nil {
			return utils.ErrInternal("failed to validate hierarchy", err)
		}
		if parent == nil {
			break
		}
		current = parent.ParentID
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchService) validateCreateRequest(req *dto.CreateBatchRequest) error {
	if req.Name == "" {
		return utils.ErrBadRequest("name is required")
	}
	if len(req.Name) < 2 || len(req.Name) > 255 {
		return utils.ErrBadRequest("name must be between 2 and 255 characters")
	}

	if req.Code == "" {
		return utils.ErrBadRequest("code is required")
	}
	if len(req.Code) < 1 || len(req.Code) > 50 {
		return utils.ErrBadRequest("code must be between 1 and 50 characters")
	}

	if req.StartYear != 0 && req.EndYear != 0 && req.EndYear < req.StartYear {
		return utils.ErrBadRequest("end_year must be greater than or equal to start_year")
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-building utilities (pure functions, no I/O)
// ─────────────────────────────────────────────────────────────────────────────

// batchToTreeNode converts a flat domain.Batch into a tree node (no children yet).
func batchToTreeNode(b domain.Batch) dto.BatchTreeResponse {
	return dto.BatchTreeResponse{
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
		Children:         []dto.BatchTreeResponse{},
	}
}

// buildForest assembles a list of root-level tree nodes from a flat slice.
func buildForest(all []domain.Batch) []dto.BatchTreeResponse {
	if len(all) == 0 {
		return []dto.BatchTreeResponse{}
	}

	// Index all nodes by ID
	nodeMap := make(map[uuid.UUID]dto.BatchTreeResponse, len(all))
	for _, b := range all {
		nodeMap[b.ID] = batchToTreeNode(b)
	}

	// Determine root IDs
	var rootIDs []uuid.UUID
	for _, b := range all {
		if b.ParentID == nil {
			rootIDs = append(rootIDs, b.ID)
		}
	}

	// Build each root's subtree
	var forest []dto.BatchTreeResponse
	for _, rid := range rootIDs {
		forest = append(forest, buildSubtree(rid, nodeMap))
	}
	return forest
}

// buildSubtree recursively constructs a node's subtree from the flat nodeMap.
func buildSubtree(id uuid.UUID, nodeMap map[uuid.UUID]dto.BatchTreeResponse) dto.BatchTreeResponse {
	node := nodeMap[id]
	node.Children = []dto.BatchTreeResponse{}

	for _, candidate := range nodeMap {
		if candidate.ParentID != nil && *candidate.ParentID == id {
			child := buildSubtree(candidate.ID, nodeMap)
			node.Children = append(node.Children, child)
		}
	}

	return node
}
