'use client';

/**
 * RoleGuard – conditionally renders children based on the user's roles.
 *
 * By default, ANY of the provided roles is sufficient (`requireAll = false`).
 * Pass `requireAll` to enforce that ALL listed roles must be present.
 *
 * Usage:
 *   <RoleGuard roles="admin">…admin-only UI…</RoleGuard>
 *   <RoleGuard roles={['admin', 'instructor']} fallback={<p>No access</p>}>…</RoleGuard>
 */

import { useAuthStore } from '@/lib/stores/authStore';

interface RoleGuardProps {
  /** One role name or an array of role names */
  roles: string | string[];
  /** Render all listed roles or only one? Default: false (any is enough) */
  requireAll?: boolean;
  children: React.ReactNode;
  /** Rendered when the check fails; defaults to null (nothing) */
  fallback?: React.ReactNode;
}

export function RoleGuard({
  roles,
  requireAll = false,
  children,
  fallback = null,
}: RoleGuardProps) {
  const hasRole = useAuthStore((s) => s.hasRole);
  const allowed = Array.isArray(roles)
    ? requireAll
      ? roles.every((r) => hasRole(r))
      : roles.some((r) => hasRole(r))
    : hasRole(roles);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
