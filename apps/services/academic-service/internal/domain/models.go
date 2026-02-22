package domain

// Program represents an academic program/degree (placeholder).
// Kept here for the seeder and legacy migrations only.
type Program struct {
	BaseEntity
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	Name        string `gorm:"not null"             json:"name"`
	Description string `json:"description"`
	Duration    int    `gorm:"not null"             json:"duration"` // Duration in semesters
}
