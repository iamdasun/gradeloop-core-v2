package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// FacultyRepository defines the interface for faculty data operations
type FacultyRepository interface {
	CreateFaculty(faculty *domain.Faculty) error
	UpdateFaculty(faculty *domain.Faculty) error
	GetFacultyByID(id uuid.UUID) (*domain.Faculty, error)
	GetFacultyByCode(code string) (*domain.Faculty, error)
	ListFaculties(includeInactive bool) ([]domain.Faculty, error)
	SoftDeleteFaculty(id uuid.UUID) error
	FacultyExists(id uuid.UUID) (bool, error)
}

// FacultyLeadershipRepository defines the interface for faculty leadership operations
type FacultyLeadershipRepository interface {
	CreateLeaders(leaders []domain.FacultyLeadership) error
	DeleteLeadersByFacultyID(facultyID uuid.UUID) error
	GetLeadersByFacultyID(facultyID uuid.UUID) ([]domain.FacultyLeadership, error)
	DeactivateLeadersByFacultyID(facultyID uuid.UUID) error
}

// facultyRepository is the concrete implementation
type facultyRepository struct {
	db *gorm.DB
}

// facultyLeadershipRepository is the concrete implementation
type facultyLeadershipRepository struct {
	db *gorm.DB
}

// NewFacultyRepository creates a new faculty repository
func NewFacultyRepository(db *gorm.DB) FacultyRepository {
	return &facultyRepository{db: db}
}

// NewFacultyLeadershipRepository creates a new faculty leadership repository
func NewFacultyLeadershipRepository(db *gorm.DB) FacultyLeadershipRepository {
	return &facultyLeadershipRepository{db: db}
}

// CreateFaculty creates a new faculty
func (r *facultyRepository) CreateFaculty(faculty *domain.Faculty) error {
	return r.db.Create(faculty).Error
}

// UpdateFaculty updates an existing faculty
func (r *facultyRepository) UpdateFaculty(faculty *domain.Faculty) error {
	return r.db.Save(faculty).Error
}

// GetFacultyByID retrieves a faculty by ID
func (r *facultyRepository) GetFacultyByID(id uuid.UUID) (*domain.Faculty, error) {
	var faculty domain.Faculty
	err := r.db.Where("id = ? AND deleted_at IS NULL", id).
		Preload("Leaders", "deleted_at IS NULL").
		First(&faculty).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &faculty, nil
}

// GetFacultyByCode retrieves a faculty by code
func (r *facultyRepository) GetFacultyByCode(code string) (*domain.Faculty, error) {
	var faculty domain.Faculty
	err := r.db.Where("code = ? AND deleted_at IS NULL", code).First(&faculty).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &faculty, nil
}

// ListFaculties retrieves all faculties
func (r *facultyRepository) ListFaculties(includeInactive bool) ([]domain.Faculty, error) {
	var faculties []domain.Faculty
	query := r.db.Where("deleted_at IS NULL")

	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	err := query.Preload("Leaders", "deleted_at IS NULL").
		Order("created_at DESC").
		Find(&faculties).Error

	if err != nil {
		return nil, err
	}

	return faculties, nil
}

// SoftDeleteFaculty soft deletes a faculty
func (r *facultyRepository) SoftDeleteFaculty(id uuid.UUID) error {
	return r.db.Model(&domain.Faculty{}).
		Where("id = ?", id).
		Update("deleted_at", gorm.Expr("NOW()")).Error
}

// FacultyExists checks if a faculty exists
func (r *facultyRepository) FacultyExists(id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.Model(&domain.Faculty{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Count(&count).Error

	if err != nil {
		return false, err
	}

	return count > 0, nil
}

// CreateLeaders creates multiple faculty leaders in a transaction
func (r *facultyLeadershipRepository) CreateLeaders(leaders []domain.FacultyLeadership) error {
	if len(leaders) == 0 {
		return nil
	}

	return r.db.Create(&leaders).Error
}

// DeleteLeadersByFacultyID hard deletes all leaders for a faculty
func (r *facultyLeadershipRepository) DeleteLeadersByFacultyID(facultyID uuid.UUID) error {
	return r.db.Where("faculty_id = ?", facultyID).
		Delete(&domain.FacultyLeadership{}).Error
}

// GetLeadersByFacultyID retrieves all leaders for a faculty
func (r *facultyLeadershipRepository) GetLeadersByFacultyID(facultyID uuid.UUID) ([]domain.FacultyLeadership, error) {
	var leaders []domain.FacultyLeadership
	err := r.db.Where("faculty_id = ? AND deleted_at IS NULL", facultyID).
		Find(&leaders).Error

	if err != nil {
		return nil, err
	}

	return leaders, nil
}

// DeactivateLeadersByFacultyID soft deletes all leaders for a faculty
func (r *facultyLeadershipRepository) DeactivateLeadersByFacultyID(facultyID uuid.UUID) error {
	return r.db.Model(&domain.FacultyLeadership{}).
		Where("faculty_id = ?", facultyID).
		Update("deleted_at", gorm.Expr("NOW()")).Error
}
