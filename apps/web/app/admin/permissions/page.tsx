"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Key } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PermissionsTable } from "./components/permissions-table";
import { getPermissions } from "@/lib/api/iam";
import { Permission } from "@/lib/types/iam";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/auth-store";

export default function PermissionsManagementPage() {
  const { toast } = useToast();
  const { isLoading: isAuthLoading, isAuthenticated } = useAuthStore();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch permissions
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const permissionsResponse = await getPermissions();
      setPermissions(permissionsResponse.permissions);
    } catch (err) {
      const errorMessage =
        (err as Error).message || "Failed to load permissions";
      setError(errorMessage);
      toast({
        title: "Error loading permissions",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only fetch data after auth initialization is complete and user is authenticated
    if (!isAuthLoading && isAuthenticated) {
      fetchData();
    } else if (!isAuthLoading && !isAuthenticated) {
      setIsLoading(false);
      setError("You must be authenticated to view permissions");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAuthenticated]);

  // Group permissions by category for stats
  const categories = Array.from(
    new Set(permissions.map((p) => p.name.split(":")[0] || "Other")),
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Key className="h-8 w-8" />
            Permissions Management
          </h1>
          <p className="text-muted-foreground mt-2">
            View all system permissions
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Permissions
            </CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : permissions.length}
            </div>
            <p className="text-xs text-muted-foreground">
              All available permissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : categories.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Permission categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Most Common</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading
                ? "..."
                : categories.length > 0
                  ? categories[0].charAt(0).toUpperCase() +
                    categories[0].slice(1)
                  : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Primary category</p>
          </CardContent>
        </Card>
      </div>

      {/* Info Alert */}
      <Alert>
        <Key className="h-4 w-4" />
        <AlertTitle>About Permissions</AlertTitle>
        <AlertDescription>
          Permissions are system-defined and control what actions users can
          perform. They are assigned to roles, which are then assigned to users.
          Common naming convention is{" "}
          <code className="bg-muted px-1 py-0.5 rounded">category:action</code>{" "}
          (e.g., users:read, courses:write). Permissions are read-only and
          managed by system administrators.
        </AlertDescription>
      </Alert>

      {/* Permissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Permissions</CardTitle>
          <CardDescription>
            View all available permissions organized by category
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionsTable
            permissions={permissions}
            isLoading={isLoading}
            onRefresh={fetchData}
          />
        </CardContent>
      </Card>
    </div>
  );
}
