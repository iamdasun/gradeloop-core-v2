'use client';

/**
 * PermissionGuard – conditionally renders children based on user type access.
 *
 * Note: This component now uses user types instead of fine-grained permissions.
 * Use 'admin' or 'super_admin' for admin access, 'instructor' for instructor access, etc.
 *
 * By default, ANY of the provided user types is sufficient (`requireAll = false`).
 * Pass `requireAll` to enforce that ALL listed types must be present.
 *
 * Usage:
 *   <PermissionGuard permission="admin">…</PermissionGuard>
 *   <PermissionGuard permission={['instructor', 'admin']} requireAll={false}>…</PermissionGuard>
 */

import { useAuthStore } from '@/lib/stores/authStore';

interface PermissionGuardProps {
  /** One user type or an array of user types */
  permission: string | string[];
  /** Require ALL user types? Default: false (any is enough) */
  requireAll?: boolean;
  children: React.ReactNode;
  /** Rendered when the check fails; defaults to null (nothing) */
  fallback?: React.ReactNode;
}

export function PermissionGuard({
  permission,
  requireAll = false,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const hasUserType = useAuthStore((s) => s.hasUserType);
  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = requireAll
    ? perms.every((p) => hasUserType(p))
    : perms.some((p) => hasUserType(p));

  return allowed ? <>{children}</> : <>{fallback}</>;
}
