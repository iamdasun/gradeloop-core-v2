import { create } from "zustand";
import axios from "axios";

// --- JWT Decoder ---
function parseJwt(token: string) {
    try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
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

    // Actions
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<string | null>;
    setUserFromToken: (token: string) => void;
    setLoading: (loading: boolean) => void;
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,

    setLoading: (loading) => set({ isLoading: loading }),

    setUserFromToken: (token) => {
        const decoded = parseJwt(token);
        if (decoded) {
            set({
                user: {
                    userId: decoded.userId || decoded.sub,
                    role: decoded.role,
                    permissions: decoded.permissions || [],
                    name: decoded.name || decoded.preferred_username || decoded.sub,
                    email: decoded.email,
                    requiresPasswordReset: decoded.requires_password_reset === true || decoded.reset === true,
                },
                accessToken: token,
                isAuthenticated: true,
            });
        }
    },

    logout: async () => {
        try {
            await axios.post("/api/v1/auth/logout", {}, { withCredentials: true });
        } catch (error) {
            console.error("Logout error", error);
        } finally {
            set({
                user: null,
                accessToken: null,
                isAuthenticated: false,
            });
        }
    },

    refresh: async () => {
        try {
            const response = await axios.post("/api/v1/auth/refresh", {}, { withCredentials: true });
            const { accessToken: newToken } = response.data;
            if (newToken) {
                get().setUserFromToken(newToken);
                return newToken;
            }
            return null;
        } catch (error) {
            console.error("Token refresh failed", error);
            await get().logout();
            return null;
        }
    },

    login: async (username, password) => {
        try {
            const response = await axios.post("/api/v1/auth/login", { username, password }, { withCredentials: true });
            const { accessToken: token } = response.data;
            if (token) {
                get().setUserFromToken(token);
            }
        } catch (error) {
            throw error;
        }
    },

    changePassword: async (currentPassword, newPassword) => {
        try {
            const response = await axios.post("/api/v1/auth/change-password", {
                currentPassword,
                newPassword,
            }, { withCredentials: true });

            const { accessToken: token } = response.data;
            if (token) {
                get().setUserFromToken(token);
            } else {
                // If backend doesn't return a new token, at least clear the reset flag locally
                const currentUser = get().user;
                if (currentUser) {
                    set({
                        user: { ...currentUser, requiresPasswordReset: false }
                    });
                }
            }
        } catch (error) {
            throw error;
        }
    },
}));
