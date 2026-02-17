package repository

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"gorm.io/gorm"
)

type roleRepository struct {
	db *gorm.DB
}

func NewRoleRepository(db *gorm.DB) domain.RoleRepository {
	return &roleRepository{db: db}
}

func (r *roleRepository) Create(ctx context.Context, role *domain.Role) error {
	return r.db.WithContext(ctx).Create(role).Error
}

func (r *roleRepository) FindByName(ctx context.Context, name string) (*domain.Role, error) {
	var role domain.Role
	err := r.db.WithContext(ctx).First(&role, "name = ?", name).Error
	if err != nil {
		return nil, err
	}

	// Load permissions for this role
	var rolePermissions []struct {
		PermissionID string `gorm:"column:permission_id"`
	}
	err = r.db.WithContext(ctx).
		Table("role_permissions").
		Where("role_id = ?", role.ID).
		Find(&rolePermissions).Error
	if err != nil {
		return nil, err
	}

	if len(rolePermissions) > 0 {
		permIDs := make([]string, len(rolePermissions))
		for i, rp := range rolePermissions {
			permIDs[i] = rp.PermissionID
		}

		var permissions []domain.Permission
		err = r.db.WithContext(ctx).
			Where("id IN ?", permIDs).
			Find(&permissions).Error
		if err != nil {
			return nil, err
		}
		role.Permissions = permissions
	}

	return &role, nil
}

func (r *roleRepository) FindAll(ctx context.Context) ([]domain.Role, error) {
	var roles []domain.Role
	// Use explicit JOIN to avoid N+1 queries
	// First get all roles
	err := r.db.WithContext(ctx).Find(&roles).Error
	if err != nil {
		return nil, err
	}

	// If no roles, return early
	if len(roles) == 0 {
		return roles, nil
	}

	// Get all role IDs
	roleIDs := make([]string, len(roles))
	for i, role := range roles {
		roleIDs[i] = role.ID
	}

	// Load all permissions for these roles in a single query
	var rolePermissions []struct {
		RoleID       string `gorm:"column:role_id"`
		PermissionID string `gorm:"column:permission_id"`
	}
	err = r.db.WithContext(ctx).
		Table("role_permissions").
		Where("role_id IN ?", roleIDs).
		Find(&rolePermissions).Error
	if err != nil {
		return nil, err
	}

	// Get all unique permission IDs
	permIDMap := make(map[string]bool)
	for _, rp := range rolePermissions {
		permIDMap[rp.PermissionID] = true
	}
	permIDs := make([]string, 0, len(permIDMap))
	for id := range permIDMap {
		permIDs = append(permIDs, id)
	}

	// Load all permissions in a single query
	var permissions []domain.Permission
	if len(permIDs) > 0 {
		err = r.db.WithContext(ctx).
			Where("id IN ?", permIDs).
			Find(&permissions).Error
		if err != nil {
			return nil, err
		}
	}

	// Build permission map for quick lookup
	permMap := make(map[string]domain.Permission)
	for i := range permissions {
		permMap[permissions[i].ID] = permissions[i]
	}

	// Build role -> permissions mapping
	rolePermMap := make(map[string][]domain.Permission)
	for _, rp := range rolePermissions {
		if perm, ok := permMap[rp.PermissionID]; ok {
			rolePermMap[rp.RoleID] = append(rolePermMap[rp.RoleID], perm)
		}
	}

	// Assign permissions to roles
	for i := range roles {
		if perms, ok := rolePermMap[roles[i].ID]; ok {
			roles[i].Permissions = perms
		}
	}

	return roles, nil
}

func (r *roleRepository) AssignRole(ctx context.Context, userID, roleID string) error {
	// GORM many-to-many: user.Roles = append(user.Roles, role)
	// Or using manual association insert specific for user_roles table?
	// Easiest is to traverse via User model.

	// Option 1: Load user, append role, save.
	// Option 2: Use Association mode.

	// We need structs.
	user := domain.User{ID: userID}
	role := domain.Role{ID: roleID}

	return r.db.WithContext(ctx).Model(&user).Association("Roles").Append(&role)
}

func (r *roleRepository) GetRolesByUserID(ctx context.Context, userID string) ([]domain.Role, error) {
	var roles []domain.Role
	// Join with user_roles? Or simple association find?
	// association find: db.Model(&user).Association("Roles").Find(&roles)
	// But we usually want to find roles where user_id = ?
	// "SELECT * FROM roles JOIN user_roles ON user_roles.role_id = roles.id WHERE user_roles.user_id = ?"

	// Using Query:
	err := r.db.WithContext(ctx).
		Joins("JOIN user_roles ON user_roles.role_id = roles.id").
		Where("user_roles.user_id = ?", userID).
		Preload("Permissions").
		Find(&roles).Error

	return roles, err
}
