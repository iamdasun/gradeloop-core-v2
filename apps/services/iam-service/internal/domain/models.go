package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Role struct {
	ID           uuid.UUID      `gorm:"type:uuid;primarykey" json:"id"`
	Name         string         `gorm:"uniqueIndex;not null;size:100" json:"name"`
	UserType     string         `gorm:"not null;default:'all';size:10" json:"user_type"`
	IsSystemRole bool           `gorm:"not null;default:false" json:"is_system_role"`
	Permissions  []Permission   `gorm:"many2many:role_permissions;" json:"permissions,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

type Permission struct {
	ID          uuid.UUID      `gorm:"type:uuid;primarykey" json:"id"`
	Name        string         `gorm:"uniqueIndex;not null;size:100" json:"name"`
	Description string         `gorm:"size:500" json:"description"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

type User struct {
	ID                      uuid.UUID      `gorm:"type:uuid;primarykey" json:"id"`
	Username                string         `gorm:"uniqueIndex:idx_users_username,where:deleted_at IS NULL;not null;size:100" json:"username"`
	Email                   string         `gorm:"uniqueIndex:idx_users_email,where:deleted_at IS NULL;not null;size:255" json:"email"`
	PasswordHash            string         `gorm:"not null;size:255" json:"-"`
	RoleID                  *uuid.UUID     `gorm:"type:uuid;index" json:"role_id"`
	Role                    *Role          `gorm:"foreignKey:RoleID" json:"role,omitempty"`
	IsActive                bool           `gorm:"not null;default:true" json:"is_active"`
	IsPasswordResetRequired bool           `gorm:"not null;default:false" json:"is_password_reset_required"`
	DeletedAt               gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	CreatedAt               time.Time      `json:"created_at"`
	UpdatedAt               time.Time      `json:"updated_at"`
}

type UserProfileStudent struct {
	UserID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"user_id"`
	StudentID string    `gorm:"uniqueIndex;not null;size:50" json:"student_id"`
	User      User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
}

type UserProfileEmployee struct {
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
