'use client';

import * as React from 'react';
import { UserCog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SelectNative } from '@/components/ui/select-native';
import { useAdminUsersStore } from '@/lib/stores/adminUsersStore';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import type { UpdateUserRequest, FormErrors } from '@/types/admin.types';
import type { UserListItem } from '@/types/auth.types';

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updated: UserListItem) => void;
}

interface FormValues extends UpdateUserRequest {
  role_id: string;
}

export function EditUserDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { roles, rolesLoading, fetchRoles } = useAdminUsersStore();
  const [values, setValues] = React.useState<FormValues>({
    full_name: '',
    is_active: true,
    role_id: '',
  });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Populate form from user
  React.useEffect(() => {
    if (user && open) {
      setValues({
        full_name: (user as UserListItem & { full_name?: string }).full_name ?? '',
        is_active: user.is_active,
        role_id: user.role_id ?? '',
      });
      setErrors({});
      fetchRoles();
    }
  }, [user, open, fetchRoles]);

  /** Track whether the role has changed vs original. */
  const roleChanged = user && values.role_id && values.role_id !== user.role_id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      // 1. Update profile fields
      const profilePayload: UpdateUserRequest = {
        is_active: values.is_active,
      };
      if (values.full_name?.trim()) profilePayload.full_name = values.full_name.trim();

      const updated = await usersApi.update(user.id, profilePayload);

      // 2. Assign new role if changed
      if (roleChanged && values.role_id) {
        await usersApi.assignRole(user.id, { role_id: values.role_id });
      }

      const finalUser: UserListItem = {
        ...updated,
        role_id: values.role_id || updated.role_id,
        role_name:
          roles.find((r) => r.id === values.role_id)?.name ?? updated.role_name,
      };

      toast.success('User updated', `${user.username} has been updated.`);
      onSuccess(finalUser);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to update user', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <UserCog className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Editing <strong>{user.username}</strong>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Read-only info */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Username</span>
              <span className="font-medium">{user.username}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Email</span>
              <span className="font-medium truncate max-w-[200px]">
                {user.email}
              </span>
            </div>
          </div>

          {/* Full name */}
          <div className="space-y-1.5">
            <Label htmlFor="eu-fullname">Display Name</Label>
            <Input
              id="eu-fullname"
              placeholder="John Doe"
              value={values.full_name ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, full_name: e.target.value }))
              }
              disabled={submitting}
            />
            {errors.full_name && (
              <p className="text-xs text-red-500">{errors.full_name}</p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="eu-role">Role</Label>
            <SelectNative
              id="eu-role"
              value={values.role_id}
              onChange={(e) =>
                setValues((v) => ({ ...v, role_id: e.target.value }))
              }
              disabled={submitting || rolesLoading}
            >
              <option value="">
                {rolesLoading ? 'Loading…' : 'Select role'}
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
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

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
