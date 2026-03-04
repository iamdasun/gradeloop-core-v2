'use client';

/**
 * Degree dialogs: Create + Edit
 */
import * as React from 'react';
import { Award } from 'lucide-react';
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
import { degreesApi, departmentsApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import {
  DEGREE_LEVELS,
  type Degree,
  type Department,
  type DegreeLevel,
  type CreateDegreeRequest,
  type UpdateDegreeRequest,
  type AcademicFormErrors,
} from '@/types/academics.types';

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateDegreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (degree: Degree) => void;
  /** Pre-fill and lock Department when creating from a Department detail page */
  initialDepartmentId?: string;
  initialDepartmentName?: string;
}

const EMPTY: CreateDegreeRequest = {
  department_id: '',
  name: '',
  code: '',
  level: 'Undergraduate',
};

function validateCreate(v: CreateDegreeRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!v.department_id.trim()) e.department_id = 'Department is required';
  if (!v.name.trim()) e.name = 'Name is required';
  else if (v.name.trim().length < 3) e.name = 'Minimum 3 characters';
  if (!v.code.trim()) e.code = 'Code is required';
  else if (v.code.trim().length < 2) e.code = 'Minimum 2 characters';
  if (!v.level) e.level = 'Level is required';
  return e;
}

export function CreateDegreeDialog({
  open,
  onOpenChange,
  onSuccess,
  initialDepartmentId,
  initialDepartmentName,
}: CreateDegreeDialogProps) {
  const [values, setValues] = React.useState<CreateDegreeRequest>(EMPTY);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [departments, setDepartments] = React.useState<Department[]>([]);

  React.useEffect(() => {
    if (open) {
      setValues({ ...EMPTY, department_id: initialDepartmentId ?? '' });
      setErrors({});
      if (!initialDepartmentId) {
        departmentsApi.list().then(setDepartments).catch(() => {});
      }
    }
  }, [open, initialDepartmentId]);

  function set(field: keyof CreateDegreeRequest, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCreate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const degree = await degreesApi.create(values);
      toast.success('Degree created', degree.name);
      onOpenChange(false);
      onSuccess(degree);
    } catch (err) {
      toast.error('Failed to create degree', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-zinc-600" />
            Create Degree
          </DialogTitle>
          <DialogDescription>
            Add a new degree programme under a department.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="deg_dept">Department</Label>
            {initialDepartmentId ? (
              <div className="flex h-9 w-full items-center rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
                {initialDepartmentName ?? initialDepartmentId}
              </div>
            ) : (
              <select
                id="deg_dept"
                className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
                value={values.department_id}
                onChange={(e) => set('department_id', e.target.value)}
              >
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            )}
            {errors.department_id && (
              <p className="text-xs text-red-600">{errors.department_id}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deg_name">Name</Label>
              <Input
                id="deg_name"
                placeholder="Computer Science"
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deg_code">Code</Label>
              <Input
                id="deg_code"
                placeholder="BSC-CS"
                value={values.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
              {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deg_level">Level</Label>
            <select
              id="deg_level"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
              value={values.level}
              onChange={(e) => set('level', e.target.value)}
            >
              {DEGREE_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            {errors.level && <p className="text-xs text-red-600">{errors.level}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Degree'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditDegreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  degree: Degree;
  onSuccess: (degree: Degree) => void;
}

function validateEdit(v: UpdateDegreeRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (v.name !== undefined && v.name.trim().length > 0 && v.name.trim().length < 3)
    e.name = 'Minimum 3 characters';
  if (v.code !== undefined && v.code.trim().length > 0 && v.code.trim().length < 2)
    e.code = 'Minimum 2 characters';
  return e;
}

export function EditDegreeDialog({
  open,
  onOpenChange,
  degree,
  onSuccess,
}: EditDegreeDialogProps) {
  const [values, setValues] = React.useState<UpdateDegreeRequest>({});
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues({ name: degree.name, code: degree.code, level: degree.level });
      setErrors({});
    }
  }, [open, degree]);

  function set(field: keyof UpdateDegreeRequest, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateEdit(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const updated = await degreesApi.update(degree.id, values);
      toast.success('Degree updated', updated.name);
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error('Failed to update degree', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-zinc-600" />
            Edit Degree
          </DialogTitle>
          <DialogDescription>
            Update details for <strong>{degree.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_deg_name">Name</Label>
              <Input
                id="edit_deg_name"
                value={values.name ?? ''}
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_deg_code">Code</Label>
              <Input
                id="edit_deg_code"
                value={values.code ?? ''}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
              {errors.code && <p className="text-xs text-red-600">{errors.code}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_deg_level">Level</Label>
            <select
              id="edit_deg_level"
              className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 dark:border-zinc-800 dark:focus-visible:ring-zinc-300"
              value={values.level ?? degree.level}
              onChange={(e) => set('level', e.target.value)}
            >
              {DEGREE_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
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
