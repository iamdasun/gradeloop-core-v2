package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// SemesterRepository defines all data operations for semesters.
type SemesterRepository interface {
	Create(semester *domain.Semester) error
	Update(semester *domain.Semester) error
	GetByID(id uuid.UUID) (*domain.Semester, error)
	GetByCode(code string) (*domain.Semester, error)
	List(includeInactive bool, termType string) ([]domain.Semester, error)
	Exists(id uuid.UUID) (bool, error)
}

// semesterRepository is the concrete GORM-backed implementation.
type semesterRepository struct {
	db *gorm.DB
}

// NewSemesterRepository creates a new semesterRepository.
func NewSemesterRepository(db *gorm.DB) SemesterRepository {
	return &semesterRepository{db: db}
}

// Create inserts a new semester record.
func (r *semesterRepository) Create(semester *domain.Semester) error {
	return r.db.Create(semester).Error
}

// Update saves changes to an existing semester record.
func (r *semesterRepository) Update(semester *domain.Semester) error {
	return r.db.Save(semester).Error
}

// GetByID loads a single semester by primary key.
// Returns nil, nil when no record is found.
func (r *semesterRepository) GetByID(id uuid.UUID) (*domain.Semester, error) {
	var semester domain.Semester
	err := r.db.
		Where("id = ? AND deleted_at IS NULL", id).
		First(&semester).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &semester, nil
}

// GetByCode loads a single semester by its unique code.
// Returns nil, nil when no record is found.
func (r *semesterRepository) GetByCode(code string) (*domain.Semester, error) {
	var semester domain.Semester
	err := r.db.
		Where("code = ? AND deleted_at IS NULL", code).
		First(&semester).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &semester, nil
}

// List returns all semesters, optionally including inactive ones and filtered
// by term_type when a non-empty termType string is supplied.
func (r *semesterRepository) List(includeInactive bool, termType string) ([]domain.Semester, error) {
	var semesters []domain.Semester
	query := r.db.Where("deleted_at IS NULL")

	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	if termType != "" {
		query = query.Where("term_type = ?", termType)
	}

	err := query.Order("start_date DESC").Find(&semesters).Error
	return semesters, err
}

// Exists reports whether a non-deleted semester with the given id exists.
func (r *semesterRepository) Exists(id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.Model(&domain.Semester{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Count(&count).Error
	return count > 0, err
}
