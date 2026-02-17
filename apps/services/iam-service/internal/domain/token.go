package domain

import (
	"time"

	"gorm.io/gorm"
)

type RefreshToken struct {
	ID                  string         `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID              string         `gorm:"type:uuid;not null;index" json:"user_id"`
	TokenHash           string         `gorm:"not null" json:"-"`
	ExpiresAt           time.Time      `gorm:"not null" json:"expires_at"`
	Revoked             bool           `gorm:"default:false" json:"revoked"`
	RevokedAt           *time.Time     `json:"revoked_at,omitempty"`
	ReplacedByTokenHash *string        `json:"replaced_by_token_hash,omitempty"`
	IP                  string         `gorm:"size:50" json:"ip"`
	UserAgent           string         `gorm:"size:255" json:"user_agent"`
	CreatedAt           time.Time      `gorm:"not null;default:now()" json:"created_at"`
	UpdatedAt           time.Time      `gorm:"not null;default:now()" json:"updated_at"`
	DeletedAt           gorm.DeletedAt `gorm:"index" json:"-"`
}
