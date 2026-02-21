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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateRole } from "@/lib/api/iam";
import { UpdateRoleRequest, Role, Permission } from "@/lib/types/iam";
import { Loader2, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onRoleUpdated: () => void;
  permissions: Permission[];
}

export function EditRoleDialog({
  open,
  onOpenChange,
  role,
  onRoleUpdated,
  permissions,
}: EditRoleDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState<{
    name: string;
    userType: "student" | "employee" | "all";
    selectedPermissions: string[];
  }>({
    name: "",
    userType: "all",
    selectedPermissions: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when role changes
  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name,
        userType: role.user_type || "all",
        selectedPermissions: role.permissions?.map((p) => p.id) || [],
      });
      setErrors({});
    }
  }, [role]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Role name is required";
    } else if (formData.name.length < 2) {
      newErrors.name = "Role name must be at least 2 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role || !validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const requestData: UpdateRoleRequest = {
        name: formData.name.trim(),
        user_type: formData.userType,
        permission_ids: formData.selectedPermissions,
      };

      await updateRole(role.id, requestData);

      toast({
        title: "Role updated successfully",
        description: `${formData.name} has been updated.`,
      });

      onRoleUpdated();
      handleClose();
    } catch (error) {
      toast({
        title: "Failed to update role",
        description:
          (error as Error).message ||
          "An error occurred while updating the role",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      userType: "all",
      selectedPermissions: [],
    });
    setErrors({});
    onOpenChange(false);
  };

  const handlePermissionToggle = (permissionId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedPermissions: prev.selectedPermissions.includes(permissionId)
        ? prev.selectedPermissions.filter((id) => id !== permissionId)
        : [...prev.selectedPermissions, permissionId],
    }));
  };

  const handleSelectAllPermissions = () => {
    if (formData.selectedPermissions.length === permissions.length) {
      setFormData((prev) => ({ ...prev, selectedPermissions: [] }));
    } else {
      setFormData((prev) => ({
        ...prev,
        selectedPermissions: permissions.map((p) => p.id),
      }));
    }
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Edit Role
          </DialogTitle>
          <DialogDescription>
            Update the role name and manage its permissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Role Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Role Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="e.g., Content Manager, Department Head"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className={errors.name ? "border-red-500" : ""}
                disabled={role.is_system_role}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name}</p>
              )}
              {role.is_system_role && (
                <p className="text-sm text-yellow-600">
                  System roles cannot be renamed
                </p>
              )}
            </div>

            {/* User Type */}
            <div className="space-y-2">
              <Label htmlFor="userType">
                User Type <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.userType}
                onValueChange={(value: "student" | "employee" | "all") =>
                  setFormData({ ...formData, userType: value })
                }
                disabled={role.is_system_role}
              >
                <SelectTrigger id="userType">
                  <SelectValue placeholder="Select user type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="student">Students Only</SelectItem>
                  <SelectItem value="employee">Employees Only</SelectItem>
                </SelectContent>
              </Select>
              {role.is_system_role ? (
                <p className="text-sm text-yellow-600">
                  User type cannot be changed for system roles
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Users with this role will be categorized by this type
                </p>
              )}
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Permissions</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAllPermissions}
                >
                  {formData.selectedPermissions.length === permissions.length
                    ? "Deselect All"
                    : "Select All"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Manage permissions for this role
              </p>

              {permissions.length === 0 ? (
                <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">
                  No permissions available
                </div>
              ) : (
                <ScrollArea className="h-[250px] rounded-md border p-4">
                  <div className="space-y-3">
                    {permissions.map((permission) => (
                      <div
                        key={permission.id}
                        className="flex items-start space-x-3 space-y-0"
                      >
                        <Checkbox
                          id={permission.id}
                          checked={formData.selectedPermissions.includes(
                            permission.id,
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
                </ScrollArea>
              )}

              {formData.selectedPermissions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {formData.selectedPermissions.length} permission
                  {formData.selectedPermissions.length !== 1 ? "s" : ""}{" "}
                  selected
                </p>
              )}
            </div>
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
              Update Role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
