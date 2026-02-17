package mocks

import (
	"context"

	"github.com/4yrg/gradeloop-core-v2/apps/services/iam-service/internal/domain"
	"github.com/stretchr/testify/mock"
)

// UserRepository
type UserRepository struct {
	mock.Mock
}

func (m *UserRepository) Create(ctx context.Context, user *domain.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}

func (m *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}

func (m *UserRepository) FindByEmailForAuth(ctx context.Context, email string) (*domain.User, error) {
	args := m.Called(ctx, email)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}

// FindByStudentID returns a mocked lookup by student ID
func (m *UserRepository) FindByStudentID(ctx context.Context, studentID string) (*domain.User, error) {
	args := m.Called(ctx, studentID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}

// FindByEmployeeID returns a mocked lookup by employee ID
func (m *UserRepository) FindByEmployeeID(ctx context.Context, employeeID string) (*domain.User, error) {
	args := m.Called(ctx, employeeID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.User), args.Error(1)
}

func (m *UserRepository) FindAll(ctx context.Context, skip, limit int) ([]domain.User, error) {
	args := m.Called(ctx, skip, limit)
	return args.Get(0).([]domain.User), args.Error(1)
}

func (m *UserRepository) Update(ctx context.Context, user *domain.User) error {
	args := m.Called(ctx, user)
	return args.Error(0)
}

func (m *UserRepository) Delete(ctx context.Context, id string) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

// RoleRepository
type RoleRepository struct {
	mock.Mock
}

func (m *RoleRepository) Create(ctx context.Context, role *domain.Role) error {
	args := m.Called(ctx, role)
	return args.Error(0)
}

func (m *RoleRepository) FindByName(ctx context.Context, name string) (*domain.Role, error) {
	args := m.Called(ctx, name)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Role), args.Error(1)
}

func (m *RoleRepository) FindAll(ctx context.Context) ([]domain.Role, error) {
	args := m.Called(ctx)
	return args.Get(0).([]domain.Role), args.Error(1)
}

func (m *RoleRepository) AssignRole(ctx context.Context, userID, roleID string) error {
	args := m.Called(ctx, userID, roleID)
	return args.Error(0)
}

func (m *RoleRepository) GetRolesByUserID(ctx context.Context, userID string) ([]domain.Role, error) {
	args := m.Called(ctx, userID)
	return args.Get(0).([]domain.Role), args.Error(1)
}

// PermissionRepository
type PermissionRepository struct {
	mock.Mock
}

func (m *PermissionRepository) Create(ctx context.Context, permission *domain.Permission) error {
	args := m.Called(ctx, permission)
	return args.Error(0)
}

func (m *PermissionRepository) FindByName(ctx context.Context, name string) (*domain.Permission, error) {
	args := m.Called(ctx, name)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.Permission), args.Error(1)
}

func (m *PermissionRepository) AssignPermission(ctx context.Context, roleID, permissionID string) error {
	args := m.Called(ctx, roleID, permissionID)
	return args.Error(0)
}

func (m *PermissionRepository) GetPermissionsByRoleID(ctx context.Context, roleID string) ([]domain.Permission, error) {
	args := m.Called(ctx, roleID)
	return args.Get(0).([]domain.Permission), args.Error(1)
}

// AuditRepository
type AuditRepository struct {
	mock.Mock
}

func (m *AuditRepository) Create(ctx context.Context, log *domain.AuditLog) error {
	args := m.Called(ctx, log)
	return args.Error(0)
}

func (m *AuditRepository) FindAll(ctx context.Context, skip, limit int) ([]domain.AuditLog, error) {
	args := m.Called(ctx, skip, limit)
	return args.Get(0).([]domain.AuditLog), args.Error(1)
}

// RefreshTokenRepository
type RefreshTokenRepository struct {
	mock.Mock
}

func (m *RefreshTokenRepository) Create(ctx context.Context, token *domain.RefreshToken) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func (m *RefreshTokenRepository) FindByTokenHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	args := m.Called(ctx, hash)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.RefreshToken), args.Error(1)
}

func (m *RefreshTokenRepository) Revoke(ctx context.Context, id string, replacedByHash string) error {
	args := m.Called(ctx, id, replacedByHash)
	return args.Error(0)
}

func (m *RefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	args := m.Called(ctx, userID)
	return args.Error(0)
}

// PasswordResetRepository
type PasswordResetRepository struct {
	mock.Mock
}

func (m *PasswordResetRepository) Create(ctx context.Context, token *domain.PasswordResetToken) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func (m *PasswordResetRepository) FindByTokenHash(ctx context.Context, hash string) (*domain.PasswordResetToken, error) {
	args := m.Called(ctx, hash)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.PasswordResetToken), args.Error(1)
}

func (m *PasswordResetRepository) DeleteByUserID(ctx context.Context, userID string) error {
	args := m.Called(ctx, userID)
	return args.Error(0)
}

func (m *PasswordResetRepository) FindLatestByUserID(ctx context.Context, userID string) (*domain.PasswordResetToken, error) {
	args := m.Called(ctx, userID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*domain.PasswordResetToken), args.Error(1)
}

func (m *PasswordResetRepository) MarkAsUsed(ctx context.Context, id string) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}
