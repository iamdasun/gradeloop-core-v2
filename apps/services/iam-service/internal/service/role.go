package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"github.com/gradeloop/iam-service/internal/dto"
	"github.com/gradeloop/iam-service/internal/repository"
	"gorm.io/gorm"
)

var (
	ErrRoleAlreadyExists          = errors.New("role already exists")
	ErrSystemRoleCannotBeModified = errors.New("system roles cannot be modified")
	ErrSystemRoleCannotBeDeleted  = errors.New("system roles cannot be deleted")
	ErrPermissionNotFound         = errors.New("permission not found")
)

type RoleService interface {
	CreateRole(ctx context.Context, req *dto.CreateRoleRequest, actorPermissions []string) (*dto.CreateRoleResponse, error)
	GetRoleByID(ctx context.Context, roleID uuid.UUID) (*dto.RoleResponse, error)
	GetAllRoles(ctx context.Context) (*dto.ListRolesResponse, error)
	UpdateRole(ctx context.Context, roleID uuid.UUID, req *dto.UpdateRoleRequest, actorPermissions []string) (*dto.UpdateRoleResponse, error)
	DeleteRole(ctx context.Context, roleID uuid.UUID, actorPermissions []string) error
	AssignPermission(ctx context.Context, roleID, permissionID uuid.UUID, actorPermissions []string) (*dto.AssignPermissionResponse, error)
}

type roleService struct {
	db             *gorm.DB
	roleRepo       repository.RoleRepository
	permissionRepo repository.PermissionRepository
}

func NewRoleService(
	db *gorm.DB,
	roleRepo repository.RoleRepository,
	permissionRepo repository.PermissionRepository,
) RoleService {
	return &roleService{
		db:             db,
		roleRepo:       roleRepo,
		permissionRepo: permissionRepo,
	}
}

func (s *roleService) CreateRole(ctx context.Context, req *dto.CreateRoleRequest, actorPermissions []string) (*dto.CreateRoleResponse, error) {
	// Check if actor has permission to manage roles
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "roles:write" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return nil, ErrUnauthorized
	}

	// Check if role already exists
	existingRole, err := s.roleRepo.GetRoleByName(ctx, req.Name)
	if err != nil {
		return nil, fmt.Errorf("checking role: %w", err)
	}
	if existingRole != nil {
		return nil, ErrRoleAlreadyExists
	}

	// Validate permissions exist
	var permissionIDs []uuid.UUID
	if len(req.PermissionIDs) > 0 {
		for _, permIDStr := range req.PermissionIDs {
			permID, err := uuid.Parse(permIDStr)
			if err != nil {
				return nil, fmt.Errorf("invalid permission ID: %w", err)
			}
			permExists, err := s.permissionRepo.PermissionExists(ctx, permID)
			if err != nil {
				return nil, fmt.Errorf("checking permission: %w", err)
			}
			if !permExists {
				return nil, ErrPermissionNotFound
			}
			permissionIDs = append(permissionIDs, permID)
		}
	}

	// Create role
	role := &domain.Role{
		ID:           uuid.New(),
		Name:         req.Name,
		IsSystemRole: req.IsSystemRole,
	}

	if err := s.roleRepo.CreateRole(ctx, role); err != nil {
		return nil, fmt.Errorf("creating role: %w", err)
	}

	// Assign permissions if provided
	if len(permissionIDs) > 0 {
		if err := s.roleRepo.AssignPermissions(ctx, role.ID, permissionIDs); err != nil {
			return nil, fmt.Errorf("assigning permissions: %w", err)
		}
		role.Permissions, _ = s.roleRepo.GetRolePermissions(ctx, role.ID)
	}

	return s.toCreateRoleResponse(role), nil
}

func (s *roleService) GetRoleByID(ctx context.Context, roleID uuid.UUID) (*dto.RoleResponse, error) {
	role, err := s.roleRepo.GetRoleByID(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("fetching role: %w", err)
	}
	if role == nil {
		return nil, ErrUserNotFound
	}

	return s.toRoleResponse(role), nil
}

func (s *roleService) GetAllRoles(ctx context.Context) (*dto.ListRolesResponse, error) {
	roles, err := s.roleRepo.GetAllRoles(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetching roles: %w", err)
	}

	response := &dto.ListRolesResponse{
		Roles: make([]dto.RoleResponse, len(roles)),
	}
	for i, role := range roles {
		response.Roles[i] = *s.toRoleResponse(&role)
	}

	return response, nil
}

func (s *roleService) UpdateRole(ctx context.Context, roleID uuid.UUID, req *dto.UpdateRoleRequest, actorPermissions []string) (*dto.UpdateRoleResponse, error) {
	// Check if actor has permission to manage roles
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "roles:write" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return nil, ErrUnauthorized
	}

	// Get role
	role, err := s.roleRepo.GetRoleByID(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("fetching role: %w", err)
	}
	if role == nil {
		return nil, ErrUserNotFound
	}

	// System roles cannot be modified
	if role.IsSystemRole {
		return nil, ErrSystemRoleCannotBeModified
	}

	// Validate permissions exist
	var permissionIDs []uuid.UUID
	if len(req.PermissionIDs) > 0 {
		for _, permIDStr := range req.PermissionIDs {
			permID, err := uuid.Parse(permIDStr)
			if err != nil {
				return nil, fmt.Errorf("invalid permission ID: %w", err)
			}
			permExists, err := s.permissionRepo.PermissionExists(ctx, permID)
			if err != nil {
				return nil, fmt.Errorf("checking permission: %w", err)
			}
			if !permExists {
				return nil, ErrPermissionNotFound
			}
			permissionIDs = append(permissionIDs, permID)
		}
	}

	// Update role
	role.Name = req.Name

	if err := s.roleRepo.UpdateRole(ctx, role); err != nil {
		return nil, fmt.Errorf("updating role: %w", err)
	}

	// Assign permissions
	if len(permissionIDs) > 0 {
		if err := s.roleRepo.AssignPermissions(ctx, role.ID, permissionIDs); err != nil {
			return nil, fmt.Errorf("assigning permissions: %w", err)
		}
		role.Permissions, _ = s.roleRepo.GetRolePermissions(ctx, role.ID)
	}

	return s.toUpdateRoleResponse(role), nil
}

func (s *roleService) DeleteRole(ctx context.Context, roleID uuid.UUID, actorPermissions []string) error {
	// Check if actor has permission to manage roles
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "roles:delete" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return ErrUnauthorized
	}

	// Get role
	role, err := s.roleRepo.GetRoleByID(ctx, roleID)
	if err != nil {
		return fmt.Errorf("fetching role: %w", err)
	}
	if role == nil {
		return ErrUserNotFound
	}

	// System roles cannot be deleted
	if role.IsSystemRole {
		return ErrSystemRoleCannotBeDeleted
	}

	return s.roleRepo.DeleteRole(ctx, roleID)
}

func (s *roleService) AssignPermission(ctx context.Context, roleID, permissionID uuid.UUID, actorPermissions []string) (*dto.AssignPermissionResponse, error) {
	// Check if actor has permission to manage roles
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "roles:write" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return nil, ErrUnauthorized
	}

	// Get role
	role, err := s.roleRepo.GetRoleByID(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("fetching role: %w", err)
	}
	if role == nil {
		return nil, ErrUserNotFound
	}

	// Get permission
	permission, err := s.permissionRepo.GetPermissionByID(ctx, permissionID)
	if err != nil {
		return nil, fmt.Errorf("fetching permission: %w", err)
	}
	if permission == nil {
		return nil, ErrPermissionNotFound
	}

	// Get current permissions
	currentPerms, err := s.roleRepo.GetRolePermissions(ctx, roleID)
	if err != nil {
		return nil, fmt.Errorf("fetching role permissions: %w", err)
	}

	// Check if permission already assigned
	for _, p := range currentPerms {
		if p.ID == permissionID {
			return &dto.AssignPermissionResponse{
				Message: "Permission already assigned to role",
			}, nil
		}
	}

	// Add permission
	permissionIDs := make([]uuid.UUID, len(currentPerms)+1)
	for i, p := range currentPerms {
		permissionIDs[i] = p.ID
	}
	permissionIDs[len(currentPerms)] = permissionID

	if err := s.roleRepo.AssignPermissions(ctx, roleID, permissionIDs); err != nil {
		return nil, fmt.Errorf("assigning permission: %w", err)
	}

	return &dto.AssignPermissionResponse{
		Message: "Permission assigned successfully",
	}, nil
}

func (s *roleService) toCreateRoleResponse(role *domain.Role) *dto.CreateRoleResponse {
	resp := &dto.CreateRoleResponse{
		ID:           role.ID,
		Name:         role.Name,
		IsSystemRole: role.IsSystemRole,
		Permissions:  make([]dto.PermissionResponse, len(role.Permissions)),
	}
	for i, perm := range role.Permissions {
		resp.Permissions[i] = dto.PermissionResponse{
			ID:          perm.ID,
			Name:        perm.Name,
			Description: perm.Description,
		}
	}
	return resp
}

func (s *roleService) toRoleResponse(role *domain.Role) *dto.RoleResponse {
	resp := &dto.RoleResponse{
		ID:           role.ID,
		Name:         role.Name,
		IsSystemRole: role.IsSystemRole,
		Permissions:  make([]dto.PermissionResponse, len(role.Permissions)),
	}
	for i, perm := range role.Permissions {
		resp.Permissions[i] = dto.PermissionResponse{
			ID:          perm.ID,
			Name:        perm.Name,
			Description: perm.Description,
		}
	}
	return resp
}

func (s *roleService) toUpdateRoleResponse(role *domain.Role) *dto.UpdateRoleResponse {
	resp := &dto.UpdateRoleResponse{
		ID:           role.ID,
		Name:         role.Name,
		IsSystemRole: role.IsSystemRole,
		Permissions:  make([]dto.PermissionResponse, len(role.Permissions)),
	}
	for i, perm := range role.Permissions {
		resp.Permissions[i] = dto.PermissionResponse{
			ID:          perm.ID,
			Name:        perm.Name,
			Description: perm.Description,
		}
	}
	return resp
}
