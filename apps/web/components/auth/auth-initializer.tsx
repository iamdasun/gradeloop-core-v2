"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth-store";

// --- JWT Decoder (shared or duplicated for simplicity here) ---
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
  } catch (e) {
    return null;
  }
}

export function AuthInitializer() {
  const { accessToken, refresh, setLoading, isAuthenticated } = useAuthStore();
  const hasInitialized = useRef(false);

  // Initial auth check - only refresh if we don't have a valid access token
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initAuth = async () => {
      // Only attempt refresh if we don't already have a valid access token
      // This prevents unnecessary refresh calls when user is already authenticated
      if (!accessToken) {
        await refresh();
      }
      setLoading(false);
    };
    initAuth();
  }, [refresh, setLoading, accessToken]);

  // Auto-refresh timer
  useEffect(() => {
    if (!accessToken) return;

    const decoded = parseJwt(accessToken);
    if (!decoded || !decoded.exp) return;

    const expiryTime = decoded.exp * 1000;
    const currentTime = Date.now();
    const delay = expiryTime - currentTime - 60000; // Refresh 1 minute before expiry

    if (delay <= 0) {
      // Token already expired or about to expire
      refresh();
      return;
    }

    const timer = setTimeout(() => {
      refresh();
    }, delay);

    return () => clearTimeout(timer);
  }, [accessToken, refresh]);

  return null; // This component doesn't render anything
}
