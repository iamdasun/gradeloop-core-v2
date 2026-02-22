import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '@/types/auth.types';
import { decodeJwtPayload } from '@/lib/auth/jwt-decode';

// ---------------------------------------------------------------------------
// Role → dashboard path map
// ---------------------------------------------------------------------------
const ROLE_DASHBOARD_MAP: Record<string, string> = {
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
// Store interface
// ---------------------------------------------------------------------------

interface AuthState {
  // Access token is memory-only – never persisted (XSS mitigation)
  accessToken: string | null;

  // Persisted for UX continuity; re-validated on mount via hydrateSession
  user: User | null;

  isAuthenticated: boolean;
  isLoading: boolean;
  /** True once the initial hydration attempt has completed */
  isHydrated: boolean;

  // ---- internal setter used by the axios interceptor --------------------
  setAccessToken: (token: string) => void;

  // ---- session lifecycle -------------------------------------------------
  /**
   * Decode the access token, extract JWT claims, and populate the store.
   * Called after a successful login or refresh.
   */
  setSession: (token: string) => void;
  /** Wipe all auth state (logout / unrecoverable 401). */
  clearSession: () => void;
  /**
   * Silently attempt a token refresh on app mount.
   * Decodes the new token to restore the full session without any profile API.
   */
  hydrateSession: () => Promise<void>;

  // ---- RBAC helpers ------------------------------------------------------
  hasRole: (roleName: string) => boolean;
  hasPermission: (permissionName: string) => boolean;
  /** Returns the default dashboard path for the user's role. */
  getRedirectPath: () => string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,

      // ------------------------------------------------------------------ //
      setAccessToken: (token) => {
        // Also re-decode so permissions stay in sync after a refresh
        const claims = decodeJwtPayload(token);
        if (!claims) return;
        const user: User = {
          id: claims.user_id,
          username: claims.username,
          role_name: claims.role_name ?? '',
          permissions: claims.permissions ?? [],
        };
        set({ accessToken: token, user, isAuthenticated: true });
      },

      // ------------------------------------------------------------------ //
      setSession: (token) => {
        const claims = decodeJwtPayload(token);
        if (!claims) {
          console.error('[AuthStore] setSession: failed to decode JWT');
          return;
        }
        const user: User = {
          id: claims.user_id,
          username: claims.username,
          role_name: claims.role_name ?? '',
          permissions: claims.permissions ?? [],
        };
        set({
          accessToken: token,
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      },

      // ------------------------------------------------------------------ //
      clearSession: () =>
        set({
          accessToken: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }),

      // ------------------------------------------------------------------ //
      hydrateSession: async () => {
        if (get().isLoading) return;
        set({ isLoading: true });

        try {
          const { default: axiosBase } = await import('axios');
          const API_URL =
            process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

          // The refresh token lives in an HttpOnly cookie set by the server.
          // withCredentials ensures the browser sends it automatically.
          const res = await axiosBase.post(
            `${API_URL}/auth/refresh`,
            {},
            { withCredentials: true, timeout: 10_000 },
          );

          const newToken: string = res.data.access_token;
          const claims = decodeJwtPayload(newToken);

          if (!claims) {
            set({ accessToken: null, isAuthenticated: false });
            return;
          }

          const user: User = {
            id: claims.user_id,
            username: claims.username,
            role_name: claims.role_name ?? '',
            permissions: claims.permissions ?? [],
          };

          set({ accessToken: newToken, user, isAuthenticated: true });
        } catch {
          // No cookie / expired — user must log in. This is expected on first load.
          // Guard against races where a real login finished while hydration was in-flight.
          if (!get().isAuthenticated) {
            set({ accessToken: null, isAuthenticated: false });
          }
        } finally {
          set({ isLoading: false, isHydrated: true });
        }
      },

      // ------------------------------------------------------------------ //
      hasRole: (roleName) => {
        const u = get().user;
        return !!u && u.role_name.toLowerCase() === roleName.toLowerCase();
      },

      hasPermission: (permissionName) => {
        const u = get().user;
        return !!u && u.permissions.includes(permissionName);
      },

      getRedirectPath: () => {
        const roleName = get().user?.role_name?.toLowerCase() ?? '';
        return ROLE_DASHBOARD_MAP[roleName] ?? '/admin';
      },
    }),

    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
        return localStorage;
      }),
      // accessToken and refreshToken are intentionally excluded from persistence.
      // The refresh token lives in an HttpOnly cookie managed by the browser.
      partialize: (state) => ({ user: state.user }),
    },
  ),
);
