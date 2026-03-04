'use client';

/**
 * Course Instance dialogs: Create + Edit
 * Uses SideDialog for consistent layout with user management UIs.
 */
import * as React from 'react';
import { Calendar, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  courseInstancesApi,
  semestersApi,
  batchesApi,
} from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
  CourseInstance,
  Semester,
  Batch,
  CreateCourseInstanceRequest,
  UpdateCourseInstanceRequest,
  CourseInstanceStatus,
  COURSE_INSTANCE_STATUSES,
  AcademicFormErrors,
} from '@/types/academics.types';

const STATUSES: CourseInstanceStatus[] = ['Planned', 'Active', 'Completed', 'Cancelled'];

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateCourseInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  onSuccess: (instance: CourseInstance) => void;
}

function validateCreate(v: CreateCourseInstanceRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!v.semester_id) e.semester_id = 'Semester is required';
  if (!v.batch_id) e.batch_id = 'Batch is required';
  if (!v.status) e.status = 'Status is required';
  if (!v.max_enrollment || v.max_enrollment <= 0)
    e.max_enrollment = 'Max enrollment must be a positive number';
  return e;
}

export function CreateCourseInstanceDialog({
  open,
  onOpenChange,
  courseId,
  onSuccess,
}: CreateCourseInstanceDialogProps) {
  const [semesterId, setSemesterId] = React.useState('');
  const [batchId, setBatchId] = React.useState('');
  const [status, setStatus] = React.useState<CourseInstanceStatus>('Planned');
  const [maxEnrollment, setMaxEnrollment] = React.useState(30);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [semesters, setSemesters] = React.useState<Semester[]>([]);
  const [batches, setBatches] = React.useState<Batch[]>([]);
  const [metaLoading, setMetaLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSemesterId('');
      setBatchId('');
      setStatus('Planned');
      setMaxEnrollment(30);
      setErrors({});
      setMetaLoading(true);
      Promise.all([semestersApi.list(), batchesApi.list()])
        .then(([sems, bats]) => {
          setSemesters(sems);
          setBatches(bats);
        })
        .catch(() => {
          toast.error('Failed to load options', 'Could not fetch semesters or batches.');
        })
        .finally(() => setMetaLoading(false));
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const req: CreateCourseInstanceRequest = {
      course_id: courseId,
      semester_id: semesterId,
      batch_id: batchId,
      status,
      max_enrollment: maxEnrollment,
    };
    const errs = validateCreate(req);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const instance = await courseInstancesApi.create(req);
      toast.success('Instance created', `Course instance has been scheduled.`);
      onOpenChange(false);
      onSuccess(instance);
    } catch (err) {
      toast.error('Failed to create instance', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Create Course Instance
          </SideDialogTitle>
          <SideDialogDescription>
            Schedule this course for a specific semester and batch.
          </SideDialogDescription>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          {/* Semester */}
          <div className="space-y-1.5">
            <Label htmlFor="ci_semester">Semester</Label>
            {metaLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading semesters…
              </div>
            ) : (
              <Select value={semesterId} onValueChange={setSemesterId}>
                <SelectTrigger id="ci_semester">
                  <SelectValue placeholder="Select a semester…" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.length === 0 ? (
                    <SelectItem value="__none" disabled>No semesters available</SelectItem>
                  ) : (
                    semesters.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.term_type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {errors.semester_id && (
              <p className="text-xs text-destructive">{errors.semester_id}</p>
            )}
          </div>

          {/* Batch */}
          <div className="space-y-1.5">
            <Label htmlFor="ci_batch">Batch / Group</Label>
            {metaLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading batches…
              </div>
            ) : (
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger id="ci_batch">
                  <SelectValue placeholder="Select a batch…" />
                </SelectTrigger>
                <SelectContent>
                  {batches.length === 0 ? (
                    <SelectItem value="__none" disabled>No batches available</SelectItem>
                  ) : (
                    batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
            {errors.batch_id && (
              <p className="text-xs text-destructive">{errors.batch_id}</p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="ci_status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CourseInstanceStatus)}>
              <SelectTrigger id="ci_status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && (
              <p className="text-xs text-destructive">{errors.status}</p>
            )}
          </div>

          {/* Max Enrollment */}
          <div className="space-y-1.5">
            <Label htmlFor="ci_max">Max Enrollment</Label>
            <Input
              id="ci_max"
              type="number"
              min={1}
              value={maxEnrollment}
              onChange={(e) => setMaxEnrollment(parseInt(e.target.value, 10) || 1)}
            />
            {errors.max_enrollment && (
              <p className="text-xs text-destructive">{errors.max_enrollment}</p>
            )}
          </div>

          <SideDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || metaLoading}>
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
                : 'Create Instance'
              }
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

interface EditCourseInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: CourseInstance;
  semesterName?: string;
  batchName?: string;
  onSuccess: (updated: CourseInstance) => void;
}

export function EditCourseInstanceDialog({
  open,
  onOpenChange,
  instance,
  semesterName,
  batchName,
  onSuccess,
}: EditCourseInstanceDialogProps) {
  const [status, setStatus] = React.useState<CourseInstanceStatus>(instance.status);
  const [maxEnrollment, setMaxEnrollment] = React.useState(instance.max_enrollment);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStatus(instance.status);
      setMaxEnrollment(instance.max_enrollment);
      setErrors({});
    }
  }, [open, instance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: AcademicFormErrors = {};
    if (maxEnrollment <= 0) errs.max_enrollment = 'Must be a positive number';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const updated = await courseInstancesApi.update(instance.id, {
        status,
        max_enrollment: maxEnrollment,
      });
      toast.success('Instance updated');
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error('Failed to update instance', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Edit Course Instance
          </SideDialogTitle>
          <SideDialogDescription>
            {semesterName && batchName
              ? `${semesterName} — ${batchName}`
              : `Instance ${instance.id.slice(0, 8)}`}
          </SideDialogDescription>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="edit_ci_status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as CourseInstanceStatus)}>
              <SelectTrigger id="edit_ci_status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Enrollment */}
          <div className="space-y-1.5">
            <Label htmlFor="edit_ci_max">Max Enrollment</Label>
            <Input
              id="edit_ci_max"
              type="number"
              min={1}
              value={maxEnrollment}
              onChange={(e) => setMaxEnrollment(parseInt(e.target.value, 10) || 1)}
            />
            {errors.max_enrollment && (
              <p className="text-xs text-destructive">{errors.max_enrollment}</p>
            )}
          </div>

          <SideDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                : 'Save Changes'
              }
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}
