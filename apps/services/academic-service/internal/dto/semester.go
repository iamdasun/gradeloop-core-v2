package dto

import (
	"time"

	"github.com/google/uuid"
)

// ─────────────────────────────────────────────────────────────────────────────
// Semester DTOs
// ─────────────────────────────────────────────────────────────────────────────

// CreateSemesterRequest is the payload for POST /semesters
type CreateSemesterRequest struct {
	Name      string `json:"name"`
	Code      string `json:"code"`
	TermType  string `json:"term_type"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Status    string `json:"status"`
}

// UpdateSemesterRequest is the payload for PUT /semesters/:id
type UpdateSemesterRequest struct {
	Name      string `json:"name"`
	TermType  string `json:"term_type"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Status    string `json:"status"`
	IsActive  *bool  `json:"is_active"`
}

// SemesterResponse is returned for semester endpoints
type SemesterResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	TermType  string    `json:"term_type"`
	StartDate string    `json:"start_date"`
	EndDate   string    `json:"end_date"`
	Status    string    `json:"status"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ListSemestersQuery holds query parameters for listing semesters
type ListSemestersQuery struct {
	IncludeInactive bool   `query:"include_inactive"`
	TermType        string `query:"term_type"`
}
