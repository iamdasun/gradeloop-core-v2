package repository

import (
	"errors"

	"github.com/google/uuid"
	"github.com/gradeloop/academic-service/internal/domain"
	"gorm.io/gorm"
)

// EnrollmentRepository defines all data operations for student enrollments.
type EnrollmentRepository interface {
	EnrollStudent(enrollment *domain.Enrollment) error
	UpdateEnrollment(enrollment *domain.Enrollment) error
	GetEnrollments(instanceID uuid.UUID) ([]domain.Enrollment, error)
	GetEnrollment(instanceID, userID uuid.UUID) (*domain.Enrollment, error)
	RemoveEnrollment(instanceID, userID uuid.UUID) error
}

// enrollmentRepository is the concrete GORM-backed implementation.
type enrollmentRepository struct {
	db *gorm.DB
}

// NewEnrollmentRepository creates a new enrollmentRepository.
func NewEnrollmentRepository(db *gorm.DB) EnrollmentRepository {
	return &enrollmentRepository{db: db}
}

// EnrollStudent inserts a new enrollment record.
func (r *enrollmentRepository) EnrollStudent(enrollment *domain.Enrollment) error {
	return r.db.Create(enrollment).Error
}

// UpdateEnrollment saves changes to an existing enrollment record (status,
// final_grade, etc.).
func (r *enrollmentRepository) UpdateEnrollment(enrollment *domain.Enrollment) error {
	return r.db.
		Model(&domain.Enrollment{}).
		Where("course_instance_id = ? AND user_id = ?", enrollment.CourseInstanceID, enrollment.UserID).
		Updates(map[string]interface{}{
			"status":      enrollment.Status,
			"final_grade": enrollment.FinalGrade,
		}).Error
}

// GetEnrollments returns all enrollments for the given course instance, ordered
// by enrolled_at ascending.
func (r *enrollmentRepository) GetEnrollments(instanceID uuid.UUID) ([]domain.Enrollment, error) {
	var enrollments []domain.Enrollment
	err := r.db.
		Where("course_instance_id = ?", instanceID).
		Order("enrolled_at ASC").
		Find(&enrollments).Error
	return enrollments, err
}

// GetEnrollment loads a single enrollment by its composite primary key.
// Returns nil, nil when no record is found.
func (r *enrollmentRepository) GetEnrollment(instanceID, userID uuid.UUID) (*domain.Enrollment, error) {
	var enrollment domain.Enrollment
	err := r.db.
		Where("course_instance_id = ? AND user_id = ?", instanceID, userID).
		First(&enrollment).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &enrollment, nil
}

// RemoveEnrollment hard-deletes the enrollment record identified by the
// composite primary key.
func (r *enrollmentRepository) RemoveEnrollment(instanceID, userID uuid.UUID) error {
	return r.db.
		Where("course_instance_id = ? AND user_id = ?", instanceID, userID).
		Delete(&domain.Enrollment{}).Error
}
