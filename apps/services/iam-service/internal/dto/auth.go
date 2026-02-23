package dto

import "github.com/google/uuid"

type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type RefreshTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type UserWithRole struct {
	ID                      uuid.UUID
	Username                string
	Email                   string
	FullName                string
	PasswordHash            string
	RoleID                  *uuid.UUID
	RoleName                string
	Permissions             []string `gorm:"-"`
	IsActive                bool
	IsPasswordResetRequired bool
}

// User DTOs

type CreateUserRequest struct {
	FullName    string `json:"full_name" validate:"required"`
	Email       string `json:"email" validate:"required,email"`
	RoleID      string `json:"role_id" validate:"required"`
	UserType    string `json:"user_type" validate:"required,oneof=student employee all"`
	StudentID   string `json:"student_id"`
	Designation string `json:"designation"`
}

type CreateUserResponse struct {
	ID        uuid.UUID `json:"id"`
	FullName  string    `json:"full_name"`
	Email     string    `json:"email"`
	RoleID    uuid.UUID `json:"role_id"`
	IsActive  bool      `json:"is_active"`
	ResetLink string    `json:"reset_link"`
	Message   string    `json:"message"`
}

// Password Management DTOs

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

type ChangePasswordResponse struct {
	Message string `json:"message"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

type ForgotPasswordResponse struct {
	Message string `json:"message"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}

type ResetPasswordResponse struct {
	Message string `json:"message"`
}

// Session Management DTOs

type RevokeUserSessionsResponse struct {
	Message string `json:"message"`
}
