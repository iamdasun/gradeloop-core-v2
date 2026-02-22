package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Course represents an academic course in the course catalog.
type Course struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Code        string     `gorm:"type:varchar(50);uniqueIndex;not null"          json:"code"`
	Title       string     `gorm:"type:varchar(255);not null"                     json:"title"`
	Description string     `gorm:"type:text"                                      json:"description"`
	Credits     int        `gorm:"not null;default:0"                             json:"credits"`
	IsActive    bool       `gorm:"default:true"                                   json:"is_active"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `gorm:"index"                                          json:"deleted_at,omitempty"`

	// Prerequisites for this course (courses that must be completed beforehand)
	Prerequisites []CoursePrerequisite `gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE"             json:"prerequisites,omitempty"`
}

// TableName overrides the GORM default table name.
func (Course) TableName() string {
	return "courses"
}

// BeforeCreate generates a UUID when none is provided.
func (c *Course) BeforeCreate(_ *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}

// CoursePrerequisite represents a prerequisite relationship between two courses.
// A course can have multiple prerequisites; this is a self-referential join table.
type CoursePrerequisite struct {
	CourseID             uuid.UUID `gorm:"type:uuid;primaryKey;not null"                                                    json:"course_id"`
	PrerequisiteCourseID uuid.UUID `gorm:"type:uuid;primaryKey;not null"                                                    json:"prerequisite_course_id"`

	// DB FKs — both courses must exist and not be soft-deleted
	Course             *Course `gorm:"foreignKey:CourseID;constraint:OnDelete:CASCADE"             json:"course,omitempty"`
	PrerequisiteCourse *Course `gorm:"foreignKey:PrerequisiteCourseID;constraint:OnDelete:CASCADE" json:"prerequisite_course,omitempty"`
}

// TableName overrides the GORM default table name.
func (CoursePrerequisite) TableName() string {
	return "course_prerequisites"
}
