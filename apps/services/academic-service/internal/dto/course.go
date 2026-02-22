package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// Course DTOs
// ─────────────────────────────────────────────────────────────────────────────

// CreateCourseRequest is the payload for POST /courses
type CreateCourseRequest struct {
	Code        string `json:"code"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Credits     int    `json:"credits"`
}

// UpdateCourseRequest is the payload for PUT /courses/:id
type UpdateCourseRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Credits     *int   `json:"credits"`
	IsActive    *bool  `json:"is_active"`
}

// CourseResponse is returned for course endpoints
type CourseResponse struct {
	ID          uuid.UUID `json:"id"`
	Code        string    `json:"code"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Credits     int       `json:"credits"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ListCoursesQuery holds query parameters for listing courses
type ListCoursesQuery struct {
	IncludeInactive bool `query:"include_inactive"`
}

// ─────────────────────────────────────────────────────────────────────────────
// CoursePrerequisite DTOs
// ─────────────────────────────────────────────────────────────────────────────

// AddPrerequisiteRequest is the payload for POST /courses/:id/prerequisites
type AddPrerequisiteRequest struct {
	PrerequisiteCourseID uuid.UUID `json:"prerequisite_course_id"`
}

// CoursePrerequisiteResponse is returned for prerequisite endpoints
type CoursePrerequisiteResponse struct {
	CourseID             uuid.UUID       `json:"course_id"`
	PrerequisiteCourseID uuid.UUID       `json:"prerequisite_course_id"`
	PrerequisiteCourse   *CourseResponse `json:"prerequisite_course,omitempty"`
}
