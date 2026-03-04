package dto

import (
	"github.com/google/uuid"
)

type ImportUserRow struct {
	FullName    string `json:"full_name"`
	Email       string `json:"email"`
	Username    string `json:"username"`
	Role        string `json:"role"`
	UserType    string `json:"user_type"`
	Department  string `json:"department"`
	Faculty     string `json:"faculty"`
	StudentID   string `json:"student_id,omitempty"`
	Designation string `json:"designation,omitempty"`
}

type ImportPreviewRow struct {
	RowIndex int           `json:"row_index"`
	Data     ImportUserRow `json:"data"`
	Errors   []string      `json:"errors,omitempty"`
	IsValid  bool          `json:"is_valid"`
}

type BulkImportPreviewResponse struct {
	Rows            []ImportPreviewRow `json:"rows"`
	TotalRows       int                `json:"total_rows"`
	ValidRows       int                `json:"valid_rows"`
	InvalidRows     int                `json:"invalid_rows"`
	ColumnMapping   map[string]string  `json:"column_mapping"` // Map of normalized header to actual header
}

type BulkImportExecuteRequest struct {
	Rows          []ImportUserRow   `json:"rows"`
	ColumnMapping map[string]string `json:"column_mapping"`
}

type BulkImportResultRow struct {
	RowIndex int    `json:"row_index"`
	Email    string `json:"email"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

type BulkImportExecuteResponse struct {
	TotalProcessed int                   `json:"total_processed"`
	SuccessCount   int                   `json:"success_count"`
	FailureCount   int                   `json:"failure_count"`
	Results        []BulkImportResultRow `json:"results"`
}

type RoleInfo struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}
