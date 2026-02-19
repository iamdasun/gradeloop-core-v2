package dto

import "github.com/google/uuid"

// Role DTOs

type CreateRoleRequest struct {
	Name          string   `json:"name" validate:"required"`
	IsSystemRole  bool     `json:"is_system_role"`
	PermissionIDs []string `json:"permission_ids"`
}

type CreateRoleResponse struct {
	ID           uuid.UUID            `json:"id"`
	Name         string               `json:"name"`
	IsSystemRole bool                 `json:"is_system_role"`
	Permissions  []PermissionResponse `json:"permissions"`
}

type UpdateRoleRequest struct {
	Name          string   `json:"name" validate:"required"`
	PermissionIDs []string `json:"permission_ids"`
}

type UpdateRoleResponse struct {
	ID           uuid.UUID            `json:"id"`
	Name         string               `json:"name"`
	IsSystemRole bool                 `json:"is_system_role"`
	Permissions  []PermissionResponse `json:"permissions"`
}

type RoleResponse struct {
	ID           uuid.UUID            `json:"id"`
	Name         string               `json:"name"`
	IsSystemRole bool                 `json:"is_system_role"`
	Permissions  []PermissionResponse `json:"permissions"`
}

type ListRolesResponse struct {
	Roles []RoleResponse `json:"roles"`
}

// Permission DTOs

type CreatePermissionRequest struct {
	Name        string `json:"name" validate:"required"`
	Description string `json:"description"`
}

type PermissionResponse struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
}

type ListPermissionsResponse struct {
	Permissions []PermissionResponse `json:"permissions"`
}

// Assign Permission to Role

type AssignPermissionRequest struct {
	PermissionID string `json:"permission_id" validate:"required"`
}

type AssignPermissionResponse struct {
	Message string `json:"message"`
}
