package model

import (
	"time"

	"gorm.io/gorm"
)

// PasswordReset represents a single password reset request.
// It stores a hashed one-time token (not the raw token) and metadata
// about the request. Tokens should be created opaque, sent to the user
// (via email) and the raw token compared against the stored hash after hashing.
//
// Notes:
//   - Use a strong hash for TokenHash (bcrypt or other) and compare using the same algorithm.
//   - ExpiresAt controls the validity window for the reset token.
//   - When a reset is completed, mark the record as Used and set UsedAt.
//   - Records can be cleaned up by background jobs after they are expired and/or used.
type PasswordReset struct {
	gorm.Model

	// TokenHash is a hash of the opaque reset token sent to the user.
	// Store only the hash to avoid leaking tokens from the DB.
	TokenHash string `gorm:"not null;size:255;index" json:"-"`

	// Relationship to the user who requested the reset.
	UserID uint `gorm:"index;not null" json:"user_id"`
	User   User `gorm:"constraint:OnDelete:CASCADE;" json:"-"`

	// ExpiresAt determines when the token is no longer valid.
	ExpiresAt time.Time `gorm:"not null;index" json:"expires_at"`

	// Whether the token has already been used to reset the password.
	Used   bool       `gorm:"default:false;index" json:"used"`
	UsedAt *time.Time `json:"used_at,omitempty"`

	// Optional metadata to assist auditing and abuse detection.
	RequestIP    string `gorm:"size:45" json:"request_ip,omitempty"`
	RequestAgent string `gorm:"size:512" json:"request_agent,omitempty"`

	// Optional: why the reset was requested (user initiated, admin initiated, etc.)
	Reason string `gorm:"size:255" json:"reason,omitempty"`
}

// TableName returns a stable table name for PasswordReset records.
func (PasswordReset) TableName() string {
	return "password_resets"
}

// IsExpired returns true if the password reset token has passed its expiry time.
func (pr *PasswordReset) IsExpired() bool {
	return time.Now().After(pr.ExpiresAt)
}

// IsActive returns true when the token is valid for use (not used, not expired).
func (pr *PasswordReset) IsActive() bool {
	return !pr.Used && !pr.IsExpired()
}

// MarkUsed marks the password reset token as used and sets UsedAt.
func (pr *PasswordReset) MarkUsed() {
	now := time.Now()
	pr.Used = true
	pr.UsedAt = &now
}
