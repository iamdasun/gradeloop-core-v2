package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CourseInstance represents a course offered to a specific batch in a specific
// semester. course_id and semester_id are logical references to the Course
// Catalog and Academic Calendar services — no DB foreign keys for those.
type CourseInstance struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CourseID      uuid.UUID `gorm:"type:uuid;not null"                             json:"course_id"`
	SemesterID    uuid.UUID `gorm:"type:uuid;not null"                             json:"semester_id"`
	BatchID       uuid.UUID `gorm:"type:uuid;not null;index"                       json:"batch_id"`
	Status        string    `gorm:"type:varchar(50);not null;default:'Planned'"    json:"status"`
	MaxEnrollment int       `gorm:"not null;default:0"                             json:"max_enrollment"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// DB FK — batch must exist
	Batch *Batch `gorm:"foreignKey:BatchID;constraint:OnDelete:RESTRICT" json:"batch,omitempty"`
}

// TableName overrides the GORM default.
func (CourseInstance) TableName() string {
	return "course_instances"
}

// BeforeCreate generates a UUID when none is provided.
func (ci *CourseInstance) BeforeCreate(_ *gorm.DB) error {
	if ci.ID == uuid.Nil {
		ci.ID = uuid.New()
	}
	return nil
}

// Allowed status values for course instances.
const (
	CourseInstanceStatusPlanned   = "Planned"
	CourseInstanceStatusActive    = "Active"
	CourseInstanceStatusCompleted = "Completed"
	CourseInstanceStatusCancelled = "Cancelled"
)

// ValidCourseInstanceStatuses is the set of accepted status strings.
var ValidCourseInstanceStatuses = map[string]struct{}{
	CourseInstanceStatusPlanned:   {},
	CourseInstanceStatusActive:    {},
	CourseInstanceStatusCompleted: {},
	CourseInstanceStatusCancelled: {},
}

// IsValidCourseInstanceStatus reports whether s is one of the accepted values.
func IsValidCourseInstanceStatus(s string) bool {
	_, ok := ValidCourseInstanceStatuses[s]
	return ok
}
