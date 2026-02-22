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

// SemesterService defines the business-logic contract for semester management.
type SemesterService interface {
	CreateSemester(req *dto.CreateSemesterRequest, username, ipAddress, userAgent string) (*domain.Semester, error)
	UpdateSemester(id uuid.UUID, req *dto.UpdateSemesterRequest, username, ipAddress, userAgent string) (*domain.Semester, error)
	DeactivateSemester(id uuid.UUID, username, ipAddress, userAgent string) error
	GetSemester(id uuid.UUID) (*domain.Semester, error)
	ListSemesters(includeInactive bool, termType string) ([]domain.Semester, error)
}

// semesterService is the concrete implementation.
type semesterService struct {
	semesterRepo repository.SemesterRepository
	auditClient  *client.AuditClient
	logger       *zap.Logger
}

// NewSemesterService wires all dependencies together.
func NewSemesterService(
	semesterRepo repository.SemesterRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) SemesterService {
	return &semesterService{
		semesterRepo: semesterRepo,
		auditClient:  auditClient,
		logger:       logger,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateSemester
// ─────────────────────────────────────────────────────────────────────────────

func (s *semesterService) CreateSemester(
	req *dto.CreateSemesterRequest,
	username, ipAddress, userAgent string,
) (*domain.Semester, error) {
	// Validate required fields
	if req.Name == "" {
		return nil, utils.ErrBadRequest("name is required")
	}
	if req.Code == "" {
		return nil, utils.ErrBadRequest("code is required")
	}
	if req.TermType == "" {
		return nil, utils.ErrBadRequest("term_type is required")
	}
	if !domain.IsValidTermType(req.TermType) {
		return nil, utils.ErrBadRequest("invalid term_type: allowed values are Fall, Spring, Summer, Winter")
	}
	if req.StartDate == "" {
		return nil, utils.ErrBadRequest("start_date is required")
	}
	if req.EndDate == "" {
		return nil, utils.ErrBadRequest("end_date is required")
	}

	// Default status to Planned when not provided
	if req.Status == "" {
		req.Status = domain.SemesterStatusPlanned
	}
	if !domain.IsValidSemesterStatus(req.Status) {
		return nil, utils.ErrBadRequest("invalid status: allowed values are Planned, Active, Completed, Cancelled")
	}

	// Enforce unique code
	existing, err := s.semesterRepo.GetByCode(req.Code)
	if err != nil {
		s.logger.Error("failed to check semester code uniqueness", zap.Error(err))
		return nil, utils.ErrInternal("failed to check semester code uniqueness", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("a semester with this code already exists")
	}

	semester := &domain.Semester{
		Name:      req.Name,
		Code:      req.Code,
		TermType:  req.TermType,
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
		Status:    req.Status,
		IsActive:  true,
	}

	if err := s.semesterRepo.Create(semester); err != nil {
		s.logger.Error("failed to create semester", zap.Error(err))
		return nil, utils.ErrInternal("failed to create semester", err)
	}

	changes := map[string]interface{}{
		"name":       semester.Name,
		"code":       semester.Code,
		"term_type":  semester.TermType,
		"start_date": semester.StartDate,
		"end_date":   semester.EndDate,
		"status":     semester.Status,
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionSemesterCreated),
		"semester",
		semester.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("semester created",
		zap.String("id", semester.ID.String()),
		zap.String("code", semester.Code),
	)
	return semester, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// UpdateSemester
// ─────────────────────────────────────────────────────────────────────────────

func (s *semesterService) UpdateSemester(
	id uuid.UUID,
	req *dto.UpdateSemesterRequest,
	username, ipAddress, userAgent string,
) (*domain.Semester, error) {
	semester, err := s.semesterRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load semester", zap.Error(err))
		return nil, utils.ErrInternal("failed to load semester", err)
	}
	if semester == nil {
		return nil, utils.ErrNotFound("semester not found")
	}

	changes := make(map[string]interface{})

	if req.Name != "" && req.Name != semester.Name {
		changes["name"] = map[string]interface{}{"from": semester.Name, "to": req.Name}
		semester.Name = req.Name
	}
	if req.TermType != "" && req.TermType != semester.TermType {
		if !domain.IsValidTermType(req.TermType) {
			return nil, utils.ErrBadRequest("invalid term_type: allowed values are Fall, Spring, Summer, Winter")
		}
		changes["term_type"] = map[string]interface{}{"from": semester.TermType, "to": req.TermType}
		semester.TermType = req.TermType
	}
	if req.StartDate != "" && req.StartDate != semester.StartDate {
		changes["start_date"] = map[string]interface{}{"from": semester.StartDate, "to": req.StartDate}
		semester.StartDate = req.StartDate
	}
	if req.EndDate != "" && req.EndDate != semester.EndDate {
		changes["end_date"] = map[string]interface{}{"from": semester.EndDate, "to": req.EndDate}
		semester.EndDate = req.EndDate
	}
	if req.Status != "" && req.Status != semester.Status {
		if !domain.IsValidSemesterStatus(req.Status) {
			return nil, utils.ErrBadRequest("invalid status: allowed values are Planned, Active, Completed, Cancelled")
		}
		changes["status"] = map[string]interface{}{"from": semester.Status, "to": req.Status}
		semester.Status = req.Status
	}
	if req.IsActive != nil && *req.IsActive != semester.IsActive {
		changes["is_active"] = map[string]interface{}{"from": semester.IsActive, "to": *req.IsActive}
		semester.IsActive = *req.IsActive
	}

	if err := s.semesterRepo.Update(semester); err != nil {
		s.logger.Error("failed to update semester", zap.Error(err))
		return nil, utils.ErrInternal("failed to update semester", err)
	}

	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionSemesterUpdated),
		"semester",
		semester.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("semester updated", zap.String("id", semester.ID.String()))
	return semester, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// DeactivateSemester
// ─────────────────────────────────────────────────────────────────────────────

func (s *semesterService) DeactivateSemester(
	id uuid.UUID,
	username, ipAddress, userAgent string,
) error {
	semester, err := s.semesterRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load semester", zap.Error(err))
		return utils.ErrInternal("failed to load semester", err)
	}
	if semester == nil {
		return utils.ErrNotFound("semester not found")
	}
	if !semester.IsActive {
		return utils.ErrBadRequest("semester is already inactive")
	}

	semester.IsActive = false
	if err := s.semesterRepo.Update(semester); err != nil {
		s.logger.Error("failed to deactivate semester", zap.Error(err))
		return utils.ErrInternal("failed to deactivate semester", err)
	}

	changes := map[string]interface{}{
		"is_active": map[string]interface{}{"from": true, "to": false},
	}
	if auditErr := s.auditClient.LogAction(
		string(client.AuditActionSemesterDeactivated),
		"semester",
		semester.ID.String(),
		0,
		username,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to write audit log", zap.Error(auditErr))
	}

	s.logger.Info("semester deactivated", zap.String("id", semester.ID.String()))
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// GetSemester
// ─────────────────────────────────────────────────────────────────────────────

func (s *semesterService) GetSemester(id uuid.UUID) (*domain.Semester, error) {
	semester, err := s.semesterRepo.GetByID(id)
	if err != nil {
		s.logger.Error("failed to load semester", zap.Error(err))
		return nil, utils.ErrInternal("failed to load semester", err)
	}
	if semester == nil {
		return nil, utils.ErrNotFound("semester not found")
	}
	return semester, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ListSemesters
// ─────────────────────────────────────────────────────────────────────────────

func (s *semesterService) ListSemesters(includeInactive bool, termType string) ([]domain.Semester, error) {
	semesters, err := s.semesterRepo.List(includeInactive, termType)
	if err != nil {
		s.logger.Error("failed to list semesters", zap.Error(err))
		return nil, utils.ErrInternal("failed to list semesters", err)
	}
	return semesters, nil
}
