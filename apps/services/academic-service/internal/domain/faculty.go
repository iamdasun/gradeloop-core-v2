package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Faculty represents an academic faculty
type Faculty struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string     `gorm:"type:varchar(255);not null" json:"name"`
	Code        string     `gorm:"type:varchar(50);uniqueIndex;not null" json:"code"`
	Description string     `gorm:"type:text" json:"description"`
	IsActive    bool       `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `gorm:"index" json:"deleted_at,omitempty"`

	Leaders []FacultyLeadership `gorm:"foreignKey:FacultyID;constraint:OnDelete:CASCADE" json:"leaders,omitempty"`
}

// TableName specifies the table name for Faculty
func (Faculty) TableName() string {
	return "faculties"
}

// BeforeCreate hook to generate UUID if not set
func (f *Faculty) BeforeCreate(tx *gorm.DB) error {
	if f.ID == uuid.Nil {
		f.ID = uuid.New()
	}
	return nil
}

// FacultyLeadership represents the leadership panel of a faculty
type FacultyLeadership struct {
	FacultyID uuid.UUID  `gorm:"type:uuid;primaryKey" json:"faculty_id"`
	UserID    uuid.UUID  `gorm:"type:uuid;primaryKey" json:"user_id"`
	Role      string     `gorm:"type:varchar(100);not null" json:"role"`
	IsActive  bool       `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `gorm:"index" json:"deleted_at,omitempty"`
}

// TableName specifies the table name for FacultyLeadership
func (FacultyLeadership) TableName() string {
	return "faculty_leadership"
}
