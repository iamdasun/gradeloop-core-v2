package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Batch represents a hierarchical academic group (e.g. Class → Track → Team)
type Batch struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ParentID         *uuid.UUID `gorm:"type:uuid;index:idx_batches_parent_id"          json:"parent_id,omitempty"`
	DegreeID         uuid.UUID  `gorm:"type:uuid;not null;index:idx_batches_degree_id" json:"degree_id"`
	SpecializationID *uuid.UUID `gorm:"type:uuid"                                      json:"specialization_id,omitempty"`

	Name string `gorm:"type:varchar(255);not null"                              json:"name"`
	Code string `gorm:"type:varchar(50);not null;uniqueIndex:idx_batches_degree_code" json:"code"`

	StartYear int `gorm:"type:integer" json:"start_year"`
	EndYear   int `gorm:"type:integer" json:"end_year"`

	IsActive bool `gorm:"default:true" json:"is_active"`
	CreatedBy uuid.UUID `gorm:"type:uuid;index:idx_batches_created_by" json:"created_by"`

	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `gorm:"index" json:"deleted_at,omitempty"`

	// Self-referential relationship
	Parent   *Batch  `gorm:"foreignKey:ParentID;constraint:OnDelete:RESTRICT"  json:"parent,omitempty"`
	Children []Batch `gorm:"foreignKey:ParentID"                               json:"children,omitempty"`

	// Related entities (for preloading)
	Degree         *Degree         `gorm:"foreignKey:DegreeID;constraint:OnDelete:RESTRICT"         json:"degree,omitempty"`
	Specialization *Specialization `gorm:"foreignKey:SpecializationID;constraint:OnDelete:RESTRICT" json:"specialization,omitempty"`
}

// TableName specifies the PostgreSQL table name.
func (Batch) TableName() string {
	return "batches"
}

// BeforeCreate generates a UUID when none is provided.
func (b *Batch) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
