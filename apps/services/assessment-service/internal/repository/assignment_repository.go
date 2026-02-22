package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/assessment-service/internal/domain"
	"gorm.io/gorm"
)

// AssignmentRepository defines all data operations for assignments.
type AssignmentRepository interface {
	CreateAssignment(assignment *domain.Assignment) error
	GetAssignmentByID(id uuid.UUID) (*domain.Assignment, error)
	UpdateAssignment(assignment *domain.Assignment) error
	ListAssignmentsByCourseInstance(courseInstanceID uuid.UUID) ([]domain.Assignment, error)
}

// assignmentRepository is the concrete GORM-backed implementation.
type assignmentRepository struct {
	db *gorm.DB
}

// NewAssignmentRepository creates a new assignmentRepository.
func NewAssignmentRepository(db *gorm.DB) AssignmentRepository {
	return &assignmentRepository{db: db}
}

// CreateAssignment inserts a new assignment record into the database.
func (r *assignmentRepository) CreateAssignment(assignment *domain.Assignment) error {
	return r.db.Create(assignment).Error
}

// GetAssignmentByID loads a single active assignment by its primary key.
// Soft-deleted (is_active = false) assignments are excluded.
// Returns (nil, nil) when no matching record is found.
func (r *assignmentRepository) GetAssignmentByID(id uuid.UUID) (*domain.Assignment, error) {
	var assignment domain.Assignment

	err := r.db.
		Where("id = ? AND is_active = true", id).
		First(&assignment).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &assignment, nil
}

// UpdateAssignment persists changes to an existing assignment record.
// It uses Save so that zero-value boolean fields are written correctly.
func (r *assignmentRepository) UpdateAssignment(assignment *domain.Assignment) error {
	return r.db.Save(assignment).Error
}

// ListAssignmentsByCourseInstance returns all active assignments that belong to
// the given course instance, ordered by creation time ascending.
func (r *assignmentRepository) ListAssignmentsByCourseInstance(courseInstanceID uuid.UUID) ([]domain.Assignment, error) {
	var assignments []domain.Assignment

	err := r.db.
		Where("course_instance_id = ? AND is_active = true", courseInstanceID).
		Order("created_at ASC").
		Find(&assignments).Error

	if err != nil {
		return nil, err
	}

	return assignments, nil
}
