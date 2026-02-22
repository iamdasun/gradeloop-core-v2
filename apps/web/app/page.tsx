'use client';

/**
 * Root page – transparent redirect.
 *
 * Waits for the session hydration to complete, then sends the user to either
 * their role-specific dashboard or the login page.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';

export default function RootPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const getRedirectPath = useAuthStore((s) => s.getRedirectPath);

  useEffect(() => {
    if (!isHydrated) return;
    router.replace(isAuthenticated ? getRedirectPath() : '/login');
  }, [isHydrated, isAuthenticated, getRedirectPath, router]);

  // Minimal spinner while waiting
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800 dark:border-zinc-700 dark:border-t-zinc-200" />
    </div>
  );
}
