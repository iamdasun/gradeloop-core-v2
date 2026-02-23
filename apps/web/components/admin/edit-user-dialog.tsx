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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SelectNative } from '@/components/ui/select-native';
import { useAdminUsersStore } from '@/lib/stores/adminUsersStore';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import type { UpdateUserRequest, UpdateUserResponse, FormErrors } from '@/types/admin.types';
import type { UserListItem } from '@/types/auth.types';

interface Props {
  user: UserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updated: UserListItem) => void;
}

interface FormValues {
  role_id: string;
  is_active: boolean;
}

export function EditUserDialog({ user, open, onOpenChange, onSuccess }: Props) {
  const { roles, rolesLoading, rolesError, fetchRoles, refetchRoles } = useAdminUsersStore();
  const [values, setValues] = React.useState<FormValues>({
    is_active: true,
    role_id: '',
  });
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Populate form from user
  React.useEffect(() => {
    if (user && open) {
      setValues({
        is_active: user.is_active,
        role_id: user.role_id ?? '',
      });
      setErrors({});
      fetchRoles();
    }
  }, [user, open, fetchRoles]);

  // Only show roles compatible with the user's type so admins can't accidentally
  // assign a student-only role to an employee, etc.
  const compatibleRoles = React.useMemo(() => {
    if (!user?.user_type) return roles;
    return roles.filter(
      (r) => r.user_type === user.user_type || r.user_type === 'all',
    );
  }, [roles, user?.user_type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const payload: UpdateUserRequest = {
        is_active: values.is_active,
      };
      // Only include role_id if it changed
      if (values.role_id && values.role_id !== user.role_id) {
        payload.role_id = values.role_id;
      }

      const updated: UpdateUserResponse = await usersApi.update(user.id, payload);

      // Merge response with original user to produce a full UserListItem
      const resolvedRoleId = updated.role_id ?? values.role_id ?? user.role_id;
      const finalUser: UserListItem = {
        ...user,
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role_id: resolvedRoleId,
        is_active: updated.is_active,
        role_name:
          roles.find((r) => r.id === resolvedRoleId)?.name ?? user.role_name,
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
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">User Type</span>
              <span className="font-medium capitalize">{user.user_type || '—'}</span>
            </div>
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
              title={rolesError ? `Roles unavailable: ${rolesError}` : undefined}
            >
              <option value="">
                {rolesLoading ? 'Loading…' : rolesError ? 'Roles unavailable' : 'Select role'}
              </option>
              {compatibleRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectNative>
            {rolesError && (
              <button
                type="button"
                className="text-xs text-red-500 hover:underline"
                onClick={() => refetchRoles()}
              >
                Retry loading roles
              </button>
            )}
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
