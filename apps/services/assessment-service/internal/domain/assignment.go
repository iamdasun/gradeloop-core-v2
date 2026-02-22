package domain

import (
	"time"

	"github.com/google/uuid"
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
