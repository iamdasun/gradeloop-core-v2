package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/gradeloop/iam-service/internal/domain"
	"gorm.io/gorm"
)

type RoleRepository interface {
	CreateRole(ctx context.Context, role *domain.Role) error
	GetRoleByID(ctx context.Context, roleID uuid.UUID) (*domain.Role, error)
	GetRoleByName(ctx context.Context, name string) (*domain.Role, error)
	GetAllRoles(ctx context.Context) ([]domain.Role, error)
	UpdateRole(ctx context.Context, role *domain.Role) error
	DeleteRole(ctx context.Context, roleID uuid.UUID) error
	RoleExists(ctx context.Context, roleID uuid.UUID) (bool, error)
	AssignPermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error
	GetRolePermissions(ctx context.Context, roleID uuid.UUID) ([]domain.Permission, error)
}

type roleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) RoleRepository {
	return &roleRepository{db: db}
}

func (r *roleRepository) CreateRole(ctx context.Context, role *domain.Role) error {
	return r.db.WithContext(ctx).Create(role).Error
}

func (r *roleRepository) GetRoleByID(ctx context.Context, roleID uuid.UUID) (*domain.Role, error) {
	var role domain.Role

	query := r.db.WithContext(ctx).
		Preload("Permissions").
		First(&role, roleID)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &role, nil
}

func (r *roleRepository) GetRoleByName(ctx context.Context, name string) (*domain.Role, error) {
	var role domain.Role

	query := r.db.WithContext(ctx).
		Preload("Permissions").
		Where("name = ? AND deleted_at IS NULL", name).
		First(&role)

	if query.Error != nil {
		if query.Error == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, query.Error
	}

	return &role, nil
}

func (r *roleRepository) GetAllRoles(ctx context.Context) ([]domain.Role, error) {
	var roles []domain.Role

	query := r.db.WithContext(ctx).
		Preload("Permissions").
		Where("deleted_at IS NULL").
		Find(&roles)

	if query.Error != nil {
		return nil, query.Error
	}

	return roles, nil
}

func (r *roleRepository) UpdateRole(ctx context.Context, role *domain.Role) error {
	return r.db.WithContext(ctx).Save(role).Error
}

func (r *roleRepository) DeleteRole(ctx context.Context, roleID uuid.UUID) error {
	return r.db.WithContext(ctx).
		Model(&domain.Role{}).
		Where("id = ?", roleID).
		Update("deleted_at", gorm.Expr("NOW()")).Error
}

func (r *roleRepository) RoleExists(ctx context.Context, roleID uuid.UUID) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).
		Model(&domain.Role{}).
		Where("id = ? AND deleted_at IS NULL", roleID).
		Count(&count)

	if query.Error != nil {
		return false, query.Error
	}

	return count > 0, nil
}

func (r *roleRepository) AssignPermissions(ctx context.Context, roleID uuid.UUID, permissionIDs []uuid.UUID) error {
	tx := r.db.WithContext(ctx).Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Remove existing permissions
	if err := tx.Table("role_permissions").
		Where("role_id = ?", roleID).
		Delete(&struct{}{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Add new permissions
	for _, permID := range permissionIDs {
		if err := tx.Table("role_permissions").
			Create(map[string]interface{}{
				"role_id":       roleID,
				"permission_id": permID,
				"created_at":    gorm.Expr("NOW()"),
			}).Error; err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit().Error
}

func (r *roleRepository) GetRolePermissions(ctx context.Context, roleID uuid.UUID) ([]domain.Permission, error) {
	var permissions []domain.Permission

	query := r.db.WithContext(ctx).
		Table("permissions").
		Joins("INNER JOIN role_permissions ON role_permissions.permission_id = permissions.id").
		Where("role_permissions.role_id = ? AND permissions.deleted_at IS NULL", roleID).
		Find(&permissions)

	if query.Error != nil {
		return nil, query.Error
	}

	return permissions, nil
}
