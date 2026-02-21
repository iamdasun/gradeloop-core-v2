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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { updateUser } from "@/lib/api/iam";
import { User, Role } from "@/lib/types/iam";
import { Loader2 } from "lucide-react";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onUserUpdated: () => void;
  roles: Role[];
}

export function EditUserDialog({
  open,
  onOpenChange,
  user,
  onUserUpdated,
  roles,
}: EditUserDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [roleId, setRoleId] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  useEffect(() => {
    if (user) {
      setRoleId(user.role_id);
      setIsActive(user.is_active);
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    setIsLoading(true);

    try {
      // Only send changed fields
      const updates: { role_id?: string; is_active?: boolean } = {};

      if (roleId !== user.role_id) {
        updates.role_id = roleId;
      }

      if (isActive !== user.is_active) {
        updates.is_active = isActive;
      }

      // If nothing changed, just close
      if (Object.keys(updates).length === 0) {
        toast({
          title: "No changes",
          description: "No changes were made to the user",
        });
        onOpenChange(false);
        return;
      }

      await updateUser(user.id, updates);

      toast({
        title: "User updated successfully",
        description: `${user.username} has been updated.`,
      });

      onUserUpdated();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to update user",
        description:
          (error as Error).message ||
          "An error occurred while updating the user",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update role and active status for {user.username}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6 py-4">
            {/* User Info - Read Only */}
            <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Username
                </Label>
                <p className="text-sm font-medium">{user.username}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="text-sm font-medium">{user.email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  User Type
                </Label>
                <p className="text-sm font-medium capitalize">
                  {user.user_type}
                  {user.user_type === "student" && user.student_id && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({user.student_id})
                    </span>
                  )}
                  {user.user_type === "employee" && user.designation && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({user.designation})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Role - Editable */}
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                      {role.is_system_role && (
                        <span className="text-xs text-muted-foreground ml-2">
                          (System)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active Status - Editable */}
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="is-active">Active Status</Label>
                <p className="text-sm text-muted-foreground">
                  {isActive
                    ? "User can log in and access the system"
                    : "User is blocked from logging in"}
                </p>
              </div>
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
