package service

import (
	"github.com/google/uuid"
	"github.com/gradeloop/assessment-service/internal/client"
	"github.com/gradeloop/assessment-service/internal/domain"
	"github.com/gradeloop/assessment-service/internal/dto"
	"github.com/gradeloop/assessment-service/internal/repository"
	"github.com/gradeloop/assessment-service/internal/utils"
	"go.uber.org/zap"
)

// AssignmentService defines the business-logic contract for assignment management.
type AssignmentService interface {
	CreateAssignment(req *dto.CreateAssignmentRequest, createdBy uuid.UUID, username, ipAddress, userAgent string) (*domain.Assignment, error)
	GetAssignmentByID(id uuid.UUID) (*domain.Assignment, error)
	UpdateAssignment(id uuid.UUID, req *dto.UpdateAssignmentRequest, username, ipAddress, userAgent string) (*domain.Assignment, error)
	ListAssignmentsByCourseInstance(courseInstanceID uuid.UUID) ([]domain.Assignment, error)
}

// assignmentService is the concrete implementation.
type assignmentService struct {
	assignmentRepo repository.AssignmentRepository
	auditClient    *client.AuditClient
	logger         *zap.Logger
}

// NewAssignmentService wires all dependencies and returns an AssignmentService.
func NewAssignmentService(
	assignmentRepo repository.AssignmentRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) AssignmentService {
	return &assignmentService{
		assignmentRepo: assignmentRepo,
		auditClient:    auditClient,
		logger:         logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateAssignment
// ─────────────────────────────────────────────────────────────────────────────

func (s *assignmentService) CreateAssignment(
	req *dto.CreateAssignmentRequest,
	createdBy uuid.UUID,
	username, ipAddress, userAgent string,
) (*domain.Assignment, error) {
	// 1. Required fields
	if req.CourseInstanceID == uuid.Nil {
		return nil, utils.ErrBadRequest("course_instance_id is required")
	}
	if req.Title == "" {
		return nil, utils.ErrBadRequest("title is required")
	}

	// 2. Late due date must not precede due date
	if req.DueAt != nil && req.LateDueAt != nil {
		if req.LateDueAt.Before(*req.DueAt) {
			return nil, utils.ErrBadRequest("invalid late_due_at: must be on or after due_at")
		}
	}

	// 3. Group submission validation
	maxGroupSize := 1
	if req.MaxGroupSize != nil {
		maxGroupSize = *req.MaxGroupSize
	}
	if req.AllowGroupSubmission {
		if maxGroupSize < 2 {
			return nil, utils.ErrBadRequest("max_group_size must be at least 2 when allow_group_submission is true")
		}
	} else {
		// Enforce max_group_size = 1 when group submission is disabled
		maxGroupSize = 1
	}

	// 4. Build domain model
	assignment := &domain.Assignment{
		CourseInstanceID: req.CourseInstanceID,

		Title:       req.Title,
		Description: req.Description,
		Code:        req.Code,

		ReleaseAt: req.ReleaseAt,
		DueAt:     req.DueAt,
		LateDueAt: req.LateDueAt,

		AllowLateSubmissions: req.AllowLateSubmissions,
		EnforceTimeLimit:     req.EnforceTimeLimit,

		AllowGroupSubmission: req.AllowGroupSubmission,
		MaxGroupSize:         maxGroupSize,

		EnableAIAssistant:      req.EnableAIAssistant,
		EnableSocraticFeedback: req.EnableSocraticFeedback,
		AllowRegenerate:        req.AllowRegenerate,

		IsActive:  true,
		CreatedBy: createdBy,
	}

	// 5. Persist
	if err := s.assignmentRepo.CreateAssignment(assignment); err != nil {
		s.logger.Error("failed to create assignment", zap.Error(err))
		return nil, utils.ErrInternal("failed to create assignment", err)
	}

	// 6. Audit log
	changes := map[string]interface{}{
		"course_instance_id":       req.CourseInstanceID.String(),
		"title":                    req.Title,
		"allow_group_submission":   req.AllowGroupSubmission,
		"max_group_size":           maxGroupSize,
		"enable_ai_assistant":      req.EnableAIAssistant,
		"enable_socratic_feedback": req.EnableSocraticFeedback,
		"allow_regenerate":         req.AllowRegenerate,
		"is_active":                true,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionAssignmentCreated),
		"assignment",
		assignment.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("assignment created",
		zap.String("id", assignment.ID.String()),
		zap.String("course_instance_id", req.CourseInstanceID.String()),
		zap.String("title", req.Title),
	)

	return assignment, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetAssignmentByID
// ─────────────────────────────────────────────────────────────────────────────

func (s *assignmentService) GetAssignmentByID(id uuid.UUID) (*domain.Assignment, error) {
	assignment, err := s.assignmentRepo.GetAssignmentByID(id)
	if err != nil {
		s.logger.Error("failed to load assignment", zap.String("id", id.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load assignment", err)
	}
	if assignment == nil {
		return nil, utils.ErrNotFound("assignment not found")
	}
	return assignment, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateAssignment  (also handles soft-delete via is_active = false)
// ─────────────────────────────────────────────────────────────────────────────

func (s *assignmentService) UpdateAssignment(
	id uuid.UUID,
	req *dto.UpdateAssignmentRequest,
	username, ipAddress, userAgent string,
) (*domain.Assignment, error) {
	// 1. Load existing record (must be active)
	assignment, err := s.assignmentRepo.GetAssignmentByID(id)
	if err != nil {
		s.logger.Error("failed to load assignment", zap.String("id", id.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load assignment", err)
	}
	if assignment == nil {
		return nil, utils.ErrNotFound("assignment not found")
	}

	// 2. Determine the effective due / late-due dates after applying updates
	effectiveDueAt := assignment.DueAt
	effectiveLateDueAt := assignment.LateDueAt

	if req.DueAt != nil {
		effectiveDueAt = req.DueAt
	}
	if req.LateDueAt != nil {
		effectiveLateDueAt = req.LateDueAt
	}

	// 3. Late due date validation on effective values
	if effectiveDueAt != nil && effectiveLateDueAt != nil {
		if effectiveLateDueAt.Before(*effectiveDueAt) {
			return nil, utils.ErrBadRequest("invalid late_due_at: must be on or after due_at")
		}
	}

	// 4. Determine effective group-submission settings
	effectiveAllowGroup := assignment.AllowGroupSubmission
	effectiveMaxGroupSize := assignment.MaxGroupSize

	if req.AllowGroupSubmission != nil {
		effectiveAllowGroup = *req.AllowGroupSubmission
	}
	if req.MaxGroupSize != nil {
		effectiveMaxGroupSize = *req.MaxGroupSize
	}

	if effectiveAllowGroup {
		if effectiveMaxGroupSize < 2 {
			return nil, utils.ErrBadRequest("max_group_size must be at least 2 when allow_group_submission is true")
		}
	} else {
		effectiveMaxGroupSize = 1
	}

	// 5. Build the changes map for auditing before mutating the struct
	changes := make(map[string]interface{})

	// 6. Apply scalar field patches
	if req.Title != nil && *req.Title != assignment.Title {
		changes["title"] = map[string]string{"from": assignment.Title, "to": *req.Title}
		assignment.Title = *req.Title
	}
	if req.Description != nil && *req.Description != assignment.Description {
		changes["description"] = map[string]string{"from": assignment.Description, "to": *req.Description}
		assignment.Description = *req.Description
	}
	if req.Code != nil && *req.Code != assignment.Code {
		changes["code"] = map[string]string{"from": assignment.Code, "to": *req.Code}
		assignment.Code = *req.Code
	}

	// Timestamp patches
	if req.ReleaseAt != nil {
		changes["release_at"] = req.ReleaseAt
		assignment.ReleaseAt = req.ReleaseAt
	}
	if req.DueAt != nil {
		changes["due_at"] = req.DueAt
		assignment.DueAt = effectiveDueAt
	}
	if req.LateDueAt != nil {
		changes["late_due_at"] = req.LateDueAt
		assignment.LateDueAt = effectiveLateDueAt
	}

	// Boolean / int patches
	if req.AllowLateSubmissions != nil && *req.AllowLateSubmissions != assignment.AllowLateSubmissions {
		changes["allow_late_submissions"] = map[string]bool{"from": assignment.AllowLateSubmissions, "to": *req.AllowLateSubmissions}
		assignment.AllowLateSubmissions = *req.AllowLateSubmissions
	}
	if req.EnforceTimeLimit != nil {
		changes["enforce_time_limit"] = req.EnforceTimeLimit
		assignment.EnforceTimeLimit = req.EnforceTimeLimit
	}

	if req.AllowGroupSubmission != nil && *req.AllowGroupSubmission != assignment.AllowGroupSubmission {
		changes["allow_group_submission"] = map[string]bool{"from": assignment.AllowGroupSubmission, "to": effectiveAllowGroup}
		assignment.AllowGroupSubmission = effectiveAllowGroup
	}
	if effectiveMaxGroupSize != assignment.MaxGroupSize {
		changes["max_group_size"] = map[string]int{"from": assignment.MaxGroupSize, "to": effectiveMaxGroupSize}
		assignment.MaxGroupSize = effectiveMaxGroupSize
	}

	if req.EnableAIAssistant != nil && *req.EnableAIAssistant != assignment.EnableAIAssistant {
		changes["enable_ai_assistant"] = map[string]bool{"from": assignment.EnableAIAssistant, "to": *req.EnableAIAssistant}
		assignment.EnableAIAssistant = *req.EnableAIAssistant
	}
	if req.EnableSocraticFeedback != nil && *req.EnableSocraticFeedback != assignment.EnableSocraticFeedback {
		changes["enable_socratic_feedback"] = map[string]bool{"from": assignment.EnableSocraticFeedback, "to": *req.EnableSocraticFeedback}
		assignment.EnableSocraticFeedback = *req.EnableSocraticFeedback
	}
	if req.AllowRegenerate != nil && *req.AllowRegenerate != assignment.AllowRegenerate {
		changes["allow_regenerate"] = map[string]bool{"from": assignment.AllowRegenerate, "to": *req.AllowRegenerate}
		assignment.AllowRegenerate = *req.AllowRegenerate
	}

	// 7. Handle soft-delete / re-activation via is_active field
	isDeactivation := false
	if req.IsActive != nil && *req.IsActive != assignment.IsActive {
		changes["is_active"] = map[string]bool{"from": assignment.IsActive, "to": *req.IsActive}
		assignment.IsActive = *req.IsActive
		if !*req.IsActive {
			isDeactivation = true
		}
	}

	// 8. Persist
	if err := s.assignmentRepo.UpdateAssignment(assignment); err != nil {
		s.logger.Error("failed to update assignment", zap.String("id", id.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to update assignment", err)
	}

	// 9. Emit the appropriate audit action
	auditAction := string(client.AuditActionAssignmentUpdated)
	if isDeactivation {
		auditAction = string(client.AuditActionAssignmentDeactivated)
	}

	if auditErr := s.auditClient.LogAction(
		auditAction,
		"assignment",
		assignment.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("assignment updated",
		zap.String("id", assignment.ID.String()),
		zap.Bool("is_active", assignment.IsActive),
		zap.Bool("deactivated", isDeactivation),
	)

	return assignment, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListAssignmentsByCourseInstance
// ─────────────────────────────────────────────────────────────────────────────

func (s *assignmentService) ListAssignmentsByCourseInstance(courseInstanceID uuid.UUID) ([]domain.Assignment, error) {
	if courseInstanceID == uuid.Nil {
		return nil, utils.ErrBadRequest("course_instance_id is required")
	}

	assignments, err := s.assignmentRepo.ListAssignmentsByCourseInstance(courseInstanceID)
	if err != nil {
		s.logger.Error("failed to list assignments",
			zap.String("course_instance_id", courseInstanceID.String()),
			zap.Error(err),
		)
		return nil, utils.ErrInternal("failed to list assignments", err)
	}

	return assignments, nil
}
