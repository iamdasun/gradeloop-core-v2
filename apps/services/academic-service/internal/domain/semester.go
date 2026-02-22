package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Semester represents an academic semester / term in the academic calendar.
type Semester struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string     `gorm:"type:varchar(255);not null"                     json:"name"`
	Code      string     `gorm:"type:varchar(50);uniqueIndex;not null"          json:"code"`
	TermType  string     `gorm:"type:varchar(50);not null"                      json:"term_type"`
	StartDate string     `gorm:"type:date;not null"                             json:"start_date"`
	EndDate   string     `gorm:"type:date;not null"                             json:"end_date"`
	Status    string     `gorm:"type:varchar(50);not null;default:'Planned'"    json:"status"`
	IsActive  bool       `gorm:"default:true"                                   json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	DeletedAt *time.Time `gorm:"index"                                          json:"deleted_at,omitempty"`
}

// TableName overrides the GORM default table name.
func (Semester) TableName() string {
	return "semesters"
}

// BeforeCreate generates a UUID when none is provided.
func (s *Semester) BeforeCreate(_ *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

// Allowed term_type values.
const (
	TermTypeFall   = "Fall"
	TermTypeSpring = "Spring"
	TermTypeSummer = "Summer"
	TermTypeWinter = "Winter"
)

// ValidTermTypes is the set of accepted term_type strings.
var ValidTermTypes = map[string]struct{}{
	TermTypeFall:   {},
	TermTypeSpring: {},
	TermTypeSummer: {},
	TermTypeWinter: {},
}

// IsValidTermType reports whether t is one of the accepted values.
func IsValidTermType(t string) bool {
	_, ok := ValidTermTypes[t]
	return ok
}

// Allowed status values for semesters.
const (
	SemesterStatusPlanned   = "Planned"
	SemesterStatusActive    = "Active"
	SemesterStatusCompleted = "Completed"
	SemesterStatusCancelled = "Cancelled"
)

// ValidSemesterStatuses is the set of accepted status strings.
var ValidSemesterStatuses = map[string]struct{}{
	SemesterStatusPlanned:   {},
	SemesterStatusActive:    {},
	SemesterStatusCompleted: {},
	SemesterStatusCancelled: {},
}

// IsValidSemesterStatus reports whether s is one of the accepted values.
func IsValidSemesterStatus(s string) bool {
	_, ok := ValidSemesterStatuses[s]
	return ok
}
