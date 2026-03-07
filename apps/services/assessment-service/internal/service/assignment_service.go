package service

import (
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/client"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/repository"
	"github.com/4yrg/gradeloop-core-v2/assessment-service/internal/utils"
	"github.com/google/uuid"
	"go.uber.org/zap"
	"gorm.io/datatypes"
)

// AssignmentService defines the business-logic contract for assignment management.
type AssignmentService interface {
	CreateAssignment(req *dto.CreateAssignmentRequest, createdBy uuid.UUID, username, ipAddress, userAgent string) (*domain.Assignment, error)
	GetAssignmentByID(id uuid.UUID) (*domain.Assignment, error)
	UpdateAssignment(id uuid.UUID, req *dto.UpdateAssignmentRequest, username, ipAddress, userAgent string) (*domain.Assignment, error)
	ListAssignmentsByCourseInstance(courseInstanceID uuid.UUID) ([]domain.Assignment, error)

	// Content sub-resources
	GetAssignmentRubric(assignmentID uuid.UUID) ([]domain.AssignmentRubricCriterion, error)
	UpdateRubricCriteria(assignmentID uuid.UUID, req []dto.CreateRubricCriterionRequest) ([]domain.AssignmentRubricCriterion, error)
	GetAssignmentTestCases(assignmentID uuid.UUID) ([]domain.AssignmentTestCase, error)
	GetAssignmentSampleAnswer(assignmentID uuid.UUID) (*domain.AssignmentSampleAnswer, error)
}

// assignmentService is the concrete implementation.
type assignmentService struct {
	assignmentRepo repository.AssignmentRepository
	contentRepo    repository.AssignmentContentRepository
	auditClient    *client.AuditClient
	logger         *zap.Logger
}

// NewAssignmentService wires all dependencies and returns an AssignmentService.
func NewAssignmentService(
	assignmentRepo repository.AssignmentRepository,
	contentRepo repository.AssignmentContentRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) AssignmentService {
	return &assignmentService{
		assignmentRepo: assignmentRepo,
		contentRepo:    contentRepo,
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
	assignmentType := "lab"
	if req.AssessmentType != "" {
		assignmentType = req.AssessmentType
	}

	// Resolve feature-flag defaults: AI grading and socratic feedback are ON by
	// default; allow_regenerate is OFF by default. Callers may override by
	// sending an explicit bool in the request.
	enableAIAssistant := true
	if req.EnableAIAssistant != nil {
		enableAIAssistant = *req.EnableAIAssistant
	}
	enableSocratic := true
	if req.EnableSocraticFeedback != nil {
		enableSocratic = *req.EnableSocraticFeedback
	}
	allowRegenerate := false
	if req.AllowRegenerate != nil {
		allowRegenerate = *req.AllowRegenerate
	}

	assignment := &domain.Assignment{
		CourseInstanceID: req.CourseInstanceID,

		Title:          req.Title,
		Description:    req.Description,
		Code:           req.Code,
		AssessmentType: assignmentType,
		Objective:      req.Objective,

		ReleaseAt: req.ReleaseAt,
		DueAt:     req.DueAt,
		LateDueAt: req.LateDueAt,

		AllowLateSubmissions: req.AllowLateSubmissions,
		EnforceTimeLimit:     req.EnforceTimeLimit,

		AllowGroupSubmission: req.AllowGroupSubmission,
		MaxGroupSize:         maxGroupSize,

		EnableAIAssistant:      enableAIAssistant,
		EnableSocraticFeedback: enableSocratic,
		AllowRegenerate:        allowRegenerate,

		IsActive:  true,
		CreatedBy: createdBy,
	}

	// Propagate language: top-level req.LanguageID (from the "Programming
	// Language" selector) takes precedence. Fall back to the sample answer's
	// language, then default to 71 (Python 3.8.1).
	switch {
	case req.LanguageID > 0:
		assignment.LanguageID = req.LanguageID
	case req.SampleAnswer != nil && req.SampleAnswer.LanguageID > 0:
		assignment.LanguageID = req.SampleAnswer.LanguageID
	default:
		assignment.LanguageID = 71 // default: Python 3.8.1
	}

	// 5. Persist assignment row
	if err := s.assignmentRepo.CreateAssignment(assignment); err != nil {
		s.logger.Error("failed to create assignment", zap.Error(err))
		return nil, utils.ErrInternal("failed to create assignment", err)
	}

	// 5b. Persist inline content sub-resources
	if len(req.RubricCriteria) > 0 {
		criteria := make([]domain.AssignmentRubricCriterion, 0, len(req.RubricCriteria))
		for i, rc := range req.RubricCriteria {
			bandsJSON := datatypes.JSON([]byte("{}"))
			if len(rc.Bands) > 0 {
				bandsJSON = datatypes.JSON(rc.Bands)
			}
			criterion := domain.AssignmentRubricCriterion{
				AssignmentID: assignment.ID,
				Name:         rc.Name,
				Description:  rc.Description,
				GradingMode:  rc.GradingMode,
				Weight:       rc.Weight,
				Bands:        bandsJSON,
				OrderIndex:   rc.OrderIndex,
			}
			if criterion.OrderIndex == 0 {
				criterion.OrderIndex = i + 1
			}
			criteria = append(criteria, criterion)
		}
		if err := s.contentRepo.CreateRubricCriteria(criteria); err != nil {
			s.logger.Warn("failed to persist rubric criteria", zap.Error(err))
		}
	}

	if len(req.TestCases) > 0 {
		testCases := make([]domain.AssignmentTestCase, 0, len(req.TestCases))
		for i, tc := range req.TestCases {
			testCase := domain.AssignmentTestCase{
				AssignmentID:   assignment.ID,
				Description:    tc.Description,
				Input:          tc.Input,
				ExpectedOutput: tc.ExpectedOutput,
				IsHidden:       tc.IsHidden,
				OrderIndex:     tc.OrderIndex,
			}
			if testCase.OrderIndex == 0 {
				testCase.OrderIndex = i + 1
			}
			testCases = append(testCases, testCase)
		}
		if err := s.contentRepo.CreateTestCases(testCases); err != nil {
			s.logger.Warn("failed to persist test cases", zap.Error(err))
		}
	}

	if req.SampleAnswer != nil {
		answer := &domain.AssignmentSampleAnswer{
			AssignmentID: assignment.ID,
			LanguageID:   req.SampleAnswer.LanguageID,
			Language:     req.SampleAnswer.Language,
			Code:         req.SampleAnswer.Code,
		}
		if err := s.contentRepo.UpsertSampleAnswer(answer); err != nil {
			s.logger.Warn("failed to persist sample answer", zap.Error(err))
		}
	}

	// 6. Audit log
	changes := map[string]interface{}{
		"course_instance_id":       req.CourseInstanceID.String(),
		"title":                    req.Title,
		"allow_group_submission":   req.AllowGroupSubmission,
		"max_group_size":           maxGroupSize,
		"enable_ai_assistant":      enableAIAssistant,
		"enable_socratic_feedback": enableSocratic,
		"allow_regenerate":         allowRegenerate,
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

// ─────────────────────────────────────────────────────────────────────────────
// Content sub-resource getters
// ─────────────────────────────────────────────────────────────────────────────

func (s *assignmentService) GetAssignmentRubric(assignmentID uuid.UUID) ([]domain.AssignmentRubricCriterion, error) {
	criteria, err := s.contentRepo.ListRubricCriteria(assignmentID)
	if err != nil {
		s.logger.Error("failed to list rubric criteria", zap.String("assignment_id", assignmentID.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load rubric", err)
	}
	return criteria, nil
}

// UpdateRubricCriteria replaces all rubric criteria for an assignment atomically.
// It deletes all existing rows then inserts the new set in one DB round-trip each.
func (s *assignmentService) UpdateRubricCriteria(assignmentID uuid.UUID, req []dto.CreateRubricCriterionRequest) ([]domain.AssignmentRubricCriterion, error) {
	if err := s.contentRepo.DeleteRubricCriteria(assignmentID); err != nil {
		s.logger.Error("failed to delete rubric criteria", zap.String("assignment_id", assignmentID.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to replace rubric", err)
	}

	if len(req) == 0 {
		return []domain.AssignmentRubricCriterion{}, nil
	}

	criteria := make([]domain.AssignmentRubricCriterion, 0, len(req))
	for i, r := range req {
		criteria = append(criteria, domain.AssignmentRubricCriterion{
			AssignmentID: assignmentID,
			Name:         r.Name,
			Description:  r.Description,
			GradingMode:  r.GradingMode,
			Weight:       r.Weight,
			Bands:        datatypes.JSON(r.Bands),
			OrderIndex:   r.OrderIndex,
		})
		if criteria[i].GradingMode == "" {
			criteria[i].GradingMode = "llm"
		}
	}

	if err := s.contentRepo.CreateRubricCriteria(criteria); err != nil {
		s.logger.Error("failed to create rubric criteria", zap.String("assignment_id", assignmentID.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to save rubric", err)
	}

	s.logger.Info("rubric criteria updated",
		zap.String("assignment_id", assignmentID.String()),
		zap.Int("count", len(criteria)),
	)

	return criteria, nil
}

func (s *assignmentService) GetAssignmentTestCases(assignmentID uuid.UUID) ([]domain.AssignmentTestCase, error) {
	cases, err := s.contentRepo.ListTestCases(assignmentID)
	if err != nil {
		s.logger.Error("failed to list test cases", zap.String("assignment_id", assignmentID.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load test cases", err)
	}
	return cases, nil
}

func (s *assignmentService) GetAssignmentSampleAnswer(assignmentID uuid.UUID) (*domain.AssignmentSampleAnswer, error) {
	answer, err := s.contentRepo.GetSampleAnswer(assignmentID)
	if err != nil {
		s.logger.Error("failed to load sample answer", zap.String("assignment_id", assignmentID.String()), zap.Error(err))
		return nil, utils.ErrInternal("failed to load sample answer", err)
	}
	return answer, nil
}
