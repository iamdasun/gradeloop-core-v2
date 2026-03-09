import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types/auth.types";
import { decodeJwtPayload } from "@/lib/auth/jwt-decode";

// ---------------------------------------------------------------------------
// User type → dashboard path map
// ---------------------------------------------------------------------------
const USER_TYPE_DASHBOARD_MAP: Record<string, string> = {
  super_admin: "/admin",
  admin: "/admin",
  instructor: "/instructor",
  student: "/student",
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
  hasUserType: (userType: string) => boolean;
  hasAdminAccess: () => boolean;
  isSuperAdmin: () => boolean;
  isInstructor: () => boolean;
  isStudent: () => boolean;
  /** Returns the default dashboard path for the user's type. */
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
          email: claims.email,
          full_name: claims.full_name,
          user_type: claims.user_type ?? "student",
        };
        set({ accessToken: token, user, isAuthenticated: true });
      },

      // ------------------------------------------------------------------ //
      setSession: (token) => {
        const claims = decodeJwtPayload(token);
        if (!claims) {
          console.error("[AuthStore] setSession: failed to decode JWT");
          return;
        }
        const user: User = {
          id: claims.user_id,
          email: claims.email,
          full_name: claims.full_name,
          user_type: claims.user_type ?? "student",
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

        // If already authenticated with access token, skip refresh
        if (get().accessToken && get().isAuthenticated) {
          set({ isLoading: false, isHydrated: true });
          return;
        }

        set({ isLoading: true });

        try {
          const { default: axiosBase } = await import("axios");
          const API_URL =
            process.env.NEXT_PUBLIC_API_URL || "http://traefik:8000/api/v1";

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
            email: claims.email,
            full_name: claims.full_name,
            user_type: claims.user_type ?? "student",
          };

          set({ accessToken: newToken, user, isAuthenticated: true });
        } catch {
          // No cookie / expired — user must log in. This is expected on first load.
          // Guard against races: only clear if no access token was set concurrently
          // (e.g. by a login on another tab). Checking accessToken is safer than
          // isAuthenticated because stale localStorage can leave isAuthenticated=true
          // even when there is no valid token.
          if (!get().accessToken) {
            set({ accessToken: null, isAuthenticated: false, user: null });
          }
        } finally {
          set({ isLoading: false, isHydrated: true });
        }
      },

      // ------------------------------------------------------------------ //
      hasUserType: (userType) => {
        const u = get().user;
        return !!u && u.user_type.toLowerCase() === userType.toLowerCase();
      },

      hasAdminAccess: () => {
        const u = get().user;
        return !!u && (u.user_type === "admin" || u.user_type === "super_admin");
      },

      isSuperAdmin: () => {
        const u = get().user;
        return !!u && u.user_type === "super_admin";
      },

      isInstructor: () => {
        const u = get().user;
        return !!u && u.user_type === "instructor";
      },

      isStudent: () => {
        const u = get().user;
        return !!u && u.user_type === "student";
      },

      getRedirectPath: () => {
        const userType = get().user?.user_type?.toLowerCase() ?? "";
        return USER_TYPE_DASHBOARD_MAP[userType] ?? "/admin";
      },
    }),

    {
      name: "auth-storage",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
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
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
