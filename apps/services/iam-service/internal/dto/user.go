package dto

import "github.com/google/uuid"

type UserResponse struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	FullName    string    `json:"full_name"`
	AvatarURL   string    `json:"avatar_url"`
	UserType    string    `json:"user_type"`
	Faculty     string    `json:"faculty,omitempty"`
	Department  string    `json:"department,omitempty"`
	StudentID   string    `json:"student_id,omitempty"`
	Designation string    `json:"designation,omitempty"`
	IsActive    bool      `json:"is_active"`
	LastLoginAt *string   `json:"last_login_at"`
	CreatedAt   string    `json:"created_at"`
}

type UpdateAvatarResponse struct {
	AvatarURL string `json:"avatar_url"`
	Message   string `json:"message"`
}

type GetUsersResponse struct {
	Users      []UserResponse `json:"users"`
	TotalCount int64          `json:"total_count"`
	Page       int            `json:"page"`
	Limit      int            `json:"limit"`
}

type UpdateUserRequest struct {
	UserType *string `json:"user_type" validate:"omitempty,oneof=student instructor admin super_admin"`
	IsActive *bool   `json:"is_active"`
}

type UpdateUserResponse struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	UserType string    `json:"user_type"`
	IsActive bool      `json:"is_active"`
	Message  string    `json:"message"`
}
type GetUsersByIDsRequest struct {
	IDs []string `json:"ids"`
}
