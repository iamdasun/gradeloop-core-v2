"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth.store";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";

interface RouteGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireRoles?: string[];
  requirePermissions?: string[];
  fallback?: React.ReactNode;
  redirectTo?: string;
  showFallback?: boolean;
}

// Base route guard component
export function RouteGuard({
  children,
  requireAuth = true,
  requireRoles = [],
  requirePermissions = [],
  fallback,
  redirectTo = "/login",
  showFallback = true,
}: RouteGuardProps) {
  const router = useRouter();
  const auth = useAuth();
  const [isChecking, setIsChecking] = React.useState(true);

  // Check if auth is disabled (for development)
  const isAuthDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

  React.useEffect(() => {
    // Skip all auth checks if disabled
    if (isAuthDisabled) {
      setIsChecking(false);
      return;
    }

    // Initial auth check
    const checkAuth = () => {
      setIsChecking(false);

      // If authentication is required but user is not authenticated
      // Do not automatically redirect to the login page; allow the
      // component to render the unauthorized fallback instead.
      if (requireAuth && !auth.isAuthenticated) {
        return;
      }

      // If user is authenticated but roles are required
      if (requireAuth && auth.isAuthenticated && requireRoles.length > 0) {
        const hasRequiredRole = auth.hasAnyRole(requireRoles);
        if (!hasRequiredRole) {
          router.replace("/unauthorized");
          return;
        }
      }

      // If user is authenticated but permissions are required
      if (requireAuth && auth.isAuthenticated && requirePermissions.length > 0) {
        const hasRequiredPermission = auth.hasAnyPermission(requirePermissions);
        if (!hasRequiredPermission) {
          router.replace("/unauthorized");
          return;
        }
      }
    };

    // Small delay to allow auth store to initialize
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, [auth.isAuthenticated, requireAuth, requireRoles, requirePermissions, router, redirectTo]);

  // Show loading state while checking authentication
  if (isChecking || auth.isLoading) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return showFallback ? <RouteGuardSkeleton /> : null;
  }

  // Skip all checks if auth is disabled
  if (isAuthDisabled) {
    return <>{children}</>;
  }

  // Check authentication requirement
  if (requireAuth && !auth.isAuthenticated) {
    return showFallback ? (
      <UnauthorizedFallback
        message="Please sign in to access this page"
        onSignIn={() => {
          const currentPath = window.location.pathname;
          const returnUrl = currentPath !== "/" ? `?returnTo=${encodeURIComponent(currentPath)}` : "";
          router.push(`${redirectTo}${returnUrl}`);
        }}
      />
    ) : null;
  }

  // Check role requirements
  if (requireAuth && auth.isAuthenticated && requireRoles.length > 0) {
    const hasRequiredRole = auth.hasAnyRole(requireRoles);
    if (!hasRequiredRole) {
      return showFallback ? (
        <ForbiddenFallback
          message={`This page requires one of the following roles: ${requireRoles.join(", ")}`}
          userRoles={auth.roles}
        />
      ) : null;
    }
  }

  // Check permission requirements
  if (requireAuth && auth.isAuthenticated && requirePermissions.length > 0) {
    const hasRequiredPermission = auth.hasAnyPermission(requirePermissions);
    if (!hasRequiredPermission) {
      return showFallback ? (
        <ForbiddenFallback
          message={`This page requires one of the following permissions: ${requirePermissions.join(", ")}`}
          userPermissions={auth.permissions}
        />
      ) : null;
    }
  }

  // All checks passed, render children
  return <>{children}</>;
}

// Specific route guards for common scenarios
export function ProtectedRoute({ children, ...props }: Omit<RouteGuardProps, "requireAuth">) {
  return (
    <RouteGuard requireAuth={true} {...props}>
      {children}
    </RouteGuard>
  );
}

export function AdminRoute({ children, ...props }: Omit<RouteGuardProps, "requireAuth" | "requireRoles">) {
  return (
    <RouteGuard
      requireAuth={true}
      requireRoles={["admin", "super_admin"]}
      redirectTo="/unauthorized"
      {...props}
    >
      {children}
    </RouteGuard>
  );
}

export function FacultyRoute({ children, ...props }: Omit<RouteGuardProps, "requireAuth" | "requireRoles">) {
  return (
    <RouteGuard
      requireAuth={true}
      requireRoles={["faculty", "instructor", "teacher", "admin", "super_admin"]}
      redirectTo="/unauthorized"
      {...props}
    >
      {children}
    </RouteGuard>
  );
}

export function StudentRoute({ children, ...props }: Omit<RouteGuardProps, "requireAuth" | "requireRoles">) {
  return (
    <RouteGuard
      requireAuth={true}
      requireRoles={["student", "admin", "super_admin"]}
      redirectTo="/unauthorized"
      {...props}
    >
      {children}
    </RouteGuard>
  );
}

export function GuestRoute({ children, ...props }: Omit<RouteGuardProps, "requireAuth">) {
  const auth = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (auth.isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [auth.isAuthenticated, router]);

  if (auth.isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

// Permission-based guards
export function WithPermission({
  children,
  permissions,
  fallback,
}: {
  children: React.ReactNode;
  permissions: string[];
  fallback?: React.ReactNode;
}) {
  return (
    <RouteGuard
      requirePermissions={permissions}
      fallback={fallback}
      showFallback={!!fallback}
    >
      {children}
    </RouteGuard>
  );
}

export function WithRole({
  children,
  roles,
  fallback,
}: {
  children: React.ReactNode;
  roles: string[];
  fallback?: React.ReactNode;
}) {
  return (
    <RouteGuard
      requireRoles={roles}
      fallback={fallback}
      showFallback={!!fallback}
    >
      {children}
    </RouteGuard>
  );
}

// Fallback components
function RouteGuardSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4 w-full max-w-md p-6">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm text-muted-foreground">Checking authentication...</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function UnauthorizedFallback({
  message,
  onSignIn,
}: {
  message: string;
  onSignIn: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="flex justify-center">
          <Shield className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold">Authentication Required</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button onClick={onSignIn} className="w-full">
          Sign In
        </Button>
      </div>
    </div>
  );
}

function ForbiddenFallback({
  message,
  userRoles,
  userPermissions,
}: {
  message: string;
  userRoles?: string[];
  userPermissions?: string[];
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="flex justify-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        {userRoles && userRoles.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Your roles: {userRoles.join(", ")}</p>
          </div>
        )}
        {userPermissions && userPermissions.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>Your permissions: {userPermissions.slice(0, 3).join(", ")}</p>
            {userPermissions.length > 3 && (
              <p>...and {userPermissions.length - 3} more</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Button onClick={() => router.back()} variant="outline" className="w-full">
            Go Back
          </Button>
          <Button onClick={() => router.push("/dashboard")} className="w-full">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

// Hook for conditional rendering based on permissions
export function usePermissionGuard() {
  const auth = useAuth();

  return {
    canAccess: (permissions: string[]) => auth.hasAnyPermission(permissions),
    hasRole: (roles: string[]) => auth.hasAnyRole(roles),
    isAdmin: auth.isAdmin,
    isFaculty: auth.isFaculty,
    isStudent: auth.isStudent,
    isSuperAdmin: auth.isSuperAdmin,
  };
}

// Component wrapper for conditional rendering
export function ConditionalRender({
  children,
  condition,
  fallback = null,
}: {
  children: React.ReactNode;
  condition: boolean;
  fallback?: React.ReactNode;
}) {
  return condition ? <>{children}</> : <>{fallback}</>;
}

// Higher-order component for route protection
export function withRouteGuard<P extends object>(
  Component: React.ComponentType<P>,
  guardConfig: Omit<RouteGuardProps, "children">
) {
  const WrappedComponent = (props: P) => {
    return (
      <RouteGuard {...guardConfig}>
        <Component {...props} />
      </RouteGuard>
    );
  };

  WrappedComponent.displayName = `withRouteGuard(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

// Export all guards
export default RouteGuard;
