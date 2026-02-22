'use client';

/**
 * AuthGuard – wraps any subtree that requires an authenticated session.
 *
 * Behaviour:
 *   • While the session is being hydrated (initial page load / refresh)  → shows
 *     a loading screen so the user never sees a flash of protected content.
 *   • After hydration, if the user is NOT authenticated                  → redirects
 *     to /login and continues showing the loading screen while the router
 *     transitions (prevents flickering).
 *   • After hydration, if the user IS authenticated                      → renders
 *     children normally.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Optional custom loading / placeholder while hydrating */
  fallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isHydrated && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isHydrated, isLoading, isAuthenticated, router]);

  // Block render until hydration is complete
  if (!isHydrated || isLoading) {
    return <>{fallback ?? <AuthLoadingScreen />}</>;
  }

  // Still show loader while the redirect is in-flight
  if (!isAuthenticated) {
    return <>{fallback ?? <AuthLoadingScreen />}</>;
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Internal loading UI
// ---------------------------------------------------------------------------

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800 dark:border-zinc-700 dark:border-t-zinc-200" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    </div>
  );
}
