package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"gorm.io/gorm"
)

type PermissionRepository interface {
	CreatePermission(ctx context.Context, permission *domain.Permission) error
	GetPermissionByID(ctx context.Context, permissionID uuid.UUID) (*domain.Permission, error)
	GetPermissionByName(ctx context.Context, name string) (*domain.Permission, error)
	GetAllPermissions(ctx context.Context) ([]domain.Permission, error)
	UpdatePermission(ctx context.Context, permission *domain.Permission) error
	DeletePermission(ctx context.Context, permissionID uuid.UUID) error
	PermissionExists(ctx context.Context, permissionID uuid.UUID) (bool, error)
}

type permissionRepository struct {
	db *gorm.DB
}

func NewPermissionRepository(db *gorm.DB) PermissionRepository {
	return &permissionRepository{db: db}
}

func (r *permissionRepository) CreatePermission(ctx context.Context, permission *domain.Permission) error {
	return r.db.WithContext(ctx).Create(permission).Error
}

func (r *permissionRepository) GetPermissionByID(ctx context.Context, permissionID uuid.UUID) (*domain.Permission, error) {
	var permission domain.Permission

	query := r.db.WithContext(ctx).
		First(&permission, permissionID)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &permission, nil
}

func (r *permissionRepository) GetPermissionByName(ctx context.Context, name string) (*domain.Permission, error) {
	var permission domain.Permission

	query := r.db.WithContext(ctx).
		Where("name = ? AND deleted_at IS NULL", name).
		First(&permission)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &permission, nil
}

func (r *permissionRepository) GetAllPermissions(ctx context.Context) ([]domain.Permission, error) {
	var permissions []domain.Permission

	query := r.db.WithContext(ctx).
		Where("deleted_at IS NULL").
		Find(&permissions)

	if query.Error != nil {
		return nil, query.Error
	}

	return permissions, nil
}

func (r *permissionRepository) UpdatePermission(ctx context.Context, permission *domain.Permission) error {
	return r.db.WithContext(ctx).Save(permission).Error
}

func (r *permissionRepository) DeletePermission(ctx context.Context, permissionID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Model(&domain.Permission{}).
		Where("id = ?", permissionID).
		Update("deleted_at", gorm.Expr("NOW()")).Error
}

func (r *permissionRepository) PermissionExists(ctx context.Context, permissionID uuid.UUID) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&domain.Permission{}).
		Where("id = ? AND deleted_at IS NULL", permissionID).
		Count(&count)

	if query.Error != nil {
		return false, query.Error
	}

	return count > 0, nil
}
