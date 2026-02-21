"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateRole } from "@/lib/api/iam";
import { UpdateRoleRequest, Role, Permission } from "@/lib/types/iam";
import { Loader2, Key, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ManagePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onPermissionsUpdated: () => void;
  permissions: Permission[];
}

export function ManagePermissionsDialog({
  open,
  onOpenChange,
  role,
  onPermissionsUpdated,
  permissions,
}: ManagePermissionsDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  // Initialize selected permissions when role changes
  useEffect(() => {
    if (role) {
      setSelectedPermissions(role.permissions?.map((p) => p.id) || []);
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      return;
    }

    setIsLoading(true);

    try {
      const requestData: UpdateRoleRequest = {
        name: role.name,
        permission_ids: selectedPermissions,
      };

      await updateRole(role.id, requestData);

      toast({
        title: "Permissions updated successfully",
        description: `Permissions for ${role.name} have been updated.`,
      });

      onPermissionsUpdated();
      handleClose();
    } catch (error) {
      toast({
        title: "Failed to update permissions",
        description:
          (error as Error).message ||
          "An error occurred while updating permissions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPermissions([]);
    onOpenChange(false);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSelectAllPermissions = () => {
    if (selectedPermissions.length === permissions.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(permissions.map((p) => p.id));
    }
  };

  // Group permissions by category (assuming permission names follow pattern: "category:action")
  const groupedPermissions = permissions.reduce((acc, permission) => {
    const category = permission.name.split(":")[0] || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Manage Permissions
          </DialogTitle>
          <DialogDescription>
            Manage permissions for the role <strong>{role.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Role Info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{role.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedPermissions.length} of {permissions.length}{" "}
                  permissions selected
                </p>
              </div>
              {role.is_system_role && (
                <Badge variant="destructive">System Role</Badge>
              )}
            </div>

            {/* Permissions Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Available Permissions</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllPermissions}
                >
                  {selectedPermissions.length === permissions.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>

              {permissions.length === 0 ? (
                <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No permissions available</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px] rounded-md border">
                  <div className="p-4 space-y-6">
                    {Object.entries(groupedPermissions).map(
                      ([category, categoryPermissions]) => (
                        <div key={category} className="space-y-3">
                          <div className="sticky top-0 bg-background pb-2">
                            <h4 className="text-sm font-semibold uppercase text-muted-foreground">
                              {category}
                            </h4>
                          </div>
                          <div className="space-y-3 pl-2">
                            {categoryPermissions.map((permission) => (
                              <div
                                key={permission.id}
                                className="flex items-start space-x-3 space-y-0"
                              >
                                <Checkbox
                                  id={permission.id}
                                  checked={selectedPermissions.includes(
                                    permission.id
                                  )}
                                  onCheckedChange={() =>
                                    handlePermissionToggle(permission.id)
                                  }
                                />
                                <div className="flex-1 space-y-1">
                                  <Label
                                    htmlFor={permission.id}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                  >
                                    {permission.name}
                                  </Label>
                                  {permission.description && (
                                    <p className="text-sm text-muted-foreground">
                                      {permission.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Summary */}
            {selectedPermissions.length > 0 && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="text-muted-foreground">
                  <strong>{selectedPermissions.length}</strong> permission
                  {selectedPermissions.length !== 1 ? "s" : ""} will be
                  assigned to this role
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Permissions
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
