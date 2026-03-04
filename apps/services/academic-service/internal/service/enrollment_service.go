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

// EnrollmentService defines the business-logic contract for student enrollment
// management.
type EnrollmentService interface {
	EnrollStudent(req *dto.EnrollmentRequest, username, ipAddress, userAgent string) (*domain.Enrollment, error)
	UpdateEnrollment(instanceID, userID uuid.UUID, req *dto.UpdateEnrollmentRequest, username, ipAddress, userAgent string) (*domain.Enrollment, error)
	GetEnrollments(instanceID uuid.UUID) ([]domain.Enrollment, error)
	RemoveEnrollment(instanceID, userID uuid.UUID, username, ipAddress, userAgent string) error
}

// enrollmentService is the concrete implementation.
type enrollmentService struct {
	courseInstanceRepo repository.CourseInstanceRepository
	batchMemberRepo    repository.BatchMemberRepository
	enrollmentRepo     repository.EnrollmentRepository
	auditClient        *client.AuditClient
	logger             *zap.Logger
}

// NewEnrollmentService wires all dependencies together.
func NewEnrollmentService(
	courseInstanceRepo repository.CourseInstanceRepository,
	batchMemberRepo repository.BatchMemberRepository,
	enrollmentRepo repository.EnrollmentRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) EnrollmentService {
	return &enrollmentService{
		courseInstanceRepo: courseInstanceRepo,
		batchMemberRepo:    batchMemberRepo,
		enrollmentRepo:     enrollmentRepo,
		auditClient:        auditClient,
		logger:             logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// EnrollStudent
// ─────────────────────────────────────────────────────────────────────────────

func (s *enrollmentService) EnrollStudent(
	req *dto.EnrollmentRequest,
	username, ipAddress, userAgent string,
) (*domain.Enrollment, error) {
	// 1. Validate required fields
	if req.CourseInstanceID == uuid.Nil {
		return nil, utils.ErrBadRequest("course_instance_id is required")
	}
	if req.UserID == uuid.Nil {
		return nil, utils.ErrBadRequest("user_id is required")
	}

	// Default status to Enrolled when not provided
	if req.Status == "" {
		req.Status = domain.EnrollmentStatusEnrolled
	}
	if !domain.IsValidEnrollmentStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Enrolled, Dropped, Completed, Failed")
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

	// 3. Validate the student belongs to the batch that owns this course instance,
	//    unless allow_individual is explicitly set (for individual enrollments outside batch).
	//    batch_members.batch_id = instance.batch_id AND user_id = req.UserID
	if !req.AllowIndividual {
		membership, err := s.batchMemberRepo.GetMember(instance.BatchID, req.UserID)
		if err != nil {
			s.logger.Error("failed to check batch membership", zap.Error(err))
			return nil, utils.ErrInternal("failed to check batch membership", err)
		}
		if membership == nil {
			return nil, utils.ErrBadRequest("student not in batch")
		}
	}

	// 4. Guard against duplicate enrollment
	existing, err := s.enrollmentRepo.GetEnrollment(req.CourseInstanceID, req.UserID)
	if err != nil {
		s.logger.Error("failed to check existing enrollment", zap.Error(err))
		return nil, utils.ErrInternal("failed to check existing enrollment", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("student is already enrolled in this course instance")
	}

	// 5. Persist enrollment
	enrollment := &domain.Enrollment{
		CourseInstanceID: req.CourseInstanceID,
		UserID:           req.UserID,
		Status:           req.Status,
	}

	if err := s.enrollmentRepo.EnrollStudent(enrollment); err != nil {
		s.logger.Error("failed to enroll student", zap.Error(err))
		return nil, utils.ErrInternal("failed to enroll student", err)
	}

	// 6. Write audit log (non-blocking — failure is warned but never propagated)
	changes := map[string]interface{}{
		"course_instance_id": req.CourseInstanceID.String(),
		"user_id":            req.UserID.String(),
		"status":             req.Status,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionStudentEnrolled),
		"enrollment",
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

	s.logger.Info("student enrolled",
		zap.String("course_instance_id", req.CourseInstanceID.String()),
		zap.String("user_id", req.UserID.String()),
	)
	return enrollment, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateEnrollment
// ─────────────────────────────────────────────────────────────────────────────

func (s *enrollmentService) UpdateEnrollment(
	instanceID, userID uuid.UUID,
	req *dto.UpdateEnrollmentRequest,
	username, ipAddress, userAgent string,
) (*domain.Enrollment, error) {
	// 1. Validate status when provided
	if req.Status != "" && !domain.IsValidEnrollmentStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Enrolled, Dropped, Completed, Failed")
	}

	// 2. Load existing enrollment
	enrollment, err := s.enrollmentRepo.GetEnrollment(instanceID, userID)
	if err != nil {
		s.logger.Error("failed to load enrollment", zap.Error(err))
		return nil, utils.ErrInternal("failed to load enrollment", err)
	}
	if enrollment == nil {
		return nil, utils.ErrNotFound("enrollment not found")
	}

	// 3. Apply changes — only override fields that were explicitly supplied
	oldStatus := enrollment.Status
	oldGrade := enrollment.FinalGrade

	if req.Status != "" {
		enrollment.Status = req.Status
	}
	if req.FinalGrade != "" {
		enrollment.FinalGrade = req.FinalGrade
	}

	if err := s.enrollmentRepo.UpdateEnrollment(enrollment); err != nil {
		s.logger.Error("failed to update enrollment", zap.Error(err))
		return nil, utils.ErrInternal("failed to update enrollment", err)
	}

	// 4. Write audit log
	changes := map[string]interface{}{
		"status": map[string]string{
			"from": oldStatus,
			"to":   enrollment.Status,
		},
		"final_grade": map[string]string{
			"from": oldGrade,
			"to":   enrollment.FinalGrade,
		},
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionEnrollmentUpdated),
		"enrollment",
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

	s.logger.Info("enrollment updated",
		zap.String("course_instance_id", instanceID.String()),
		zap.String("user_id", userID.String()),
	)
	return enrollment, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetEnrollments
// ─────────────────────────────────────────────────────────────────────────────

func (s *enrollmentService) GetEnrollments(instanceID uuid.UUID) ([]domain.Enrollment, error) {
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

	enrollments, err := s.enrollmentRepo.GetEnrollments(instanceID)
	if err != nil {
		s.logger.Error("failed to list enrollments", zap.Error(err))
		return nil, utils.ErrInternal("failed to list enrollments", err)
	}

	return enrollments, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveEnrollment
// ─────────────────────────────────────────────────────────────────────────────

func (s *enrollmentService) RemoveEnrollment(
	instanceID, userID uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	// Verify the enrollment exists before attempting deletion
	existing, err := s.enrollmentRepo.GetEnrollment(instanceID, userID)
	if err != nil {
		s.logger.Error("failed to check enrollment", zap.Error(err))
		return utils.ErrInternal("failed to check enrollment", err)
	}
	if existing == nil {
		return utils.ErrNotFound("enrollment not found")
	}

	if err := s.enrollmentRepo.RemoveEnrollment(instanceID, userID); err != nil {
		s.logger.Error("failed to remove enrollment", zap.Error(err))
		return utils.ErrInternal("failed to remove enrollment", err)
	}

	// Audit log
	changes := map[string]interface{}{
		"course_instance_id": instanceID.String(),
		"user_id":            userID.String(),
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionEnrollmentRemoved),
		"enrollment",
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

	s.logger.Info("enrollment removed",
		zap.String("course_instance_id", instanceID.String()),
		zap.String("user_id", userID.String()),
	)
	return nil
}
