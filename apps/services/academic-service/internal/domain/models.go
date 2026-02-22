package domain

// Course represents an academic course (placeholder — owned by Course Catalog service).
// Kept here for the seeder and legacy migrations only.
type Course struct {
	BaseEntity
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	Name        string `gorm:"not null"             json:"name"`
	Description string `json:"description"`
	Credits     int    `gorm:"not null"             json:"credits"`
}

// Program represents an academic program/degree (placeholder).
// Kept here for the seeder and legacy migrations only.
type Program struct {
	BaseEntity
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	Name        string `gorm:"not null"             json:"name"`
	Description string `json:"description"`
	Duration    int    `gorm:"not null"             json:"duration"` // Duration in semesters
}

// Semester represents an academic semester/term (placeholder — owned by Academic Calendar service).
// Kept here for the seeder and legacy migrations only.
type Semester struct {
	BaseEntity
	Name      string `gorm:"not null"         json:"name"`
	Year      int    `gorm:"not null"         json:"year"`
	StartDate string `gorm:"not null"         json:"start_date"`
	EndDate   string `gorm:"not null"         json:"end_date"`
	IsActive  bool   `gorm:"default:false"    json:"is_active"`
}
