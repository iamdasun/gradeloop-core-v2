package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// Batch Member DTOs
// ─────────────────────────────────────────────────────────────────────────────

// AddBatchMemberRequest is the payload for POST /batch-members
type AddBatchMemberRequest struct {
	BatchID uuid.UUID `json:"batch_id"`
	UserID  uuid.UUID `json:"user_id"`
	Status  string    `json:"status"`
}

// BatchMemberResponse is returned for batch-member endpoints
type BatchMemberResponse struct {
	BatchID    uuid.UUID `json:"batch_id"`
	UserID     uuid.UUID `json:"user_id"`
	Status     string    `json:"status"`
	EnrolledAt time.Time `json:"enrolled_at"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Course Instance DTOs
// ─────────────────────────────────────────────────────────────────────────────

// CreateCourseInstanceRequest is the payload for POST /course-instances
type CreateCourseInstanceRequest struct {
	CourseID      uuid.UUID `json:"course_id"`
	SemesterID    uuid.UUID `json:"semester_id"`
	BatchID       uuid.UUID `json:"batch_id"`
	Status        string    `json:"status"`
	MaxEnrollment int       `json:"max_enrollment"`
}

// UpdateCourseInstanceRequest is the payload for PUT /course-instances/:id
type UpdateCourseInstanceRequest struct {
	Status        string `json:"status"`
	MaxEnrollment *int   `json:"max_enrollment"`
}

// CourseInstanceResponse is returned for course-instance endpoints
type CourseInstanceResponse struct {
	ID            uuid.UUID `json:"id"`
	CourseID      uuid.UUID `json:"course_id"`
	SemesterID    uuid.UUID `json:"semester_id"`
	BatchID       uuid.UUID `json:"batch_id"`
	Status        string    `json:"status"`
	MaxEnrollment int       `json:"max_enrollment"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Course Instructor DTOs
// ─────────────────────────────────────────────────────────────────────────────

// AssignInstructorRequest is the payload for POST /course-instructors
type AssignInstructorRequest struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`
	UserID           uuid.UUID `json:"user_id"`
	Role             string    `json:"role"`
}

// CourseInstructorResponse is returned for course-instructor endpoints
type CourseInstructorResponse struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`
	UserID           uuid.UUID `json:"user_id"`
	Role             string    `json:"role"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment DTOs
// ─────────────────────────────────────────────────────────────────────────────

// EnrollmentRequest is the payload for POST /enrollments
type EnrollmentRequest struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`
	UserID           uuid.UUID `json:"user_id"`
	Status           string    `json:"status"`
}

// UpdateEnrollmentRequest is the payload for PUT /enrollments/:instanceID/:userID
type UpdateEnrollmentRequest struct {
	Status     string `json:"status"`
	FinalGrade string `json:"final_grade"`
}

// EnrollmentResponse is returned for enrollment endpoints
type EnrollmentResponse struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`
	UserID           uuid.UUID `json:"user_id"`
	Status           string    `json:"status"`
	FinalGrade       string    `json:"final_grade,omitempty"`
	EnrolledAt       time.Time `json:"enrolled_at"`
}
