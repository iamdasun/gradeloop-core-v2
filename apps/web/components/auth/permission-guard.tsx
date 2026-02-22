'use client';

/**
 * PermissionGuard – conditionally renders children based on IAM permissions.
 *
 * By default, ANY of the provided permissions is sufficient (`requireAll = false`).
 * Pass `requireAll` to enforce that ALL listed permissions must be present.
 *
 * Usage:
 *   <PermissionGuard permission="users:read">…</PermissionGuard>
 *   <PermissionGuard permission={['users:write', 'roles:assign']} requireAll>…</PermissionGuard>
 */

import { useAuthStore } from '@/lib/stores/authStore';

interface PermissionGuardProps {
  /** One permission name or an array of permission names */
  permission: string | string[];
  /** Require ALL permissions? Default: false (any is enough) */
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
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = requireAll
    ? perms.every((p) => hasPermission(p))
    : perms.some((p) => hasPermission(p));

  return allowed ? <>{children}</> : <>{fallback}</>;
}
