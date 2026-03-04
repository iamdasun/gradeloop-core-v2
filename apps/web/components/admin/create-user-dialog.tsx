'use client';

import * as React from 'react';
import { UserPlus } from 'lucide-react';
import {
  SideDialog,
  SideDialogContent,
  SideDialogDescription,
  SideDialogFooter,
  SideDialogHeader,
  SideDialogTitle,
} from '@/components/ui/side-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { useAdminUsersStore } from '@/lib/stores/adminUsersStore';
import { usersApi, handleApiError } from '@/lib/api/users';
import { toast } from '@/lib/hooks/use-toast';
import type { CreateUserRequest, CreateUserResponse, FormErrors } from '@/types/admin.types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const EMPTY: CreateUserRequest = {
  full_name: '',
  email: '',
  role_id: '',
  user_type: '',
};

function validate(values: CreateUserRequest): FormErrors {
  const errors: FormErrors = {};
  if (!values.full_name.trim()) errors.full_name = 'Full Name is required';
  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!values.role_id) errors.role_id = 'Role is required';
  if (values.user_type === 'student' && !values.student_id?.trim())
    errors.student_id = 'Student ID is required for student type';
  if (values.user_type === 'employee' && !values.designation?.trim())
    errors.designation = 'Designation is required for employee type';
  return errors;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: Props) {
  const { roles, rolesLoading, rolesError, fetchRoles, refetchRoles } = useAdminUsersStore();
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

  // User Type is now inferred from the selected role


  function set(field: keyof CreateUserRequest, value: string) {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'role_id') {
        const role = roles.find((r) => r.id === value);
        next.user_type = role?.user_type || 'all';
      }
      return next;
    });
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
      const user: CreateUserResponse = await usersApi.create(values);
      toast.success('User created', `${user.full_name} has been added. An activation email has been sent.`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to create user', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent className="max-w-md">
        <SideDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <UserPlus className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <SideDialogTitle>Create User</SideDialogTitle>
              <SideDialogDescription>
                Add a new user to the system.
              </SideDialogDescription>
            </div>
          </div>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cu-fullname">
              Full Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="cu-fullname"
              placeholder="e.g. John Doe"
              value={values.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              autoComplete="off"
              disabled={submitting}
            />
            {errors.full_name && (
              <p className="text-xs text-red-500">{errors.full_name}</p>
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
              title={rolesError ? `Roles unavailable: ${rolesError}` : undefined}
            >
              <option value="">
                {rolesLoading ? 'Loading roles…' : rolesError ? 'Roles unavailable' : 'Select a role'}
              </option>
              {roles.map((r) => (
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
            {errors.role_id && (
              <p className="text-xs text-red-500">{errors.role_id}</p>
            )}
          </div>

          {/* Student ID (only for student type) */}
          {values.user_type === 'student' && (
            <div className="space-y-1.5">
              <Label htmlFor="cu-studentid">
                Student ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cu-studentid"
                placeholder="e.g. STU-2024-001"
                value={values.student_id ?? ''}
                onChange={(e) => set('student_id', e.target.value)}
                autoComplete="off"
                disabled={submitting}
              />
              {errors.student_id && (
                <p className="text-xs text-red-500">{errors.student_id}</p>
              )}
            </div>
          )}

          {/* Designation (only for employee type) */}
          {values.user_type === 'employee' && (
            <div className="space-y-1.5">
              <Label htmlFor="cu-designation">
                Designation <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cu-designation"
                placeholder="e.g. Lecturer"
                value={values.designation ?? ''}
                onChange={(e) => set('designation', e.target.value)}
                autoComplete="off"
                disabled={submitting}
              />
              {errors.designation && (
                <p className="text-xs text-red-500">{errors.designation}</p>
              )}
            </div>
          )}


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
              {submitting ? 'Creating…' : 'Create User'}
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}
