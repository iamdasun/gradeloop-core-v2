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
	ErrPermissionAlreadyExists = errors.New("permission already exists")
)

type PermissionService interface {
	CreatePermission(ctx context.Context, req *dto.CreatePermissionRequest, actorPermissions []string) (*dto.PermissionResponse, error)
	GetAllPermissions(ctx context.Context) (*dto.ListPermissionsResponse, error)
}

type permissionService struct {
	db             *gorm.DB
	permissionRepo repository.PermissionRepository
}

func NewPermissionService(
	db *gorm.DB,
	permissionRepo repository.PermissionRepository,
) PermissionService {
	return &permissionService{
		db:             db,
		permissionRepo: permissionRepo,
	}
}

func (s *permissionService) CreatePermission(ctx context.Context, req *dto.CreatePermissionRequest, actorPermissions []string) (*dto.PermissionResponse, error) {
	// Check if actor has permission to manage permissions
	hasPermission := false
	for _, perm := range actorPermissions {
		if perm == "permissions:write" {
			hasPermission = true
			break
		}
	}
	if !hasPermission {
		return nil, ErrUnauthorized
	}

	// Check if permission already exists
	existingPerm, err := s.permissionRepo.GetPermissionByName(ctx, req.Name)
	if err != nil {
		return nil, fmt.Errorf("checking permission: %w", err)
	}
	if existingPerm != nil {
		return nil, ErrPermissionAlreadyExists
	}

	// Create permission
	permission := &domain.Permission{
		ID:          uuid.New(),
		Name:        req.Name,
		Description: req.Description,
	}

	if err := s.permissionRepo.CreatePermission(ctx, permission); err != nil {
		return nil, fmt.Errorf("creating permission: %w", err)
	}

	return &dto.PermissionResponse{
		ID:          permission.ID,
		Name:        permission.Name,
		Description: permission.Description,
	}, nil
}

func (s *permissionService) GetAllPermissions(ctx context.Context) (*dto.ListPermissionsResponse, error) {
	permissions, err := s.permissionRepo.GetAllPermissions(ctx)
	if err != nil {
		return nil, fmt.Errorf("fetching permissions: %w", err)
	}

	response := &dto.ListPermissionsResponse{
		Permissions: make([]dto.PermissionResponse, len(permissions)),
	}
	for i, perm := range permissions {
		response.Permissions[i] = dto.PermissionResponse{
			ID:          perm.ID,
			Name:        perm.Name,
			Description: perm.Description,
		}
	}

	return response, nil
}
