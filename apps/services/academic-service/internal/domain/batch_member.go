package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BatchMember represents a student's membership in a batch.
// user_id is a logical reference to the IAM service — no DB foreign key.
type BatchMember struct {
	BatchID    uuid.UUID `gorm:"type:uuid;primaryKey;not null"        json:"batch_id"`
	UserID     uuid.UUID `gorm:"type:uuid;primaryKey;not null"        json:"user_id"`
	EnrolledAt time.Time `gorm:"autoCreateTime"                       json:"enrolled_at"`
	Status     string    `gorm:"type:varchar(50);not null"            json:"status"`

	// DB FK — batch must exist
	Batch *Batch `gorm:"foreignKey:BatchID;constraint:OnDelete:RESTRICT" json:"batch,omitempty"`
}

// TableName overrides the GORM default.
func (BatchMember) TableName() string {
	return "batch_members"
}

// BeforeCreate seeds EnrolledAt when the caller leaves it at the zero value.
func (bm *BatchMember) BeforeCreate(_ *gorm.DB) error {
	if bm.EnrolledAt.IsZero() {
		bm.EnrolledAt = time.Now().UTC()
	}
	return nil
}

// Allowed status values for batch membership.
const (
	BatchMemberStatusActive    = "Active"
	BatchMemberStatusGraduated = "Graduated"
	BatchMemberStatusSuspended = "Suspended"
	BatchMemberStatusWithdrawn = "Withdrawn"
)

// ValidBatchMemberStatuses is the set of accepted status strings.
var ValidBatchMemberStatuses = map[string]struct{}{
	BatchMemberStatusActive:    {},
	BatchMemberStatusGraduated: {},
	BatchMemberStatusSuspended: {},
	BatchMemberStatusWithdrawn: {},
}

// IsValidBatchMemberStatus reports whether s is one of the accepted values.
func IsValidBatchMemberStatus(s string) bool {
	_, ok := ValidBatchMemberStatuses[s]
	return ok
}
