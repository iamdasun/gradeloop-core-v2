import { create } from "zustand";
import apiClient from "@/lib/api/client";

// --- JWT Decoder ---
function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// --- Types ---

export interface User {
  userId: string;
  role: string;
  permissions: string[];
  name?: string;
  email?: string;
  requiresPasswordReset?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isRefreshing: boolean;

  // Actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  setUserFromToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  isRefreshing: false,

  setLoading: (loading) => set({ isLoading: loading }),

  setUserFromToken: (token) => {
    const decoded = parseJwt(token);
    if (decoded) {
      set({
        user: {
          userId: decoded.user_id || decoded.sub,
          role: decoded.role_name,
          permissions: decoded.permissions || [],
          name:
            decoded.name ||
            decoded.preferred_username ||
            decoded.username ||
            decoded.sub,
          email: decoded.email,
          requiresPasswordReset:
            decoded.requires_password_reset === true || decoded.reset === true,
        },
        accessToken: token,
        isAuthenticated: true,
      });
    }
  },

  logout: async () => {
    // Clear local state first
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    });

    try {
      // Only call backend if we're likely to have a valid session
      // This prevents unnecessary 400 errors when there's no refresh_token cookie
      await apiClient.post("/auth/logout", {});
    } catch (error) {
      // Silently ignore logout errors - this is expected when:
      // - No refresh token cookie exists (first-time users, expired sessions)
      // - Token is already revoked
      // Local state is already cleared above, so we're good either way
      console.debug(
        "Logout backend call failed (this is usually normal)",
        error,
      );
    }
  },

  refresh: async () => {
    // Prevent concurrent refresh calls
    if (get().isRefreshing) {
      return null;
    }

    set({ isRefreshing: true });
    try {
      // Use apiClient which has proper interceptors and cookie handling
      const response = await apiClient.post("/auth/refresh");
      const { access_token: newToken } = response.data;
      if (newToken) {
        get().setUserFromToken(newToken);
        return newToken;
      }
      return null;
    } catch {
      // Refresh failure is expected when no valid session exists
      // Don't log as error - this is normal behavior for expired/missing sessions
      // Clear local state without calling backend logout (which would also fail)
      set({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      });
      return null;
    } finally {
      set({ isRefreshing: false });
    }
  },

  login: async (username, password) => {
    try {
      const response = await apiClient.post("/auth/login", {
        username,
        password,
      });
      const { access_token: token } = response.data;
      if (token) {
        get().setUserFromToken(token);
      }
    } catch (error) {
      throw error;
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      const response = await apiClient.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      const { access_token: token } = response.data;
      if (token) {
        get().setUserFromToken(token);
      } else {
        // If backend doesn't return a new token, at least clear the reset flag locally
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, requiresPasswordReset: false },
          });
        }
      }
    } catch (error) {
      throw error;
    }
  },

  forgotPassword: async (email) => {
    // Sends a reset link to the given email.
    // Backend returns 200 regardless of whether the email exists (anti-enumeration).
    await apiClient.post("/auth/forgot-password", { email });
  },

  resetPassword: async (token, newPassword) => {
    // Resets password with the token extracted from the reset-link URL.
    // Backend expects: { token, new_password }
    await apiClient.post("/auth/reset-password", {
      token,
      new_password: newPassword,
    });
  },
}));
