package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// CourseInstanceRepository defines all data operations for course instances.
type CourseInstanceRepository interface {
	Create(instance *domain.CourseInstance) error
	Update(instance *domain.CourseInstance) error
	GetByID(id uuid.UUID) (*domain.CourseInstance, error)
	ListByBatch(batchID uuid.UUID) ([]domain.CourseInstance, error)
	GetByUnique(courseID, semesterID, batchID uuid.UUID) (*domain.CourseInstance, error)
}

// courseInstanceRepository is the concrete GORM-backed implementation.
type courseInstanceRepository struct {
	db *gorm.DB
}

// NewCourseInstanceRepository creates a new courseInstanceRepository.
func NewCourseInstanceRepository(db *gorm.DB) CourseInstanceRepository {
	return &courseInstanceRepository{db: db}
}

// Create inserts a new course instance record.
func (r *courseInstanceRepository) Create(instance *domain.CourseInstance) error {
	return r.db.Create(instance).Error
}

// Update saves changes to an existing course instance record.
func (r *courseInstanceRepository) Update(instance *domain.CourseInstance) error {
	return r.db.Save(instance).Error
}

// GetByID loads a single course instance by primary key.
// Returns nil, nil when no record is found.
func (r *courseInstanceRepository) GetByID(id uuid.UUID) (*domain.CourseInstance, error) {
	var instance domain.CourseInstance
	err := r.db.
		Where("id = ?", id).
		First(&instance).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &instance, nil
}

// ListByBatch returns all course instances associated with the given batch,
// ordered by creation time ascending.
func (r *courseInstanceRepository) ListByBatch(batchID uuid.UUID) ([]domain.CourseInstance, error) {
	var instances []domain.CourseInstance
	err := r.db.
		Where("batch_id = ?", batchID).
		Order("created_at ASC").
		Find(&instances).Error
	return instances, err
}

// GetByUnique looks up a course instance by its unique (course_id, semester_id,
// batch_id) combination, used for duplicate-prevention checks.
// Returns nil, nil when no record is found.
func (r *courseInstanceRepository) GetByUnique(courseID, semesterID, batchID uuid.UUID) (*domain.CourseInstance, error) {
	var instance domain.CourseInstance
	err := r.db.
		Where("course_id = ? AND semester_id = ? AND batch_id = ?", courseID, semesterID, batchID).
		First(&instance).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &instance, nil
}
