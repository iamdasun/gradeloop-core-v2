'use client';

/**
 * AuthProvider – must wrap the entire application tree.
 *
 * On first mount it calls hydrateSession(), which silently attempts a token
 * refresh using the HttpOnly refresh-token cookie.  This re-establishes the
 * user's session after a page reload without forcing a login screen.
 *
 * The provider itself does not block rendering; individual route guards
 * (AuthGuard) are responsible for gating protected content while hydration
 * is in progress.
 */

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrateSession = useAuthStore((s) => s.hydrateSession);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    // Only hydrate once; the store guards against re-entrant calls too
    if (!isHydrated) {
      hydrateSession();
    }
  }, [isHydrated, hydrateSession]);

  return <>{children}</>;
}
