'use client';

/**
 * RoleGuard – conditionally renders children based on the user's type.
 *
 * By default, ANY of the provided user types is sufficient (`requireAll = false`).
 * Pass `requireAll` to enforce that ALL listed types must be present (rarely needed).
 *
 * Usage:
 *   <RoleGuard roles="admin">…admin-only UI…</RoleGuard>
 *   <RoleGuard roles={['admin', 'instructor']} fallback={<p>No access</p>}>…</RoleGuard>
 */

import { useAuthStore } from '@/lib/stores/authStore';

interface RoleGuardProps {
  /** One user type or an array of user types */
  roles: string | string[];
  /** Render all listed types or only one? Default: false (any is enough) */
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
  const hasUserType = useAuthStore((s) => s.hasUserType);
  const allowed = Array.isArray(roles)
    ? requireAll
      ? roles.every((r) => hasUserType(r))
      : roles.some((r) => hasUserType(r))
    : hasUserType(roles);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
