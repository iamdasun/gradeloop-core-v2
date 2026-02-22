package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

// CreateAssignmentRequest is the payload for POST /assignments
type CreateAssignmentRequest struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`

	Title       string `json:"title"`
	Description string `json:"description"`
	Code        string `json:"code"`

	ReleaseAt *time.Time `json:"release_at"`
	DueAt     *time.Time `json:"due_at"`
	LateDueAt *time.Time `json:"late_due_at"`

	AllowLateSubmissions bool `json:"allow_late_submissions"`

	EnforceTimeLimit *int `json:"enforce_time_limit"`

	AllowGroupSubmission bool `json:"allow_group_submission"`
	MaxGroupSize         *int `json:"max_group_size"`

	EnableAIAssistant      bool `json:"enable_ai_assistant"`
	EnableSocraticFeedback bool `json:"enable_socratic_feedback"`
	AllowRegenerate        bool `json:"allow_regenerate"`
}

// UpdateAssignmentRequest is the payload for PATCH /assignments/:id
// All fields are optional — only non-nil pointer fields or explicitly set
// booleans are applied. IsActive allows soft deletion via PATCH.
type UpdateAssignmentRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Code        *string `json:"code"`

	ReleaseAt *time.Time `json:"release_at"`
	DueAt     *time.Time `json:"due_at"`
	LateDueAt *time.Time `json:"late_due_at"`

	AllowLateSubmissions *bool `json:"allow_late_submissions"`

	EnforceTimeLimit *int `json:"enforce_time_limit"`

	AllowGroupSubmission *bool `json:"allow_group_submission"`
	MaxGroupSize         *int  `json:"max_group_size"`

	EnableAIAssistant      *bool `json:"enable_ai_assistant"`
	EnableSocraticFeedback *bool `json:"enable_socratic_feedback"`
	AllowRegenerate        *bool `json:"allow_regenerate"`

	// Explicit pointer so callers can set is_active=false for soft delete
	IsActive *bool `json:"is_active"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Response DTOs
// ─────────────────────────────────────────────────────────────────────────────

// AssignmentResponse is the canonical JSON shape returned to callers.
type AssignmentResponse struct {
	ID               uuid.UUID `json:"id"`
	CourseInstanceID uuid.UUID `json:"course_instance_id"`

	Title       string `json:"title"`
	Description string `json:"description"`
	Code        string `json:"code"`

	ReleaseAt *time.Time `json:"release_at"`
	DueAt     *time.Time `json:"due_at"`
	LateDueAt *time.Time `json:"late_due_at"`

	AllowLateSubmissions bool `json:"allow_late_submissions"`

	EnforceTimeLimit *int `json:"enforce_time_limit"`

	AllowGroupSubmission bool `json:"allow_group_submission"`
	MaxGroupSize         int  `json:"max_group_size"`

	EnableAIAssistant      bool `json:"enable_ai_assistant"`
	EnableSocraticFeedback bool `json:"enable_socratic_feedback"`
	AllowRegenerate        bool `json:"allow_regenerate"`

	IsActive  bool      `json:"is_active"`
	CreatedBy uuid.UUID `json:"created_by"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListAssignmentsResponse wraps a slice of AssignmentResponse with a count.
type ListAssignmentsResponse struct {
	Assignments []AssignmentResponse `json:"assignments"`
	Count       int                  `json:"count"`
}
