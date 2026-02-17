package repository

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

type permissionRepository struct {
	db *gorm.DB
}

func NewPermissionRepository(db *gorm.DB) domain.PermissionRepository {
	return &permissionRepository{db: db}
}

func (r *permissionRepository) Create(ctx context.Context, permission *domain.Permission) error {
	return r.db.WithContext(ctx).Create(permission).Error
}

func (r *permissionRepository) FindByName(ctx context.Context, name string) (*domain.Permission, error) {
	var permission domain.Permission
	err := r.db.WithContext(ctx).First(&permission, "name = ?", name).Error
	if err != nil {
		return nil, err
	}
	return &permission, nil
}

func (r *permissionRepository) AssignPermission(ctx context.Context, roleID, permissionID string) error {
	role := domain.Role{ID: roleID}
	permission := domain.Permission{ID: permissionID}

	return r.db.WithContext(ctx).Model(&role).Association("Permissions").Append(&permission)
}

func (r *permissionRepository) GetPermissionsByRoleID(ctx context.Context, roleID string) ([]domain.Permission, error) {
	var permissions []domain.Permission

	err := r.db.WithContext(ctx).
		Joins("JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Where("role_permissions.role_id = ?", roleID).
		Find(&permissions).Error

	return permissions, err
}
