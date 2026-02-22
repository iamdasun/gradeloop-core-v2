'use client';

import * as React from 'react';
import { UserPlus } from 'lucide-react';
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
import { SelectNative } from '@/components/ui/select-native';
import { useAdminUsersStore } from '@/lib/stores/adminUsersStore';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import type { CreateUserRequest, FormErrors } from '@/types/admin.types';
import type { UserListItem } from '@/types/auth.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: UserListItem) => void;
}

const EMPTY: CreateUserRequest = {
  username: '',
  email: '',
  role_id: '',
  password: '',
};

function validate(values: CreateUserRequest): FormErrors {
  const errors: FormErrors = {};
  if (!values.username.trim()) errors.username = 'Username is required';
  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!values.role_id) errors.role_id = 'Role is required';
  return errors;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: Props) {
  const { roles, rolesLoading, fetchRoles } = useAdminUsersStore();
  const [values, setValues] = React.useState<CreateUserRequest>(EMPTY);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Fetch roles once when dialog opens
  React.useEffect(() => {
    if (open) fetchRoles();
  }, [open, fetchRoles]);

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
    }
  }, [open]);

  function set(field: keyof CreateUserRequest, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateUserRequest = { ...values };
      if (!payload.password?.trim()) delete payload.password;
      const user = await usersApi.create(payload);
      toast.success('User created', `${user.username} has been added.`);
      onSuccess(user);
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to create user', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <UserPlus className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Add a new user to the system.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-username">
              Username <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cu-username"
              placeholder="e.g. john.doe"
              value={values.username}
              onChange={(e) => set('username', e.target.value)}
              autoComplete="off"
              disabled={submitting}
            />
            {errors.username && (
              <p className="text-xs text-red-500">{errors.username}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cu-email"
              type="email"
              placeholder="john@example.com"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="off"
              disabled={submitting}
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-password">Password</Label>
            <Input
              id="cu-password"
              type="password"
              placeholder="Leave blank for auto-generated"
              value={values.password ?? ''}
              onChange={(e) => set('password', e.target.value)}
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-role">
              Role <span className="text-red-500">*</span>
            </Label>
            <SelectNative
              id="cu-role"
              value={values.role_id}
              onChange={(e) => set('role_id', e.target.value)}
              disabled={submitting || rolesLoading}
            >
              <option value="">
                {rolesLoading ? 'Loading roles…' : 'Select a role'}
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectNative>
            {errors.role_id && (
              <p className="text-xs text-red-500">{errors.role_id}</p>
            )}
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
              {submitting ? 'Creating…' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
