package domain

import (
	"time"
)

type AuditLog struct {
	ID         string    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     string    `gorm:"type:uuid;index" json:"user_id"` // Can be null if system action? Maybe not for this scope.
	Action     string    `gorm:"size:255;not null" json:"action"`
	EntityName string    `gorm:"size:255;not null" json:"entity_name"`
	EntityID   string    `gorm:"type:uuid;index" json:"entity_id"`
	CreatedAt  time.Time `gorm:"not null;default:now()" json:"created_at"`
}
