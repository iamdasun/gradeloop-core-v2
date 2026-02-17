package domain

// Roles
const (
	RoleSuperAdmin = "SUPER_ADMIN"
	RoleAdmin      = "ADMIN"
	RoleInstructor = "INSTRUCTOR"
	RoleStudent    = "STUDENT"
)

// Permissions
const (
	PermissionUserCreate = "USER_CREATE"
	PermissionUserRead   = "USER_READ"
	PermissionUserUpdate = "USER_UPDATE"
	PermissionUserDelete = "USER_DELETE"

	PermissionRoleCreate = "ROLE_CREATE"
	PermissionRoleRead   = "ROLE_READ"
	PermissionRoleUpdate = "ROLE_UPDATE"
	PermissionRoleDelete = "ROLE_DELETE"
	PermissionRoleAssign = "ROLE_ASSIGN"

	PermissionAuditRead = "AUDIT_READ"
)
