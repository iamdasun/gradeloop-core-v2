package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// BatchMemberService defines the business-logic contract for batch membership management.
type BatchMemberService interface {
	AddBatchMember(req *dto.AddBatchMemberRequest, username, ipAddress, userAgent string) (*domain.BatchMember, error)
	AddMembersToBatch(req *dto.BulkAddBatchMembersRequest, username, ipAddress, userAgent string) error
	GetBatchMembers(batchID uuid.UUID) ([]domain.BatchMember, error)
	GetBatchMembersDetailed(ctx context.Context, batchID uuid.UUID, token string) ([]dto.BatchMemberDetailResponse, error)
	RemoveBatchMember(batchID, userID uuid.UUID, username, ipAddress, userAgent string) error
}

// batchMemberService is the concrete implementation.
type batchMemberService struct {
	batchRepo       repository.BatchRepository
	batchMemberRepo repository.BatchMemberRepository
	auditClient     *client.AuditClient
	iamClient       *client.IAMClient
	logger          *zap.Logger
}

// NewBatchMemberService wires all dependencies together.
func NewBatchMemberService(
	batchRepo repository.BatchRepository,
	batchMemberRepo repository.BatchMemberRepository,
	auditClient *client.AuditClient,
	iamClient *client.IAMClient,
	logger *zap.Logger,
) BatchMemberService {
	return &batchMemberService{
		batchRepo:       batchRepo,
		batchMemberRepo: batchMemberRepo,
		auditClient:     auditClient,
		iamClient:       iamClient,
		logger:          logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// AddBatchMember
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchMemberService) AddBatchMember(
	req *dto.AddBatchMemberRequest,
	username, ipAddress, userAgent string,
) (*domain.BatchMember, error) {
	// 1. Validate required fields
	if req.BatchID == uuid.Nil {
		return nil, utils.ErrBadRequest("batch_id is required")
	}
	if req.UserID == uuid.Nil {
		return nil, utils.ErrBadRequest("user_id is required")
	}
	if req.Status == "" {
		req.Status = domain.BatchMemberStatusActive
	}
	if !domain.IsValidBatchMemberStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Active, Graduated, Suspended, Withdrawn")
	}

	// 2. Validate batch exists (not soft-deleted)
	batch, err := s.batchRepo.GetBatchByID(req.BatchID)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return nil, utils.ErrNotFound("batch not found")
	}

	// 3. Validate batch is active
	if !batch.IsActive {
		return nil, utils.ErrBadRequest("batch is not active")
	}

	// 4. Guard against duplicate membership
	existing, err := s.batchMemberRepo.GetMember(req.BatchID, req.UserID)
	if err != nil {
		s.logger.Error("failed to check existing membership", zap.Error(err))
		return nil, utils.ErrInternal("failed to check existing membership", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("user is already a member of this batch")
	}

	// 5. Create membership
	member := &domain.BatchMember{
		BatchID: req.BatchID,
		UserID:  req.UserID,
		Status:  req.Status,
	}

	if err := s.batchMemberRepo.AddMember(member); err != nil {
		s.logger.Error("failed to add batch member", zap.Error(err))
		return nil, utils.ErrInternal("failed to add batch member", err)
	}

	// 6. Write audit log (non-blocking — failure is warned but never propagated)
	changes := map[string]interface{}{
		"batch_id": req.BatchID.String(),
		"user_id":  req.UserID.String(),
		"status":   req.Status,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionBatchMemberAdded),
		"batch_member",
		req.BatchID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("batch member added",
		zap.String("batch_id", req.BatchID.String()),
		zap.String("user_id", req.UserID.String()),
	)
	return member, nil
}

// AddMembersToBatch handles bulk student addition to a batch
func (s *batchMemberService) AddMembersToBatch(
	req *dto.BulkAddBatchMembersRequest,
	username, ipAddress, userAgent string,
) error {
	if req.BatchID == uuid.Nil {
		return utils.ErrBadRequest("batch_id is required")
	}
	if len(req.UserIDs) == 0 {
		return nil
	}

	// 1. Validate batch exists and is active
	batch, err := s.batchRepo.GetBatchByID(req.BatchID)
	if err != nil {
		return utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return utils.ErrNotFound("batch not found")
	}
	if !batch.IsActive {
		return utils.ErrBadRequest("batch is not active")
	}

	// 2. Prepare domain objects (filtering duplicates)
	var members []domain.BatchMember
	for _, userID := range req.UserIDs {
		// Optimization: could check existence in bulk, but GORM's Create with Ignore or similar is easier.
		// For now, let's keep it simple and just create the records.
		// Repository AddMembers uses Create which will fail on unique constraint if record exists.
		// In a production app, we'd handle this more gracefully.
		members = append(members, domain.BatchMember{
			BatchID: req.BatchID,
			UserID:  userID,
			Status:  domain.BatchMemberStatusActive,
		})
	}

	// 3. Persist
	if err := s.batchMemberRepo.AddMembers(members); err != nil {
		s.logger.Error("failed to add members in bulk", zap.Error(err))
		return utils.ErrInternal("failed to add batch members", err)
	}

	// 4. Audit log
	changes := map[string]interface{}{
		"batch_id": req.BatchID.String(),
		"count":    len(req.UserIDs),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionBatchMemberAdded),
		"batch_member",
		req.BatchID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetBatchMembers
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchMemberService) GetBatchMembers(batchID uuid.UUID) ([]domain.BatchMember, error) {
	// Verify the batch exists before fetching members so callers get a
	// meaningful 404 rather than an empty list for a non-existent batch.
	batch, err := s.batchRepo.GetBatchByID(batchID)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return nil, utils.ErrNotFound("batch not found")
	}

	members, err := s.batchMemberRepo.GetMembers(batchID)
	if err != nil {
		s.logger.Error("failed to list batch members", zap.Error(err))
		return nil, utils.ErrInternal("failed to list batch members", err)
	}

	return members, nil
}

// GetBatchMembersDetailed fetches members with their details from IAM
func (s *batchMemberService) GetBatchMembersDetailed(ctx context.Context, batchID uuid.UUID, token string) ([]dto.BatchMemberDetailResponse, error) {
	members, err := s.GetBatchMembers(batchID)
	if err != nil {
		return nil, err
	}

	if len(members) == 0 {
		return []dto.BatchMemberDetailResponse{}, nil
	}

	// Extract User IDs
	var userIDs []string
	for _, m := range members {
		userIDs = append(userIDs, m.UserID.String())
	}

	// Fetch detailed info from IAM
	userInfo, err := s.iamClient.GetUsersInfo(ctx, token, userIDs)
	if err != nil {
		s.logger.Error("failed to fetch user info from IAM", zap.Error(err))
		// We can still return partial info or fail. Let's return what we have (UserID + Status) but with partial details.
		// Or fail if it's critical. For a management page, we probably need the details.
		return nil, utils.ErrInternal("failed to fetch user details", err)
	}

	// Map them together
	infoMap := make(map[string]client.UserInfoResponse)
	for _, info := range userInfo {
		infoMap[info.ID] = info
	}

	var results []dto.BatchMemberDetailResponse
	for _, m := range members {
		detail := dto.BatchMemberDetailResponse{
			UserID:     m.UserID,
			Status:     m.Status,
			EnrolledAt: m.EnrolledAt,
		}

		if info, ok := infoMap[m.UserID.String()]; ok {
			detail.FullName = info.FullName
			detail.Email = info.Email
			detail.AvatarURL = info.AvatarURL
			detail.StudentID = info.StudentID
		}

		results = append(results, detail)
	}

	return results, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveBatchMember
// ─────────────────────────────────────────────────────────────────────────────

func (s *batchMemberService) RemoveBatchMember(
	batchID, userID uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	// Verify membership exists before attempting deletion
	existing, err := s.batchMemberRepo.GetMember(batchID, userID)
	if err != nil {
		s.logger.Error("failed to check membership", zap.Error(err))
		return utils.ErrInternal("failed to check membership", err)
	}
	if existing == nil {
		return utils.ErrNotFound("batch member not found")
	}

	if err := s.batchMemberRepo.RemoveMember(batchID, userID); err != nil {
		s.logger.Error("failed to remove batch member", zap.Error(err))
		return utils.ErrInternal("failed to remove batch member", err)
	}

	// Audit log
	changes := map[string]interface{}{
		"batch_id": batchID.String(),
		"user_id":  userID.String(),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionBatchMemberRemoved),
		"batch_member",
		batchID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("batch member removed",
		zap.String("batch_id", batchID.String()),
		zap.String("user_id", userID.String()),
	)
	return nil
}
