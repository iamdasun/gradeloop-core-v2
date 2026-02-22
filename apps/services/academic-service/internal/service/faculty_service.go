package service

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/client"
	"github.com/gradeloop/academic-service/internal/domain"
	"github.com/gradeloop/academic-service/internal/dto"
	"github.com/gradeloop/academic-service/internal/repository"
	"github.com/gradeloop/academic-service/internal/utils"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// FacultyService defines the interface for faculty business logic
type FacultyService interface {
	CreateFaculty(req *dto.CreateFacultyRequest, userID uint, email, ipAddress, userAgent string) (*domain.Faculty, error)
	UpdateFaculty(id uuid.UUID, req *dto.UpdateFacultyRequest, userID uint, email, ipAddress, userAgent string) (*domain.Faculty, error)
	DeactivateFaculty(id uuid.UUID, userID uint, email, ipAddress, userAgent string) error
	GetFacultyByID(id uuid.UUID) (*domain.Faculty, error)
	ListFaculties(includeInactive bool) ([]domain.Faculty, error)
	GetFacultyLeaders(id uuid.UUID) ([]domain.FacultyLeadership, error)
}

// facultyService is the concrete implementation
type facultyService struct {
	db             *gorm.DB
	facultyRepo    repository.FacultyRepository
	leadershipRepo repository.FacultyLeadershipRepository
	auditClient    *client.AuditClient
	logger         *zap.Logger
}

// NewFacultyService creates a new faculty service
func NewFacultyService(
	db *gorm.DB,
	facultyRepo repository.FacultyRepository,
	leadershipRepo repository.FacultyLeadershipRepository,
	auditClient *client.AuditClient,
	logger *zap.Logger,
) FacultyService {
	return &facultyService{
		db:             db,
		facultyRepo:    facultyRepo,
		leadershipRepo: leadershipRepo,
		auditClient:    auditClient,
		logger:         logger,
	}
}

// CreateFaculty creates a new faculty with leaders
func (s *facultyService) CreateFaculty(
	req *dto.CreateFacultyRequest,
	userID uint,
	email, ipAddress, userAgent string,
) (*domain.Faculty, error) {
	// Validate input
	if err := s.validateCreateRequest(req); err != nil {
		return nil, err
	}

	// Check if faculty code already exists
	existing, err := s.facultyRepo.GetFacultyByCode(req.Code)
	if err != nil {
		s.logger.Error("failed to check faculty code", zap.Error(err))
		return nil, utils.ErrInternal("failed to check faculty code", err)
	}
	if existing != nil {
		return nil, utils.ErrConflict("faculty with this code already exists")
	}

	// Create faculty entity
	faculty := &domain.Faculty{
		Name:        req.Name,
		Code:        req.Code,
		Description: req.Description,
		IsActive:    true,
	}

	// Create faculty and leaders in a transaction
	err = repository.WithTx(s.db, func(tx *gorm.DB) error {
		// Create faculty
		if err := tx.Create(faculty).Error; err != nil {
			s.logger.Error("failed to create faculty", zap.Error(err))
			return err
		}

		// Create leadership records
		leaders := make([]domain.FacultyLeadership, len(req.Leaders))
		for i, leader := range req.Leaders {
			leaders[i] = domain.FacultyLeadership{
				FacultyID: faculty.ID,
				UserID:    leader.UserID,
				Role:      leader.Role,
				IsActive:  true,
			}
		}

		if err := tx.Create(&leaders).Error; err != nil {
			s.logger.Error("failed to create faculty leaders", zap.Error(err))
			return err
		}

		faculty.Leaders = leaders
		return nil
	})

	if err != nil {
		return nil, utils.ErrInternal("failed to create faculty", err)
	}

	// Log audit event
	changes := map[string]interface{}{
		"name":          faculty.Name,
		"code":          faculty.Code,
		"description":   faculty.Description,
		"leaders_count": len(req.Leaders),
	}

	metadata := map[string]interface{}{
		"leaders": req.Leaders,
	}

	if auditErr := s.auditClient.LogFacultyAction(
		client.AuditActionFacultyCreated,
		faculty.ID,
		userID,
		email,
		changes,
		metadata,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to log audit event", zap.Error(auditErr))
	}

	s.logger.Info("faculty created successfully",
		zap.String("faculty_id", faculty.ID.String()),
		zap.String("code", faculty.Code),
	)

	return faculty, nil
}

// UpdateFaculty updates an existing faculty
func (s *facultyService) UpdateFaculty(
	id uuid.UUID,
	req *dto.UpdateFacultyRequest,
	userID uint,
	email, ipAddress, userAgent string,
) (*domain.Faculty, error) {
	// Validate input
	if err := s.validateUpdateRequest(req); err != nil {
		return nil, err
	}

	// Load existing faculty
	faculty, err := s.facultyRepo.GetFacultyByID(id)
	if err != nil {
		s.logger.Error("failed to load faculty", zap.Error(err))
		return nil, utils.ErrInternal("failed to load faculty", err)
	}
	if faculty == nil {
		return nil, utils.ErrNotFound("faculty not found")
	}

	// Track changes for audit log
	changes := make(map[string]interface{})

	// Update faculty fields
	if req.Name != "" && req.Name != faculty.Name {
		changes["name"] = map[string]interface{}{
			"old": faculty.Name,
			"new": req.Name,
		}
		faculty.Name = req.Name
	}

	if req.Description != faculty.Description {
		changes["description"] = map[string]interface{}{
			"old": faculty.Description,
			"new": req.Description,
		}
		faculty.Description = req.Description
	}

	if req.IsActive != nil && *req.IsActive != faculty.IsActive {
		changes["is_active"] = map[string]interface{}{
			"old": faculty.IsActive,
			"new": *req.IsActive,
		}
		faculty.IsActive = *req.IsActive
	}

	// Update in transaction
	err = repository.WithTx(s.db, func(tx *gorm.DB) error {
		// Update faculty
		if err := tx.Save(faculty).Error; err != nil {
			s.logger.Error("failed to update faculty", zap.Error(err))
			return err
		}

		// Update leaders if provided
		if req.Leaders != nil {
			// Delete existing leaders
			if err := tx.Where("faculty_id = ?", faculty.ID).
				Delete(&domain.FacultyLeadership{}).Error; err != nil {
				s.logger.Error("failed to delete existing leaders", zap.Error(err))
				return err
			}

			// Validate at least one leader
			if len(req.Leaders) == 0 {
				return utils.ErrBadRequest("faculty must have at least one leader")
			}

			// Create new leaders
			leaders := make([]domain.FacultyLeadership, len(req.Leaders))
			for i, leader := range req.Leaders {
				leaders[i] = domain.FacultyLeadership{
					FacultyID: faculty.ID,
					UserID:    leader.UserID,
					Role:      leader.Role,
					IsActive:  true,
				}
			}

			if err := tx.Create(&leaders).Error; err != nil {
				s.logger.Error("failed to create new leaders", zap.Error(err))
				return err
			}

			faculty.Leaders = leaders
			changes["leaders_updated"] = true
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Log audit event
	metadata := map[string]interface{}{
		"faculty_id": faculty.ID.String(),
	}
	if req.Leaders != nil {
		metadata["new_leaders"] = req.Leaders
	}

	if auditErr := s.auditClient.LogFacultyAction(
		client.AuditActionFacultyUpdated,
		faculty.ID,
		userID,
		email,
		changes,
		metadata,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to log audit event", zap.Error(auditErr))
	}

	s.logger.Info("faculty updated successfully",
		zap.String("faculty_id", faculty.ID.String()),
	)

	// Reload with leaders
	faculty, err = s.facultyRepo.GetFacultyByID(id)
	if err != nil {
		s.logger.Error("failed to reload faculty", zap.Error(err))
		return nil, utils.ErrInternal("failed to reload faculty", err)
	}

	return faculty, nil
}

// DeactivateFaculty deactivates a faculty
func (s *facultyService) DeactivateFaculty(
	id uuid.UUID,
	userID uint,
	email, ipAddress, userAgent string,
) error {
	// Load existing faculty
	faculty, err := s.facultyRepo.GetFacultyByID(id)
	if err != nil {
		s.logger.Error("failed to load faculty", zap.Error(err))
		return utils.ErrInternal("failed to load faculty", err)
	}
	if faculty == nil {
		return utils.ErrNotFound("faculty not found")
	}

	// Update is_active to false
	faculty.IsActive = false

	if err := s.facultyRepo.UpdateFaculty(faculty); err != nil {
		s.logger.Error("failed to deactivate faculty", zap.Error(err))
		return utils.ErrInternal("failed to deactivate faculty", err)
	}

	// Log audit event
	changes := map[string]interface{}{
		"is_active": map[string]interface{}{
			"old": true,
			"new": false,
		},
	}

	if auditErr := s.auditClient.LogFacultyAction(
		client.AuditActionFacultyDeactivated,
		faculty.ID,
		userID,
		email,
		changes,
		nil,
		ipAddress,
		userAgent,
	); auditErr != nil {
		s.logger.Warn("failed to log audit event", zap.Error(auditErr))
	}

	s.logger.Info("faculty deactivated successfully",
		zap.String("faculty_id", faculty.ID.String()),
	)

	return nil
}

// GetFacultyByID retrieves a faculty by ID
func (s *facultyService) GetFacultyByID(id uuid.UUID) (*domain.Faculty, error) {
	faculty, err := s.facultyRepo.GetFacultyByID(id)
	if err != nil {
		s.logger.Error("failed to get faculty", zap.Error(err))
		return nil, utils.ErrInternal("failed to get faculty", err)
	}
	if faculty == nil {
		return nil, utils.ErrNotFound("faculty not found")
	}

	return faculty, nil
}

// ListFaculties retrieves all faculties
func (s *facultyService) ListFaculties(includeInactive bool) ([]domain.Faculty, error) {
	faculties, err := s.facultyRepo.ListFaculties(includeInactive)
	if err != nil {
		s.logger.Error("failed to list faculties", zap.Error(err))
		return nil, utils.ErrInternal("failed to list faculties", err)
	}

	return faculties, nil
}

// GetFacultyLeaders retrieves all leaders for a faculty
func (s *facultyService) GetFacultyLeaders(id uuid.UUID) ([]domain.FacultyLeadership, error) {
	// Check if faculty exists
	exists, err := s.facultyRepo.FacultyExists(id)
	if err != nil {
		s.logger.Error("failed to check faculty existence", zap.Error(err))
		return nil, utils.ErrInternal("failed to check faculty existence", err)
	}
	if !exists {
		return nil, utils.ErrNotFound("faculty not found")
	}

	leaders, err := s.leadershipRepo.GetLeadersByFacultyID(id)
	if err != nil {
		s.logger.Error("failed to get faculty leaders", zap.Error(err))
		return nil, utils.ErrInternal("failed to get faculty leaders", err)
	}

	return leaders, nil
}

// validateCreateRequest validates the create faculty request
func (s *facultyService) validateCreateRequest(req *dto.CreateFacultyRequest) error {
	if req.Name == "" {
		return utils.ErrBadRequest("name is required")
	}
	if len(req.Name) < 3 || len(req.Name) > 255 {
		return utils.ErrBadRequest("name must be between 3 and 255 characters")
	}

	if req.Code == "" {
		return utils.ErrBadRequest("code is required")
	}
	if len(req.Code) < 2 || len(req.Code) > 50 {
		return utils.ErrBadRequest("code must be between 2 and 50 characters")
	}

	if len(req.Leaders) == 0 {
		return utils.ErrBadRequest("faculty must have at least one leader")
	}

	for i, leader := range req.Leaders {
		if leader.UserID == uuid.Nil {
			return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: user_id is required", i))
		}
		if leader.Role == "" {
			return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: role is required", i))
		}
		if len(leader.Role) < 3 || len(leader.Role) > 100 {
			return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: role must be between 3 and 100 characters", i))
		}
	}

	return nil
}

// validateUpdateRequest validates the update faculty request
func (s *facultyService) validateUpdateRequest(req *dto.UpdateFacultyRequest) error {
	if req.Name != "" && (len(req.Name) < 3 || len(req.Name) > 255) {
		return utils.ErrBadRequest("name must be between 3 and 255 characters")
	}

	if req.Leaders != nil {
		if len(req.Leaders) == 0 {
			return utils.ErrBadRequest("faculty must have at least one leader")
		}

		for i, leader := range req.Leaders {
			if leader.UserID == uuid.Nil {
				return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: user_id is required", i))
			}
			if leader.Role == "" {
				return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: role is required", i))
			}
			if len(leader.Role) < 3 || len(leader.Role) > 100 {
				return utils.ErrBadRequest(fmt.Sprintf("leader at index %d: role must be between 3 and 100 characters", i))
			}
		}
	}

	return nil
}
