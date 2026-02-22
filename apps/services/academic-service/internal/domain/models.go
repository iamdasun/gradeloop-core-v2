package domain

// Add your academic domain models here
// Example models for academic service:

// Course represents an academic course
type Course struct {
	BaseEntity
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	Name        string `gorm:"not null" json:"name"`
	Description string `json:"description"`
	Credits     int    `gorm:"not null" json:"credits"`
}

// Program represents an academic program/degree
type Program struct {
	BaseEntity
	Code        string `gorm:"uniqueIndex;not null" json:"code"`
	Name        string `gorm:"not null" json:"name"`
	Description string `json:"description"`
	Duration    int    `gorm:"not null" json:"duration"` // Duration in semesters
}

// Semester represents an academic semester/term
type Semester struct {
	BaseEntity
	Name      string `gorm:"not null" json:"name"`
	Year      int    `gorm:"not null" json:"year"`
	StartDate string `gorm:"not null" json:"start_date"`
	EndDate   string `gorm:"not null" json:"end_date"`
	IsActive  bool   `gorm:"default:false" json:"is_active"`
}

// Enrollment represents a student enrollment in a course
type Enrollment struct {
	BaseEntity
	StudentID  uint    `gorm:"not null;index" json:"student_id"`
	CourseID   uint    `gorm:"not null;index" json:"course_id"`
	SemesterID uint    `gorm:"not null;index" json:"semester_id"`
	Grade      string  `json:"grade,omitempty"`
	Status     string  `gorm:"not null;default:'active'" json:"status"` // active, completed, dropped
	Course     *Course `gorm:"foreignKey:CourseID" json:"course,omitempty"`
}
