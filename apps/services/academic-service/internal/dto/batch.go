package dto

import (
	"time"

	"github.com/google/uuid"
)

// CreateBatchRequest is the payload for POST /batches
type CreateBatchRequest struct {
	ParentID         *uuid.UUID `json:"parent_id"`
	DegreeID         *uuid.UUID `json:"degree_id"`
	SpecializationID *uuid.UUID `json:"specialization_id"`
	Name             string     `json:"name"`
	Code             string     `json:"code"`
	StartYear        int        `json:"start_year"`
	EndYear          int        `json:"end_year"`
}

// UpdateBatchRequest is the payload for PUT /batches/:id
// parent_id is intentionally excluded — it cannot be changed after creation.
type UpdateBatchRequest struct {
	SpecializationID *uuid.UUID `json:"specialization_id"`
	Name             string     `json:"name"`
	StartYear        int        `json:"start_year"`
	EndYear          int        `json:"end_year"`
	IsActive         *bool      `json:"is_active"`
}

// BatchResponse is returned for individual batch endpoints
type BatchResponse struct {
	ID               uuid.UUID  `json:"id"`
	ParentID         *uuid.UUID `json:"parent_id"`
	DegreeID         uuid.UUID  `json:"degree_id"`
	SpecializationID *uuid.UUID `json:"specialization_id"`
	Name             string     `json:"name"`
	Code             string     `json:"code"`
	StartYear        int        `json:"start_year"`
	EndYear          int        `json:"end_year"`
	IsActive         bool       `json:"is_active"`
	CreatedBy        uuid.UUID  `json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

// BatchTreeResponse represents a node in the recursive batch hierarchy tree
type BatchTreeResponse struct {
	ID               uuid.UUID           `json:"id"`
	ParentID         *uuid.UUID          `json:"parent_id"`
	DegreeID         uuid.UUID           `json:"degree_id"`
	SpecializationID *uuid.UUID          `json:"specialization_id"`
	Name             string              `json:"name"`
	Code             string              `json:"code"`
	StartYear        int                 `json:"start_year"`
	EndYear          int                 `json:"end_year"`
	IsActive         bool                `json:"is_active"`
	CreatedBy        uuid.UUID           `json:"created_by"`
	Children         []BatchTreeResponse `json:"children"`
}

// ListBatchesQuery holds the query parameters for GET /batches
type ListBatchesQuery struct {
	IncludeInactive bool `query:"include_inactive"`
}

// BatchEnrollmentStats combines batch metadata with computed enrollment counts
// for a specific course instance. Used by instructor-scoped endpoints.
type BatchEnrollmentStats struct {
	BatchID       uuid.UUID `json:"batch_id"`
	Name          string    `json:"name"`
	Code          string    `json:"code"`
	StartYear     int       `json:"start_year"`
	EndYear       int       `json:"end_year"`
	IsActive      bool      `json:"is_active"`
	TotalMembers  int       `json:"total_members"`
	EnrolledCount int       `json:"enrolled_count"`
}
