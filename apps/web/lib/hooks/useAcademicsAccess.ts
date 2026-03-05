/**
 * useAcademicsAccess
 *
 * Derives academics access from the JWT user_type stored in authStore.
 * The academic-service backend uses user type checks:
 *   - super_admin  → full access (including faculties management)
 *   - admin        → departments, degrees, courses read + write
 *
 * Permission gating strategy: user type + action level.
 * The user_type comes from the decoded JWT, so no extra API round-trip needed.
 */
import { useAuthStore } from '@/lib/stores/authStore';

export interface AcademicsAccess {
  /** True if the user can view academics admin pages (admin or super_admin). */
  canAccess: boolean;
  /** True if the user can create/update/deactivate entities. */
  canWrite: boolean;
  /** True if the user is super_admin (required for faculties management). */
  isSuperAdmin: boolean;
}

export function useAcademicsAccess(): AcademicsAccess {
  const userType = useAuthStore((s) => s.user?.user_type ?? '');

  const isSuperAdmin = userType === 'super_admin';
  const isAdmin = isSuperAdmin || userType === 'admin';

  return {
    canAccess: isAdmin,
    canWrite: isAdmin,
    isSuperAdmin,
  };
}
