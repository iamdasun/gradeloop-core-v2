"use client";

import { useAuthStore } from "@/store/auth-store";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  return {
    user,
    role: user?.role,
    permissions: user?.permissions || [],
    isAuthenticated,
    isLoading,
    logout,
  };
}
