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

// CourseInstructorService defines the business-logic contract for instructor
// assignment management.
type CourseInstructorService interface {
	AssignInstructor(req *dto.AssignInstructorRequest, username, ipAddress, userAgent string) (*domain.CourseInstructor, error)
	GetInstructors(instanceID uuid.UUID) ([]domain.CourseInstructor, error)
	RemoveInstructor(instanceID, userID uuid.UUID, username, ipAddress, userAgent string) error
	GetMyInstances(userID uuid.UUID) ([]domain.CourseInstructor, error)
	GetCourseInstance(id uuid.UUID) (*domain.CourseInstance, error)
}

// courseInstructorService is the concrete implementation.
type courseInstructorService struct {
	courseInstanceRepo   repository.CourseInstanceRepository
	courseInstructorRepo repository.CourseInstructorRepository
	auditClient          *client.AuditClient
	logger               *zap.Logger
}

// NewCourseInstructorService wires all dependencies together.
func NewCourseInstructorService(
	courseInstanceRepo repository.CourseInstanceRepository,
	courseInstructorRepo repository.CourseInstructorRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) CourseInstructorService {
	return &courseInstructorService{
		courseInstanceRepo:   courseInstanceRepo,
		courseInstructorRepo: courseInstructorRepo,
		auditClient:          auditClient,
		logger:               logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignInstructor
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstructorService) AssignInstructor(
	req *dto.AssignInstructorRequest,
	username, ipAddress, userAgent string,
) (*domain.CourseInstructor, error) {
	// 1. Validate required fields
	if req.CourseInstanceID == uuid.Nil {
		return nil, utils.ErrBadRequest("course_instance_id is required")
	}
	if req.UserID == uuid.Nil {
		return nil, utils.ErrBadRequest("user_id is required")
	}
	if req.Role == "" {
		return nil, utils.ErrBadRequest("role is required")
	}
	if !domain.IsValidInstructorRole(req.Role) {
		return nil, utils.ErrBadRequest("invalid role: allowed values are Lead Instructor, Instructor, TA")
	}

	// 2. Validate course instance exists
	instance, err := s.courseInstanceRepo.GetByID(req.CourseInstanceID)
	if err != nil {
		s.logger.Error("failed to load course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course instance", err)
	}
	if instance == nil {
		return nil, utils.ErrNotFound("course instance not found")
	}

	// 3. Guard against duplicate assignment
	existing, err := s.courseInstructorRepo.GetInstructor(req.CourseInstanceID, req.UserID)
	if err != nil {
		s.logger.Error("failed to check existing instructor assignment", zap.Error(err))
		return nil, utils.ErrInternal("failed to check existing instructor assignment", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("instructor is already assigned to this course instance")
	}

	// 4. Persist assignment
	instructor := &domain.CourseInstructor{
		CourseInstanceID: req.CourseInstanceID,
		UserID:           req.UserID,
		Role:             req.Role,
	}

	if err := s.courseInstructorRepo.AssignInstructor(instructor); err != nil {
		s.logger.Error("failed to assign instructor", zap.Error(err))
		return nil, utils.ErrInternal("failed to assign instructor", err)
	}

	// 5. Write audit log (non-blocking)
	changes := map[string]interface{}{
		"course_instance_id": req.CourseInstanceID.String(),
		"user_id":            req.UserID.String(),
		"role":               req.Role,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseInstructorAssigned),
		"course_instructor",
		req.CourseInstanceID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("instructor assigned",
		zap.String("course_instance_id", req.CourseInstanceID.String()),
		zap.String("user_id", req.UserID.String()),
		zap.String("role", req.Role),
	)
	return instructor, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetInstructors
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstructorService) GetInstructors(instanceID uuid.UUID) ([]domain.CourseInstructor, error) {
	// Verify the course instance exists so callers receive a meaningful 404
	// instead of an empty list for a non-existent instance.
	instance, err := s.courseInstanceRepo.GetByID(instanceID)
	if err != nil {
		s.logger.Error("failed to load course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to load course instance", err)
	}
	if instance == nil {
		return nil, utils.ErrNotFound("course instance not found")
	}

	instructors, err := s.courseInstructorRepo.GetByCourseInstance(instanceID)
	if err != nil {
		s.logger.Error("failed to list instructors", zap.Error(err))
		return nil, utils.ErrInternal("failed to list instructors", err)
	}

	return instructors, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveInstructor
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstructorService) RemoveInstructor(
	instanceID, userID uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	// Verify the assignment exists before attempting deletion
	existing, err := s.courseInstructorRepo.GetInstructor(instanceID, userID)
	if err != nil {
		s.logger.Error("failed to check instructor assignment", zap.Error(err))
		return utils.ErrInternal("failed to check instructor assignment", err)
	}
	if existing == nil {
		return utils.ErrNotFound("instructor assignment not found")
	}

	if err := s.courseInstructorRepo.RemoveInstructor(instanceID, userID); err != nil {
		s.logger.Error("failed to remove instructor", zap.Error(err))
		return utils.ErrInternal("failed to remove instructor", err)
	}

	// Audit log
	changes := map[string]interface{}{
		"course_instance_id": instanceID.String(),
		"user_id":            userID.String(),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionCourseInstructorRemoved),
		"course_instructor",
		instanceID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("instructor removed",
		zap.String("course_instance_id", instanceID.String()),
		zap.String("user_id", userID.String()),
	)
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetMyInstances
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstructorService) GetMyInstances(userID uuid.UUID) ([]domain.CourseInstructor, error) {
	if userID == uuid.Nil {
		return nil, utils.ErrBadRequest("user_id is required")
	}

	instructors, err := s.courseInstructorRepo.GetByUserID(userID)
	if err != nil {
		s.logger.Error("failed to list instructor assignments", zap.Error(err))
		return nil, utils.ErrInternal("failed to list instructor assignments", err)
	}

	return instructors, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetCourseInstance
// ─────────────────────────────────────────────────────────────────────────────

func (s *courseInstructorService) GetCourseInstance(id uuid.UUID) (*domain.CourseInstance, error) {
	if id == uuid.Nil {
		return nil, utils.ErrBadRequest("invalid course instance id")
	}

	instance, err := s.courseInstanceRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to fetch course instance", zap.Error(err))
		return nil, utils.ErrInternal("failed to fetch course instance", err)
	}
	if instance == nil {
		return nil, utils.ErrNotFound("course instance not found")
	}

	return instance, nil
}
