package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserType constants
const (
	UserTypeStudent    = "student"
	UserTypeInstructor = "instructor"
	UserTypeAdmin      = "admin"
	UserTypeSuperAdmin = "super_admin"
)

// Valid user types
var ValidUserTypes = []string{
	UserTypeStudent,
	UserTypeInstructor,
	UserTypeAdmin,
	UserTypeSuperAdmin,
}

type User struct {
	ID                      uuid.UUID      `gorm:"type:uuid;primarykey" json:"id"`
	Email                   string         `gorm:"uniqueIndex:idx_users_email,where:deleted_at IS NULL;not null;size:255" json:"email"`
	FullName                string         `gorm:"size:255" json:"full_name"`
	AvatarURL               string         `gorm:"size:512" json:"avatar_url"`
	Faculty                 string         `gorm:"size:255" json:"faculty"`
	Department              string         `gorm:"size:255" json:"department"`
	PasswordHash            string         `gorm:"size:255" json:"-"`
	UserType                string         `gorm:"not null;size:20;index" json:"user_type"`
	IsActive                bool           `gorm:"not null;default:true" json:"is_active"`
	IsPasswordResetRequired bool           `gorm:"not null;default:false" json:"is_password_reset_required"`
	EmailVerified           bool           `gorm:"not null;default:false" json:"email_verified"`
	PasswordSetAt           *time.Time     `json:"password_set_at,omitempty"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	CreatedAt               time.Time      `json:"created_at"`
	UpdatedAt               time.Time      `json:"updated_at"`
}

type UserProfileStudent struct {
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	StudentID string    `gorm:"uniqueIndex;not null;size:50" json:"student_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
}

type UserProfileInstructor struct {
	UserID      uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	Designation string    `gorm:"not null;size:100" json:"designation"`
	User        User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
}

type RefreshToken struct {
	ID        uuid.UUID  `gorm:"type:uuid;primarykey" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	User      User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	TokenHash string     `gorm:"uniqueIndex;not null;size:255" json:"-"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type PasswordResetToken struct {
	ID        uuid.UUID  `gorm:"type:uuid;primarykey" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"user_id"`
	User      User       `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	TokenHash string     `gorm:"uniqueIndex;not null;size:255" json:"-"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expires_at"`
	UsedAt    *time.Time `gorm:"index" json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

// User helper methods

// IsValidUserType checks if the given user type is valid
func IsValidUserType(userType string) bool {
	for _, validType := range ValidUserTypes {
		if validType == userType {
			return true
		}
	}
	return false
}

// HasAdminAccess returns true if the user has admin or super_admin access
func (u *User) HasAdminAccess() bool {
	return u.UserType == UserTypeAdmin || u.UserType == UserTypeSuperAdmin
}

// IsSuperAdmin returns true if the user is a super admin
func (u *User) IsSuperAdmin() bool {
	return u.UserType == UserTypeSuperAdmin
}

// IsStudent returns true if the user is a student
func (u *User) IsStudent() bool {
	return u.UserType == UserTypeStudent
}

// IsInstructor returns true if the user is an instructor
func (u *User) IsInstructor() bool {
	return u.UserType == UserTypeInstructor
}
