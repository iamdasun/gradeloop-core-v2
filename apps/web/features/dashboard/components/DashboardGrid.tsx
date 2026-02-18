"use client";
import { useAuthStore } from "@/store/auth.store";
import { DASHBOARD_WIDGETS } from "@/config/dashboard";

export function DashboardGrid() {
  const { hasPermission, hasRole } = useAuthStore();

  const allowedWidgets = DASHBOARD_WIDGETS.filter((widget) => {
    // Check permissions
    if (widget.requiredPermissions && widget.requiredPermissions.length > 0) {
      // Use hasAnyPermission to check if user has AT LEAST ONE of the required permissions
      // Or should it be ALL? Usually widgets require *a* permission.
      // Let's assume the config implies ALL are required if listed?
      // Or let's stick to the store's hasPermission for single checks.
      // If the config has an array, we might want to ensure they have them.
      // For simplicity and common patterns, let's assume if multiple are listed,
      // maybe we check if they have *any* or *all*.
      // The implementation plan example was `['iam:users:read']`.
      // Let's check if they have specific permissions.
      const hasAll = widget.requiredPermissions.every((p) => hasPermission(p));
      if (!hasAll) return false;
    }

    // Check roles
    if (widget.requiredRoles && widget.requiredRoles.length > 0) {
      const hasAny = widget.requiredRoles.some((r) => hasRole(r));
      if (!hasAny) return false;
    }

    return true;
  });

  if (allowedWidgets.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No dashboard widgets available for your account.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {allowedWidgets.map((widget) => {
        const Component = widget.component;
        const colSpan = widget.gridSpan
          ? `col-span-1 ${widget.gridSpan.sm ? `sm:col-span-${widget.gridSpan.sm}` : ""} ${
              widget.gridSpan.md ? `md:col-span-${widget.gridSpan.md}` : ""
            } ${widget.gridSpan.lg ? `lg:col-span-${widget.gridSpan.lg}` : ""}`
          : "col-span-1";

        return (
          <div key={widget.id} className={colSpan}>
            <Component />
          </div>
        );
      })}
    </div>
  );
}
