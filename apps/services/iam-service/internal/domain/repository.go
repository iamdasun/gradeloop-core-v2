package domain

import "context"

type UserRepository interface {
	Create(ctx context.Context, user *User) error
	FindByID(ctx context.Context, id string) (*User, error)
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindByEmailForAuth(ctx context.Context, email string) (*User, error) // Optimized for auth - no preloads
	FindByStudentID(ctx context.Context, studentID string) (*User, error)
	FindByEmployeeID(ctx context.Context, employeeID string) (*User, error)
	FindAll(ctx context.Context, skip, limit int) ([]User, error)
	Update(ctx context.Context, user *User) error
	Delete(ctx context.Context, id string) error // Soft delete
}

type RoleRepository interface {
	Create(ctx context.Context, role *Role) error
	FindByName(ctx context.Context, name string) (*Role, error)
	FindAll(ctx context.Context) ([]Role, error)
	AssignRole(ctx context.Context, userID, roleID string) error
	GetRolesByUserID(ctx context.Context, userID string) ([]Role, error)
}

type PermissionRepository interface {
	Create(ctx context.Context, permission *Permission) error
	FindByName(ctx context.Context, name string) (*Permission, error)
	AssignPermission(ctx context.Context, roleID, permissionID string) error
	GetPermissionsByRoleID(ctx context.Context, roleID string) ([]Permission, error)
}

type AuditRepository interface {
	Create(ctx context.Context, log *AuditLog) error
	FindAll(ctx context.Context, skip, limit int) ([]AuditLog, error)
}

type PasswordResetRepository interface {
	Create(ctx context.Context, token *PasswordResetToken) error
	FindByTokenHash(ctx context.Context, hash string) (*PasswordResetToken, error)
	FindLatestByUserID(ctx context.Context, userID string) (*PasswordResetToken, error)
	MarkAsUsed(ctx context.Context, id string) error
	DeleteByUserID(ctx context.Context, userID string) error
}

type RefreshTokenRepository interface {
	Create(ctx context.Context, token *RefreshToken) error
	FindByTokenHash(ctx context.Context, hash string) (*RefreshToken, error)
	Revoke(ctx context.Context, id string, replacedByHash string) error
	RevokeAllForUser(ctx context.Context, userID string) error
}
