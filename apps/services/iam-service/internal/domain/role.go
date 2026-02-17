package domain

import (
	"time"
)

type Role struct {
	ID          string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"uniqueIndex;not null;size:50;default:gen_random_uuid()" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	CreatedAt   time.Time `gorm:"not null;default:now()" json:"created_at"`

	// Relations
	Permissions []Permission `gorm:"many2many:role_permissions;" json:"permissions,omitempty"`
	Users       []User       `gorm:"many2many:user_roles;" json:"-"`
}

type Permission struct {
	ID          string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"uniqueIndex;not null;size:100;default:gen_random_uuid()" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	CreatedAt   time.Time `gorm:"not null;default:now()" json:"created_at"`

	// Relations
	Roles []Role `gorm:"many2many:role_permissions;" json:"-"`
}
