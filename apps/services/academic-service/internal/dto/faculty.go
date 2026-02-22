package dto

import (
	"time"

	"github.com/google/uuid"
)

// CreateFacultyRequest represents the request to create a faculty
type CreateFacultyRequest struct {
	Name        string                    `json:"name" validate:"required,min=3,max=255"`
	Code        string                    `json:"code" validate:"required,min=2,max=50"`
	Description string                    `json:"description"`
	Leaders     []CreateLeadershipRequest `json:"leaders" validate:"required,min=1,dive"`
}

// CreateLeadershipRequest represents a leader in the faculty
type CreateLeadershipRequest struct {
	UserID uuid.UUID `json:"user_id" validate:"required"`
	Role   string    `json:"role" validate:"required,min=3,max=100"`
}

// UpdateFacultyRequest represents the request to update a faculty
type UpdateFacultyRequest struct {
	Name        string                    `json:"name" validate:"omitempty,min=3,max=255"`
	Description string                    `json:"description"`
	Leaders     []CreateLeadershipRequest `json:"leaders" validate:"omitempty,dive"`
	IsActive    *bool                     `json:"is_active"`
}

// DeactivateFacultyRequest represents the request to deactivate a faculty
type DeactivateFacultyRequest struct {
	IsActive bool `json:"is_active"`
}

// FacultyResponse represents the response for a faculty
type FacultyResponse struct {
	ID          uuid.UUID                   `json:"id"`
	Name        string                      `json:"name"`
	Code        string                      `json:"code"`
	Description string                      `json:"description"`
	IsActive    bool                        `json:"is_active"`
	CreatedAt   time.Time                   `json:"created_at"`
	UpdatedAt   time.Time                   `json:"updated_at"`
	Leaders     []FacultyLeadershipResponse `json:"leaders,omitempty"`
}

// FacultyLeadershipResponse represents the response for faculty leadership
type FacultyLeadershipResponse struct {
	FacultyID uuid.UUID `json:"faculty_id"`
	UserID    uuid.UUID `json:"user_id"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListFacultiesQuery represents query parameters for listing faculties
type ListFacultiesQuery struct {
	IncludeInactive bool `query:"include_inactive"`
}
