package domain

import "github.com/google/uuid"

// CourseInstructor represents an instructor assigned to a course instance.
// user_id is a logical reference to the IAM service — no DB foreign key.
type CourseInstructor struct {
	CourseInstanceID uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"course_instance_id"`
	UserID           uuid.UUID `gorm:"type:uuid;primaryKey;not null" json:"user_id"`
	Role             string    `gorm:"type:varchar(50);not null"     json:"role"`

	// DB FK — course instance must exist
	CourseInstance *CourseInstance `gorm:"foreignKey:CourseInstanceID;constraint:OnDelete:CASCADE" json:"course_instance,omitempty"`
}

// TableName overrides the GORM default.
func (CourseInstructor) TableName() string {
	return "course_instructors"
}

// Allowed role values for course instructors.
const (
	InstructorRoleLead       = "Lead Instructor"
	InstructorRoleInstructor = "Instructor"
	InstructorRoleTA         = "TA"
)

// ValidInstructorRoles is the set of accepted role strings.
var ValidInstructorRoles = map[string]struct{}{
	InstructorRoleLead:       {},
	InstructorRoleInstructor: {},
	InstructorRoleTA:         {},
}

// IsValidInstructorRole reports whether r is one of the accepted values.
func IsValidInstructorRole(r string) bool {
	_, ok := ValidInstructorRoles[r]
	return ok
}
