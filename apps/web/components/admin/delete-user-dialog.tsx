"use client";

import * as React from "react";
import { usersApi, handleApiError } from "@/lib/api/users";
import { toast } from "@/lib/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { UserListItem } from "@/types/auth.types";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (id: string) => void;
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    if (!user) return;
    setLoading(true);
    try {
      await usersApi.delete(user.id);
      toast.success("User deleted", `${user.email} has been removed.`);
      onSuccess(user.id);
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to delete user", handleApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete User"
      description={`Are you sure you want to permanently delete ${user?.full_name ?? "this user"}? This action cannot be undone and will remove all associated data.`}
      confirmText="Delete User"
      onConfirm={handleConfirm}
      isLoading={loading}
      variant="destructive"
    />
  );
}
