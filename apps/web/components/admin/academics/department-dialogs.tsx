'use client';

/**
 * Department dialogs: Create + Edit
 * Follows the same pattern as create-user-dialog.tsx / edit-user-dialog.tsx
 */
import * as React from 'react';
import { Building2 } from 'lucide-react';
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
import { departmentsApi, facultiesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import { useAcademicsAccess } from '@/lib/hooks/useAcademicsAccess';
import type {
  Department,
  Faculty,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  AcademicFormErrors,
} from '@/types/academics.types';

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (dept: Department) => void;
  /** Pre-fill and lock Faculty when creating from a Faculty detail page */
  initialFacultyId?: string;
  initialFacultyName?: string;
}

const EMPTY_CREATE: CreateDepartmentRequest = {
  faculty_id: '',
  name: '',
  code: '',
  description: '',
};

function validateCreate(v: CreateDepartmentRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!v.faculty_id.trim()) e.faculty_id = 'Faculty ID is required';
  else if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v.faculty_id.trim(),
    )
  )
    e.faculty_id = 'Must be a valid UUID';
  if (!v.name.trim()) e.name = 'Name is required';
  else if (v.name.trim().length < 3) e.name = 'Minimum 3 characters';
  if (!v.code.trim()) e.code = 'Code is required';
  else if (v.code.trim().length < 2) e.code = 'Minimum 2 characters';
  return e;
}

export function CreateDepartmentDialog({
  open,
  onOpenChange,
  onSuccess,
  initialFacultyId,
  initialFacultyName,
}: CreateDepartmentDialogProps) {
  const { isSuperAdmin } = useAcademicsAccess();
  const [values, setValues] = React.useState<CreateDepartmentRequest>(EMPTY_CREATE);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // Optionally prefetch faculties for super_admin
  const [faculties, setFaculties] = React.useState<Faculty[]>([]);
  const [facultiesLoaded, setFacultiesLoaded] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues({ ...EMPTY_CREATE, faculty_id: initialFacultyId ?? '' });
      setErrors({});
      if (isSuperAdmin && !facultiesLoaded && !initialFacultyId) {
        facultiesApi
          .list()
          .then((f) => { setFaculties(f); setFacultiesLoaded(true); })
          .catch(() => { /* graceful — admin will type UUID manually */ });
      }
    }
  }, [open, isSuperAdmin, facultiesLoaded, initialFacultyId]);

  function set(field: keyof CreateDepartmentRequest, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCreate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const dept = await departmentsApi.create(values);
      toast.success('Department created', dept.name);
      onOpenChange(false);
      onSuccess(dept);
    } catch (err) {
      toast.error('Failed to create department', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-zinc-600" />
            Create Department
          </DialogTitle>
          <DialogDescription>
            Add a new department to the academic structure.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Faculty ID — locked when pre-filled, dropdown for super_admin, text otherwise */}
          <div className="space-y-1.5">
            <Label htmlFor="faculty_id">Faculty</Label>
            {initialFacultyId ? (
              <div className="flex h-9 w-full items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {initialFacultyName ?? initialFacultyId}
              </div>
            ) : isSuperAdmin && faculties.length > 0 ? (
              <select
                id="faculty_id"
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
                value={values.faculty_id}
                onChange={(e) => set('faculty_id', e.target.value)}
              >
                <option value="">Select faculty…</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="faculty_id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={values.faculty_id}
                onChange={(e) => set('faculty_id', e.target.value)}
              />
            )}
            {errors.faculty_id && (
              <p className="text-xs text-red-600">{errors.faculty_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dept_name">Name</Label>
              <Input
                id="dept_name"
                placeholder="Computer Science"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept_code">Code</Label>
              <Input
                id="dept_code"
                placeholder="CS"
                value={values.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
              {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dept_desc">Description <span className="text-zinc-400">(optional)</span></Label>
            <Input
              id="dept_desc"
              placeholder="Brief description of the department"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Department'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditDepartmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: Department;
  onSuccess: (dept: Department) => void;
}

function validateEdit(v: UpdateDepartmentRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (v.name !== undefined && v.name.trim().length > 0 && v.name.trim().length < 3)
    e.name = 'Minimum 3 characters';
  if (v.code !== undefined && v.code.trim().length > 0 && v.code.trim().length < 2)
    e.code = 'Minimum 2 characters';
  return e;
}

export function EditDepartmentDialog({
  open,
  onOpenChange,
  department,
  onSuccess,
}: EditDepartmentDialogProps) {
  const [values, setValues] = React.useState<UpdateDepartmentRequest>({});
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues({
        name: department.name,
        code: department.code,
        description: department.description,
      });
      setErrors({});
    }
  }, [open, department]);

  function set(field: keyof UpdateDepartmentRequest, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateEdit(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const updated = await departmentsApi.update(department.id, values);
      toast.success('Department updated', updated.name);
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error('Failed to update department', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-zinc-600" />
            Edit Department
          </DialogTitle>
          <DialogDescription>
            Update details for <strong>{department.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_dept_name">Name</Label>
              <Input
                id="edit_dept_name"
                value={values.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_dept_code">Code</Label>
              <Input
                id="edit_dept_code"
                value={values.code ?? ''}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
              {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_dept_desc">Description</Label>
            <Input
              id="edit_dept_desc"
              value={values.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
