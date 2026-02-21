"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RolesTable } from "./components/roles-table";
import { CreateRoleDialog } from "./components/create-role-dialog";
import { EditRoleDialog } from "./components/edit-role-dialog";
import { DeleteRoleDialog } from "./components/delete-role-dialog";
import { ManagePermissionsDialog } from "./components/manage-permissions-dialog";
import { getRoles, getPermissions } from "@/lib/api/iam";
import { Role, Permission } from "@/lib/types/iam";
import { useToast } from "@/hooks/use-toast";

export default function RolesManagementPage() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isManagePermissionsDialogOpen, setIsManagePermissionsDialogOpen] =
    useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Fetch roles and permissions
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch roles
      const rolesResponse = await getRoles();
      setRoles(rolesResponse.roles);

      // Fetch permissions
      const permissionsResponse = await getPermissions();
      setPermissions(permissionsResponse.permissions);
    } catch (err) {
      const errorMessage = (err as Error).message || "Failed to load data";
      setError(errorMessage);
      toast({
        title: "Error loading data",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsEditDialogOpen(true);
  };

  const handleDeleteRole = (role: Role) => {
    setSelectedRole(role);
    setIsDeleteDialogOpen(true);
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setIsManagePermissionsDialogOpen(true);
  };

  const handleRoleCreated = () => {
    fetchData();
  };

  const handleRoleUpdated = () => {
    fetchData();
  };

  const handleRoleDeleted = () => {
    fetchData();
  };

  const handlePermissionsUpdated = () => {
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Shield className="h-8 w-8" />
            Roles Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Create and manage roles with custom permissions
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
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
            <CardTitle className="text-sm font-medium">Total Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : roles.length}
            </div>
            <p className="text-xs text-muted-foreground">
              System and custom roles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading
                ? "..."
                : roles.filter((r) => r.is_system_role).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Protected system roles
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custom Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading
                ? "..."
                : roles.filter((r) => !r.is_system_role).length}
            </div>
            <p className="text-xs text-muted-foreground">
              User-created roles
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Roles</CardTitle>
          <CardDescription>
            View and manage all roles in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolesTable
            roles={roles}
            isLoading={isLoading}
            onEditRole={handleEditRole}
            onDeleteRole={handleDeleteRole}
            onManagePermissions={handleManagePermissions}
            onRefresh={fetchData}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateRoleDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onRoleCreated={handleRoleCreated}
        permissions={permissions}
      />

      <EditRoleDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        role={selectedRole}
        onRoleUpdated={handleRoleUpdated}
        permissions={permissions}
      />

      <DeleteRoleDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        role={selectedRole}
        onRoleDeleted={handleRoleDeleted}
      />

      <ManagePermissionsDialog
        open={isManagePermissionsDialogOpen}
        onOpenChange={setIsManagePermissionsDialogOpen}
        role={selectedRole}
        onPermissionsUpdated={handlePermissionsUpdated}
        permissions={permissions}
      />
    </div>
  );
}
