package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────────
// Submission
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionStatus represents the lifecycle state of a submission.
type SubmissionStatus string

const (
	// SubmissionStatusQueued means the submission has been accepted by the HTTP
	// handler and placed on the message queue.  The code has not yet been
	// uploaded to object storage.  This is the initial status set during the
	// synchronous DB insert; it transitions to Pending once the queue worker
	// has successfully uploaded the code to MinIO.
	SubmissionStatusQueued   SubmissionStatus = "queued"
	SubmissionStatusPending  SubmissionStatus = "pending"
	SubmissionStatusRunning  SubmissionStatus = "running"
	SubmissionStatusAccepted SubmissionStatus = "accepted"
	SubmissionStatusRejected SubmissionStatus = "rejected"
	SubmissionStatusError    SubmissionStatus = "error"
)

// ─────────────────────────────────────────────────────────────────────────────
// Judge0 Execution Types
// ─────────────────────────────────────────────────────────────────────────────

// TestCaseResult represents individual test case evaluation
type TestCaseResult struct {
	TestCaseID     string `json:"test_case_id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	ActualOutput   string `json:"actual_output"`
	Passed         bool   `json:"passed"`
	ExecutionTime  string `json:"execution_time,omitempty"`
	MemoryUsed     int    `json:"memory_used,omitempty"`
	StatusID       int    `json:"status_id"`
	StatusDesc     string `json:"status_description"`
}

// Submission represents a single (potentially versioned) code submission made
// by an individual student or a student group for a given assignment.
//
// Exactly one of UserID or GroupID must be non-nil — the constraint is
// enforced at the service layer, not by a database CHECK constraint, so
// that we retain full control over the error message returned to clients.
//
// StoragePath holds the MinIO object key where the submitted code is stored;
// the actual bytes are never persisted in the database.
//
// Version is a monotonically increasing counter scoped to
// (assignment_id, user_id) or (assignment_id, group_id).  IsLatest=true on
// exactly one record per scope at any given time.
type Submission struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssignmentID uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"assignment_id"`
	UserID       *uuid.UUID `gorm:"type:uuid;index"                                json:"user_id,omitempty"`
	GroupID      *uuid.UUID `gorm:"type:uuid;index"                                json:"group_id,omitempty"`

	StoragePath string `gorm:"type:text;not null"       json:"storage_path"`
	Language    string `gorm:"type:varchar(50)"         json:"language"`
	LanguageID  int    `gorm:""                         json:"language_id,omitempty"`
	Status      string `gorm:"type:varchar(50);not null;default:'pending'" json:"status"`

	Version  int  `gorm:"not null;default:1" json:"version"`
	IsLatest bool `gorm:"not null;default:true;index" json:"is_latest"`

	Judge0JobID string    `gorm:"type:varchar(100)" json:"judge0_job_id,omitempty"`
	SubmittedAt time.Time `gorm:"not null"          json:"submitted_at"`

	// Judge0 execution results
	ExecutionStdout     string         `gorm:"type:text" json:"execution_stdout,omitempty"`
	ExecutionStderr     string         `gorm:"type:text" json:"execution_stderr,omitempty"`
	CompileOutput       string         `gorm:"type:text" json:"compile_output,omitempty"`
	ExecutionStatus     string         `gorm:"type:varchar(50)" json:"execution_status,omitempty"`
	ExecutionStatusID   int            `gorm:"" json:"execution_status_id,omitempty"`
	ExecutionTime       string         `gorm:"type:varchar(20)" json:"execution_time,omitempty"`
	MemoryUsed          int            `gorm:"" json:"memory_used,omitempty"`
	TestCasesPassed     int            `gorm:"" json:"test_cases_passed,omitempty"`
	TotalTestCases      int            `gorm:"" json:"total_test_cases,omitempty"`
	TestCaseResults     datatypes.JSON `gorm:"type:jsonb" json:"test_case_results,omitempty"`
}

// TableName overrides the GORM default table name.
func (Submission) TableName() string {
	return "submissions"
}

// BeforeCreate generates a UUID and sets SubmittedAt when not already
// populated.
func (s *Submission) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	if s.SubmittedAt.IsZero() {
		s.SubmittedAt = time.Now().UTC()
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmissionGroup  (table: groups)
// ─────────────────────────────────────────────────────────────────────────────

// SubmissionGroup represents a named set of student members who collaborate on
// an assignment together.  The Members field is a JSONB array of user-ID
// strings (UUIDs), e.g. ["uuid-1", "uuid-2", "uuid-3"].
//
// assignment_id is a logical cross-service reference; no database FK is
// enforced here, mirroring the pattern used for assignment→course-instance.
//
// Uniqueness of members within the array is enforced at the service layer.
type SubmissionGroup struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssignmentID uuid.UUID      `gorm:"type:uuid;not null;index"                       json:"assignment_id"`
	Members      datatypes.JSON `gorm:"type:jsonb;not null"                            json:"members"`
	CreatedAt    time.Time      `json:"created_at"`
}

// TableName overrides the GORM default table name.
func (SubmissionGroup) TableName() string {
	return "groups"
}

// BeforeCreate generates a UUID when not already set.
func (g *SubmissionGroup) BeforeCreate(_ *gorm.DB) error {
	if g.ID == uuid.Nil {
		g.ID = uuid.New()
	}
	return nil
}
