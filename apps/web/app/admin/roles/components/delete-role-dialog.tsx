"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { deleteRole } from "@/lib/api/iam";
import { Role } from "@/lib/types/iam";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
  onRoleDeleted: () => void;
}

export function DeleteRoleDialog({
  open,
  onOpenChange,
  role,
  onRoleDeleted,
}: DeleteRoleDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (!role) return;

    setIsLoading(true);

    try {
      await deleteRole(role.id);

      toast({
        title: "Role deleted successfully",
        description: `${role.name} has been deleted.`,
      });

      onRoleDeleted();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Failed to delete role",
        description:
          (error as Error).message ||
          "An error occurred while deleting the role",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Role
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You are about to delete the role <strong>{role.name}</strong>.
              {role.permissions && role.permissions.length > 0 && (
                <> This role has {role.permissions.length} permission(s) assigned to it.</>
              )}
            </AlertDescription>
          </Alert>

          {role.is_system_role && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This is a system role and cannot be deleted.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this role? Users with this role may lose access to certain features.
          </p>
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
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading || role.is_system_role}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
