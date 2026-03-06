package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Assignment represents an assignment belonging to a CourseInstance.
// course_instance_id is a logical cross-service reference to the Academics
// Service — no database foreign key is enforced.
type Assignment struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CourseInstanceID uuid.UUID `gorm:"type:uuid;not null;index"                       json:"course_instance_id"`

	Title       string `gorm:"type:varchar(255);not null" json:"title"`
	Description string `gorm:"type:text"                  json:"description"`
	Code        string `gorm:"type:varchar(50)"           json:"code"`

	// AssessmentType distinguishes lab and exam assignments.
	// It is forwarded to ACAFS via the submission queue to drive grading config.
	AssessmentType string `gorm:"type:varchar(50);default:'lab'" json:"assessment_type,omitempty"`

	// Objective is an optional instructor-supplied LLM context string injected
	// into ACAFS evaluation prompts for rubric-based grading.
	Objective string `gorm:"type:text" json:"objective,omitempty"`

	ReleaseAt *time.Time `gorm:"type:timestamp" json:"release_at,omitempty"`
	DueAt     *time.Time `gorm:"type:timestamp" json:"due_at,omitempty"`
	LateDueAt *time.Time `gorm:"type:timestamp" json:"late_due_at,omitempty"`

	AllowLateSubmissions bool `gorm:"not null;default:false" json:"allow_late_submissions"`

	// EnforceTimeLimit is the time limit in minutes.  NULL means no limit.
	EnforceTimeLimit *int `gorm:"type:integer" json:"enforce_time_limit,omitempty"`

	AllowGroupSubmission bool `gorm:"not null;default:false" json:"allow_group_submission"`
	MaxGroupSize         int  `gorm:"not null;default:1"     json:"max_group_size"`

	EnableAIAssistant      bool `gorm:"not null;default:false" json:"enable_ai_assistant"`
	EnableSocraticFeedback bool `gorm:"not null;default:false" json:"enable_socratic_feedback"`
	AllowRegenerate        bool `gorm:"not null;default:false" json:"allow_regenerate"`

	IsActive bool `gorm:"not null;default:true" json:"is_active"`

	CreatedBy uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ─────────────────────────────────────────────────────────────────────────────
// TestCase  (lightweight — used by EvaluationService, NOT a GORM model)
// ─────────────────────────────────────────────────────────────────────────────

// TestCase is the lightweight struct consumed by EvaluationService.
// For persisted test cases, see AssignmentTestCase below.
type TestCase struct {
	ID             string `json:"id"`
	AssignmentID   string `json:"assignment_id"`
	Input          string `json:"input"`
	ExpectedOutput string `json:"expected_output"`
	IsHidden       bool   `json:"is_hidden"`
	OrderIndex     int    `json:"order_index"`
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignmentRubricCriterion
// ─────────────────────────────────────────────────────────────────────────────

// AssignmentRubricCriterion stores one grading criterion for an assignment.
// Bands is JSONB so the four performance-level descriptors can evolve without
// a schema migration.
type AssignmentRubricCriterion struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssignmentID uuid.UUID `gorm:"type:uuid;not null;index"                       json:"assignment_id"`
	Name         string    `gorm:"type:varchar(255);not null"                     json:"name"`
	Description  string    `gorm:"type:text"                                      json:"description,omitempty"`
	// GradingMode: deterministic | llm | llm_ast
	GradingMode string         `gorm:"type:varchar(50);not null;default:'llm'"        json:"grading_mode"`
	Weight      int            `gorm:"not null"                                       json:"weight"`
	Bands       datatypes.JSON `gorm:"type:jsonb;not null"                            json:"bands"`
	OrderIndex  int            `gorm:"not null;default:0"                             json:"order_index"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

func (AssignmentRubricCriterion) TableName() string { return "assignment_rubric_criteria" }

func (r *AssignmentRubricCriterion) BeforeCreate(_ *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignmentTestCase
// ─────────────────────────────────────────────────────────────────────────────

// AssignmentTestCase stores a persisted test case for an assignment.
// Input is passed as stdin to Judge0; ExpectedOutput is compared against
// stdout after whitespace normalisation by EvaluationService.
type AssignmentTestCase struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssignmentID   uuid.UUID `gorm:"type:uuid;not null;index"                       json:"assignment_id"`
	Description    string    `gorm:"type:text"                                      json:"description,omitempty"`
	Input          string    `gorm:"type:text"                                      json:"input"`
	ExpectedOutput string    `gorm:"type:text;not null"                             json:"expected_output"`
	IsHidden       bool      `gorm:"not null;default:false"                         json:"is_hidden"`
	OrderIndex     int       `gorm:"not null;default:0"                             json:"order_index"`
	CreatedAt      time.Time `json:"created_at"`
}

func (AssignmentTestCase) TableName() string { return "assignment_test_cases" }

func (t *AssignmentTestCase) BeforeCreate(_ *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignmentSampleAnswer
// ─────────────────────────────────────────────────────────────────────────────

// AssignmentSampleAnswer stores the instructor's reference implementation.
// There is at most one sample answer per assignment (unique index on
// assignment_id). The code is stored inline for fast retrieval by the
// submission worker and ACAFS evaluation pipeline.
type AssignmentSampleAnswer struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssignmentID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"                 json:"assignment_id"`
	LanguageID   int       `gorm:"not null"                                       json:"language_id"`
	Language     string    `gorm:"type:varchar(50)"                               json:"language"`
	Code         string    `gorm:"type:text;not null"                             json:"code"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (AssignmentSampleAnswer) TableName() string { return "assignment_sample_answers" }

func (s *AssignmentSampleAnswer) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// TableName overrides the GORM default table name.
func (Assignment) TableName() string {
	return "assignments"
}

// BeforeCreate generates a UUID if one is not already set.
func (a *Assignment) BeforeCreate(_ *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
