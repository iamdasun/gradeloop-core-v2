/**
 * Standalone RBAC helpers.
 *
 * Work directly with the flat role_name / permissions data from JWT claims.
 * Safe to use outside React (middleware, server utilities, etc.).
 */

// ---------------------------------------------------------------------------
// Role → dashboard route mapping
// ---------------------------------------------------------------------------
export const ROLE_DASHBOARD_MAP: Record<string, string> = {
  super_admin: '/admin',
  admin: '/admin',
  administrator: '/admin',
  superadmin: '/admin',
  employee: '/admin',
  instructor: '/instructor',
  teacher: '/instructor',
  student: '/student',
  learner: '/student',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the default dashboard path for the user's role.
 * Falls back to '/admin' when no mapping exists.
 */
export function getRoleDashboard(roleName: string): string {
  return ROLE_DASHBOARD_MAP[roleName.toLowerCase()] ?? '/admin';
}

/** Returns true when `roleName` matches the user's assigned role. */
export function hasRoleIn(userRoleName: string, roleName: string): boolean {
  return userRoleName.toLowerCase() === roleName.toLowerCase();
}

/**
 * Returns true when `permissionName` is in the user's flat permissions list.
 */
export function hasPermissionIn(
  permissions: string[],
  permissionName: string,
): boolean {
  return permissions.includes(permissionName);
}
