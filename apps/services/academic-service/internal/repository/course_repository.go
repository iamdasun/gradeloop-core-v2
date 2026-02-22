package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// CourseRepository defines all data operations for courses.
type CourseRepository interface {
	Create(course *domain.Course) error
	Update(course *domain.Course) error
	GetByID(id uuid.UUID) (*domain.Course, error)
	GetByCode(code string) (*domain.Course, error)
	List(includeInactive bool) ([]domain.Course, error)
	Exists(id uuid.UUID) (bool, error)

	// Prerequisite operations
	AddPrerequisite(prereq *domain.CoursePrerequisite) error
	RemovePrerequisite(courseID, prerequisiteCourseID uuid.UUID) error
	ListPrerequisites(courseID uuid.UUID) ([]domain.CoursePrerequisite, error)
	PrerequisiteExists(courseID, prerequisiteCourseID uuid.UUID) (bool, error)
}

// courseRepository is the concrete GORM-backed implementation.
type courseRepository struct {
	db *gorm.DB
}

// NewCourseRepository creates a new courseRepository.
func NewCourseRepository(db *gorm.DB) CourseRepository {
	return &courseRepository{db: db}
}

// Create inserts a new course record.
func (r *courseRepository) Create(course *domain.Course) error {
	return r.db.Create(course).Error
}

// Update saves changes to an existing course record.
func (r *courseRepository) Update(course *domain.Course) error {
	return r.db.Save(course).Error
}

// GetByID loads a single course by primary key.
// Returns nil, nil when no record is found.
func (r *courseRepository) GetByID(id uuid.UUID) (*domain.Course, error) {
	var course domain.Course
	err := r.db.
		Where("id = ? AND deleted_at IS NULL", id).
		First(&course).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &course, nil
}

// GetByCode loads a single course by its unique code.
// Returns nil, nil when no record is found.
func (r *courseRepository) GetByCode(code string) (*domain.Course, error) {
	var course domain.Course
	err := r.db.
		Where("code = ? AND deleted_at IS NULL", code).
		First(&course).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &course, nil
}

// List returns all courses, optionally including inactive ones.
func (r *courseRepository) List(includeInactive bool) ([]domain.Course, error) {
	var courses []domain.Course
	query := r.db.Where("deleted_at IS NULL")

	if !includeInactive {
		query = query.Where("is_active = ?", true)
	}

	err := query.Order("created_at ASC").Find(&courses).Error
	return courses, err
}

// Exists reports whether a non-deleted course with the given id exists.
func (r *courseRepository) Exists(id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.Model(&domain.Course{}).
		Where("id = ? AND deleted_at IS NULL", id).
		Count(&count).Error
	return count > 0, err
}

// ─────────────────────────────────────────────────────────────────────────────
// Prerequisite operations
// ─────────────────────────────────────────────────────────────────────────────

// AddPrerequisite inserts a new prerequisite relationship.
func (r *courseRepository) AddPrerequisite(prereq *domain.CoursePrerequisite) error {
	return r.db.Create(prereq).Error
}

// RemovePrerequisite deletes a prerequisite relationship by the composite PK.
func (r *courseRepository) RemovePrerequisite(courseID, prerequisiteCourseID uuid.UUID) error {
	return r.db.
		Where("course_id = ? AND prerequisite_course_id = ?", courseID, prerequisiteCourseID).
		Delete(&domain.CoursePrerequisite{}).Error
}

// ListPrerequisites returns all prerequisites for a given course, eagerly
// loading the prerequisite course details.
func (r *courseRepository) ListPrerequisites(courseID uuid.UUID) ([]domain.CoursePrerequisite, error) {
	var prereqs []domain.CoursePrerequisite
	err := r.db.
		Where("course_id = ?", courseID).
		Preload("PrerequisiteCourse", "deleted_at IS NULL").
		Find(&prereqs).Error
	return prereqs, err
}

// PrerequisiteExists reports whether the given prerequisite relationship
// already exists.
func (r *courseRepository) PrerequisiteExists(courseID, prerequisiteCourseID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.Model(&domain.CoursePrerequisite{}).
		Where("course_id = ? AND prerequisite_course_id = ?", courseID, prerequisiteCourseID).
		Count(&count).Error
	return count > 0, err
}
