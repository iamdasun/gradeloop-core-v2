package dto

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// Inline content request types (used inside CreateAssignmentRequest)
// ─────────────────────────────────────────────────────────────────────────────

// CreateRubricCriterionRequest is one criterion submitted inline with an assignment.
type CreateRubricCriterionRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// GradingMode: deterministic | llm | llm_ast
	GradingMode string `json:"grading_mode"`
	Weight      int    `json:"weight"`
	// Bands is opaque JSON: {excellent,good,satisfactory,unsatisfactory} each
	// with {description, mark_range:{min,max}}.
	Bands      json.RawMessage `json:"bands"`
	OrderIndex int             `json:"order_index,omitempty"`
}

// CreateTestCaseRequest is one test case submitted inline with an assignment.
type CreateTestCaseRequest struct {
	Description    string `json:"description,omitempty"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsHidden       bool   `json:"is_hidden,omitempty"`
	OrderIndex     int    `json:"order_index,omitempty"`
}

// CreateSampleAnswerRequest is the reference implementation submitted inline.
type CreateSampleAnswerRequest struct {
	LanguageID int    `json:"language_id"`
	Language   string `json:"language,omitempty"`
	Code       string `json:"code"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Request DTOs
// ─────────────────────────────────────────────────────────────────────────────

// CreateAssignmentRequest is the payload for POST /assignments
type CreateAssignmentRequest struct {
	CourseInstanceID uuid.UUID `json:"course_instance_id"`

	Title       string `json:"title"`
	Description string `json:"description"`
	Code        string `json:"code"`

	// AssessmentType: "lab" (default) or "exam".
	AssessmentType string `json:"assessment_type,omitempty"`
	// Objective is an optional LLM context string forwarded to ACAFS.
	Objective string `json:"objective,omitempty"`

	ReleaseAt *time.Time `json:"release_at"`
	DueAt     *time.Time `json:"due_at"`
	LateDueAt *time.Time `json:"late_due_at"`

	AllowLateSubmissions bool `json:"allow_late_submissions"`

	// EnforceTimeLimit: time limit in minutes (nil = unlimited).
	EnforceTimeLimit *int `json:"enforce_time_limit"`

	AllowGroupSubmission bool `json:"allow_group_submission"`
	MaxGroupSize         *int `json:"max_group_size"`

	EnableAIAssistant      bool `json:"enable_ai_assistant"`
	EnableSocraticFeedback bool `json:"enable_socratic_feedback"`
	AllowRegenerate        bool `json:"allow_regenerate"`

	// ── Inline content (optional — stored in separate tables on success) ———————
	RubricCriteria []CreateRubricCriterionRequest `json:"rubric_criteria,omitempty"`
	TestCases      []CreateTestCaseRequest        `json:"test_cases,omitempty"`
	SampleAnswer   *CreateSampleAnswerRequest     `json:"sample_answer,omitempty"`
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

	AssessmentType string `json:"assessment_type,omitempty"`
	Objective      string `json:"objective,omitempty"`

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

// ─────────────────────────────────────────────────────────────────────────────
// Content response DTOs (rubric, test cases, sample answer)
// ─────────────────────────────────────────────────────────────────────────────

// RubricCriterionResponse is the read representation of one rubric criterion.
type RubricCriterionResponse struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	GradingMode string          `json:"grading_mode"`
	Weight      int             `json:"weight"`
	Bands       json.RawMessage `json:"bands"`
	OrderIndex  int             `json:"order_index"`
}

// ListRubricResponse wraps the rubric criteria for an assignment.
type ListRubricResponse struct {
	AssignmentID string                    `json:"assignment_id"`
	Criteria     []RubricCriterionResponse `json:"criteria"`
	TotalWeight  int                       `json:"total_weight"`
}

// TestCaseResponse is the read representation of one test case.
// IsHidden=true means the input/expected_output are redacted for students.
type TestCaseResponse struct {
	ID             string `json:"id"`
	Description    string `json:"description,omitempty"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsHidden       bool   `json:"is_hidden"`
	OrderIndex     int    `json:"order_index"`
}

// ListTestCasesResponse wraps the test cases for an assignment.
type ListTestCasesResponse struct {
	AssignmentID string             `json:"assignment_id"`
	TestCases    []TestCaseResponse `json:"test_cases"`
}

// SampleAnswerResponse is the read representation of the reference implementation.
type SampleAnswerResponse struct {
	ID           string `json:"id"`
	AssignmentID string `json:"assignment_id"`
	LanguageID   int    `json:"language_id"`
	Language     string `json:"language"`
	Code         string `json:"code"`
}
