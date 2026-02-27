package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// CourseInstructorRepository defines all data operations for course instructors.
type CourseInstructorRepository interface {
	AssignInstructor(instructor *domain.CourseInstructor) error
	GetByCourseInstance(instanceID uuid.UUID) ([]domain.CourseInstructor, error)
	GetInstructor(instanceID, userID uuid.UUID) (*domain.CourseInstructor, error)
	RemoveInstructor(instanceID, userID uuid.UUID) error
	GetByUserID(userID uuid.UUID) ([]domain.CourseInstructor, error)
}

// courseInstructorRepository is the concrete GORM-backed implementation.
type courseInstructorRepository struct {
	db *gorm.DB
}

// NewCourseInstructorRepository creates a new courseInstructorRepository.
func NewCourseInstructorRepository(db *gorm.DB) CourseInstructorRepository {
	return &courseInstructorRepository{db: db}
}

// AssignInstructor inserts a new course instructor assignment record.
func (r *courseInstructorRepository) AssignInstructor(instructor *domain.CourseInstructor) error {
	return r.db.Create(instructor).Error
}

// GetByCourseInstance returns all instructors assigned to the given course
// instance, ordered by role.
func (r *courseInstructorRepository) GetByCourseInstance(instanceID uuid.UUID) ([]domain.CourseInstructor, error) {
	var instructors []domain.CourseInstructor
	err := r.db.
		Where("course_instance_id = ?", instanceID).
		Order("role ASC").
		Find(&instructors).Error
	return instructors, err
}

// GetInstructor loads a single instructor assignment by composite primary key.
// Returns nil, nil when no record is found.
func (r *courseInstructorRepository) GetInstructor(instanceID, userID uuid.UUID) (*domain.CourseInstructor, error) {
	var instructor domain.CourseInstructor
	err := r.db.
		Where("course_instance_id = ? AND user_id = ?", instanceID, userID).
		First(&instructor).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &instructor, nil
}

// RemoveInstructor hard-deletes the instructor assignment identified by the
// composite primary key.
func (r *courseInstructorRepository) RemoveInstructor(instanceID, userID uuid.UUID) error {
	return r.db.
		Where("course_instance_id = ? AND user_id = ?", instanceID, userID).
		Delete(&domain.CourseInstructor{}).Error
}

// GetByUserID returns all course instructor assignments for the given user,
// ordered by course_instance_id. Used by the instructor-scoped endpoints.
func (r *courseInstructorRepository) GetByUserID(userID uuid.UUID) ([]domain.CourseInstructor, error) {
	var instructors []domain.CourseInstructor
	err := r.db.
		Where("user_id = ?", userID).
		Order("course_instance_id ASC").
		Find(&instructors).Error
	return instructors, err
}
