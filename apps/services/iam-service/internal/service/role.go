package service

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/dto"
	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/errors"
	"github.com/go-playground/validator/v10"
)

type RoleService interface {
	CreateRole(ctx context.Context, req dto.CreateRoleRequest) (*domain.Role, error)
	ListRoles(ctx context.Context) ([]domain.Role, error)
	AssignPermission(ctx context.Context, roleID, permissionID string) error
}

type roleService struct {
	roleRepo       domain.RoleRepository
	permissionRepo domain.PermissionRepository
	auditRepo      domain.AuditRepository
	validate       *validator.Validate
}

func NewRoleService(
	roleRepo domain.RoleRepository,
	permissionRepo domain.PermissionRepository,
	auditRepo domain.AuditRepository,
) RoleService {
	return &roleService{
		roleRepo:       roleRepo,
		permissionRepo: permissionRepo,
		auditRepo:      auditRepo,
		validate:       validator.New(),
	}
}

func (s *roleService) CreateRole(ctx context.Context, req dto.CreateRoleRequest) (*domain.Role, error) {
	if err := s.validate.Struct(req); err != nil {
		return nil, errors.New(400, "Validation failed", err)
	}

	role := &domain.Role{
		Name:        req.Name,
		Description: req.Description,
	}

	if err := s.roleRepo.Create(ctx, role); err != nil {
		return nil, errors.New(500, "Failed to create role", err)
	}

	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "ROLE_CREATE",
		EntityName: "roles",
		EntityID:   role.ID,
	})

	return role, nil
}

func (s *roleService) ListRoles(ctx context.Context) ([]domain.Role, error) {
	return s.roleRepo.FindAll(ctx)
}

func (s *roleService) AssignPermission(ctx context.Context, roleID, permissionID string) error {
	if err := s.permissionRepo.AssignPermission(ctx, roleID, permissionID); err != nil {
		return errors.New(500, "Failed to assign permission", err)
	}

	s.auditRepo.Create(ctx, &domain.AuditLog{
		Action:     "PERMISSION_ASSIGN",
		EntityName: "roles",
		EntityID:   roleID,
	})
	return nil
}
