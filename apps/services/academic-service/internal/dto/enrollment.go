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

// BatchMemberDetailResponse is returned when we include student details from IAM
type BatchMemberDetailResponse struct {
	UserID     uuid.UUID `json:"user_id"`
	StudentID  string    `json:"student_id"`
	FullName   string    `json:"full_name"`
	Email      string    `json:"email"`
	AvatarURL  string    `json:"avatar_url"`
	Status     string    `json:"status"`
	EnrolledAt time.Time `json:"enrolled_at"`
}

// BulkAddBatchMembersRequest is the payload for POST /batch-members/bulk
type BulkAddBatchMembersRequest struct {
	BatchID uuid.UUID   `json:"batch_id"`
	UserIDs []uuid.UUID `json:"user_ids"`
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
	CourseCode       string    `json:"course_code"`
	CourseTitle      string    `json:"course_title"`
	UserID           uuid.UUID `json:"user_id"`
	Designation      string    `json:"designation"`
	FullName         string    `json:"full_name"`
	Email            string    `json:"email"`
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
	AllowIndividual  bool      `json:"allow_individual"` // Skip batch membership check for individual enrollments
}

// UpdateEnrollmentRequest is the payload for PUT /enrollments/:instanceID/:userID
type UpdateEnrollmentRequest struct {
	Status     string `json:"status"`
	FinalGrade string `json:"final_grade"`
}

// EnrollBatchRequest is the payload for POST /instructor-courses/:id/enroll-batch
type EnrollBatchRequest struct {
	BatchID uuid.UUID `json:"batch_id"`
}

// EnrollBatchResponse summarises the result of a bulk batch enrollment
type EnrollBatchResponse struct {
	Enrolled     int         `json:"enrolled"`
	Skipped      int         `json:"skipped"`
	Total        int         `json:"total"`
	SkippedUsers []uuid.UUID `json:"skipped_users,omitempty"`
}

// EnrollmentResponse is returned for enrollment endpoints
type EnrollmentResponse struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`
	UserID           uuid.UUID `json:"user_id"`
	StudentID        string    `json:"student_id"`
	FullName         string    `json:"full_name"`
	Email            string    `json:"email"`
	Status           string    `json:"status"`
	FinalGrade       string    `json:"final_grade,omitempty"`
	EnrolledAt       time.Time `json:"enrolled_at"`
}

// StudentCourseEnrollmentResponse is returned for student-scoped course endpoints.
// It enriches the raw enrollment with course, semester, and batch details so the
// frontend can render a fully populated course card without additional lookups.
type StudentCourseEnrollmentResponse struct {
	CourseInstanceID  uuid.UUID `json:"course_instance_id"`
	CourseID          uuid.UUID `json:"course_id"`
	CourseCode        string    `json:"course_code"`
	CourseTitle       string    `json:"course_title"`
	CourseDescription string    `json:"course_description,omitempty"`
	CourseCredits     int       `json:"course_credits"`

	SemesterID        uuid.UUID `json:"semester_id"`
	SemesterName      string    `json:"semester_name"`
	SemesterTerm      string    `json:"semester_term"`
	SemesterStartDate string    `json:"semester_start_date,omitempty"`
	SemesterEndDate   string    `json:"semester_end_date,omitempty"`

	BatchID   uuid.UUID `json:"batch_id,omitempty"`
	BatchName string    `json:"batch_name,omitempty"`

	Status     string    `json:"status"`
	FinalGrade string    `json:"final_grade,omitempty"`
	EnrolledAt time.Time `json:"enrolled_at"`
}
