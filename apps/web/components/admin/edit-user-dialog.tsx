"use client";

import * as React from "react";
import { UserCog } from "lucide-react";
import {
  SideDialog,
  SideDialogContent,
  SideDialogDescription,
  SideDialogFooter,
  SideDialogHeader,
  SideDialogTitle,
} from "@/components/ui/side-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectNative } from "@/components/ui/select-native";
import { usersApi, handleApiError } from "@/lib/api/users";
import { toast } from "@/lib/hooks/use-toast";
import type {
  UpdateUserRequest,
  UpdateUserResponse,
  FormErrors,
} from "@/types/admin.types";
import type { UserListItem } from "@/types/auth.types";
import { USER_TYPES } from "@/types/auth.types";

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updated: UserListItem) => void;
}

interface FormValues {
  user_type: string;
  is_active: boolean;
}

export function EditUserDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const [values, setValues] = React.useState<FormValues>({
    is_active: true,
    user_type: "student",
  });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Populate form from user
  React.useEffect(() => {
    if (user && open) {
      setValues({
        is_active: user.is_active,
        user_type: user.user_type || "student",
      });
      setErrors({});
    }
  }, [user, open]);

  // User type is tied to the role, so any role can be selected.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const payload: UpdateUserRequest = {
        is_active: values.is_active,
        user_type: values.user_type,
      };

      const updated: UpdateUserResponse = await usersApi.update(
        user.id,
        payload,
      );

      // Merge response with original user
      const finalUser: UserListItem = {
        ...user,
        id: updated.id,
        email: updated.email,
        user_type: updated.user_type || values.user_type,
        is_active: updated.is_active,
      };

      toast.success(
        "User updated",
        `${user.full_name || "No Name"} has been updated.`,
      );
      onSuccess(finalUser);
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to update user", handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent className="max-w-md">
        <SideDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <UserCog className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <SideDialogTitle>Edit User</SideDialogTitle>
              <SideDialogDescription>
                Editing <strong>{user.full_name || "No Name"}</strong>
              </SideDialogDescription>
            </div>
          </div>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Read-only info */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Full Name</span>
              <span className="font-medium">{user.full_name || "No Name"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Email</span>
              <span className="font-medium truncate max-w-[200px]">
                {user.email}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">User Type</span>
              <span className="font-medium capitalize">
                {user.user_type}
              </span>
            </div>
          </div>

          {/* User Type */}
          <div className="space-y-1.5">
            <Label htmlFor="eu-user-type">User Type</Label>
            <SelectNative
              id="eu-user-type"
              value={values.user_type}
              onChange={(e) =>
                setValues((v) => ({ ...v, user_type: e.target.value }))
              }
              disabled={submitting}
            >
              {USER_TYPES.map((type) => (
                <option key={type} value={type} className="capitalize">
                  {type.replace('_', ' ')}
                </option>
              ))}
            </SelectNative>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="eu-active" className="text-sm font-medium">
                Active
              </Label>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Inactive users cannot log in.
              </p>
            </div>
            <Switch
              id="eu-active"
              checked={values.is_active}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, is_active: checked }))
              }
              disabled={submitting}
            />
          </div>

          <SideDialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}
