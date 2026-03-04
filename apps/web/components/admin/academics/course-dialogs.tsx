'use client';

/**
 * Course dialogs: Create + Edit (with Prerequisites management)
 * Uses SideDialog for consistent layout with user management UIs.
 */
import * as React from 'react';
import { BookOpen, X, Plus, Loader2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { coursesApi } from '@/lib/api/academics';
import { handleApiError } from '@/lib/api/axios';
import { toast } from '@/lib/hooks/use-toast';
import type {
  Course,
  CoursePrerequisite,
  CreateCourseRequest,
  UpdateCourseRequest,
  AcademicFormErrors,
} from '@/types/academics.types';

// ── Create ────────────────────────────────────────────────────────────────────

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (course: Course) => void;
}

const EMPTY: CreateCourseRequest = {
  code: '',
  title: '',
  description: '',
  credits: 3,
};

function validateCreate(v: CreateCourseRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (!v.code.trim()) e.code = 'Course code is required';
  if (!v.title.trim()) e.title = 'Title is required';
  if (v.credits <= 0) e.credits = 'Credits must be a positive number';
  return e;
}

export function CreateCourseDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateCourseDialogProps) {
  const [values, setValues] = React.useState<CreateCourseRequest>(EMPTY);
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // ── Prerequisites state ─────────────────────────────────────────────
  const [allCourses, setAllCourses] = React.useState<Course[]>([]);
  const [selectedPrereqIds, setSelectedPrereqIds] = React.useState<string[]>([]);
  const [prereqPicker, setPrereqPicker] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setErrors({});
      setSelectedPrereqIds([]);
      setPrereqPicker('');
      coursesApi.list().then(setAllCourses).catch(() => { });
    }
  }, [open]);

  function set(field: keyof CreateCourseRequest, value: string | number) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function addPrereqToList() {
    if (!prereqPicker || selectedPrereqIds.includes(prereqPicker)) return;
    setSelectedPrereqIds((prev) => [...prev, prereqPicker]);
    setPrereqPicker('');
  }

  function removePrereqFromList(id: string) {
    setSelectedPrereqIds((prev) => prev.filter((p) => p !== id));
  }

  const availableCourses = allCourses.filter(
    (c) => !selectedPrereqIds.includes(c.id),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCreate(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const course = await coursesApi.create(values);

      // Add selected prerequisites (best-effort — course is already created)
      let prereqFailed = 0;
      for (const prereqId of selectedPrereqIds) {
        try {
          await coursesApi.addPrerequisite(course.id, { prerequisite_course_id: prereqId });
        } catch {
          prereqFailed++;
        }
      }

      if (prereqFailed > 0) {
        toast.success(
          'Course created',
          `${course.title} — ${prereqFailed} prerequisite(s) failed to link`,
        );
      } else {
        toast.success('Course created', course.title);
      }

      onOpenChange(false);
      onSuccess(course);
    } catch (err) {
      toast.error('Failed to create course', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Create Course
          </SideDialogTitle>
          <SideDialogDescription>
            Add a new course to the catalogue.
          </SideDialogDescription>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="course_code">Code</Label>
              <Input
                id="course_code"
                placeholder="CS101"
                value={values.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course_credits">Credits</Label>
              <Input
                id="course_credits"
                type="number"
                min={1}
                max={12}
                value={values.credits}
                onChange={(e) => set('credits', parseInt(e.target.value, 10) || 0)}
              />
              {errors.credits && <p className="text-xs text-destructive">{errors.credits}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course_title">Title</Label>
            <Input
              id="course_title"
              placeholder="Introduction to Computer Science"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course_desc">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="course_desc"
              placeholder="Brief course overview"
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              className="resize-none"
            />
          </div>

          {/* ── Prerequisites Section ─────────────────────────────────── */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-sm font-medium">
              Prerequisites <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>

            {selectedPrereqIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No prerequisites selected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedPrereqIds.map((id) => {
                  const prereqCourse = allCourses.find((c) => c.id === id);
                  return (
                    <Badge
                      key={id}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {prereqCourse ? `${prereqCourse.code} – ${prereqCourse.title}` : id.slice(0, 8)}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 hover:bg-accent"
                        onClick={() => removePrereqFromList(id)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {availableCourses.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Select value={prereqPicker} onValueChange={setPrereqPicker}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="Select a prerequisite…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.code} – {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={!prereqPicker}
                  onClick={addPrereqToList}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </div>
            )}
          </div>

          <SideDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</> : 'Create Course'}
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}

// ── Edit (with Prerequisites management) ──────────────────────────────────────

interface EditCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course;
  onSuccess: (course: Course) => void;
}

function validateEdit(v: UpdateCourseRequest): AcademicFormErrors {
  const e: AcademicFormErrors = {};
  if (v.credits !== undefined && v.credits <= 0) e.credits = 'Must be a positive number';
  return e;
}

export function EditCourseDialog({
  open,
  onOpenChange,
  course,
  onSuccess,
}: EditCourseDialogProps) {
  const [values, setValues] = React.useState<UpdateCourseRequest>({});
  const [errors, setErrors] = React.useState<AcademicFormErrors>({});
  const [submitting, setSubmitting] = React.useState(false);

  // ── Prerequisites state ─────────────────────────────────────────────
  const [prereqs, setPrereqs] = React.useState<CoursePrerequisite[]>([]);
  const [prereqLoading, setPrereqLoading] = React.useState(false);
  const [allCourses, setAllCourses] = React.useState<Course[]>([]);
  const [selectedPrereq, setSelectedPrereq] = React.useState('');
  const [addingPrereq, setAddingPrereq] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues({ title: course.title, description: course.description, credits: course.credits });
      setErrors({});
      // Load prerequisites + all courses for prerequisite picker
      setPrereqLoading(true);
      Promise.all([
        coursesApi.listPrerequisites(course.id),
        coursesApi.list(),
      ]).then(([pList, cList]) => {
        setPrereqs(pList);
        setAllCourses(cList);
      }).catch(() => {
        // Silently handle — prereqs are supplementary
      }).finally(() => setPrereqLoading(false));
    }
  }, [open, course]);

  function set(field: keyof UpdateCourseRequest, value: string | number) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateEdit(values);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const updated = await coursesApi.update(course.id, values);
      toast.success('Course updated', updated.title);
      onOpenChange(false);
      onSuccess(updated);
    } catch (err) {
      toast.error('Failed to update course', handleApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function addPrerequisite() {
    if (!selectedPrereq) return;
    setAddingPrereq(true);
    try {
      const p = await coursesApi.addPrerequisite(course.id, {
        prerequisite_course_id: selectedPrereq,
      });
      setPrereqs((prev) => [...prev, p]);
      setSelectedPrereq('');
      toast.success('Prerequisite added');
    } catch (err) {
      toast.error('Failed to add prerequisite', handleApiError(err));
    } finally {
      setAddingPrereq(false);
    }
  }

  async function removePrerequisite(prereqCourseId: string) {
    try {
      await coursesApi.removePrerequisite(course.id, prereqCourseId);
      setPrereqs((prev) => prev.filter((p) => p.prerequisite_course_id !== prereqCourseId));
      toast.success('Prerequisite removed');
    } catch (err) {
      toast.error('Failed to remove prerequisite', handleApiError(err));
    }
  }

  // Filter out courses that are already prerequisites or are self
  const availableCourses = allCourses.filter(
    (c) =>
      c.id !== course.id &&
      !prereqs.some((p) => p.prerequisite_course_id === c.id),
  );

  return (
    <SideDialog open={open} onOpenChange={onOpenChange}>
      <SideDialogContent>
        <SideDialogHeader>
          <SideDialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Edit Course
          </SideDialogTitle>
          <SideDialogDescription>
            Update details for <strong>{course.title}</strong>.
            <br />
            <span className="font-mono text-xs text-muted-foreground">{course.code}</span>
          </SideDialogDescription>
        </SideDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit_course_title">Title</Label>
              <Input
                id="edit_course_title"
                value={values.title ?? ''}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_course_credits">Credits</Label>
              <Input
                id="edit_course_credits"
                type="number"
                min={1}
                max={12}
                value={values.credits ?? course.credits}
                onChange={(e) => set('credits', parseInt(e.target.value, 10) || 0)}
              />
              {errors.credits && <p className="text-xs text-destructive">{errors.credits}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit_course_desc">Description</Label>
            <Textarea
              id="edit_course_desc"
              rows={3}
              value={values.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              className="resize-none"
            />
          </div>

          {/* ── Prerequisites Section ─────────────────────────────────── */}
          <div className="space-y-2 border-t border-border pt-4">
            <Label className="text-sm font-medium">Prerequisites</Label>

            {prereqLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading prerequisites…
              </div>
            ) : (
              <>
                {/* Current prereqs */}
                {prereqs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prerequisites set.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {prereqs.map((p) => {
                      const prereqCourse = allCourses.find(
                        (c) => c.id === p.prerequisite_course_id,
                      );
                      return (
                        <Badge
                          key={p.prerequisite_course_id}
                          variant="secondary"
                          className="flex items-center gap-1 pr-1"
                        >
                          {prereqCourse
                            ? `${prereqCourse.code} – ${prereqCourse.title}`
                            : p.prerequisite_course_id.slice(0, 8)}
                          <button
                            type="button"
                            className="ml-0.5 rounded-full p-0.5 hover:bg-accent"
                            onClick={() => removePrerequisite(p.prerequisite_course_id)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {/* Add prerequisite */}
                {availableCourses.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Select
                      value={selectedPrereq}
                      onValueChange={setSelectedPrereq}
                    >
                      <SelectTrigger className="flex-1 h-8 text-xs">
                        <SelectValue placeholder="Select a course…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCourses.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.code} – {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      disabled={!selectedPrereq || addingPrereq}
                      onClick={addPrerequisite}
                    >
                      {addingPrereq ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Add
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <SideDialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : 'Save Changes'}
            </Button>
          </SideDialogFooter>
        </form>
      </SideDialogContent>
    </SideDialog>
  );
}
