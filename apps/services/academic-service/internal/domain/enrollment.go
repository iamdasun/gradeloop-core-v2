package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Enrollment represents a student's enrollment in a course instance.
// user_id is a logical reference to the IAM service — no DB foreign key.
type Enrollment struct {
	CourseInstanceID uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"course_instance_id"`
	UserID           uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"user_id"`
	Status           string    `gorm:"type:varchar(50)"              json:"status"`
	FinalGrade       string    `gorm:"type:varchar(10)"              json:"final_grade,omitempty"`
	EnrolledAt       time.Time `gorm:"autoCreateTime"                json:"enrolled_at"`

	// DB FK — course instance must exist
	CourseInstance *CourseInstance `gorm:"foreignKey:CourseInstanceID;constraint:OnDelete:CASCADE" json:"course_instance,omitempty"`
}

// TableName overrides the GORM default.
func (Enrollment) TableName() string {
	return "enrollments"
}

// BeforeCreate seeds EnrolledAt when the caller leaves it at the zero value.
func (e *Enrollment) BeforeCreate(_ *gorm.DB) error {
	if e.EnrolledAt.IsZero() {
		e.EnrolledAt = time.Now().UTC()
	}
	return nil
}

// Allowed status values for student enrollments.
const (
	EnrollmentStatusEnrolled  = "Enrolled"
	EnrollmentStatusDropped   = "Dropped"
	EnrollmentStatusCompleted = "Completed"
	EnrollmentStatusFailed    = "Failed"
)

// ValidEnrollmentStatuses is the set of accepted status strings.
var ValidEnrollmentStatuses = map[string]struct{}{
	EnrollmentStatusEnrolled:  {},
	EnrollmentStatusDropped:   {},
	EnrollmentStatusCompleted: {},
	EnrollmentStatusFailed:    {},
}

// IsValidEnrollmentStatus reports whether s is one of the accepted values.
func IsValidEnrollmentStatus(s string) bool {
	_, ok := ValidEnrollmentStatuses[s]
	return ok
}
