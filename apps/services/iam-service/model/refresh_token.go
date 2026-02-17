package model

import (
	"time"

	"gorm.io/gorm"
)

// RefreshToken represents a hashed refresh token stored in the database.
//
// Design notes:
//   - Tokens are stored hashed (not the raw token). The application should hash
//     incoming refresh tokens and compare the hash against `TokenHash`.
//   - `ReplacedByTokenHash` can be used to implement rotation: when a token is
//     rotated, the old token is marked revoked and linked to the new token's hash.
//   - `IP` and `UserAgent` are optional metadata to help with auditing and
//     detecting suspicious activity.
//   - Use `IsActive` and `IsExpired` helper methods to check token validity.
type RefreshToken struct {
	gorm.Model
	// TokenHash is a bcrypt (or other strong) hash of the opaque refresh token.
	// Must be unique to make lookups and revocation checks efficient.
	TokenHash string `gorm:"not null;size:255;uniqueIndex"`

	// Relationship to the user that owns this refresh token.
	UserID uint `gorm:"index;not null"`
	User   User `gorm:"constraint:OnDelete:CASCADE;"`

	// Expiration time for the refresh token.
	ExpiresAt time.Time `gorm:"not null;index"`

	// Revocation state
	Revoked   bool `gorm:"default:false;index"`
	RevokedAt *time.Time

	// If the token was rotated, this stores the hash of the replacing token.
	ReplacedByTokenHash *string `gorm:"size:255;index"`

	// Optional metadata
	IP        string `gorm:"size:45"`
	UserAgent string `gorm:"size:512"`
}

// TableName ensures a predictable table name.
func (RefreshToken) TableName() string {
	return "refresh_tokens"
}

// IsExpired returns true if the token's ExpiresAt is in the past.
func (rt *RefreshToken) IsExpired() bool {
	return time.Now().After(rt.ExpiresAt)
}

// IsActive returns true when the token is not revoked and not expired.
func (rt *RefreshToken) IsActive() bool {
	return !rt.Revoked && !rt.IsExpired()
}

// Revoke marks the token as revoked. Optionally accept a replacement token hash
// (hashed string) to set `ReplacedByTokenHash` for rotation tracking.
func (rt *RefreshToken) Revoke(replacementTokenHash *string) {
	rt.Revoked = true
	now := time.Now()
	rt.RevokedAt = &now
	if replacementTokenHash != nil {
		rt.ReplacedByTokenHash = replacementTokenHash
	}
}
