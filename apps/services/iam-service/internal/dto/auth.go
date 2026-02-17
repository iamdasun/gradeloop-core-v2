package dto

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type AuthResponse struct {
	AccessToken             string           `json:"access_token"`
	RefreshToken            string           `json:"refresh_token"`
	IsPasswordResetRequired bool             `json:"is_password_reset_required"`
	User                    AuthUserResponse `json:"user"`
}

type AuthUserResponse struct {
	ID       string             `json:"id"`
	Email    string             `json:"email"`
	FullName string             `json:"full_name"`
	IsActive bool               `json:"is_active"`
	UserType string             `json:"user_type"`
	Roles    []AuthRoleResponse `json:"roles"`
}

type AuthRoleResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
	All          bool   `json:"all"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" validate:"required"`
	NewPassword string `json:"new_password" validate:"required,min=8"`
}
