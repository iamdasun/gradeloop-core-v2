package domain

import (
	"time"

	"gorm.io/gorm"
)

type UserType string

const (
	UserTypeStudent  UserType = "STUDENT"
	UserTypeEmployee UserType = "EMPLOYEE"
)

type User struct {
	ID                      string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email                   string         `gorm:"uniqueIndex;not null;size:255" json:"email"`
	PasswordHash            string         `gorm:"not null" json:"-"`
	FullName                string         `gorm:"not null;size:255" json:"full_name"`
	IsActive                bool           `gorm:"default:true" json:"is_active"`
	IsPasswordResetRequired bool           `gorm:"default:false" json:"is_password_reset_required"`
	UserType                UserType       `gorm:"type:varchar(50);not null" json:"user_type"`
	EnrollmentDate          *time.Time     `gorm:"type:date" json:"enrollment_date,omitempty"`       // For Students
	StudentID               *string        `gorm:"uniqueIndex;size:50" json:"student_id,omitempty"`  // For Students
	EmployeeID              *string        `gorm:"uniqueIndex;size:50" json:"employee_id,omitempty"` // For Employees
	Designation             *string        `gorm:"size:100" json:"designation,omitempty"`            // For Employees
	EmployeeType            *string        `gorm:"size:50" json:"employee_type,omitempty"`           // For Employees
	CreatedAt               time.Time      `gorm:"not null;default:now()" json:"created_at"`
	UpdatedAt               time.Time      `gorm:"not null;default:now()" json:"updated_at"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Roles []Role `gorm:"many2many:user_roles;" json:"roles,omitempty"`
}

func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	// GORM handles UUID generation with default:gen_random_uuid() for postgres
	// If using SQLite or others, might need manual hook, but for Postgres it's fine.
	return
}
