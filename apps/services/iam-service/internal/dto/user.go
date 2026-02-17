package dto

import "time"

type CreateUserRequest struct {
	Email    string `json:"email" validate:"required,email"`
	FullName string `json:"full_name" validate:"required"`
	UserType string `json:"user_type" validate:"required,oneof=STUDENT EMPLOYEE"`

	// Student Fields
	EnrollmentDate *string `json:"enrollment_date,omitempty"` // YYYY-MM-DD
	StudentID      *string `json:"student_id,omitempty"`

	// Employee Fields
	EmployeeID   *string `json:"employee_id,omitempty"`
	Designation  *string `json:"designation,omitempty"`
	EmployeeType *string `json:"employee_type,omitempty"`
}

type UserResponse struct {
	ID             string     `json:"id"`
	Email          string     `json:"email"`
	FullName       string     `json:"full_name"`
	IsActive       bool       `json:"is_active"`
	UserType       string     `json:"user_type"`
	EnrollmentDate *time.Time `json:"enrollment_date,omitempty"`
	StudentID      *string    `json:"student_id,omitempty"`
	EmployeeID     *string    `json:"employee_id,omitempty"`
	Designation    *string    `json:"designation,omitempty"`
	EmployeeType   *string    `json:"employee_type,omitempty"`
	Roles          []string   `json:"roles,omitempty"` // Just role names
	CreatedAt      time.Time  `json:"created_at"`
}

type UpdateUserRequest struct {
	FullName *string `json:"full_name,omitempty"`
	IsActive *bool   `json:"is_active,omitempty"`
}
