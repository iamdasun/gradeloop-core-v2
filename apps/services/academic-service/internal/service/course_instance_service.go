package service

import (
	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
)

// CourseInstanceService defines the business-logic contract for course instance management.
type CourseInstanceService interface {
	CreateCourseInstance(req *dto.CreateCourseInstanceRequest, username, ipAddress, userAgent string) (*domain.CourseInstance, error)
	UpdateCourseInstance(id uuid.UUID, req *dto.UpdateCourseInstanceRequest, username, ipAddress, userAgent string) (*domain.CourseInstance, error)
	GetCourseInstance(id uuid.UUID) (*domain.CourseInstance, error)
	ListCourseInstancesByBatch(batchID uuid.UUID) ([]domain.CourseInstance, error)
}

// courseInstanceService is the concrete implementation.
type courseInstanceService struct {
	batchRepo          repository.BatchRepository
	courseInstanceRepo repository.CourseInstanceRepository
	auditClient        *client.AuditClient
	logger             *zap.Logger
}

// NewCourseInstanceService wires all dependencies together.
func NewCourseInstanceService(
	batchRepo repository.BatchRepository,
	courseInstanceRepo repository.CourseInstanceRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) CourseInstanceService {
	return &courseInstanceService{
		batchRepo:          batchRepo,
		courseInstanceRepo: courseInstanceRepo,
		auditClient:        auditClient,
		logger:             logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateCourseInstance
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstanceService) CreateCourseInstance(
	req *dto.CreateCourseInstanceRequest,
	username, ipAddress, userAgent string,
) (*domain.CourseInstance, error) {
	// 1. Validate required fields
	if req.CourseID == uuid.Nil {
		return nil, utils.ErrBadRequest("course_id is required")
	}
	if req.SemesterID == uuid.Nil {
		return nil, utils.ErrBadRequest("semester_id is required")
	}
	if req.BatchID == uuid.Nil {
		return nil, utils.ErrBadRequest("batch_id is required")
	}

	// Default status to Planned when not provided
	if req.Status == "" {
		req.Status = domain.CourseInstanceStatusPlanned
	}
	if !domain.IsValidCourseInstanceStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Planned, Active, Completed, Cancelled")
	}
	if req.MaxEnrollment < 0 {
		return nil, utils.ErrBadRequest("max_enrollment must be a non-negative integer")
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

	// 4. Enforce unique (course_id, semester_id, batch_id) constraint
	existing, err := s.courseInstanceRepo.GetByUnique(req.CourseID, req.SemesterID, req.BatchID)
	if err != nil {
		s.logger.Error("failed to check course instance uniqueness", zap.Error(err))
		return nil, utils.ErrInternal("failed to check course instance uniqueness", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("a course instance with the same course, semester, and batch already exists")
	}

	// 5. Persist
	instance := &domain.CourseInstance{
		CourseID:      req.CourseID,
		SemesterID:    req.SemesterID,
		BatchID:       req.BatchID,
		Status:        req.Status,
		MaxEnrollment: req.MaxEnrollment,
	}

	if err := s.courseInstanceRepo.Create(instance); err != nil {
		s.logger.Error("failed to create course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to create course instance", err)
	}

	// 6. Write audit log
	changes := map[string]interface{}{
		"course_id":      req.CourseID.String(),
		"semester_id":    req.SemesterID.String(),
		"batch_id":       req.BatchID.String(),
		"status":         req.Status,
		"max_enrollment": req.MaxEnrollment,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseInstanceCreated),
		"course_instance",
		instance.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course instance created",
		zap.String("id", instance.ID.String()),
		zap.String("batch_id", req.BatchID.String()),
	)
	return instance, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateCourseInstance
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstanceService) UpdateCourseInstance(
	id uuid.UUID,
	req *dto.UpdateCourseInstanceRequest,
	username, ipAddress, userAgent string,
) (*domain.CourseInstance, error) {
	// 1. Validate status
	if req.Status == "" {
		return nil, utils.ErrBadRequest("status is required")
	}
	if !domain.IsValidCourseInstanceStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Planned, Active, Completed, Cancelled")
	}
	if req.MaxEnrollment != nil && *req.MaxEnrollment < 0 {
		return nil, utils.ErrBadRequest("max_enrollment must be a non-negative integer")
	}

	// 2. Load existing instance
	instance, err := s.courseInstanceRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course instance", err)
	}
	if instance == nil {
		return nil, utils.ErrNotFound("course instance not found")
	}

	// 3. Apply changes
	changes := make(map[string]interface{})

	oldStatus := instance.Status
	instance.Status = req.Status
	changes["status"] = map[string]string{"from": oldStatus, "to": req.Status}

	if req.MaxEnrollment != nil && *req.MaxEnrollment != instance.MaxEnrollment {
		changes["max_enrollment"] = map[string]int{"from": instance.MaxEnrollment, "to": *req.MaxEnrollment}
		instance.MaxEnrollment = *req.MaxEnrollment
	}

	if err := s.courseInstanceRepo.Update(instance); err != nil {
		s.logger.Error("failed to update course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to update course instance", err)
	}

	// 4. Write audit log
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseInstanceUpdated),
		"course_instance",
		instance.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("course instance updated",
		zap.String("id", instance.ID.String()),
		zap.String("status", req.Status),
	)
	return instance, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetCourseInstance
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstanceService) GetCourseInstance(id uuid.UUID) (*domain.CourseInstance, error) {
	instance, err := s.courseInstanceRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course instance", err)
	}
	if instance == nil {
		return nil, utils.ErrNotFound("course instance not found")
	}
	return instance, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListCourseInstancesByBatch
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstanceService) ListCourseInstancesByBatch(batchID uuid.UUID) ([]domain.CourseInstance, error) {
	// Verify the batch exists before fetching so callers get a meaningful 404
	// rather than an empty list for a non-existent batch.
	batch, err := s.batchRepo.GetBatchByID(batchID)
	if err != nil {
		s.logger.Error("failed to load batch", zap.Error(err))
		return nil, utils.ErrInternal("failed to load batch", err)
	}
	if batch == nil {
		return nil, utils.ErrNotFound("batch not found")
	}

	instances, err := s.courseInstanceRepo.ListByBatch(batchID)
	if err != nil {
		s.logger.Error("failed to list course instances", zap.Error(err))
		return nil, utils.ErrInternal("failed to list course instances", err)
	}

	return instances, nil
}
