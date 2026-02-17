"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time for auth-related queries
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Retry configuration
      retry: (failureCount, error: unknown) => {
        // Don't retry auth errors
        const errorWithStatus = error as { status?: number };
        if (
          errorWithStatus?.status === 401 ||
          errorWithStatus?.status === 403
        ) {
          return false;
        }
        return failureCount < 3;
      },
      // Refetch on window focus for auth queries
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});

// Auth provider component
function AuthProvider({ children }: { children: React.ReactNode }) {
  const authStore = useAuthStore();

  // Initialize auth state on mount by validating session
  React.useEffect(() => {
    console.log("[AuthProvider] useEffect triggered", { 
      isAuthenticated: authStore.isAuthenticated, 
      isLoading: authStore.isLoading 
    });
    
    const initializeAuth = async () => {
      // Skip auth initialization if disabled
      if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
        console.log("[AuthProvider] Auth disabled - skipping initialization");
        authStore.setLoading(false);
        return;
      }

      // Skip if already authenticated or loading
      if (authStore.isAuthenticated || authStore.isLoading) {
        console.log("[AuthProvider] Skipping initialization - already authenticated or loading");
        return;
      }

      console.log("[AuthProvider] Starting session validation");
      authStore.setLoading(true);

      try {
        // TEMPORARILY DISABLE SESSION VALIDATION TO DEBUG LOOP
        console.log("[AuthProvider] Session validation temporarily disabled");
        authStore.setLoading(false);
        return;
        
        /*
        // Validate current session using HTTPOnly cookies
        const sessionResult = await apiClient.validateSession();

        if (sessionResult.valid && sessionResult.user) {
          // Session is valid, update auth state
          console.log("[AuthProvider] Valid session found");
          authStore.setAuthenticated(true);
          authStore.setUser(
            sessionResult.user as {
              id: string;
              email: string;
              full_name: string;
              is_active: boolean;
              user_type: "student" | "employee";
              roles: { id: string; name: string; permissions: string[] }[];
            },
          );
          authStore.updateLastActivity();
        } else {
          // No valid session, ensure we're logged out
          console.log("[AuthProvider] No valid session, logging out");
          authStore.logout();
        }
        */
      } catch (error) {
        console.error("[AuthProvider] Auth initialization error:", error);
        // On error, ensure we're logged out but don't retry immediately
        authStore.logout();
      } finally {
        authStore.setLoading(false);
      }
    };

    // Only initialize once on mount, not on every render
    initializeAuth();
  }, []); // Empty dependency array - only run once

  // Auto-refresh token when it's about to expire
  React.useEffect(() => {
    if (!authStore.isAuthenticated) return;

    const checkTokenExpiry = async () => {
      if (authStore.shouldRefresh() && !authStore.refreshing) {
        try {
          authStore.setRefreshing(true);
          // Use apiClient.refresh which handles HTTPOnly cookies
          await apiClient.refresh();
          authStore.updateLastActivity();
        } catch (error) {
          console.error("Auto-refresh failed:", error);
          authStore.logout();
        } finally {
          authStore.setRefreshing(false);
        }
      }
    };

    // Check every 30 seconds
    const interval = setInterval(checkTokenExpiry, 30 * 1000);

    // Initial check
    checkTokenExpiry();

    return () => clearInterval(interval);
  }, [authStore]);

  // Update activity on user interactions
  React.useEffect(() => {
    if (!authStore.isAuthenticated) return;

    const updateActivity = () => {
      authStore.updateLastActivity();
    };

    // Track user activity
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((event) => {
      document.addEventListener(event, updateActivity, true);
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [authStore]);

  return <>{children}</>;
}

// Session monitor component
function SessionMonitor({ children }: { children: React.ReactNode }) {
  // TEMPORARILY DISABLE SESSION MONITOR TO DEBUG LOOP
  console.log("[SessionMonitor] Temporarily disabled");
  return <>{children}</>;
  
  /*
  const authStore = useAuthStore();
  
  // Only render the monitoring logic when authenticated
  if (!authStore.isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <SessionMonitoringLogic>
      {children}
    </SessionMonitoringLogic>
  );
  */
}

// Separate component for the actual monitoring logic
function SessionMonitoringLogic({ children }: { children: React.ReactNode }) {
  const authStore = useAuthStore();
  const [validationErrorCount, setValidationErrorCount] = React.useState(0);
  const MAX_VALIDATION_ERRORS = 3; // Allow up to 3 consecutive validation errors

  // Monitor session validity
  React.useEffect(() => {
    console.log("[SessionMonitor] useEffect triggered", { 
      isAuthenticated: authStore.isAuthenticated,
      validationErrorCount
    });
    
    const checkSession = async () => {
      console.log("[SessionMonitor] Checking session");
      try {
        // Check if session is expired based on local state
        if (authStore.isSessionExpired()) {
          console.log("Session expired, logging out");
          authStore.logout();
          return;
        }

        // Check for inactivity timeout (30 minutes)
        const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
        const timeSinceActivity = Date.now() - authStore.lastActivity;

        if (timeSinceActivity > INACTIVITY_TIMEOUT) {
          console.log("Session inactive timeout, logging out");
          authStore.logout();
          return;
        }

        // Periodically validate session with the server (every 5 minutes)
        // But only if we haven't had too many validation errors
        if (validationErrorCount < MAX_VALIDATION_ERRORS) {
          try {
            console.log("[SessionMonitor] Calling validateSession");
            const validationResult = await apiClient.validateSession();
            if (!validationResult.valid) {
              console.log("Server session invalid, logging out");
              authStore.logout();
              return;
            }
            // Reset error count on successful validation
            if (validationErrorCount > 0) {
              setValidationErrorCount(0);
            }
          } catch (error) {
            console.error("Session validation failed:", error);
            setValidationErrorCount(prev => prev + 1);
            
            // If we've hit the max errors, log out
            if (validationErrorCount + 1 >= MAX_VALIDATION_ERRORS) {
              console.log("Too many validation errors, logging out");
              authStore.logout();
            }
          }
        }
      } catch (error) {
        console.error("Session check error:", error);
      }
    };

    // Check session every 5 minutes (instead of every minute to reduce load)
    const interval = setInterval(checkSession, 5 * 60 * 1000);

    // Initial check
    checkSession();

    return () => clearInterval(interval);
  }, [authStore, validationErrorCount]);

  return <>{children}</>;
}

// Main providers component
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <SessionMonitor>
            {children}
            <Toaster
              position="top-right"
              expand={true}
              richColors={true}
              closeButton={true}
            />
          </SessionMonitor>
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Export query client for use in other parts of the app
export { queryClient };
